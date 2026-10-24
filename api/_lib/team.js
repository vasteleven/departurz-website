// The crew side: chat, deadlines, files, pay and crew cards. Admins (Team tab, admin = yes) also see
// every client thread, approve hours, mark payouts paid and send thank-you notes.
import { HttpError, lower, clean, today, yes, esc, money, firstName, isEmail, id as newId } from './util.js';
import { load, add, patch, emails, isOff } from './roster.js';
import { fileInfo, startUpload, g } from './google.js';
import { createHash } from 'node:crypto';
import { teamFolder, outFolder, ticket, readTicket, logFile, kindOf } from './files.js';
import { thread, dmId, groupChan, clientChan } from './messages.js';
import { send, NOTIFY } from './mail.js';
import { day, isActive, milestones, evType } from './client.js';
import { limited } from './kv.js';

const num = v => { const n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; };
const taskId = x => String(x.id || 'r' + x._row);
const payId = x => String(x.id || 'r' + x._row);
const sinceYear = v => { const n = Number(v); if (n > 20000) return new Date(Math.round((n - 25569) * 86400000)).getUTCFullYear(); return String(v || '').slice(0, 4); };
// the About page's crew section: anyone on the Team tab with public = yes
export const photoKey = email => createHash('sha256').update('photo:' + lower(email)).digest('hex').slice(0, 16);
const DEPT = [['directors', /direct|founder|\bad\b|producer/], ['editors', /edit|vfx|color|colour|motion|post/], ['photographers', /photo|stills/], ['grip', /gaffer|grip|light|electric|best boy/], ['web', /web|design|develop/], ['sound', /sound|audio|dj|mix|boom/]];
export function deptOf(department, role) {
  const s = lower(department) + ' ' + lower(role);
  const hit = DEPT.find(([, re]) => re.test(s));
  return hit ? hit[0] : 'directors';
}
const photoUrl = r => (r.photo ? `/api/p/crew/photo?k=${photoKey(r.email)}` : '');
export async function publicCrew() {
  const t = await load('team');
  return t.Team.filter(r => isEmail(r.email) && yes(r.public) && !isOff(r.active)).map(r => ({
    name: r.name || '', role: r.role || '', department: deptOf(r.department, r.role), city: r.city || '', bio: clean(r.bio, 400), photo: photoUrl(r),
    socials: Object.fromEntries([['Instagram', r.instagram], ['Vimeo', r.vimeo], ['LinkedIn', r.linkedin], ['Website', r.website]].filter(([, v]) => v))
  }));
}
// profile photos come out of the Drive through here; unpublished ones only for signed-in crew
export async function crewPhoto(k, signedInCrew) {
  const t = await load('team');
  const r = t.Team.find(x => isEmail(x.email) && x.photo && photoKey(x.email) === k);
  const pub = r && yes(r.public) && !isOff(r.active);
  if (!r || (!pub && !signedInCrew)) throw new HttpError(404, 'No photo.');
  if (/^https:\/\//.test(String(r.photo))) return new Response(null, { status: 302, headers: { Location: r.photo } });
  const res = await g(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(r.photo)}?alt=media`, { raw: true });
  if (!res.ok) throw new HttpError(404, 'That photo is not in the Drive anymore.');
  if (Number(res.headers.get('content-length') || 0) > 4000000) throw new HttpError(413, 'That photo is over 4 MB. Upload a smaller one.');
  return new Response(res.body, { headers: { 'Content-Type': res.headers.get('content-type') || 'image/jpeg', 'Cache-Control': pub ? 'public, max-age=3600, s-maxage=86400' : 'private, max-age=600' } });
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function people(t, c) {
  const map = {};
  t.Team.forEach(r => { if (r.email) map[lower(r.email)] = r.name || r.email; });
  c.Clients.forEach(r => { if (r.email && !map[lower(r.email)]) map[lower(r.email)] = r.company || r.name || r.email; });
  return e => map[lower(e)] || String(e || '').split('@')[0];
}
const assignedTo = (x, me) => { const a = lower(x.assignee); return a && (a === me.email || a === lower(me.name)); };

export async function teamContext(email) {
  const [t, c] = await Promise.all([load('team'), load('clients')]);
  const row = t.Team.find(r => lower(r.email) === email);
  if (!row) throw new HttpError(403, 'You are not on the crew list.');
  return { t, c, row, admin: yes(row.admin), name: row.name || email.split('@')[0], email };
}

// every conversation this person can see: group channels, client threads (admins and the project lead), and DMs
export function channelList(ctx) {
  const { t, c, email, admin } = ctx;
  const memberOf = m => { const s = String(m || '').trim(); return !s || /^all$/i.test(s) || emails(s).includes(email) || s.toLowerCase().split(/\s*,\s*/).includes(lower(ctx.name)); };
  const groups = t.Channels.filter(ch => (ch.id || ch.name) && memberOf(ch.members)).map(ch => ({ id: groupChan(ch.id || ch.name), name: String(ch.name || ch.id).replace(/^#/, ''), kind: 'channel' }));
  if (!groups.length) groups.push({ id: 'ch-general', name: 'general', kind: 'channel' });
  const clientThreads = c.Projects.filter(isActive).filter(p => admin || lower(p.lead) === lower(ctx.name)).map(p => {
    const cl = c.Clients.find(r => emails(p.client_email).includes(lower(r.email)));
    return { id: clientChan(p.code), name: (cl && (cl.company || cl.name)) || p.title || String(p.code), sub: `${p.code} · ${p.title || ''}`, kind: 'client', code: String(p.code), to: emails(p.client_email) };
  });
  const dms = t.Team.filter(r => lower(r.email) !== email && !isOff(r.active) && isEmail(r.email)).map(r => ({ id: dmId(email, r.email), name: r.name || r.email.split('@')[0], kind: 'dm', to: [lower(r.email)] }));
  return groups.concat(clientThreads, dms);
}

export async function teamData(email) {
  const ctx = await teamContext(email);
  const { t, c, row, admin } = ctx;
  const nameOf = people(t, c);
  const crewRows = t.Team.filter(r => lower(r.email) !== email && !isOff(r.active) && isEmail(r.email));
  const me = {
    email, admin, name: ctx.name, role: row.role || 'Crew', city: row.city || '', tz: row.tz || 'America/Los_Angeles',
    since: row.since ? 'Crew since ' + sinceYear(row.since) : 'DEPARTURZ crew', bio: row.bio || '',
    skills: String(row.skills || '').split(',').map(s => s.trim()).filter(Boolean),
    socials: { Instagram: row.instagram || '', Vimeo: row.vimeo || '', LinkedIn: row.linkedin || '', Website: row.website || '' },
    payout: { method: row.payout_method || 'Not set yet', detail: row.payout_detail || 'Add how you would like to be paid' },
    rate: row.rate || '', photo: photoUrl(row), department: deptOf(row.department, row.role), public: yes(row.public)
  };
  const crew = crewRows.map(r => ({ key: dmId(email, r.email), name: r.name || r.email.split('@')[0], role: r.role || '', city: r.city || '', tz: r.tz || 'America/Los_Angeles' }));

  // conversations
  const all = channelList(ctx);
  const active = c.Projects.filter(isActive);
  const threads = await Promise.all(all.map(ch => thread(ch.id, email, 50)));
  const channels = all.map((ch, i) => ({ id: ch.id, name: ch.name, sub: ch.sub || '', kind: ch.kind, code: ch.code || '', msgs: threads[i].msgs, unread: threads[i].unread }));

  // deadlines
  const tasks = t.Tasks.filter(x => assignedTo(x, ctx) && x.title).map(x => ({ id: taskId(x), title: x.title, project: x.project || '', due: day(x.due), status: ['done', 'doing'].includes(lower(x.status)) ? lower(x.status) : 'todo', by: x.by || 'Nate' }));
  const events = [];
  for (const p of active) {
    milestones(c, p.code).forEach(m => { const ty = evType(m.label); if (m.date && ty !== 'event') events.push({ date: m.date, type: ty, title: `${p.title || p.code}: ${m.label}`, sub: String(p.code) }); });
    c.Events.filter(e => String(e.project_code) === String(p.code) && day(e.date) && ['shoot', 'event', 'book', 'review', 'delivery'].includes(lower(e.type)))
      .forEach(e => { const ty = lower(e.type); events.push({ date: e.date, type: ty === 'event' || ty === 'book' ? 'shoot' : ty, title: `${p.title || p.code}: ${e.title}`, sub: String(p.code) }); });
  }

  // files
  const files = [...t.Files].filter(f => f.drive_id).sort((a, b) => (day(b.date) || '').localeCompare(day(a.date) || '') || b._row - a._row).slice(0, 40)
    .map(f => ({ id: f.drive_id, name: f.name, size: num(f.size), by: nameOf(f.by), date: day(f.date) || today(), kind: kindOf(f.mime, f.name), folder: String(f.folder || '').replace(/^Team \/ /, '') }));
  const folders = [...new Set(active.map(p => p.title || String(p.code)).concat(['General', 'Drone footage', 'Music and sound']))];

  // pay
  const mine = t.Payouts.filter(p => lower(p.email) === email);
  const yr = today().slice(0, 4);
  const paid = mine.filter(p => lower(p.status) === 'paid');
  const waiting = mine.filter(p => ['pending', 'submitted'].includes(lower(p.status)));
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i);
    const key = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
    months.push([MONTHS[d.getUTCMonth()], paid.filter(p => String(day(p.date)).startsWith(key)).reduce((a, p) => a + num(p.amount), 0)]);
  }
  const next = waiting.map(p => day(p.date)).filter(Boolean).sort()[0] || '';
  const pay = {
    year: paid.filter(p => String(day(p.date)).startsWith(yr)).reduce((a, p) => a + num(p.amount), 0),
    pending: waiting.reduce((a, p) => a + num(p.amount), 0), next,
    rate: me.rate ? (/^\s*\$?\d/.test(String(me.rate)) ? 'Day rate ' + money(num(me.rate)) : String(me.rate)) : '',
    payouts: [...mine].sort((a, b) => (day(b.date) || '9999').localeCompare(day(a.date) || '9999')).slice(0, 20)
      .map(p => ({ id: payId(p), label: p.label || p.project || 'Work', amount: num(p.amount), date: day(p.date), status: ['paid', 'pending'].includes(lower(p.status)) ? lower(p.status) : 'submitted' })),
    months
  };
  const kudos = t.Kudos.filter(k => lower(k.email) === email && k.text && (k.sent_at || (day(k.date) && day(k.date) <= today())))
    .sort((a, b) => (day(b.date) || '').localeCompare(day(a.date) || '')).map(k => ({ from: k.from || 'Nate', date: day(k.date) || day(k.sent_at) || today(), text: k.text }));

  const out = { me, crew, channels, tasks, events, files, folders, pay, kudos };
  if (admin) {
    out.admin = {
      approvals: t.Payouts.filter(p => lower(p.status) === 'submitted').map(p => ({ id: payId(p), who: nameOf(p.email), label: p.label || p.project || 'Work', amount: num(p.amount), note: p.note || '' })),
      scheduled: t.Payouts.filter(p => lower(p.status) === 'pending').map(p => ({ id: payId(p), who: nameOf(p.email), label: p.label || p.project || 'Work', amount: num(p.amount), date: day(p.date) })),
      crew: crew.map(x => ({ key: x.key, name: x.name })),
      clients: active.map(p => ({ code: String(p.code), title: p.title || '', email: emails(p.client_email)[0] || '' }))
    };
  }
  return out;
}

/* ---------- actions ---------- */
export async function toggleTask(email, b) {
  const ctx = await teamContext(email);
  const x = ctx.t.Tasks.find(r => taskId(r) === String(b.id));
  if (!x || !(assignedTo(x, ctx) || ctx.admin)) throw new HttpError(404, 'That task is not on your list.');
  const done = lower(x.status) !== 'done';
  await patch('team', 'Tasks', x._row, { status: done ? 'done' : 'todo', done_at: done ? today() : '' });
  if (done) await send({ to: NOTIFY(), subject: `Done: ${x.title} (${ctx.name})`, heading: 'Task done', html: `<p><b>${esc(ctx.name)}</b> finished <b>${esc(x.title)}</b>${x.project ? ` for ${esc(x.project)}` : ''}.</p>` });
  return { status: done ? 'done' : 'todo' };
}

const SOC = { Instagram: 'instagram', Vimeo: 'vimeo', LinkedIn: 'linkedin', Website: 'website' };
export async function teamProfile(email, b) {
  const { row } = await teamContext(email);
  const v = {};
  if (b.bio !== undefined) v.bio = clean(b.bio, 1500);
  if (b.city !== undefined) v.city = clean(b.city, 80);
  if (b.tz !== undefined && /^[A-Za-z_]+\/[A-Za-z_\/-]+$/.test(b.tz)) v.tz = b.tz;
  if (Array.isArray(b.skills)) v.skills = b.skills.map(s => clean(s, 40)).filter(Boolean).slice(0, 20).join(', ');
  for (const [k, col] of Object.entries(SOC)) if (b.socials && b.socials[k] !== undefined) v[col] = clean(b.socials[k], 200);
  if (b.photo !== undefined) {
    // only a photo this person uploaded themselves
    const ctx = await teamContext(email);
    const f = ctx.t.Files.find(x => x.drive_id === String(b.photo) && lower(x.by) === email);
    if (!f || !/^image\//.test(String(f.mime || ''))) throw new HttpError(400, 'Upload an image first.');
    v.photo = f.drive_id;
  }
  await patch('team', 'Team', row._row, v);
  return { ok: true };
}

export async function payoutMethod(email, b) {
  const { row } = await teamContext(email);
  const method = clean(b.method, 60), detail = clean(b.detail, 120);
  if (/\d{7,}/.test(detail.replace(/[\s-]/g, ''))) throw new HttpError(400, 'Only the account email or the last 4 digits here, please. Never a full account number.');
  await patch('team', 'Team', row._row, { payout_method: method, payout_detail: detail });
  return { ok: true };
}

export async function submitHours(email, b) {
  const ctx = await teamContext(email);
  const days = Math.max(0, Math.min(60, Number(b.days) || 0)), extra = Math.max(0, Math.min(100000, Number(b.extra) || 0));
  const note = clean(b.note, 600), project = clean(b.project, 120);
  if (!days && !extra) throw new HttpError(400, 'Add days or costs first.');
  const amount = Math.round((days * num(ctx.row.rate) + extra) * 100) / 100;
  const pid = newId('p');
  await add('team', 'Payouts', { id: pid, email, label: [project, note].filter(Boolean).join(': ').slice(0, 140) || 'Hours', amount, date: '', status: 'submitted', project, days, extra, note });
  await send({ to: NOTIFY(), subject: `Hours from ${ctx.name}: ${money(amount)}`, heading: 'Hours to approve', html: `<p><b>${esc(ctx.name)}</b> submitted ${days} day${days === 1 ? '' : 's'}${extra ? ` plus ${esc(money(extra))} in costs` : ''} for <b>${esc(project || 'a project')}</b>.</p>${note ? `<p>${esc(note)}</p>` : ''}<p><b>${esc(money(amount))}</b>${num(ctx.row.rate) ? ` at ${esc(money(num(ctx.row.rate)))} a day` : ' (no day rate on file, so only costs are counted)'}.</p><p>Approve it in the crew portal under Payroll.</p>` });
  return { id: pid, amount };
}

/* uploads into the team Drive (or, from a client thread, into that client's delivery folder) */
export async function teamUploadStart(email, b, originUrl) {
  const ctx = await teamContext(email);
  if (await limited('up:' + email, 600, 3600)) throw new HttpError(429, 'That is a lot of uploads at once. Give it a few minutes.');
  let parent, folderLabel, project = '';
  const m = String(b.thread || '').match(/^client-(.+)$/);
  if (m) {
    const p = ctx.c.Projects.find(x => String(x.code).replace(/[^A-Za-z0-9_-]/g, '') === m[1]);
    if (!p || !(ctx.admin || lower(p.lead) === lower(ctx.name))) throw new HttpError(403, 'You are not on that client thread.');
    parent = await outFolder(p); project = String(p.code); folderLabel = `Clients / ${p.code} / From DEPARTURZ`;
  } else {
    const name = b.chat ? 'Chat' : clean(b.folder, 80) || 'General';
    parent = await teamFolder(name); folderLabel = `Team / ${name}`;
  }
  const url = await startUpload({ name: clean(b.name, 200) || 'upload', size: Number(b.size) || 0, mimeType: clean(b.type, 100), parentId: parent, origin: originUrl });
  return { url, ticket: await ticket({ email, parent, project, folder: folderLabel }) };
}
export async function teamUploadDone(email, b) {
  const t = await readTicket(b.ticket);
  if (!t || t.email !== email) throw new HttpError(403, 'That upload could not be matched.');
  const f = await fileInfo(clean(b.id, 120));
  if (!(f.parents || []).includes(t.parent)) throw new HttpError(403, 'That file is not in the folder it was sent to.');
  await logFile({ by: email, name: f.name, size: Number(f.size || 0), mime: f.mimeType, folder: t.folder, project: t.project, drive_id: f.id });
  return { id: f.id, name: f.name, size: Number(f.size || 0), kind: kindOf(f.mimeType, f.name), folder: t.folder.replace(/^Team \/ /, '') };
}

export async function canOpenAsTeam(email, fid) {
  const ctx = await teamContext(email);
  if (ctx.admin) return true;
  return ctx.t.Files.some(f => f.drive_id === fid) || ctx.c.Projects.some(p => p.review_file_id === fid);
}

/* ---------- admin ---------- */
async function adminCtx(email) { const ctx = await teamContext(email); if (!ctx.admin) throw new HttpError(403, 'Only admins can do that.'); return ctx; }

export async function approvePayout(email, b) {
  const ctx = await adminCtx(email);
  const p = ctx.t.Payouts.find(x => payId(x) === String(b.id));
  if (!p) throw new HttpError(404, 'That payout was not found.');
  const date = day(b.date) || (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() + ((5 - d.getUTCDay() + 7) % 7 || 7)); return d.toISOString().slice(0, 10); })();
  await patch('team', 'Payouts', p._row, { status: 'pending', date });
  const crew = ctx.t.Team.find(r => lower(r.email) === lower(p.email));
  if (crew) await send({ to: crew.email, subject: `Approved: ${money(num(p.amount))}`, heading: 'Your hours are approved', html: `<p>Hi ${esc(firstName(crew.name))},</p><p><b>${esc(p.label || 'Your hours')}</b> for <b>${esc(money(num(p.amount)))}</b> is approved and scheduled to pay out on <b>${esc(date)}</b>.</p><p>Thank you for the work.</p>` });
  return { ok: true, date };
}

export async function markPayoutPaid(email, b) {
  const ctx = await adminCtx(email);
  const p = ctx.t.Payouts.find(x => payId(x) === String(b.id));
  if (!p) throw new HttpError(404, 'That payout was not found.');
  const crew = ctx.t.Team.find(r => lower(r.email) === lower(p.email));
  const via = clean(b.via, 40) || (crew && crew.payout_method) || '';
  await patch('team', 'Payouts', p._row, { status: 'paid', date: today(), via });
  if (crew) await send({ to: crew.email, subject: `You've been paid: ${money(num(p.amount))}`, heading: 'Payment sent', html: `<p>Hi ${esc(firstName(crew.name))},</p><p>We just sent <b>${esc(money(num(p.amount)))}</b> for <b>${esc(p.label || 'your work')}</b>${via ? ` by ${esc(via)}` : ''}. It can take a day or two to land depending on the provider.</p><p>Thank you for everything you put into this one.</p>` });
  return { ok: true };
}

export async function sendKudos(email, b) {
  const ctx = await adminCtx(email);
  const crew = ctx.t.Team.find(r => isEmail(r.email) && dmId(email, r.email) === String(b.to));
  const text = clean(b.text, 2000);
  if (!crew || !text) throw new HttpError(400, 'Pick someone and write the note first.');
  await add('team', 'Kudos', { email: lower(crew.email), from: ctx.name, date: today(), text, sent_at: today() });
  await send({ to: crew.email, subject: `A thank-you from ${ctx.name}`, heading: `Thank you, ${firstName(crew.name)}`, html: `<p style="font-size:17px;line-height:1.6">${esc(text).replace(/\n/g, '<br>')}</p><p>${esc(ctx.name)}<br>DEPARTURZ</p>` });
  return { ok: true };
}
