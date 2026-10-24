// One-time: builds the portal's home in the departurzedits Drive.
//   npm run setup -- --admin you@departurz.com --name Nate
// Creates:  DEPARTURZ Portal / Clients   DEPARTURZ Portal / Team
//           "DEPARTURZ Clients" and "DEPARTURZ Team" Google Sheets with every tab, header and dropdown
// and adds you to the Team tab as an admin. Safe to run again: it reuses what already exists.
// Add --no-example to skip the example client project.
import { loadEnv, saveEnv } from './env.mjs';
import { CLIENTS, TEAM, CHOICES } from '../api/_lib/schema.js';

loadEnv();
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const admin = (arg('admin') || process.env.ADMIN_EMAIL || '').toLowerCase();
const adminName = arg('name', 'Nate');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin)) { console.error('\n  Tell setup who the admin is:  npm run setup -- --admin you@departurz.com --name Nate\n'); process.exit(1); }
for (const k of ['GOOGLE_REFRESH_TOKEN']) if (!process.env[k]) { console.error(`\n  ${k} is missing. Run npm run google-token first.\n`); process.exit(1); }

const { g, ensureFolder, fileInfo, appendRow } = await import('../api/_lib/google.js');
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const DATE = /(^date$|^due$|_date$|_at$)/;

async function makeSheet(title, schema, folderId, existing) {
  if (existing) { console.log(`  ✓ ${title} already set up`); return existing; }
  const tabs = Object.keys(schema);
  const s = await g(SHEETS, { method: 'POST', body: JSON.stringify({ properties: { title, timeZone: process.env.TIMEZONE || 'America/Los_Angeles' }, sheets: tabs.map((t, i) => ({ properties: { title: t, index: i, gridProperties: { frozenRowCount: 1 }, tabColor: i === 0 ? { red: 0.25, green: 0.72, blue: 0.93 } : undefined } })) }) });
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
  await g(`https://www.googleapis.com/drive/v3/files/${s.spreadsheetId}?addParents=${folderId}&removeParents=${(info.parents || []).join(',')}&fields=id`, { method: 'PATCH', body: '{}' });
  console.log(`  ✓ Created ${title}: https://docs.google.com/spreadsheets/d/${s.spreadsheetId}`);
  return s.spreadsheetId;
}

console.log('\n  Setting up the DEPARTURZ portal in the Drive…\n');
const root = await ensureFolder('DEPARTURZ Portal', 'root');
const clientsFolder = await ensureFolder('Clients', root);
const teamFolder = await ensureFolder('Team', root);
console.log(`  ✓ Folders: DEPARTURZ Portal / Clients and / Team  (https://drive.google.com/drive/folders/${root})`);
const clientsId = await makeSheet('DEPARTURZ Clients', CLIENTS, root, process.env.CLIENTS_SHEET_ID);
const teamId = await makeSheet('DEPARTURZ Team', TEAM, root, process.env.TEAM_SHEET_ID);

if (!process.env.TEAM_SHEET_ID) {
  await appendRow(teamId, 'Team', { email: admin, name: adminName, role: 'Director', city: 'Los Angeles', tz: 'America/Los_Angeles', since: String(new Date().getFullYear()), admin: 'yes', active: 'yes' });
  await appendRow(teamId, 'Channels', { id: 'general', name: 'general', members: 'all' });
  console.log(`  ✓ Added ${admin} as an admin, and a #general channel`);
}
if (!process.env.CLIENTS_SHEET_ID && !args.includes('--no-example')) {
  const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  await appendRow(clientsId, 'Clients', { email: 'client@example.com', name: 'Example Client', company: 'Example Co.', updates: 'yes', thanks: 'yes', offers: 'yes', notes: 'Example row. Delete it once you add a real client.' });
  await appendRow(clientsId, 'Projects', { code: 'DPZ-0001', client_email: 'client@example.com', title: 'Example project (delete me)', service: 'Production', status: 'Pre-production', lead: adminName, seat: '1A', start_date: d(0) });
  for (const [label, n, state, note] of [['Booked', 0, 'done', 'Deposit received.'], ['Pre-production', 7, 'now', 'Shot list and locations.'], ['Shoot day', 14, 'next', ''], ['Your review', 24, 'next', 'First cut lands here.'], ['Final delivery', 30, 'next', '']])
    await appendRow(clientsId, 'Milestones', { project_code: 'DPZ-0001', label, date: d(n), state, note, notified_at: d(0) });
  await appendRow(clientsId, 'Needs', { id: 'n1', project_code: 'DPZ-0001', kind: 'files', label: 'Logo files', detail: 'SVG or PNG, light and dark versions', due: d(5), status: 'open' });
  await appendRow(clientsId, 'Invoices', { no: 'DPZ-0001-P1', project_code: 'DPZ-0001', label: 'Deposit (50%)', amount: 1000, due: d(3), status: 'due' });
  console.log('  ✓ Added an example client project you can open from the crew side (Admin > Open client view)');
}

saveEnv('CLIENTS_SHEET_ID', clientsId); saveEnv('TEAM_SHEET_ID', teamId);
saveEnv('CLIENTS_FOLDER_ID', clientsFolder); saveEnv('TEAM_FOLDER_ID', teamFolder);
console.log(`\n  Done. Add these four to Vercel (they're also saved in .env.local):\n
  CLIENTS_SHEET_ID=${clientsId}
  TEAM_SHEET_ID=${teamId}
  CLIENTS_FOLDER_ID=${clientsFolder}
  TEAM_FOLDER_ID=${teamFolder}\n`);
