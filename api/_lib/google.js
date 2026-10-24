// Google: the departurzedits account's Drive and Sheets (through a saved refresh token),
// and checking the "Sign in with Google" tokens that clients and crew send.
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { HttpError, env, need, isoDay } from './util.js';

/* ---------- access token for departurzedits ---------- */
let cached = { token: '', exp: 0 };
export async function accessToken() {
  if (cached.token && Date.now() < cached.exp - 60000) return cached.token;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      // one Web OAuth client can do both jobs, so the Drive settings fall back to the sign-in ones
      client_id: env('GOOGLE_DRIVE_CLIENT_ID') || need('GOOGLE_CLIENT_ID'),
      client_secret: env('GOOGLE_DRIVE_CLIENT_SECRET') || need('GOOGLE_CLIENT_SECRET'),
      refresh_token: need('GOOGLE_REFRESH_TOKEN'),
      grant_type: 'refresh_token'
    })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new HttpError(502, 'Google sign-in for the Drive failed. Run "npm run google-token" again and update GOOGLE_REFRESH_TOKEN.', j);
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cached.token;
}

export async function g(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + (await accessToken()), ...(opts.body && typeof opts.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) } });
  if (opts.raw) return r;
  const text = await r.text();
  let data = {}; try { data = text ? JSON.parse(text) : {}; } catch { data = { text }; }
  if (!r.ok) throw new HttpError(r.status === 404 ? 404 : 502, (data.error && data.error.message) || 'Google request failed', data);
  return data;
}

/* ---------- Sheets ---------- */
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets/';
const headerCache = {};
const isDateKey = k => k === 'due' || k === 'date' || k.endsWith('_date') || k.endsWith('_at') && k !== 'created_at';
function serialToDay(n) { return isoDay(new Date(Math.round((n - 25569) * 86400000))); }
const norm = h => String(h || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// read whole tabs as arrays of objects (row numbers kept in _row so they can be updated later)
export async function readTabs(sheetId, tabs) {
  const q = tabs.map(t => 'ranges=' + encodeURIComponent(`'${t}'`)).join('&');
  const j = await g(`${SHEETS}${sheetId}/values:batchGet?${q}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`);
  const out = {};
  (j.valueRanges || []).forEach((vr, i) => {
    const tab = tabs[i];
    const rows = vr.values || [];
    const head = (rows[0] || []).map(norm);
    headerCache[sheetId + '/' + tab] = head;
    out[tab] = rows.slice(1).map((r, k) => {
      const o = { _row: k + 2 };
      head.forEach((h, c) => {
        if (!h) return;
        let v = r[c] === undefined ? '' : r[c];
        if (typeof v === 'number' && isDateKey(h) && v > 20000) v = serialToDay(v);
        o[h] = v;
      });
      return o;
    }).filter(o => Object.keys(o).some(k => k !== '_row' && o[k] !== ''));
  });
  return out;
}

async function headers(sheetId, tab) {
  const k = sheetId + '/' + tab;
  if (!headerCache[k]) {
    const j = await g(`${SHEETS}${sheetId}/values/${encodeURIComponent(`'${tab}'!1:1`)}`);
    headerCache[k] = ((j.values || [])[0] || []).map(norm);
  }
  return headerCache[k];
}
const colLetter = n => { let s = ''; n += 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

export async function appendRow(sheetId, tab, obj) {
  const head = await headers(sheetId, tab);
  const row = head.map(h => (obj[h] === undefined ? '' : obj[h]));
  await g(`${SHEETS}${sheetId}/values/${encodeURIComponent(`'${tab}'!A1`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: 'POST', body: JSON.stringify({ values: [row] })
  });
}

export async function updateRow(sheetId, tab, rowNumber, patch) {
  const head = await headers(sheetId, tab);
  const data = Object.entries(patch).filter(([k]) => head.includes(k)).map(([k, v]) => ({
    range: `'${tab}'!${colLetter(head.indexOf(k))}${rowNumber}`, values: [[v === undefined ? '' : v]]
  }));
  if (!data.length) return;
  await g(`${SHEETS}${sheetId}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }) });
}

/* ---------- Drive ---------- */
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const q = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
export const FOLDER = 'application/vnd.google-apps.folder';

export async function ensureFolder(name, parentId) {
  const found = await g(`${DRIVE}?q=${encodeURIComponent(`name='${q(name)}' and '${parentId}' in parents and mimeType='${FOLDER}' and trashed=false`)}&fields=files(id,name)&pageSize=1`);
  if (found.files && found.files[0]) return found.files[0].id;
  const made = await g(`${DRIVE}?fields=id`, { method: 'POST', body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] }) });
  return made.id;
}

export async function listFiles(folderId, max = 50) {
  const j = await g(`${DRIVE}?q=${encodeURIComponent(`'${folderId}' in parents and trashed=false and mimeType!='${FOLDER}'`)}&orderBy=createdTime desc&pageSize=${max}&fields=files(id,name,size,mimeType,createdTime,webViewLink)`);
  return j.files || [];
}

export async function fileInfo(fileId) {
  return g(`${DRIVE}/${encodeURIComponent(fileId)}?fields=id,name,size,mimeType,parents,webViewLink,webContentLink`);
}

// a resumable upload session the browser (or the app) sends the bytes to directly, so file size never touches Vercel
export async function startUpload({ name, size, mimeType, parentId, origin }) {
  const r = await g(`https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size`, {
    method: 'POST', raw: true,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType || 'application/octet-stream',
      ...(size ? { 'X-Upload-Content-Length': String(size) } : {}),
      ...(origin ? { Origin: origin } : {})
    },
    body: JSON.stringify({ name, parents: [parentId] })
  });
  if (!r.ok) throw new HttpError(502, 'Google Drive would not start the upload.', await r.text().catch(() => ''));
  return r.headers.get('location');
}

// lets a client open one of their delivered files (anyone with the link can view)
export async function shareFile(fileId) {
  await g(`${DRIVE}/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=false`, { method: 'POST', body: JSON.stringify({ role: 'reader', type: 'anyone' }) }).catch(() => {});
  const f = await fileInfo(fileId);
  return { view: f.webViewLink, download: f.webContentLink, preview: `https://drive.google.com/file/d/${f.id}/preview` };
}

/* ---------- "Sign in with Google" ---------- */
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export async function verifyGoogleIdToken(idToken) {
  const audience = [env('GOOGLE_CLIENT_ID'), env('GOOGLE_IOS_CLIENT_ID'), env('GOOGLE_ANDROID_CLIENT_ID')].filter(Boolean);
  if (!audience.length) throw new HttpError(503, 'Google sign-in is not set up yet (GOOGLE_CLIENT_ID).');
  try {
    const { payload } = await jwtVerify(idToken, JWKS, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience });
    if (!payload.email || payload.email_verified === false) throw new Error('unverified');
    return { email: String(payload.email).toLowerCase(), name: payload.name || '' };
  } catch {
    throw new HttpError(401, 'That Google sign-in did not go through. Try again.');
  }
}
