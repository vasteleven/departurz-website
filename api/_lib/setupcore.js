// Building the portal's home in the departurzedits Drive: the folders, the Clients and Team sheets (every tab,
// header and dropdown), the books, and the owner on the Team tab. Used by the /setup page on the site and by
// "npm run setup" on a computer. Safe to run again: it finds what's already there and only adds what's missing.
import { g, ensureFolder, fileInfo, appendRow } from './google.js';
import { CLIENTS, TEAM, CHOICES } from './schema.js';
import { env } from './util.js';
import { kv } from './kv.js';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const DATE = /(^date$|^due$|_date$|_at$)/;
const q = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const norm = h => String(h || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const col = n => { let s = ''; n += 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

async function findSheet(title, folderId) {
  const j = await g(`${DRIVE}?q=${encodeURIComponent(`name='${q(title)}' and '${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`)}&fields=files(id)&pageSize=1`);
  return j.files && j.files[0] ? j.files[0].id : '';
}

// a sheet made by an older version gets the tabs and columns it's missing, added at the end
async function upgradeSheet(title, id, schema, log) {
  const meta = await g(`${SHEETS}/${id}?fields=sheets.properties`);
  const have = Object.fromEntries(meta.sheets.map(x => [x.properties.title, x.properties.sheetId]));
  const missingTabs = Object.keys(schema).filter(t => have[t] === undefined);
  if (missingTabs.length) await g(`${SHEETS}/${id}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: missingTabs.map(t => ({ addSheet: { properties: { title: t, gridProperties: { frozenRowCount: 1 } } } })) }) });
  const added = [], data = [];
  for (const t of Object.keys(schema)) {
    const head = missingTabs.includes(t) ? [] : (((await g(`${SHEETS}/${id}/values/${encodeURIComponent(`'${t}'!1:1`)}`)).values || [])[0] || []);
    const missing = schema[t].filter(c => !head.map(norm).includes(c));
    if (!missing.length) continue;
    data.push({ range: `'${t}'!${col(head.length)}1`, values: [missing] });
    added.push(missingTabs.includes(t) ? `${t} (new tab)` : `${t}: ${missing.join(', ')}`);
  }
  if (data.length) await g(`${SHEETS}/${id}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data }) });
  log(added.length ? `${title} updated: ${added.join(' · ')}` : `${title} already set up`);
  return id;
}

async function makeSheet(title, schema, folderId, existing, log) {
  const found = existing || await findSheet(title, folderId);
  if (found) return { id: await upgradeSheet(title, found, schema, log), made: false };
  const tabs = Object.keys(schema);
  const s = await g(SHEETS, { method: 'POST', body: JSON.stringify({ properties: { title, timeZone: env('TIMEZONE', 'America/Los_Angeles') }, sheets: tabs.map((t, i) => ({ properties: { title: t, index: i, gridProperties: { frozenRowCount: 1 }, tabColor: i === 0 ? { red: 0.25, green: 0.72, blue: 0.93 } : undefined } })) }) });
  const ids = Object.fromEntries(s.sheets.map(x => [x.properties.title, x.properties.sheetId]));
  await g(`${SHEETS}/${s.spreadsheetId}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data: tabs.map(t => ({ range: `'${t}'!A1`, values: [schema[t]] })) }) });
  const requests = [];
  for (const t of tabs) {
    const cols = schema[t];
    requests.push({ repeatCell: { range: { sheetId: ids[t], startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, backgroundColor: { red: 0.04, green: 0.04, blue: 0.04 } } }, fields: 'userEnteredFormat(textFormat,backgroundColor)' } });
    requests.push({ autoResizeDimensions: { dimensions: { sheetId: ids[t], dimension: 'COLUMNS', startIndex: 0, endIndex: cols.length } } });
    cols.forEach((c, i) => {
      const range = { sheetId: ids[t], startRowIndex: 1, startColumnIndex: i, endColumnIndex: i + 1 };
      if (DATE.test(c) && c !== 'created_at') requests.push({ repeatCell: { range, cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' } } }, fields: 'userEnteredFormat.numberFormat' } });
      if (c === 'amount') requests.push({ repeatCell: { range, cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '$#,##0.00' } } }, fields: 'userEnteredFormat.numberFormat' } });
      const list = CHOICES[`${t}.${c}`];
      if (list) requests.push({ setDataValidation: { range, rule: { condition: { type: 'ONE_OF_LIST', values: list.filter(Boolean).map(v => ({ userEnteredValue: v })) }, showCustomUi: true, strict: false } } });
    });
  }
  await g(`${SHEETS}/${s.spreadsheetId}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) });
  const info = await fileInfo(s.spreadsheetId);
  await g(`${DRIVE}/${s.spreadsheetId}?addParents=${folderId}&removeParents=${(info.parents || []).join(',')}&fields=id`, { method: 'PATCH', body: '{}' });
  log(`Created ${title}`);
  return { id: s.spreadsheetId, made: true };
}

const day = n => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

export async function buildPortal({ admin, adminName = 'Nate', example = true, have = {}, log = () => {} }) {
  const root = await ensureFolder('DEPARTURZ Portal', 'root');
  const clientsFolder = have.CLIENTS_FOLDER_ID || await ensureFolder('Clients', root);
  const teamFolder = have.TEAM_FOLDER_ID || await ensureFolder('Team', root);
  log('Folders: DEPARTURZ Portal / Clients and / Team');
  const clients = await makeSheet('DEPARTURZ Clients', CLIENTS, root, have.CLIENTS_SHEET_ID, log);
  const team = await makeSheet('DEPARTURZ Team', TEAM, root, have.TEAM_SHEET_ID, log);
  if (team.made) {
    await appendRow(team.id, 'Team', { email: admin, name: adminName, role: 'Director', city: 'Los Angeles', tz: 'America/Los_Angeles', since: String(new Date().getFullYear()), admin: 'owner', active: 'yes' });
    await appendRow(team.id, 'Channels', { id: 'general', name: 'general', members: 'all' });
    log(`Added ${admin} as the owner, and a #general channel`);
  }
  if (clients.made && example) {
    await appendRow(clients.id, 'Clients', { email: 'client@example.com', name: 'Example Client', company: 'Example Co.', updates: 'yes', thanks: 'yes', offers: 'yes', notes: 'Example row. Delete it once you add a real client.' });
    await appendRow(clients.id, 'Projects', { code: 'DPZ-0001', client_email: 'client@example.com', title: 'Example project (delete me)', service: 'Production', status: 'Pre-production', lead: adminName, seat: '1A', start_date: day(0) });
    for (const [label, n, state, note] of [['Booked', 0, 'done', 'Deposit received.'], ['Pre-production', 7, 'now', 'Shot list and locations.'], ['Shoot day', 14, 'next', ''], ['Your review', 24, 'next', 'First cut lands here.'], ['Final delivery', 30, 'next', '']])
      await appendRow(clients.id, 'Milestones', { project_code: 'DPZ-0001', label, date: day(n), state, note, notified_at: day(0) });
    await appendRow(clients.id, 'Needs', { id: 'n1', project_code: 'DPZ-0001', kind: 'files', label: 'Logo files', detail: 'SVG or PNG, light and dark versions', due: day(5), status: 'open' });
    await appendRow(clients.id, 'Invoices', { no: 'DPZ-0001-P1', project_code: 'DPZ-0001', label: 'Deposit (50%)', amount: 1000, due: day(3), status: 'due' });
    log('Added an example client project (DPZ-0001) to show how the rows work. Delete it any time.');
  }
  // the books sheet sits next to the other two (books.js finds it again by name, so this is safe to repeat)
  Object.assign(process.env, { CLIENTS_FOLDER_ID: clientsFolder, TEAM_FOLDER_ID: teamFolder, CLIENTS_SHEET_ID: clients.id, TEAM_SHEET_ID: team.id });
  const { booksId, syncBooks } = await import('./books.js');
  const books = have.BOOKS_SHEET_ID || await booksId();
  process.env.BOOKS_SHEET_ID = books;
  await syncBooks().catch(e => log('The books fill in on the first daily run (' + e.message + ')'));
  log('DEPARTURZ Books');
  return { root, CLIENTS_SHEET_ID: clients.id, TEAM_SHEET_ID: team.id, CLIENTS_FOLDER_ID: clientsFolder, TEAM_FOLDER_ID: teamFolder, BOOKS_SHEET_ID: books };
}

/* ---------- settings the /setup page saved (kept in Redis, so nothing has to be pasted into Vercel) ----------
   Anything set in Vercel's environment variables wins over what's stored here. */
export const STORED = ['GOOGLE_REFRESH_TOKEN', 'CLIENTS_SHEET_ID', 'TEAM_SHEET_ID', 'CLIENTS_FOLDER_ID', 'TEAM_FOLDER_ID', 'BOOKS_SHEET_ID', 'SESSION_SECRET'];
let loaded = 0;
export async function loadStored(force = false) {
  if (!force && Date.now() - loaded < 60000) return;
  try {
    let v = await kv.get('cfg:portal');
    if (typeof v === 'string') v = JSON.parse(v);
    if (v && typeof v === 'object') for (const k of STORED) if (v[k] && !process.env[k]) process.env[k] = String(v[k]);
    loaded = Date.now();
  } catch (e) { /* no Redis yet: nothing stored */ }
}
export async function saveStored(values) {
  let v = await kv.get('cfg:portal');
  if (typeof v === 'string') v = JSON.parse(v);
  const next = { ...(v && typeof v === 'object' ? v : {}), ...Object.fromEntries(Object.entries(values).filter(([k]) => STORED.includes(k))) };
  await kv.set('cfg:portal', JSON.stringify(next));
  for (const [k, val] of Object.entries(values)) if (STORED.includes(k) && val) process.env[k] = String(val);
  loaded = Date.now();
}
