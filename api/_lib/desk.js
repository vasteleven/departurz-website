// The Desk: what Nate and managers run day to day without touching money.
//   booking requests and event days from clients (confirm or decline, the client gets an email either way)
//   notes clients chose to share from their calendar
//   crew tasks (assign, change, finish) and who is on which project
//   adding shoot days, review dates and deliveries to a project calendar
import { HttpError, lower, clean, today, esc, isEmail, id as newId, firstName, addDays } from './util.js';
import { add, patch, emails, isOff } from './roster.js';
import { send } from './mail.js';
import { siteUrl } from './mail.js';
import { day, isActive } from './projects.js';
import { teamContext, labelOf, crewOn, isClientEmail, ownerName } from './access.js';

const evId = e => 'r' + e._row;
const taskId = x => String(x.id || 'r' + x._row);
const longDate = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const portal = () => siteUrl() + '/portal-app.html';

async function staffCtx(email) {
  const ctx = await teamContext(email);
  if (!ctx.staff) throw new HttpError(403, 'The Desk is for Nate and managers.');
  return ctx;
}

export function deskData(ctx) {
  const { t, c } = ctx;
  const td = today();
  const proj = code => c.Projects.find(p => String(p.code) === String(code));
  const clientOf = p => { if (!p) return ''; const cl = c.Clients.find(r => emails(p.client_email).includes(lower(r.email))); return (cl && (cl.company || cl.name)) || emails(p.client_email)[0] || ''; };
  const clientByEmail = e => { const cl = c.Clients.find(r => lower(r.email) === lower(e)); return (cl && (cl.company || cl.name)) || e; };
  const crewName = e => (t.Team.find(r => lower(r.email) === lower(e)) || {}).name || e;
  const ev = e => { const p = proj(e.project_code); return { id: evId(e), date: day(e.date), type: lower(e.type), title: String(e.title || '').replace(/ \(requested\)$/, ''), note: e.note || '', status: lower(e.status), project: p ? String(p.code) : '', projectTitle: p ? p.title || '' : '', client: p ? clientOf(p) : clientByEmail(e.by), handledBy: e.handled_by || '' }; };
  const requests = c.Events.filter(e => ['book', 'event'].includes(lower(e.type)) && isClientEmail(c, e.by) && !['confirmed', 'declined'].includes(lower(e.status)) && day(e.date) && day(e.date) >= addDays(td, -2))
    .map(ev).sort((a, b) => a.date.localeCompare(b.date));
  const notes = c.Events.filter(e => lower(e.type) === 'note' && lower(e.status) === 'shared' && day(e.date) >= addDays(td, -30)).map(ev).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  const schedule = c.Events.filter(e => day(e.date) >= td && day(e.date) <= addDays(td, 60) && lower(e.type) !== 'note' && lower(e.status) !== 'declined' && !(isClientEmail(c, e.by) && lower(e.status) !== 'confirmed'))
    .map(ev).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 40);
  const tasks = t.Tasks.filter(x => x.title && (lower(x.status) !== 'done' || day(x.done_at) >= addDays(td, -14)))
    .map(x => ({ id: taskId(x), title: x.title, project: String(x.project || ''), assignee: lower(x.assignee), who: crewName(x.assignee), due: day(x.due), status: ['done', 'doing'].includes(lower(x.status)) ? lower(x.status) : 'todo', by: x.by || '' }))
    .sort((a, b) => (a.status === 'done') - (b.status === 'done') || (a.due || '9999').localeCompare(b.due || '9999'));
  const crew = t.Team.filter(r => isEmail(r.email) && !isOff(r.active)).map(r => ({ email: lower(r.email), name: r.name || r.email.split('@')[0], role: r.role || '' }));
  const projects = c.Projects.filter(isActive).map(p => ({ code: String(p.code), title: p.title || '', codeName: p.code_name || '', client: clientOf(p), status: p.status || '', crew: crewOn(t, p).map(r => lower(r.email)) }));
  return { requests, notes, schedule, tasks, crew, projects };
}

/* ---------- booking requests ---------- */
export async function booking(email, b) {
  const ctx = await staffCtx(email);
  const e = ctx.c.Events.find(x => evId(x) === String(b.id));
  if (!e || !['book', 'event'].includes(lower(e.type))) throw new HttpError(404, 'That request is not on the calendar anymore.');
  const ok = b.action === 'confirm';
  const note = clean(b.note, 1000);
  const title = String(e.title || '').replace(/ \(requested\)$/, '');
  await patch('clients', 'Events', e._row, { status: ok ? 'confirmed' : 'declined', handled_by: ctx.name, title, ...(note ? { note: [e.note, `${ctx.name}: ${note}`].filter(Boolean).join(' · ').slice(0, 2000) } : {}) });
  if (isEmail(e.by)) {
    const cl = ctx.c.Clients.find(r => lower(r.email) === lower(e.by)) || {};
    await send({
      to: e.by, subject: `${ok ? 'Confirmed' : 'About your request'}: ${title} on ${longDate(day(e.date))}`, heading: ok ? 'You\'re booked' : 'We can\'t make that one',
      html: `<p>Hi ${esc(firstName(cl.name))},</p><p>${ok ? `<b>${esc(title)}</b> on <b>${esc(longDate(day(e.date)))}</b> is confirmed. It's on your calendar in the portal.` : `We can't do <b>${esc(title)}</b> on <b>${esc(longDate(day(e.date)))}</b>.`}</p>${note ? `<p style="white-space:pre-wrap;background:#F1EFEA;border-radius:12px;padding:14px">${esc(note)}</p>` : ''}${ok ? '' : '<p>Pick another day in your portal calendar, or reply to this email and we\'ll find one that works.</p>'}<p>${esc(ownerName())}<br>DEPARTURZ</p>`,
      cta: { label: 'Open your calendar', url: portal() + '#/client/calendar' }
    });
  }
  return { status: ok ? 'confirmed' : 'declined' };
}

/* ---------- putting something on a project calendar ---------- */
export async function addEvent(email, b) {
  const ctx = await staffCtx(email);
  const p = ctx.c.Projects.find(x => String(x.code) === String(b.project));
  if (!p) throw new HttpError(404, 'Pick a project.');
  const date = day(b.date);
  if (!date) throw new HttpError(400, 'Pick a date.');
  const type = ['shoot', 'review', 'delivery', 'event'].includes(b.type) ? b.type : 'event';
  const title = clean(b.title, 100) || { shoot: 'Shoot day', review: 'Review', delivery: 'Delivery', event: 'Event' }[type];
  const note = clean(b.note, 1000);
  await add('clients', 'Events', { project_code: String(p.code), date, type, title, note, by: email, created_at: new Date().toISOString().slice(0, 16).replace('T', ' '), status: 'confirmed', handled_by: ctx.name });
  if (b.tell) {
    const to = emails(p.client_email);
    const cl = ctx.c.Clients.find(r => to.includes(lower(r.email))) || {};
    if (to.length) await send({ to, subject: `On your calendar: ${title}, ${longDate(date)}`, heading: 'New on your calendar', html: `<p>Hi ${esc(firstName(cl.name))},</p><p><b>${esc(title)}</b> is set for <b>${esc(longDate(date))}</b>.</p>${note ? `<p style="white-space:pre-wrap">${esc(note)}</p>` : ''}`, cta: { label: 'Open your calendar', url: portal() + '#/client/calendar' } });
  }
  // the crew on the project hear about shoot days
  if (type === 'shoot') for (const r of crewOn(ctx.t, p).filter(r => lower(r.email) !== email)) {
    await send({ to: r.email, subject: `Shoot day: ${longDate(date)} · ${labelOf(p)}`, heading: 'You\'re on a shoot', html: `<p>Hi ${esc(firstName(r.name))},</p><p><b>${esc(title)}</b> for <b>${esc(labelOf(p))}</b> is on <b>${esc(longDate(date))}</b>.</p>${note ? `<p style="white-space:pre-wrap">${esc(note)}</p>` : ''}`, cta: { label: 'Open Deadlines', url: portal() + '#/team/callsheet' } }).catch(() => {});
  }
  return { ok: true };
}

/* ---------- crew tasks ---------- */
export async function saveTask(email, b) {
  const ctx = await staffCtx(email);
  const assignee = lower(b.assignee);
  const tm = ctx.t.Team.find(r => lower(r.email) === assignee && !isOff(r.active));
  if (!tm) throw new HttpError(400, 'Pick who it\'s for.');
  const title = clean(b.title, 140);
  if (!title) throw new HttpError(400, 'Give the task a name.');
  const p = ctx.c.Projects.find(x => String(x.code) === String(b.project));
  const v = { title, assignee, project: p ? String(p.code) : clean(b.project, 80), due: day(b.due), status: ['todo', 'doing', 'done'].includes(b.status) ? b.status : 'todo' };
  let changedTo = '';
  if (b.id) {
    const x = ctx.t.Tasks.find(r => taskId(r) === String(b.id));
    if (!x) throw new HttpError(404, 'That task is gone.');
    if (lower(x.assignee) !== assignee) changedTo = assignee;
    await patch('team', 'Tasks', x._row, { ...v, done_at: v.status === 'done' ? (x.done_at || today()) : '', ...(changedTo ? { reminded_at: '' } : {}) });
  } else {
    await add('team', 'Tasks', { id: newId('t'), ...v, by: ctx.name });
    changedTo = assignee;
  }
  if (changedTo && changedTo !== email && v.status !== 'done') {
    const where = p ? (onCrew(ctx, p, tm) ? labelOf(p) : '') : v.project;
    await send({ to: tm.email, subject: `New task: ${title}${v.due ? ' · due ' + longDate(v.due) : ''}`, heading: 'A new task for you', html: `<p>Hi ${esc(firstName(tm.name))},</p><p>${esc(ctx.name)} gave you <b>${esc(title)}</b>${where ? ` for <b>${esc(where)}</b>` : ''}${v.due ? `, due <b>${esc(longDate(v.due))}</b>` : ''}.</p>`, cta: { label: 'Open Deadlines', url: portal() + '#/team/callsheet' } }).catch(() => {});
  }
  return { ok: true };
}
const onCrew = (ctx, p, tm) => crewOn(ctx.t, p).some(r => lower(r.email) === lower(tm.email));

/* ---------- who is on a project, and the name the crew know it by ---------- */
export async function saveProject(email, b) {
  const ctx = await staffCtx(email);
  const p = ctx.c.Projects.find(x => String(x.code) === String(b.code));
  if (!p) throw new HttpError(404, 'That project was not found.');
  const v = {};
  if (b.codeName !== undefined) v.code_name = clean(b.codeName, 60);
  let added = [];
  if (Array.isArray(b.crew)) {
    const list = [...new Set(b.crew.map(lower))].filter(e => ctx.t.Team.some(r => lower(r.email) === e));
    const before = crewOn(ctx.t, p).map(r => lower(r.email));
    added = list.filter(e => !before.includes(e));
    v.crew = list.join(', ');
  }
  await patch('clients', 'Projects', p._row, v);
  const label = v.code_name !== undefined ? v.code_name || String(p.code) : labelOf(p);
  for (const e of added.filter(e => e !== email)) {
    const r = ctx.t.Team.find(x => lower(x.email) === e);
    await send({ to: r.email, subject: `You're on ${label}`, heading: 'You\'re on a new project', html: `<p>Hi ${esc(firstName(r.name))},</p><p>${esc(ctx.name)} added you to <b>${esc(label)}</b>. Its dates are in Deadlines, its files are in Files, and cuts go to the editors room.</p>`, cta: { label: 'Open the crew portal', url: portal() + '#/team/lounge' } }).catch(() => {});
  }
  return { ok: true };
}
