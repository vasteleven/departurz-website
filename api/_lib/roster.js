// Reading the two sheets, with a short cache so a page load is one trip to Google.
import { need, lower, yes } from './util.js';
import { readTabs, appendRow, updateRow } from './google.js';
import { CLIENTS, TEAM } from './schema.js';

export const SHEET = { clients: () => need('CLIENTS_SHEET_ID'), team: () => need('TEAM_SHEET_ID') };
const TABS = { clients: Object.keys(CLIENTS), team: Object.keys(TEAM) };
const cache = {};
const TTL = 15000;

export async function load(which, fresh) {
  const c = cache[which];
  if (!fresh && c && Date.now() - c.t < TTL) return c.v;
  const v = await readTabs(SHEET[which](), TABS[which]);
  for (const t of TABS[which]) v[t] = v[t] || [];
  cache[which] = { t: Date.now(), v };
  return v;
}
export const bust = which => { if (which) delete cache[which]; else for (const k in cache) delete cache[k]; };

export async function add(which, tab, row) { await appendRow(SHEET[which](), tab, row); bust(which); }
export async function patch(which, tab, rowNumber, values) { await updateRow(SHEET[which](), tab, rowNumber, values); bust(which); }

export const emails = s => String(s || '').split(/[\s,;]+/).map(lower).filter(Boolean);
export const isOff = v => /^(no|n|false|0|off|inactive)$/i.test(String(v == null ? '' : v).trim());

// who is signing in: crew first, then clients. Anyone on neither list is turned away.
export async function who(email) {
  email = lower(email);
  const [t, c] = await Promise.all([load('team'), load('clients')]);
  const tm = t.Team.find(r => lower(r.email) === email && !isOff(r.active));
  if (tm) return { side: 'team', email, name: tm.name, admin: yes(tm.admin), row: tm };
  const cl = c.Clients.find(r => lower(r.email) === email);
  if (cl) return { side: 'client', email, name: cl.name, row: cl };
  // a project can list a client email that has no Clients row yet
  const p = c.Projects.find(r => emails(r.client_email).includes(email));
  if (p) return { side: 'client', email, name: '', row: null };
  return null;
}
