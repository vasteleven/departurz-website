// The client side of the portal: what a client sees, and what they can send.
import { HttpError, lower, clean, today, yes, esc, money } from './util.js';
import { load, add, patch, emails, isOff } from './roster.js';
import { listFiles, fileInfo, startUpload, shareFile } from './google.js';
import { outFolder, docsFolder, clientInFolder, ticket, readTicket, logFile, kindOf } from './files.js';
import { thread, post, clientChan } from './messages.js';
import { send, NOTIFY } from './mail.js';
import { setTag, TAGS } from './kit.js';
import { limited } from './kv.js';

export const day = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
const num = v => { const n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; };
export const isActive = p => !/deliver|landed|complete|closed|cancel/i.test(String(p.status || ''));
export const needId = n => String(n.id || 'r' + n._row);
const TEXT_KINDS = ['copy', 'songs', 'script', 'shotlist', 'location'];

export function evType(label) {
  const s = String(label || '').toLowerCase();
  if (/shoot|film|record|session|drone/.test(s)) return 'shoot';
  if (/review|cut|draft|notes/.test(s)) return 'review';
  if (/deliver|final|launch|premiere/.test(s)) return 'delivery';
  return 'event';
}

export async function context(email, pick) {
  const c = await load('clients');
  const me = c.Clients.find(r => lower(r.email) === email) || null;
  const mine = c.Projects.filter(p => emails(p.client_email).includes(email));
  const project = mine.find(p => String(p.code) === String(pick)) || [...mine].reverse().find(isActive) || mine[mine.length - 1] || null;
  return { c, me, mine, project };
}

export function milestones(c, code) {
  const td = today();
  const rows = c.Milestones.filter(m => String(m.project_code) === String(code));
  rows.sort((a, b) => (day(a.date) || '9999').localeCompare(day(b.date) || '9999'));
  let hasNow = rows.some(m => lower(m.state) === 'now');
  return rows.map(m => {
    let s = lower(m.state);
    if (!['done', 'now', 'next'].includes(s)) {
      if (day(m.date) && day(m.date) < td) s = 'done';
      else if (!hasNow) { s = 'now'; hasNow = true; } else s = 'next';
    }
    return { label: clean(m.label, 120), date: day(m.date), state: s, note: clean(m.note, 600) };
  });
}

export async function clientData(email, pick) {
  const { c, me, mine, project } = await context(email, pick);
  const prefs = { updates: !isOff(me && me.updates), thanks: !isOff(me && me.thanks), offers: !isOff(me && me.offers) };
  const out = {
    me: {
      name: (me && me.name) || '', company: (me && me.company) || '', role: (me && me.role) || '', email, city: (me && me.city) || '', bio: (me && me.bio) || '',
      socials: { Instagram: (me && me.instagram) || '', TikTok: (me && me.tiktok) || '', YouTube: (me && me.youtube) || '', LinkedIn: (me && me.linkedin) || '', X: (me && me.x) || '', Website: (me && me.website) || '' },
      prefs
    },
    projects: mine.map(p => ({ code: String(p.code), title: p.title || '', status: p.status || '' })),
    project: null, milestones: [], review: null, needs: [], deliverables: [], documents: [], events: [], invoices: [], thread: [], unread: 0
  };
  if (!project) {
    out.events = c.Events.filter(e => !e.project_code && lower(e.by) === email && day(e.date)).map(e => ({ date: e.date, type: lower(e.type) || 'note', title: e.title || 'Note', note: e.note || '' }));
    return out;
  }
  const code = String(project.code);
  const ms = milestones(c, code);
  let progress = num(project.progress);
  if (progress > 1) progress /= 100;
  if (!project.progress && ms.length) progress = (ms.filter(m => m.state === 'done').length + 0.5 * ms.filter(m => m.state === 'now').length) / ms.length;
  out.project = { code, title: project.title || 'Your project', service: project.service || '', status: project.status || 'Booked', progress: Math.max(0, Math.min(1, progress)), lead: project.lead || 'Nate', seat: project.seat || '1A' };
  out.milestones = ms;
  if (project.review_file_id || project.review_title) {
    out.review = { title: project.review_title || 'New cut', date: day(project.review_date) || today(), length: String(project.review_length || ''), fileId: project.review_file_id || '', state: project.review_state || '' };
  }
  out.needs = c.Needs.filter(n => String(n.project_code) === code).map(n => {
    const kind = lower(n.kind) || 'files';
    return { id: needId(n), kind, label: n.label || 'Item', detail: n.detail || '', due: day(n.due), status: lower(n.status) === 'received' ? 'received' : 'open', text: n.text === '' || n.text == null ? TEXT_KINDS.includes(kind) : yes(n.text) };
  });
  out.invoices = c.Invoices.filter(i => String(i.project_code) === code).map(i => ({
    no: String(i.no || 'INV-' + i._row), label: i.label || 'Invoice', amount: num(i.amount), status: ['paid', 'sent'].includes(lower(i.status)) ? lower(i.status) : 'due', due: day(i.due), date: day(i.paid_date), via: i.via || ''
  }));
  const evs = c.Events.filter(e => String(e.project_code) === code && day(e.date)).map(e => ({ date: e.date, type: lower(e.type) || 'event', title: e.title || 'Event', note: e.note || '' }));
  ms.filter(m => m.date && !evs.some(e => e.date === m.date && e.title === m.label)).forEach(m => evs.push({ date: m.date, type: evType(m.label), title: m.label, note: m.note }));
  out.events = evs;
  // the project's Drive folders are made the first time the client opens it, so there's somewhere to deliver to
  if (!project.drive_folder_id) await outFolder(project).catch(e => console.log('[folders]', e.message));
  const [t, files] = await Promise.all([
    thread(clientChan(code), email),
    project.drive_folder_id ? outFolder(project, false).then(f => (f ? listFiles(f, 40) : [])).catch(() => []) : []
  ]);
  out.thread = t.msgs; out.unread = t.unread;
  out.documents = (await syncDocs(c, project).catch(e => { console.log('[docs]', e.message); return c.Documents.filter(d => String(d.project_code) === code); }))
    .map(docShape).sort((a, b) => docNo(a.ref) - docNo(b.ref));
  out.deliverables = files.map(f => ({ id: f.id, name: f.name, size: Number(f.size || 0), date: String(f.createdTime || '').slice(0, 10), kind: kindOf(f.mimeType, f.name), tag: f.id === project.review_file_id ? 'Review' : 'Final' }));
  return out;
}

/* ---------- documents: everything filed under the project's confirmation number ----------
   Files dropped into the project's Documents folder in Drive are added to the Documents tab with the next number
   (DPZ-0142-D1, D2…). Rows can also be added by hand, with a link instead of a file. */
const docNo = r => { const m = String(r || '').match(/-D(\d+)$/i); return m ? +m[1] : 0; };
export function guessKind(name) {
  const n = String(name || '').toLowerCase();
  if (/contract|agreement|terms|sow\b/.test(n)) return 'contract';
  if (/release|waiver|consent|nda/.test(n)) return 'release';
  if (/proposal|quote|estimate|budget/.test(n)) return 'proposal';
  if (/guide|how[ -]?to|step|setup|instructions/.test(n)) return 'guide';
  if (/call ?sheet/.test(n)) return 'call sheet';
  if (/shot ?list|storyboard/.test(n)) return 'shot list';
  if (/brief|treatment|deck/.test(n)) return 'brief';
  if (/invoice|receipt/.test(n)) return 'invoice';
  return 'other';
}
const docShape = d => ({
  ref: String(d.ref || ''), title: d.title || 'Document', kind: lower(d.kind) || 'other', date: day(d.date) || '',
  status: ['to sign', 'signed'].includes(lower(d.status)) ? lower(d.status) : 'info', note: d.note || '',
  fileId: d.file_id || '', url: /^https:\/\//.test(String(d.url || '')) ? d.url : '', acceptedAt: day(d.accepted_at), acceptedBy: d.accepted_by || ''
});
export async function syncDocs(c, project) {
  const code = String(project.code);
  const rows = c.Documents.filter(d => String(d.project_code) === code);
  let next = Math.max(0, ...rows.map(d => docNo(d.ref))) + 1;
  const added = [];
  // rows typed in by hand without a number get the next one
  for (const d of rows) if (!d.ref) { d.ref = `${code}-D${next++}`; await patch('clients', 'Documents', d._row, { ref: d.ref }); }
  if (project.drive_folder_id) {
    const folderId = await docsFolder(project, false).catch(() => '');
    const files = folderId ? await listFiles(folderId, 100).catch(() => []) : [];
    for (const f of [...files].reverse()) {                     // oldest first, so numbers follow the order they arrived
      if (rows.some(d => d.file_id === f.id) || added.some(d => d.file_id === f.id)) continue;
      const row = { ref: `${code}-D${next++}`, project_code: code, title: String(f.name).replace(/\.[a-z0-9]{2,5}$/i, ''), kind: guessKind(f.name), file_id: f.id, date: String(f.createdTime || '').slice(0, 10) || today(), status: 'info' };
      await add('clients', 'Documents', row);
      added.push(row);
    }
  }
  return rows.concat(added);
}

export async function acceptDoc(user, b) {
  const ctx = await mustProject(user, b.project);
  const codes = ctx.mine.map(p => String(p.code));
  const d = ctx.c.Documents.find(x => String(x.ref) === String(b.ref) && codes.includes(String(x.project_code)));
  if (!d) throw new HttpError(404, 'That document is not in your portal.');
  if (lower(d.status) !== 'to sign') throw new HttpError(409, 'That document does not need your signature.');
  const name = clean(b.name, 120);
  if (name.length < 3 || !b.agree) throw new HttpError(400, 'Tick the box and type your full name to accept.');
  const when = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  await patch('clients', 'Documents', d._row, { status: 'signed', accepted_at: today(), accepted_by: `${name} <${user.email}> · ${when}` });
  const p = ctx.c.Projects.find(x => String(x.code) === String(d.project_code)) || ctx.project;
  const html = `<p><b>${esc(name)}</b> (${esc(user.email)}) accepted <b>${esc(d.title)}</b> on ${esc(when)}.</p><p>Document <b>${esc(d.ref)}</b>, filed under confirmation <b>${esc(p.code)}</b> (${esc(p.title || '')}).</p>`;
  await send({ to: NOTIFY(), replyTo: user.email, subject: `Accepted: ${d.title} · ${d.ref}`, heading: 'Document accepted', html });
  await send({ to: user.email, subject: `You accepted ${d.title} · ${p.code}`, heading: 'Accepted. Thank you.', html: html + '<p>A copy stays in your portal under Documents.</p>' });
  return { ok: true, acceptedAt: today(), acceptedBy: `${name} <${user.email}> · ${when}` };
}

async function mustProject(user, code) {
  const ctx = await context(user.email, code);
  if (!ctx.project) throw new HttpError(409, 'There is no project on your account yet.');
  return ctx;
}
const who = (ctx, user) => (ctx.me && (ctx.me.company || ctx.me.name)) || user.email;

/* ---------- uploads (any size, straight to Drive) ---------- */
export async function uploadStart(user, b, originUrl) {
  if (await limited('up:' + user.email, 300, 3600)) throw new HttpError(429, 'That is a lot of uploads at once. Give it a few minutes.');
  const ctx = await mustProject(user, b.project);
  const n = b.need && b.need !== 'extra' ? ctx.c.Needs.find(x => needId(x) === String(b.need) && String(x.project_code) === String(ctx.project.code)) : null;
  const label = b.chat ? 'Chat' : n ? n.label : clean(b.label, 80) || 'Other';
  const parent = await clientInFolder(ctx.project, label);
  const url = await startUpload({ name: clean(b.name, 200) || 'upload', size: Number(b.size) || 0, mimeType: clean(b.type, 100), parentId: parent, origin: originUrl });
  return { url, ticket: await ticket({ email: user.email, parent, project: String(ctx.project.code), folder: `Clients / ${ctx.project.code} / ${label}` }) };
}
export async function uploadDone(user, b) {
  const t = await readTicket(b.ticket);
  if (!t || t.email !== user.email) throw new HttpError(403, 'That upload could not be matched to your project.');
  const f = await fileInfo(clean(b.id, 120));
  if (!(f.parents || []).includes(t.parent)) throw new HttpError(403, 'That file is not in your project folder.');
  await logFile({ by: user.email, name: f.name, size: Number(f.size || 0), mime: f.mimeType, folder: t.folder, project: t.project, drive_id: f.id });
  return { id: f.id, name: f.name, size: Number(f.size || 0), kind: kindOf(f.mimeType, f.name) };
}

/* ---------- check-in: the things we need from the client ---------- */
export async function needSubmit(user, b) {
  const ctx = await mustProject(user, b.project);
  const files = (Array.isArray(b.files) ? b.files : []).slice(0, 200).map(f => ({ id: clean(f.id, 120), name: clean(f.name, 200), size: Number(f.size) || 0 }));
  const text = clean(b.text, 40000);
  if (!files.length && !text) throw new HttpError(400, 'Add a file or type it in first.');
  let label = clean(b.label, 120) || 'Something else';
  if (b.id && b.id !== 'extra') {
    const n = ctx.c.Needs.find(x => needId(x) === String(b.id) && String(x.project_code) === String(ctx.project.code));
    if (!n) throw new HttpError(404, 'That item is not on your list.');
    label = n.label;
    const reply = [n.reply, text, files.length ? files.map(f => f.name).join(', ') : ''].filter(Boolean).join('\n\n').slice(0, 45000);
    await patch('clients', 'Needs', n._row, { status: 'received', received_at: today(), reply });
  }
  const list = files.map(f => `<li><a href="https://drive.google.com/file/d/${esc(f.id)}/view">${esc(f.name)}</a></li>`).join('');
  const folderLink = ctx.project.drive_folder_id ? `https://drive.google.com/drive/folders/${ctx.project.drive_folder_id}` : '';
  await send({
    to: NOTIFY(), replyTo: user.email,
    subject: `${who(ctx, user)} sent: ${label} (${ctx.project.code})`,
    heading: `${label} is in`,
    html: `<p><b>${esc(who(ctx, user))}</b> sent this for <b>${esc(ctx.project.title)}</b>.</p>${text ? `<p style="white-space:pre-wrap;background:#F1EFEA;border-radius:12px;padding:14px">${esc(text)}</p>` : ''}${list ? `<ul>${list}</ul>` : ''}`,
    cta: folderLink ? { label: 'Open the project folder', url: folderLink } : null
  });
  return { ok: true };
}

/* ---------- calendar: bookings, event days and notes ---------- */
export async function addEvent(user, b) {
  const ctx = await context(user.email, b.project);
  const date = day(b.date);
  if (!date) throw new HttpError(400, 'Pick a date first.');
  const kind = ['book', 'event', 'note'].includes(b.kind) ? b.kind : 'note';
  const what = clean(b.what, 80), note = clean(b.note, 2000);
  const title = kind === 'note' ? (note.split('\n')[0].slice(0, 80) || 'Note') : what + (kind === 'book' ? ' (requested)' : '');
  const row = { project_code: ctx.project ? String(ctx.project.code) : '', date, type: kind, title, note: kind === 'note' ? note : [b.start && `Starts ${clean(b.start, 10)}`, b.hours && `${clean(b.hours, 4)} hours`, note].filter(Boolean).join(' · '), by: user.email, created_at: new Date().toISOString().slice(0, 16).replace('T', ' ') };
  await add('clients', 'Events', row);
  if (kind !== 'note' || b.share) {
    await send({
      to: NOTIFY(), replyTo: user.email,
      subject: `${kind === 'book' ? 'Booking request' : kind === 'event' ? 'Event day' : 'Calendar note'}: ${date} from ${who(ctx, user)}`,
      heading: kind === 'book' ? 'New booking request' : kind === 'event' ? 'New event day' : 'New calendar note',
      html: `<p><b>${esc(who(ctx, user))}</b>${ctx.project ? ` (${esc(ctx.project.code)}, ${esc(ctx.project.title)})` : ''} added this to their calendar.</p><p><b>${esc(new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }))}</b><br>${esc(title)}</p>${row.note ? `<p style="white-space:pre-wrap">${esc(row.note)}</p>` : ''}<p>Reply to this email to confirm with them.</p>`
    });
  }
  return { event: { date, type: kind, title, note: row.note } };
}

/* ---------- reviewing a cut ---------- */
export async function review(user, b) {
  const ctx = await mustProject(user, b.project);
  const p = ctx.project;
  const approve = b.action === 'approve';
  const notes = clean(b.notes, 8000);
  if (!approve && !notes) throw new HttpError(400, 'Add your notes first.');
  await patch('clients', 'Projects', p._row, { review_state: approve ? 'Approved' : 'Notes sent' });
  await post(clientChan(p.code), { email: user.email, name: (ctx.me && ctx.me.name) || user.email, text: approve ? `Approved: ${p.review_title || 'the latest cut'}.` : `Notes on ${p.review_title || 'the latest cut'}:\n${notes}` });
  await send({
    to: NOTIFY(), replyTo: user.email,
    subject: `${approve ? 'Approved' : 'Notes'}: ${p.review_title || 'cut'} (${p.code})`,
    heading: approve ? 'Cut approved' : 'Notes on the cut',
    html: `<p><b>${esc(who(ctx, user))}</b> ${approve ? 'approved' : 'sent notes on'} <b>${esc(p.review_title || 'the latest cut')}</b> for ${esc(p.title)}.</p>${notes ? `<p style="white-space:pre-wrap;background:#F1EFEA;border-radius:12px;padding:14px">${esc(notes)}</p>` : ''}`
  });
  return { ok: true };
}

/* ---------- profile, socials and email choices ---------- */
const SOC = { Instagram: 'instagram', TikTok: 'tiktok', YouTube: 'youtube', LinkedIn: 'linkedin', X: 'x', Website: 'website' };
export async function profile(user, b) {
  const { me } = await context(user.email);
  const row = {};
  for (const k of ['name', 'company', 'role', 'city']) if (b[k] !== undefined) row[k] = clean(b[k], 120);
  if (b.bio !== undefined) row.bio = clean(b.bio, 1500);
  for (const [k, col] of Object.entries(SOC)) if (b.socials && b.socials[k] !== undefined) row[col] = clean(b.socials[k], 200);
  const prefs = b.prefs || {};
  for (const k of ['updates', 'thanks', 'offers']) if (prefs[k] !== undefined) row[k] = prefs[k] ? 'yes' : 'no';
  if (me) await patch('clients', 'Clients', me._row, row);
  else await add('clients', 'Clients', { email: user.email, ...row });
  const map = { updates: TAGS.updates, thanks: TAGS.thanks, offers: TAGS.offers };
  for (const k of Object.keys(map)) if (prefs[k] !== undefined) await setTag(user.email, map[k], !!prefs[k]).catch(e => console.log('[kit]', e.message));
  return { ok: true };
}

/* ---------- opening files ---------- */
export async function canOpenAsClient(user, fid) {
  const { c, mine } = await context(user.email);
  const codes = mine.map(p => String(p.code));
  if (mine.some(p => p.review_file_id === fid)) return true;
  const t = await load('team');
  if (t.Files.some(f => f.drive_id === fid && codes.includes(String(f.project)))) return true;
  if (c.Documents.some(d => d.file_id === fid && codes.includes(String(d.project_code)))) return true;
  const info = await fileInfo(fid).catch(() => null);
  for (const p of mine) {
    if (!p.drive_folder_id || !info) continue;
    const ok = [await outFolder(p, false), await docsFolder(p, false)];
    if ((info.parents || []).some(x => ok.includes(x))) return true;
  }
  return false;
}
export async function openFile(fid) { return shareFile(fid); }

/* ---------- printable receipts ---------- */
export async function receipt(user, q) {
  const { c, mine, project } = await context(user.email, q.get('project'));
  const codes = mine.map(p => String(p.code));
  const no = q.get('no');
  const rows = c.Invoices.filter(i => codes.includes(String(i.project_code)) && lower(i.status) === 'paid' && (!no || String(i.no) === no) && (no || !project || String(i.project_code) === String(project.code)));
  if (!rows.length) throw new HttpError(404, 'No paid invoices yet.');
  const me = c.Clients.find(r => lower(r.email) === user.email) || {};
  const total = rows.reduce((a, i) => a + num(i.amount), 0);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DEPARTURZ receipt</title>
<style>body{font-family:Arial,Helvetica,sans-serif;background:#F1EFEA;color:#0A0A0A;margin:0;padding:24px}main{max-width:640px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden}header{background:#0A0A0A;color:#F2F0EB;padding:20px 26px;font-weight:900;letter-spacing:.08em;display:flex;justify-content:space-between}header span{font-weight:400;letter-spacing:0;color:#BEBCB6}.bar{height:4px;background:linear-gradient(90deg,#3FB8EE,#9E80F2)}section{padding:24px 26px}h1{margin:0 0 4px;text-transform:uppercase;font-size:28px}table{width:100%;border-collapse:collapse;margin-top:18px;font-size:14px}td,th{padding:10px 0;border-bottom:1px solid #E6E3DC;text-align:left}td:last-child,th:last-child{text-align:right}tfoot td{font-weight:900;font-size:18px;border:0}.m{color:#6B6A66;font-size:13px}button{margin-top:18px;background:#0A0A0A;color:#fff;border:0;border-radius:99px;padding:12px 20px;font-weight:700;cursor:pointer}@media print{body{background:#fff;padding:0}button{display:none}}</style></head>
<body><main><header>DEPARTURZ<span>Receipt</span></header><div class="bar"></div><section>
<h1>Paid. Thank you.</h1><div class="m">${esc(me.company || me.name || user.email)} · ${esc(user.email)}</div><p style="margin:14px 0 0;font-size:13px">Confirmation <b style="font-family:monospace;font-size:15px;letter-spacing:.06em">${esc([...new Set(rows.map(i => String(i.project_code)))].join(', '))}</b></p>
<table><thead><tr><th>Invoice</th><th>Paid</th><th>Amount</th></tr></thead><tbody>
${rows.map(i => `<tr><td><b>${esc(i.label || 'Invoice')}</b><br><span class="m">${esc(i.no)} · ${esc(i.project_code)}${i.via ? ' · ' + esc(i.via) : ''}</span></td><td>${esc(day(i.paid_date) || '')}</td><td>${esc(money(num(i.amount)))}</td></tr>`).join('')}
</tbody><tfoot><tr><td colspan="2">Total paid</td><td>${esc(money(total))}</td></tr></tfoot></table>
<p class="m" style="margin-top:22px">DEPARTURZ · 3311 La Cienega Blvd., Los Angeles, CA 90016 · 2000 Crawford St., Houston, TX 77002</p>
<button onclick="print()">Save as PDF or print</button></section></main></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

