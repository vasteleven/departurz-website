// A stand-in for Google Sheets, Google Drive and Resend, used by "npm run dev" and the tests.
// It lets the whole portal run on a laptop with no accounts and nothing sent anywhere.
const realFetch = globalThis.fetch;

export const store = { sheets: {}, files: {}, uploads: {}, mail: [], calls: [] };
let n = 0;
const nid = p => p + (++n).toString(36) + Math.random().toString(36).slice(2, 6);

const serial = s => {
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) / 86400000 + 25569;
};
// what typing a value into a cell turns it into
export function entered(v) {
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  const s = String(v == null ? '' : v);
  const d = serial(s); if (d !== null) return d;
  if (/^-?\d+(\.\d+)?$/.test(s) && !/^0\d/.test(s)) return Number(s);
  return s;
}

export function seedSheet(id, tabs) {
  store.sheets[id] = {};
  for (const [tab, rows] of Object.entries(tabs)) store.sheets[id][tab] = rows.map((r, i) => (i === 0 ? r.slice() : r.map(entered)));
}
export function addFolder(name, parent) { const id = nid('f'); store.files[id] = { id, name, mimeType: 'application/vnd.google-apps.folder', parents: parent ? [parent] : [], createdTime: new Date().toISOString() }; return id; }
export function addFile(name, parent, size, mimeType) { const id = nid('d'); store.files[id] = { id, name, mimeType: mimeType || 'application/octet-stream', parents: [parent], size: String(size || 0), createdTime: new Date().toISOString() }; return id; }

const ok = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const tabOf = range => { const m = decodeURIComponent(range).match(/^'?(.*?)'?(?:!(.*))?$/); return { tab: m[1], cell: m[2] || '' }; };
const colIndex = letters => letters.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;

function sheets(url, opts) {
  if (url.pathname === '/v4/spreadsheets' && opts.method === 'POST') {
    const b = JSON.parse(opts.body), sid = nid('sheet');
    store.sheets[sid] = {};
    b.sheets.forEach(x => { store.sheets[sid][x.properties.title] = [[]]; });
    store.files[sid] = { id: sid, name: b.properties.title, mimeType: 'application/vnd.google-apps.spreadsheet', parents: ['root'], createdTime: new Date().toISOString() };
    return ok({ spreadsheetId: sid, sheets: b.sheets.map((x, i) => ({ properties: { title: x.properties.title, sheetId: i } })) });
  }
  if (/^\/v4\/spreadsheets\/[^/]+:batchUpdate$/.test(url.pathname)) { store.calls.push('format ' + JSON.parse(opts.body).requests.length); return ok({}); }
  const m = url.pathname.match(/^\/v4\/spreadsheets\/([^/]+)\/values(.*)$/);
  if (!m) return ok({ error: { message: 'mock: unknown sheets call' } }, 400);
  const book = store.sheets[m[1]];
  if (!book) return ok({ error: { message: 'Requested entity was not found.' } }, 404);
  const rest = decodeURIComponent(m[2]);
  if (rest === ':batchGet') {
    const ranges = url.searchParams.getAll('ranges');
    return ok({ valueRanges: ranges.map(r => { const { tab } = tabOf(r); return { range: r, values: (book[tab] || []).map(row => row.slice()) }; }) });
  }
  if (rest === ':batchUpdate') {
    const b = JSON.parse(opts.body);
    for (const d of b.data) {
      const { tab, cell } = tabOf(d.range);
      const cm = cell.match(/^([A-Z]+)(\d+)$/);
      const rows = book[tab];
      const r0 = +cm[2] - 1, c0 = colIndex(cm[1]);
      d.values.forEach((vals, dr) => vals.forEach((v, dc) => {
        const r = r0 + dr, c = c0 + dc;
        while (rows.length <= r) rows.push([]);
        while (rows[r].length <= c) rows[r].push('');
        rows[r][c] = b.valueInputOption === 'RAW' ? v : entered(v);
      }));
    }
    return ok({});
  }
  const am = rest.match(/^\/(.+?):append$/);
  if (am) {
    const { tab } = tabOf(am[1]);
    const b = JSON.parse(opts.body);
    b.values.forEach(v => book[tab].push(v.map(entered)));
    return ok({ updates: {} });
  }
  const gm = rest.match(/^\/(.+)$/);
  if (gm) { const { tab } = tabOf(gm[1]); return ok({ values: [(book[tab] || [[]])[0]] }); }
  return ok({ error: { message: 'mock: unknown values call' } }, 400);
}

function drive(url, opts, base) {
  const p = url.pathname;
  if (p.startsWith('/upload/drive/v3/files')) {
    const meta = JSON.parse(opts.body || '{}');
    const sid = nid('s');
    const h = new Headers(opts.headers);
    store.uploads[sid] = { name: meta.name, parents: meta.parents, mime: h.get('X-Upload-Content-Type'), size: Number(h.get('X-Upload-Content-Length') || 0), got: 0 };
    return new Response(null, { status: 200, headers: { Location: `${base}/__upload/${sid}` } });
  }
  const fm = p.match(/^\/drive\/v3\/files\/([^/]+)(\/permissions)?$/);
  if (fm) {
    const f = store.files[decodeURIComponent(fm[1])];
    if (!f) return ok({ error: { message: 'File not found' } }, 404);
    if (fm[2]) return ok({ id: 'anyone' });
    if (url.searchParams.get('alt') === 'media') return new Response(new Uint8Array(Number(f.size) || 8), { headers: { 'Content-Type': f.mimeType, 'Content-Length': String(Number(f.size) || 8) } });
    if (opts.method === 'PATCH') { const add = url.searchParams.get('addParents'), rm = (url.searchParams.get('removeParents') || '').split(','); f.parents = f.parents.filter(x => !rm.includes(x)).concat(add ? [add] : []); return ok({ id: f.id }); }
    return ok({ ...f, webViewLink: `https://drive.google.com/file/d/${f.id}/view`, webContentLink: `https://drive.google.com/uc?id=${f.id}&export=download` });
  }
  if (p === '/drive/v3/files') {
    if ((opts.method || 'GET') === 'POST') {
      const b = JSON.parse(opts.body);
      const id = addFolder(b.name, b.parents && b.parents[0]);
      return ok({ id });
    }
    const q = url.searchParams.get('q') || '';
    const name = (q.match(/name='((?:\\'|[^'])*)'/) || [])[1];
    const parent = (q.match(/'([^']+)' in parents/) || [])[1];
    const isFolder = /mimeType='application\/vnd.google-apps.folder'/.test(q), notFolder = /mimeType!=/.test(q);
    let files = Object.values(store.files).filter(f => (!parent || f.parents.includes(parent)) && (name === undefined || f.name === name.replace(/\\'/g, "'").replace(/\\\\/g, '\\')));
    if (isFolder) files = files.filter(f => f.mimeType.endsWith('folder'));
    if (notFolder) files = files.filter(f => !f.mimeType.endsWith('folder'));
    files.sort((a, b) => b.createdTime.localeCompare(a.createdTime));
    return ok({ files: files.slice(0, Number(url.searchParams.get('pageSize') || 100)).map(f => ({ ...f, webViewLink: `https://drive.google.com/file/d/${f.id}/view` })) });
  }
  return ok({ error: { message: 'mock: unknown drive call ' + p } }, 400);
}

// the browser sends upload bytes here, the way it would to Google
export function handleUpload(sid, rangeHeader, bytes) {
  const u = store.uploads[sid];
  if (!u) return { status: 404, body: '{}' };
  const m = String(rangeHeader || '').match(/bytes (\d+)-(\d+)\/(\d+|\*)/);
  if (m) { u.got = +m[2] + 1; if (m[3] !== '*') u.size = +m[3]; } else u.got += bytes;
  if (u.got >= u.size) {
    const id = addFile(u.name, u.parents[0], u.size, u.mime);
    delete store.uploads[sid];
    return { status: 200, body: JSON.stringify({ id, name: u.name, size: String(u.size) }) };
  }
  return { status: 308, body: '' };
}

export function install(base) {
  globalThis.fetch = async (input, opts = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    store.calls.push(`${opts.method || 'GET'} ${url.host}${url.pathname}`);
    if (url.host === 'oauth2.googleapis.com') return ok({ access_token: 'mock', expires_in: 3600 });
    if (url.host === 'sheets.googleapis.com') return sheets(url, opts);
    if (url.host === 'www.googleapis.com') return drive(url, opts, base);
    if (url.host === 'api.resend.com') { const b = JSON.parse(opts.body); store.mail.push(b); return ok({ id: nid('mail') }); }
    if (url.host === 'api.kit.com') return ok({ subscriber: { id: 1 }, tags: [], tag: { id: 1 } });
    return realFetch(input, opts);
  };
}
