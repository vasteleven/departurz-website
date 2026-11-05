// The books: a "DEPARTURZ Books" Google Sheet in the portal's Drive folder, rebuilt from the portal's own records
// every morning (and whenever Nate presses Update). Owner only.
//   Summary    each month of the year: money in, card fees, crew pay, expenses, profit, tax set-aside. Then each project.
//   Money in   every paid invoice (from the Clients sheet), with the processor's fee worked out from Settings
//   Crew pay   approved and paid crew payouts (from the Team sheet)
//   Expenses   typed in by hand. The portal never touches this tab.
//   Settings   fee per payment method and the tax set-aside percent. Change them and the Summary follows.
// It only uses formulas Numbers and Excel also understand, so "Download for Numbers" opens cleanly on a Mac.
import { HttpError, env, need, today, lower } from './util.js';
import { g, fileInfo } from './google.js';
import { load, emails } from './roster.js';
import { kv } from './kv.js';
import { day } from './projects.js';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const TITLE = 'DEPARTURZ Books';
const TABS = ['Summary', 'Money in', 'Crew pay', 'Expenses', 'Settings'];
const HEAD = {
  'Money in': ['Date paid', 'Project', 'Client', 'What', 'Invoice', 'Amount', 'Paid by', 'Fee', 'Net'],
  'Crew pay': ['Date', 'Crew', 'Project', 'What', 'Status', 'Amount', 'Paid with'],
  Expenses: ['Date', 'Project', 'What', 'Category', 'Amount', 'Paid with', 'Receipt link'],
  Settings: ['Payment method', 'Percent', 'Flat fee', 'Note']
};
// a starting point: check these against your processor statements and change them in the Settings tab
const FEES = [
  ['Card', 2.9, 0.3, 'Stripe card payments'], ['Cash App Pay', 2.9, 0.3, 'Cash App Pay through Stripe'],
  ['PayPal', 3.49, 0.49, 'PayPal checkout'], ['Venmo', 3.49, 0.49, 'Venmo through PayPal'], ['Square', 2.9, 0.3, 'Square payment links'],
  ['Cash App', 2.75, 0, 'Cash App business account'], ['Zelle', 0, 0, ''], ['Cash', 0, 0, ''], ['Check', 0, 0, ''],
  ['Tax set-aside', 25, 0, 'Percent of profit to put away for taxes. Ask your accountant for your number.']
];
const num = v => { const n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; };

export async function booksId(create = true) {
  const fixed = env('BOOKS_SHEET_ID');
  if (fixed) return fixed;
  const hit = await kv.get('books:id');
  if (hit) return String(hit);
  // already made once (the id is also kept in Redis, but look in the Drive before ever making a second one)
  const found = await g(`${DRIVE}?q=${encodeURIComponent(`name='${TITLE}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`)}&fields=files(id)&pageSize=1`);
  if (found.files && found.files[0]) { await kv.set('books:id', found.files[0].id); return found.files[0].id; }
  if (!create) return '';
  return makeBooks();
}

async function makeBooks() {
  const s = await g(SHEETS, { method: 'POST', body: JSON.stringify({ properties: { title: TITLE, timeZone: env('TIMEZONE', 'America/Los_Angeles') }, sheets: TABS.map((t, i) => ({ properties: { title: t, index: i, gridProperties: { frozenRowCount: t === 'Summary' ? 3 : 1 }, tabColor: t === 'Summary' ? { red: 0.62, green: 0.5, blue: 0.95 } : t === 'Expenses' ? { red: 0.25, green: 0.72, blue: 0.93 } : undefined } })) }) });
  const id = s.spreadsheetId;
  const sid = Object.fromEntries(s.sheets.map(x => [x.properties.title, x.properties.sheetId]));
  await g(`${SHEETS}/${id}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: [
    ...Object.entries(HEAD).map(([t, h]) => ({ range: `'${t}'!A1`, values: [h] })),
    { range: `'Settings'!A2`, values: FEES },
    { range: `'Expenses'!A2`, values: [[today(), '', 'Example: hard drive (delete this row)', 'Gear', 0, 'Card', '']] }
  ] }) });
  const fmt = (t, col, pattern, type) => ({ repeatCell: { range: { sheetId: sid[t], startRowIndex: 1, startColumnIndex: col, endColumnIndex: col + 1 }, cell: { userEnteredFormat: { numberFormat: { type, pattern } } }, fields: 'userEnteredFormat.numberFormat' } });
  const money = (t, col) => fmt(t, col, '$#,##0.00', 'CURRENCY'), date = (t, col) => fmt(t, col, 'yyyy-mm-dd', 'DATE');
  const head = t => ({ repeatCell: { range: { sheetId: sid[t], startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, backgroundColor: { red: 0.04, green: 0.04, blue: 0.04 } } }, fields: 'userEnteredFormat(textFormat,backgroundColor)' } });
  const requests = [
    ...Object.keys(HEAD).map(head),
    date('Money in', 0), money('Money in', 5), money('Money in', 7), money('Money in', 8),
    date('Crew pay', 0), money('Crew pay', 5), date('Expenses', 0), money('Expenses', 4), money('Settings', 2),
    { repeatCell: { range: { sheetId: sid.Summary, startRowIndex: 3, endRowIndex: 16, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'mmm yyyy' } } }, fields: 'userEnteredFormat.numberFormat' } },
    { repeatCell: { range: { sheetId: sid.Summary, startRowIndex: 3, endRowIndex: 400, startColumnIndex: 1, endColumnIndex: 8 }, cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '$#,##0.00' } } }, fields: 'userEnteredFormat.numberFormat' } },
    ...Object.values(sid).map(sheetId => ({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 9 }, properties: { pixelSize: 140 }, fields: 'pixelSize' } }))
  ];
  await g(`${SHEETS}/${id}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) });
  // keep it next to the portal's other two sheets
  try {
    const home = (await fileInfo(need('CLIENTS_FOLDER_ID'))).parents || [];
    const info = await fileInfo(id);
    if (home[0]) await g(`${DRIVE}/${id}?addParents=${home[0]}&removeParents=${(info.parents || []).join(',')}&fields=id`, { method: 'PATCH', body: '{}' });
  } catch (e) { console.log('[books] could not move the sheet', e.message); }
  await kv.set('books:id', id);
  return id;
}

const sumifs = (tab, col, a, extra = '') => `=SUMIFS('${tab}'!${col}:${col},'${tab}'!A:A,">="&$A${a},'${tab}'!A:A,"<"&EDATE($A${a},1)${extra})`;

export async function syncBooks() {
  const id = await booksId();
  const [c, t] = await Promise.all([load('clients', true), load('team', true)]);
  const proj = code => c.Projects.find(p => String(p.code) === String(code)) || {};
  const clientOf = p => { const cl = c.Clients.find(r => emails(p.client_email).includes(lower(r.email))); return (cl && (cl.company || cl.name)) || emails(p.client_email)[0] || ''; };
  const crewName = e => (t.Team.find(r => lower(r.email) === lower(e)) || {}).name || e;

  const paid = c.Invoices.filter(i => lower(i.status) === 'paid').sort((a, b) => (day(a.paid_date) || '').localeCompare(day(b.paid_date) || ''));
  const moneyIn = paid.map((i, k) => {
    const r = k + 2;
    return [day(i.paid_date) || '', String(i.project_code || ''), clientOf(proj(i.project_code)), i.label || '', String(i.no || ''), num(i.amount), i.via || '',
      `=IFERROR(ROUND(F${r}*VLOOKUP(G${r},Settings!A:C,2,FALSE)/100+VLOOKUP(G${r},Settings!A:C,3,FALSE),2),0)`, `=F${r}-H${r}`];
  });
  const pays = t.Payouts.filter(p => ['pending', 'paid'].includes(lower(p.status))).sort((a, b) => (day(a.date) || '').localeCompare(day(b.date) || ''));
  const crewPay = pays.map(p => [day(p.date) || '', crewName(p.email), String(p.project || ''), p.label || '', lower(p.status) === 'paid' ? 'paid' : 'approved', num(p.amount), p.via || '']);

  const yr = Number(today().slice(0, 4));
  const rows = [
    [TITLE, `Updated ${today()} from the portal. Money in and Crew pay rebuild every morning; type expenses into the Expenses tab.`],
    [],
    ['Month', 'Money in', 'Card fees', 'Crew pay', 'Expenses', 'Profit', 'Set aside for tax']
  ];
  for (let m = 0; m < 12; m++) {
    const r = rows.length + 1;
    rows.push([`${yr}-${String(m + 1).padStart(2, '0')}-01`, sumifs('Money in', 'F', r), sumifs('Money in', 'H', r), sumifs('Crew pay', 'F', r, `,'Crew pay'!E:E,"paid"`), sumifs('Expenses', 'E', r),
      `=B${r}-C${r}-D${r}-E${r}`, `=ROUND(MAX(0,F${r})*IFERROR(VLOOKUP("Tax set-aside",Settings!A:B,2,FALSE),0)/100,2)`]);
  }
  rows.push([`${yr} so far`, '=SUM(B4:B15)', '=SUM(C4:C15)', '=SUM(D4:D15)', '=SUM(E4:E15)', '=SUM(F4:F15)', '=SUM(G4:G15)']);
  const owed = c.Invoices.filter(i => ['due', 'sent'].includes(lower(i.status) || 'due')).reduce((a, i) => a + num(i.amount), 0);
  const toPay = t.Payouts.filter(p => lower(p.status) === 'pending').reduce((a, p) => a + num(p.amount), 0);
  rows.push([], ['Still owed to you (unpaid invoices)', owed], ['Crew pay approved, not sent yet', toPay], [], ['Project', 'Client', 'Money in', 'Card fees', 'Crew pay', 'Expenses', 'Profit']);
  const codes = [...new Set(c.Projects.map(p => String(p.code)).concat(paid.map(i => String(i.project_code)), pays.map(p => String(p.project || ''))))].filter(Boolean);
  for (const code of codes) {
    const r = rows.length + 1;
    const p = proj(code);
    rows.push([code, clientOf(p), `=SUMIF('Money in'!B:B,A${r},'Money in'!F:F)`, `=SUMIF('Money in'!B:B,A${r},'Money in'!H:H)`, `=SUMIFS('Crew pay'!F:F,'Crew pay'!C:C,A${r},'Crew pay'!E:E,"paid")`, `=SUMIF(Expenses!B:B,A${r},Expenses!E:E)`, `=C${r}-D${r}-E${r}-F${r}`]);
  }

  await g(`${SHEETS}/${id}/values:batchClear`, { method: 'POST', body: JSON.stringify({ ranges: [`'Summary'!A1:Z2000`, `'Money in'!A2:Z50000`, `'Crew pay'!A2:Z50000`] }) });
  await g(`${SHEETS}/${id}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: [
    { range: `'Summary'!A1`, values: rows },
    ...(moneyIn.length ? [{ range: `'Money in'!A2`, values: moneyIn }] : []),
    ...(crewPay.length ? [{ range: `'Crew pay'!A2`, values: crewPay }] : [])
  ] }) });
  await kv.set('books:synced', new Date().toISOString());
  return { id, url: `https://docs.google.com/spreadsheets/d/${id}/edit`, moneyIn: moneyIn.length, crewPay: crewPay.length };
}

export async function booksInfo() {
  const id = await booksId(false).catch(() => '');
  const synced = id ? await kv.get('books:synced').catch(() => null) : null;
  return { url: id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : '', synced: synced ? String(synced) : '' };
}

// "Download for Numbers": the same sheet as an .xlsx, freshly updated
export async function booksXlsx() {
  const { id } = await syncBooks();
  const r = await g(`${DRIVE}/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}`, { raw: true });
  if (!r.ok) throw new HttpError(502, 'Google would not export the books right now. Try again in a minute.');
  return new Response(r.body, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="DEPARTURZ Books ${today()}.xlsx"`, 'Cache-Control': 'no-store' } });
}
