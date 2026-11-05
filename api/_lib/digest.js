// Nate's morning email: one look at the day. Goes to the owner(s) on the Team tab (or DIGEST_TO), once a day.
import { env, lower, today, esc, money, addDays, daysBetween } from './util.js';
import { load, emails, roleOf, isOff } from './roster.js';
import { send, NOTIFY, siteUrl } from './mail.js';
import { kv } from './kv.js';
import { day, isActive, milestones, evType } from './projects.js';
import { isClientEmail } from './access.js';

const num = v => { const n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; };
const pretty = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const H = t => `<h2 style="margin:22px 0 8px;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#6B6A66">${esc(t)}</h2>`;
const UL = items => `<ul style="margin:0;padding-left:18px">${items.map(i => `<li style="margin:0 0 6px">${i}</li>`).join('')}</ul>`;
const dim = t => `<span style="color:#6B6A66">${esc(t)}</span>`;

export async function morningEmail(log, { force = false } = {}) {
  const td = today();
  if (!force && !(await kv.set('digest:' + td, '1', { nx: true, ex: 60 * 60 * 30 }))) return;
  const [c, t] = await Promise.all([load('clients', true), load('team', true)]);
  const owners = t.Team.filter(r => r.email && !isOff(r.active) && roleOf(r) === 'owner').map(r => r.email);
  const to = env('DIGEST_TO') ? emails(env('DIGEST_TO')) : owners.length ? owners : [NOTIFY()];
  const proj = code => c.Projects.find(p => String(p.code) === String(code)) || {};
  const pname = code => { const p = proj(code); return [code, p.title].filter(Boolean).join(' · '); };
  const crewName = e => (t.Team.find(r => lower(r.email) === lower(e) || lower(r.name) === lower(e)) || {}).name || e;
  const tm = addDays(td, 1);
  const sections = [], counts = {};

  // today and tomorrow, across every active project
  const agenda = [];
  for (const p of c.Projects.filter(isActive)) {
    milestones(c, p.code).filter(m => m.date === td || m.date === tm).forEach(m => agenda.push([m.date, `<b>${esc(m.label)}</b> ${dim(pname(p.code))}`, evType(m.label)]));
  }
  c.Events.filter(e => [td, tm].includes(day(e.date)) && lower(e.type) !== 'note' && lower(e.status) !== 'declined' && !(isClientEmail(c, e.by) && lower(e.status) !== 'confirmed'))
    .forEach(e => agenda.push([day(e.date), `<b>${esc(String(e.title || '').replace(/ \(requested\)$/, ''))}</b> ${dim(pname(e.project_code))}`, lower(e.type)]));
  t.Tasks.filter(x => x.title && lower(x.status) !== 'done' && [td, tm].includes(day(x.due)))
    .forEach(x => agenda.push([day(x.due), `${esc(x.title)} ${dim('due · ' + crewName(x.assignee))}`, 'task']));
  counts.shoots = agenda.filter(a => a[0] === td && a[2] === 'shoot').length;
  if (agenda.length) {
    const part = d => agenda.filter(a => a[0] === d).map(a => a[1]);
    sections.push(H('Today') + (part(td).length ? UL(part(td)) : `<p style="margin:0">${dim('Nothing scheduled.')}</p>`) + (part(tm).length ? H('Tomorrow') + UL(part(tm)) : ''));
  }

  // waiting on you
  const yours = [];
  const reqs = c.Events.filter(e => ['book', 'event'].includes(lower(e.type)) && isClientEmail(c, e.by) && !['confirmed', 'declined'].includes(lower(e.status)) && day(e.date) >= td);
  reqs.forEach(e => yours.push(`Booking request: <b>${esc(String(e.title || '').replace(/ \(requested\)$/, ''))}</b> on ${esc(pretty(day(e.date)))} ${dim(pname(e.project_code) || e.by)}`));
  const cuts = t.Cuts.filter(x => lower(x.status || 'waiting') === 'waiting');
  cuts.forEach(x => yours.push(`Cut to review: <b>${esc(x.title)} v${num(x.version)}</b> from ${esc(crewName(x.by))} ${dim(pname(x.project_code))}`));
  const hours = t.Payouts.filter(p => lower(p.status) === 'submitted');
  hours.forEach(p => yours.push(`Hours to approve: <b>${esc(money(num(p.amount)))}</b> from ${esc(crewName(p.email))} ${dim(p.label || '')}`));
  const payNow = t.Payouts.filter(p => lower(p.status) === 'pending' && day(p.date) && day(p.date) <= td);
  payNow.forEach(p => yours.push(`Pay today: <b>${esc(money(num(p.amount)))}</b> to ${esc(crewName(p.email))} ${dim(p.label || '')}`));
  const zelle = c.Invoices.filter(i => lower(i.status) === 'sent');
  zelle.forEach(i => yours.push(`Check your ${esc(i.via || 'account')}: <b>${esc(money(num(i.amount)))}</b> ${dim(pname(i.project_code) + ' · ' + (i.no || ''))}, then mark it paid`));
  counts.yours = yours.length;
  if (yours.length) sections.push(H(`Waiting on you (${yours.length})`) + UL(yours));

  // what clients did since yesterday
  const since = addDays(td, -1);
  const decided = c.Reviews.filter(r => day(r.decided_at) >= since && ['approved', 'changes'].includes(lower(r.status)));
  const news = decided.map(r => `${lower(r.status) === 'approved' ? 'Approved' : 'Changes asked'}: <b>${esc(r.title)} v${num(r.version)}</b> ${dim(pname(r.project_code))}`);
  c.Invoices.filter(i => lower(i.status) === 'paid' && day(i.paid_date) >= since).forEach(i => news.push(`Paid: <b>${esc(money(num(i.amount)))}</b> by ${esc(i.via || 'payment')} ${dim(pname(i.project_code))}`));
  if (news.length) sections.push(H('Since yesterday') + UL(news));

  // money coming in
  const due = c.Invoices.filter(i => lower(i.status || 'due') === 'due' && day(i.due) && day(i.due) <= addDays(td, 3)).sort((a, b) => day(a.due).localeCompare(day(b.due)));
  if (due.length) sections.push(H('Invoices') + UL(due.map(i => `<b>${esc(money(num(i.amount)))}</b> ${esc(i.label || i.no || '')} ${dim(pname(i.project_code))} · ${day(i.due) < td ? `<b style="color:#C2412D">${daysBetween(i.due, td)} days late</b>` : day(i.due) === td ? 'due today' : 'due ' + esc(pretty(day(i.due)))}`)));

  // where things are stuck
  const stuck = [];
  c.Needs.filter(n => lower(n.status) !== 'received' && day(n.due) && day(n.due) < td && isActive(proj(n.project_code)))
    .forEach(n => stuck.push(`Client is late on <b>${esc(n.label || 'an item')}</b> ${dim(pname(n.project_code) + ' · due ' + pretty(day(n.due)))}`));
  c.Reviews.filter(r => lower(r.status || 'waiting') === 'waiting' && day(r.sent_at) && daysBetween(r.sent_at, td) >= 3)
    .forEach(r => stuck.push(`<b>${esc(r.title)} v${num(r.version)}</b> has been with the client ${daysBetween(r.sent_at, td)} days ${dim(pname(r.project_code))}`));
  t.Tasks.filter(x => x.title && lower(x.status) !== 'done' && day(x.due) && day(x.due) < td)
    .forEach(x => stuck.push(`Overdue: <b>${esc(x.title)}</b> ${dim(crewName(x.assignee) + ' · due ' + pretty(day(x.due)))}`));
  if (stuck.length) sections.push(H('Running late') + UL(stuck.slice(0, 15)) + (stuck.length > 15 ? `<p style="margin:6px 0 0">${dim(`and ${stuck.length - 15} more`)}</p>` : ''));

  const bits = [counts.shoots && `${counts.shoots} shoot${counts.shoots === 1 ? '' : 's'}`, counts.yours && `${counts.yours} thing${counts.yours === 1 ? '' : 's'} waiting on you`].filter(Boolean);
  const subject = `Your day, ${pretty(td)}${bits.length ? ': ' + bits.join(', ') : ''}`;
  await send({
    to, subject, heading: 'Good morning',
    html: sections.length ? sections.join('') : `<p>Nothing is waiting on you today. Every booking is answered, every cut is reviewed and nobody is late.</p>`,
    cta: { label: 'Open the crew portal', url: siteUrl() + '/portal-app.html#/team/lounge' }
  });
  log.push(`morning email: ${sections.length} sections`);
}
