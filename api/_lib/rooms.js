// The two screening rooms.
//   Client review room: whatever is in a project's "For review" Drive folder (Nate drops files there, or sends a cut
//     over from the editors room). The client watches it, leaves notes on the frame or the page, then approves it
//     or asks for changes.
//   Editors room: cuts the crew upload for a project they're on. Nate (and managers) leave notes; only Nate approves
//     a cut and sends it to the client. Editors also see the client's notes on their project, signed "Client".
// Notes live in Redis, one list per item. Files play through /api/p/media in pieces (Vercel caps a response at
// 4.5 MB), which also keeps them on our own address so the room can paint them onto the screens.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError, lower, clean, today, esc, env, need, id as newId, firstName } from './util.js';
import { load, add, patch, emails } from './roster.js';
import { g, listFiles, fileInfo } from './google.js';
import { folder, projectRoot, teamFolder } from './files.js';
import { kv } from './kv.js';
import { send, NOTIFY, siteUrl } from './mail.js';
import { post, clientChan } from './messages.js';
import { day, isActive } from './projects.js';
import { teamContext, myProjects, labelOf, projLabel, projFolder, crewOn, ownerName } from './access.js';

const DRIVE = 'https://www.googleapis.com/drive/v3/files';
export const REVIEW = 'For review';
const num = v => { const n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; };
const portal = () => siteUrl() + '/portal-app.html';

export async function reviewFolder(p, create = true) {
  const root = await projectRoot(p, create);
  return root ? folder(REVIEW, root) : '';
}
export async function cutsFolder(p) { return folder('Cuts', await teamFolder(projFolder(p))); }

// "Teaser 15s v2.mp4", "Teaser_15s_V03.mov", "Teaser 15s (v4).pdf" → "Teaser 15s", version 2 / 3 / 4
export function splitName(name) {
  const base = String(name || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_+/g, ' ').trim();
  const m = base.match(/^(.*?)[\s.\-(]*\bv(?:er(?:sion)?)?\s?0*(\d{1,3})\)?$/i);
  if (m && m[1].trim()) return { title: m[1].trim(), version: +m[2] };
  return { title: base || 'Untitled', version: 0 };
}
export function roomKind(mime, name) {
  const m = String(mime || ''), n = String(name || '').toLowerCase();
  if (m === 'application/pdf' || /\.pdf$/.test(n) || /google-apps\.(document|presentation|spreadsheet)/.test(m)) return 'pdf';
  if (m.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/.test(n)) return 'video';
  if (m.startsWith('audio/') || /\.(wav|mp3|m4a|aac|aif+|flac)$/.test(n)) return 'audio';
  if (m.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|tiff?|psd)$/.test(n)) return 'image';
  return 'file';
}
const included = p => num(p.review_rounds) || num(env('REVIEW_ROUNDS', 2)) || 2;
const roundsUsed = (c, code) => c.Reviews.filter(r => String(r.project_code) === String(code) && lower(r.status) === 'changes').length;
const STATUS = s => (['approved', 'changes'].includes(lower(s)) ? lower(s) : 'waiting');

/* ---------- the For review folder → Reviews tab ---------- */
export async function syncReviews(c, p, force = false) {
  const code = String(p.code);
  const rows = c.Reviews.filter(r => String(r.project_code) === code);
  const added = [];
  // the single review_file_id from before the review room becomes its first item
  if (p.review_file_id && !rows.some(r => r.file_id === p.review_file_id)) {
    const st = /approved/i.test(p.review_state) ? 'approved' : /notes/i.test(p.review_state) ? 'changes' : 'waiting';
    const nm = splitName(p.review_title || 'New cut');
    const row = { id: newId('rv'), project_code: code, title: nm.title, version: nm.version || 1, file_id: p.review_file_id, kind: 'video', status: st, round: 1, sent_at: day(p.review_date) || today(), notified_at: p.review_notified ? today() : '' };
    await add('clients', 'Reviews', row); added.push(row);
  }
  if (p.drive_folder_id && (force || await kv.set('revsync:' + code, '1', { nx: true, ex: 60 }))) {
    const fid = await reviewFolder(p, false).catch(() => '');
    const files = fid ? await listFiles(fid, 100).catch(() => []) : [];
    for (const f of [...files].reverse()) {                        // oldest first, so versions count up in order
      if (rows.some(r => r.file_id === f.id) || added.some(r => r.file_id === f.id)) continue;
      added.push(await reviewRow(code, f, '', rows.concat(added), roundsUsed(c, code)));
    }
  }
  return rows.concat(added);
}
async function reviewRow(code, f, fromCut, existing, used) {
  const { title, version } = splitName(f.name);
  const same = existing.filter(r => String(r.project_code) === code && lower(r.title) === lower(title));
  const row = {
    id: newId('rv'), project_code: code, title, version: version || Math.max(0, ...same.map(r => num(r.version))) + 1,
    file_id: f.id, kind: roomKind(f.mimeType, f.name), status: 'waiting', round: used + 1, sent_at: today(), from_cut: fromCut || ''
  };
  await add('clients', 'Reviews', row);
  return row;
}
export async function addReview(code, f, fromCut = '') {
  const c = await load('clients', true);
  const hit = c.Reviews.find(r => r.file_id === f.id);
  if (hit) return hit.id;
  return (await reviewRow(String(code), f, fromCut, c.Reviews, roundsUsed(c, code))).id;
}

// what the overview and timeline show: the newest thing waiting on the client
export function reviewSummary(rows) {
  const list = [...rows].sort((a, b) => (day(b.sent_at) || '').localeCompare(day(a.sent_at) || '') || num(b.version) - num(a.version));
  const waiting = list.filter(r => STATUS(r.status) === 'waiting');
  const r = waiting[0] || list[0];
  if (!r) return null;
  const st = STATUS(r.status);
  return { id: r.id, title: `${r.title}${num(r.version) ? ' v' + num(r.version) : ''}`, date: day(r.sent_at) || today(), length: '', fileId: '', kind: r.kind || 'video', state: st === 'approved' ? 'Approved' : st === 'changes' ? 'Notes sent' : '', waiting: waiting.length };
}

/* ---------- the editors room: a cut lands ---------- */
export async function addCut(email, code, f, note) {
  const [t, c] = await Promise.all([load('team', true), load('clients')]);
  const hit = t.Cuts.find(x => x.file_id === f.id);
  if (hit) return hit.id;
  const p = c.Projects.find(x => String(x.code) === String(code)) || { code };
  const { title, version } = splitName(f.name);
  const same = t.Cuts.filter(x => String(x.project_code) === String(code) && lower(x.title) === lower(title));
  const row = { id: newId('ct'), project_code: String(code), title, version: version || Math.max(0, ...same.map(x => num(x.version))) + 1, file_id: f.id, kind: roomKind(f.mimeType, f.name), by: email, status: 'waiting', submitted_at: today(), note: clean(note, 2000) };
  await add('team', 'Cuts', row);
  const who = (t.Team.find(r => lower(r.email) === email) || {}).name || email;
  await send({
    to: NOTIFY(), subject: `New cut: ${row.title} v${row.version} (${p.code}) from ${who}`, heading: 'A cut is in the editors room',
    html: `<p><b>${esc(who)}</b> sent <b>${esc(row.title)} v${row.version}</b> for <b>${esc(p.code)}${p.title ? ' · ' + esc(p.title) : ''}</b>.</p>${row.note ? `<p style="white-space:pre-wrap;background:#F1EFEA;border-radius:12px;padding:14px">${esc(row.note)}</p>` : ''}<p>Leave notes on it, approve it, and send it to the client from the editors room.</p>`,
    cta: { label: 'Open the editors room', url: portal() + '#/team/editors' }
  }).catch(e => console.log('[cut mail]', e.message));
  return row.id;
}

/* ---------- telling the client something is ready (at most one email per project every 10 minutes) ---------- */
export async function notifyClient(code, force = false) {
  const c = await load('clients', true);
  const p = c.Projects.find(x => String(x.code) === String(code));
  if (!p) return 0;
  const rows = c.Reviews.filter(r => String(r.project_code) === String(code) && STATUS(r.status) === 'waiting' && !r.notified_at);
  const to = emails(p.client_email);
  if (!rows.length || !to.length) return 0;
  if (!force && !(await kv.set('revmail:' + code, '1', { nx: true, ex: 600 }))) return 0;
  const cl = c.Clients.find(r => to.includes(lower(r.email))) || {};
  const names = rows.map(r => `${r.title}${num(r.version) ? ' v' + num(r.version) : ''}`);
  await send({
    to, subject: `Ready for your notes: ${names.length === 1 ? names[0] : names.length + ' new items'} · ${p.code}`, heading: 'Ready for your notes',
    html: `<p>Hi ${esc(firstName(cl.name))},</p><p>${names.length === 1 ? `<b>${esc(names[0])}</b> is` : 'These are'} up in your review room for <b>${esc(p.title || p.code)}</b>.</p>${names.length > 1 ? `<ul>${names.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}<p>Watch it on the big screen, leave notes right on the frame or the page, then approve it or ask for changes.</p>`,
    cta: { label: 'Open the review room', url: portal() + '#/client/review' }
  });
  for (const r of rows) await patch('clients', 'Reviews', r._row, { notified_at: today() });
  return rows.length;
}

/* ---------- who's looking, and what they can do ---------- */
async function viewer(user) {
  if (user.side === 'client') {
    const c = await load('clients');
    const me = c.Clients.find(r => lower(r.email) === user.email);
    return { side: 'client', email: user.email, name: (me && (me.name || me.company)) || user.email.split('@')[0], c, mine: c.Projects.filter(p => emails(p.client_email).includes(user.email)) };
  }
  const ctx = await teamContext(user.email);
  return { side: 'team', email: user.email, name: ctx.name, role: ctx.role, staff: ctx.staff, owner: ctx.owner, c: ctx.c, t: ctx.t, ctx };
}

async function itemAccess(user, key) {
  const [kind, id] = String(key || '').split(':');
  const v = await viewer(user);
  if (kind === 'rev') {
    const r = v.c.Reviews.find(x => String(x.id) === String(id));
    const p = r && v.c.Projects.find(x => String(x.code) === String(r.project_code));
    if (!r || !p) throw new HttpError(404, 'That review is not here anymore.');
    const waiting = STATUS(r.status) === 'waiting';
    if (v.side === 'client') {
      if (!v.mine.includes(p)) throw new HttpError(404, 'That review is not here anymore.');
      return { kind, row: r, p, v, can: { note: waiting, decide: waiting, resolve: false } };
    }
    if (v.staff) return { kind, row: r, p, v, can: { note: true, decide: false, resolve: true, notify: !r.notified_at && waiting } };
    if (myProjects(v.ctx).includes(p)) return { kind, row: r, p, v, can: { note: false, decide: false, resolve: false } };
    throw new HttpError(404, 'That review is not here anymore.');
  }
  if (kind === 'cut' && v.side === 'team') {
    const r = v.t.Cuts.find(x => String(x.id) === String(id));
    const p = r && v.c.Projects.find(x => String(x.code) === String(r.project_code));
    if (!r || !p || !(v.staff || myProjects(v.ctx).includes(p))) throw new HttpError(404, 'That cut is not here anymore.');
    return { kind, row: r, p, v, can: { note: true, decide: v.owner && STATUS(r.status) === 'waiting', send: v.owner && !r.sent_at, resolve: v.staff || lower(r.by) === v.email } };
  }
  throw new HttpError(404, 'That is not here anymore.');
}

/* ---------- notes ---------- */
const NK = (kind, id) => `notes:${kind}:${id}`;
async function readNotes(kind, id) {
  const v = await kv.get(NK(kind, id));
  if (!v) return [];
  return typeof v === 'string' ? JSON.parse(v) : v;
}
const writeNotes = (kind, id, list) => kv.set(NK(kind, id), JSON.stringify(list.slice(-500)));
// who wrote it, as this viewer is allowed to see it: crew never see a client's name, clients never see the crew's
function shapeNote(n, v) {
  let who;
  if (n.side === 'client') who = v.side === 'client' ? (n.email === v.email ? 'You' : n.name || 'Your team') : v.staff ? n.name || 'Client' : 'Client';
  else who = v.side === 'client' ? (n.role === 'owner' ? ownerName() : 'DEPARTURZ') : n.email === v.email ? 'You' : n.name;
  const o = { id: n.id, at: n.at, who, mine: n.email === v.email, from: n.side === 'client' ? 'client' : 'team', text: n.text, done: !!n.done };
  if (typeof n.t === 'number') o.t = n.t;
  if (n.page) o.page = n.page;
  if (typeof n.x === 'number') { o.x = n.x; o.y = n.y; }
  return o;
}
const fmtT = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const where = n => (typeof n.t === 'number' ? fmtT(n.t) + ' ' : n.page ? `p${n.page} ` : '');

export async function addNote(user, b) {
  const a = await itemAccess(user, b.item);
  if (!a.can.note) throw new HttpError(403, a.v.side === 'client' ? 'This one is already decided. Notes are closed on it.' : 'You can read these notes, not add to them.');
  if (await limited(user.email)) throw new HttpError(429, 'Slow down a little.');
  const text = clean(b.text, 2000);
  if (!text) throw new HttpError(400, 'Write the note first.');
  const n = { id: newId('n'), at: new Date().toISOString(), side: a.v.side, role: a.v.role || '', email: user.email, name: a.v.name, text };
  const t = Number(b.t);
  if (b.t !== undefined && b.t !== null && b.t !== '' && Number.isFinite(t) && t >= 0 && t < 86400) n.t = Math.round(t * 10) / 10;
  const pg = Math.round(Number(b.page));
  if (pg >= 1 && pg <= 2000) n.page = pg;
  const x = Number(b.x), y = Number(b.y);
  if (b.x !== undefined && Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1) { n.x = Math.round(x * 1000) / 1000; n.y = Math.round(y * 1000) / 1000; }
  const list = await readNotes(a.kind, a.row.id);
  list.push(n);
  await writeNotes(a.kind, a.row.id, list);
  return { note: shapeNote(n, a.v) };
}
async function limited(email) {
  const n = await kv.incr('rl:note:' + email);
  if (n === 1) await kv.expire('rl:note:' + email, 60);
  return n > 60;
}
export async function noteDone(user, b) {
  const a = await itemAccess(user, b.item);
  const list = await readNotes(a.kind, a.row.id);
  const n = list.find(x => x.id === String(b.id));
  if (!n) throw new HttpError(404, 'That note is gone.');
  if (!a.can.resolve) throw new HttpError(403, 'Only the team can tick notes off.');
  n.done = !n.done; n.doneBy = a.v.name;
  await writeNotes(a.kind, a.row.id, list);
  return { done: n.done };
}
export async function noteRemove(user, b) {
  const a = await itemAccess(user, b.item);
  const list = await readNotes(a.kind, a.row.id);
  const i = list.findIndex(x => x.id === String(b.id) && x.email === user.email);
  if (i < 0) throw new HttpError(404, 'You can only take back your own notes.');
  if (a.v.side === 'client' && !a.can.note) throw new HttpError(409, 'This one is already decided.');
  list.splice(i, 1);
  await writeNotes(a.kind, a.row.id, list);
  return { ok: true };
}

/* ---------- listing a room ---------- */
async function itemShape(kind, r, v, p) {
  const notes = await readNotes(kind, r.id).catch(() => []);
  const crewName = e => ((v.t || { Team: [] }).Team.find(x => lower(x.email) === lower(e)) || {}).name || String(e || '').split('@')[0];
  return {
    key: `${kind}:${r.id}`, kind, type: r.kind || 'video', title: r.title || 'Untitled', version: num(r.version), status: STATUS(r.status),
    round: num(r.round) || 1, date: day(kind === 'cut' ? r.submitted_at : r.sent_at) || '',
    by: kind === 'cut' ? (lower(r.by) === v.email ? 'You' : crewName(r.by)) : '',
    sent: kind === 'cut' ? day(r.sent_at) || '' : '', note: kind === 'cut' ? r.note || '' : '',
    notes: notes.length, open: notes.filter(n => !n.done).length, notified: kind === 'rev' ? !!r.notified_at : undefined
  };
}
const byNewest = (a, b) => (b.date || '').localeCompare(a.date || '') || b.version - a.version;
const pickProject = (list, code) => list.find(p => String(p.code) === String(code)) || list[0] || null;

export async function roomList(user, q) {
  const v = await viewer(user);
  const room = v.side === 'team' && q.get('room') === 'editors' ? 'editors' : 'client';
  let projects, p;
  if (v.side === 'client') {
    projects = [...v.mine].reverse();
    p = pickProject(projects, q.get('project') || (projects.find(isActive) || {}).code);
  } else if (room === 'client') {
    if (!v.staff) throw new HttpError(403, 'The client review room is for Nate and managers. Your cuts go to the editors room.');
    projects = v.c.Projects.filter(isActive);
    p = pickProject(projects, q.get('project')) || null;
  } else {
    projects = myProjects(v.ctx);
    const waiting = new Set(v.t.Cuts.filter(x => STATUS(x.status) === 'waiting').map(x => String(x.project_code)));
    p = pickProject(projects, q.get('project') || (projects.find(x => waiting.has(String(x.code))) || {}).code);
  }
  const label = x => (v.side === 'client' ? x.title || String(x.code) : projLabel(x, v.ctx));
  const out = { room, side: v.side, projects: projects.map(x => ({ code: String(x.code), label: label(x) })), project: p ? String(p.code) : '', items: [], rounds: null, can: {} };
  if (!p) return out;
  const revs = await syncReviews(v.c, p).catch(e => { console.log('[reviews]', e.message); return v.c.Reviews.filter(r => String(r.project_code) === String(p.code)); });
  if (room === 'client') {
    out.items = (await Promise.all(revs.map(r => itemShape('rev', r, v, p)))).sort(byNewest);
    out.rounds = { used: revs.filter(r => STATUS(r.status) === 'changes').length, included: included(p) };
    out.can = { upload: !!v.owner };
  } else {
    const cuts = v.t.Cuts.filter(x => String(x.project_code) === String(p.code));
    out.items = (await Promise.all(cuts.map(r => itemShape('cut', r, v, p)).concat(revs.map(r => itemShape('rev', r, v, p))))).sort(byNewest);
    out.can = { upload: true };
    out.crew = v.staff ? crewOn(v.t, p).map(r => r.name || r.email) : undefined;
  }
  return out;
}

export async function roomItem(user, q) {
  const a = await itemAccess(user, q.get('key'));
  const f = await fileInfo(a.row.file_id).catch(() => null);
  if (!f) throw new HttpError(404, 'That file is not in the Drive anymore.');
  const type = roomKind(f.mimeType, f.name);
  const mode = /google-apps/.test(f.mimeType) ? 'e' : type === 'image' && !/^image\/(jpeg|png|webp|gif)$/.test(f.mimeType) ? 't' : 'r';
  const notes = (await readNotes(a.kind, a.row.id)).map(n => shapeNote(n, a.v));
  return {
    item: await itemShape(a.kind, a.row, a.v, a.p), type, mime: mode === 'e' ? 'application/pdf' : f.mimeType, size: Number(f.size || 0), name: f.name,
    media: `/api/p/media?k=${mediaToken(f.id, mode)}`, whole: mode !== 'r', fileId: f.id, notes, can: a.can
  };
}

/* ---------- decisions ---------- */
export async function decide(user, b) {
  const a = await itemAccess(user, b.item);
  const approve = b.action === 'approve';
  if (!a.can.decide) throw new HttpError(403, a.kind === 'cut' ? 'Only Nate approves cuts.' : 'This one is already decided.');
  const text = clean(b.text, 4000);
  const all = await readNotes(a.kind, a.row.id);
  if (text) { all.push({ id: newId('n'), at: new Date().toISOString(), side: a.v.side, role: a.v.role || '', email: user.email, name: a.v.name, text }); await writeNotes(a.kind, a.row.id, all); }
  const open = all.filter(n => !n.done);
  if (!approve && !open.length) throw new HttpError(400, 'Add at least one note so we know what to change.');
  const name = `${a.row.title}${num(a.row.version) ? ' v' + num(a.row.version) : ''}`;
  const list = open.map(n => `<li>${typeof n.t === 'number' || n.page ? `<b style="font-family:monospace">${esc(where(n))}</b>` : ''}${esc(n.text)}</li>`).join('');
  const p = a.p;
  if (a.kind === 'rev') {
    await patch('clients', 'Reviews', a.row._row, { status: approve ? 'approved' : 'changes', decided_at: today(), decided_by: a.v.name });
    const used = roundsUsed(a.v.c, p.code) + (approve ? 0 : 1);
    await post(clientChan(p.code), { email: user.email, name: a.v.name, text: approve ? `Approved: ${name}.` : `Asked for changes on ${name} (${open.length} note${open.length === 1 ? '' : 's'} in the review room).` });
    await send({
      to: NOTIFY(), replyTo: user.email, subject: `${approve ? 'Approved' : 'Changes'}: ${name} (${p.code})`, heading: approve ? 'Approved by the client' : 'The client wants changes',
      html: `<p><b>${esc(a.v.name)}</b> ${approve ? 'approved' : 'asked for changes on'} <b>${esc(name)}</b> for ${esc(p.title || p.code)}.</p>${list ? `<ul>${list}</ul>` : ''}${!approve && used > included(p) ? `<p><b>Heads up:</b> that's round ${used}, and ${included(p)} are included.</p>` : ''}`,
      cta: { label: 'Open the review room', url: portal() + '#/team/review' }
    });
    // the editor who made it hears about it too, under the project code, never the client's name
    const cut = a.row.from_cut ? (await load('team')).Cuts.find(x => String(x.id) === String(a.row.from_cut)) : null;
    if (cut && cut.by) await send({
      to: cut.by, subject: `Client ${approve ? 'approved' : 'notes on'} ${name} · ${labelOf(p)}`, heading: approve ? 'The client approved it' : 'Client notes are in',
      html: `<p>${approve ? `The client approved <b>${esc(name)}</b>. Great work.` : `The client left notes on <b>${esc(name)}</b>. Nate will confirm what to change before you start.`}</p>${list && !approve ? `<ul>${list}</ul>` : ''}`,
      cta: { label: 'Open the editors room', url: portal() + '#/team/editors' }
    }).catch(() => {});
  } else {
    await patch('team', 'Cuts', a.row._row, { status: approve ? 'approved' : 'changes', decided_at: today() });
    if (a.row.by) await send({
      to: a.row.by, subject: `${approve ? 'Approved' : 'Notes on'} ${name} · ${labelOf(p)}`, heading: approve ? 'Your cut is approved' : 'Notes on your cut',
      html: `<p>${approve ? `<b>${esc(name)}</b> is approved.` : `${esc(a.v.name)} left notes on <b>${esc(name)}</b>.`}</p>${list ? `<ul>${list}</ul>` : ''}`,
      cta: { label: 'Open the editors room', url: portal() + '#/team/editors' }
    }).catch(() => {});
  }
  return { status: approve ? 'approved' : 'changes' };
}

// Nate sends an approved cut to the client: a copy goes into the project's For review folder
export async function sendCut(user, b) {
  const a = await itemAccess(user, b.item);
  if (a.kind !== 'cut' || !a.v.owner) throw new HttpError(403, 'Only Nate sends cuts to a client.');
  const parent = await reviewFolder(a.p);
  const f = await fileInfo(a.row.file_id);
  const c = await load('clients', true);
  const title = clean(b.title, 120) || a.row.title;
  const same = c.Reviews.filter(r => String(r.project_code) === String(a.p.code) && lower(r.title) === lower(title));
  const version = Math.max(0, ...same.map(r => num(r.version))) + 1;
  const ext = (String(f.name).match(/\.[a-z0-9]{2,5}$/i) || [''])[0];
  const copy = await g(`${DRIVE}/${encodeURIComponent(f.id)}/copy?fields=id,name,mimeType,size`, { method: 'POST', body: JSON.stringify({ name: `${title} v${version}${ext}`, parents: [parent] }) });
  const id = await addReview(a.p.code, copy, a.row.id);
  await patch('team', 'Cuts', a.row._row, { sent_at: today(), ...(STATUS(a.row.status) === 'waiting' ? { status: 'approved', decided_at: today() } : {}) });
  const sent = await notifyClient(a.p.code, true).catch(e => { console.log('[review mail]', e.message); return 0; });
  return { review: id, emailed: sent > 0 };
}

export async function notifyNow(user, b) {
  const a = await itemAccess(user, b.item);
  if (a.kind !== 'rev' || !a.v.staff) throw new HttpError(403, 'Only the team can do that.');
  const n = await notifyClient(a.p.code, true);
  return { emailed: n };
}

// the daily run: pick up anything dropped into For review folders and tell the client
export async function sweepReviews(log) {
  const c = await load('clients', true);
  for (const p of c.Projects.filter(isActive)) {
    if (!p.drive_folder_id && !p.review_file_id) continue;
    await syncReviews(c, p, true).catch(e => log.push(`review sync ${p.code}: ${e.message}`));
    const n = await notifyClient(p.code).catch(() => 0);
    if (n) log.push(`review ready ${p.code} (${n})`);
  }
}

/* ---------- media: signed, short-lived links that stream from the Drive in pieces ---------- */
const sign = s => createHmac('sha256', need('SESSION_SECRET')).update('media:' + s).digest('base64url').slice(0, 32);
export function mediaToken(fid, mode = 'r', hours = 8) {
  const body = `${fid}.${Math.floor(Date.now() / 1000) + hours * 3600}.${mode}`;
  return `${body}.${sign(body)}`;
}
function readToken(k) {
  const m = String(k || '').match(/^([A-Za-z0-9_-]{4,200})\.(\d{9,11})\.([ret])\.([A-Za-z0-9_-]{32})$/);
  if (!m) return null;
  const body = `${m[1]}.${m[2]}.${m[3]}`, want = Buffer.from(sign(body)), got = Buffer.from(m[4]);
  if (want.length !== got.length || !timingSafeEqual(want, got) || Number(m[2]) * 1000 < Date.now()) return null;
  return { fid: m[1], mode: m[3] };
}
const CAP = 4 * 1024 * 1024 - 65536;
export async function media(request, q) {
  const tok = readToken(q.get('k'));
  if (!tok) throw new HttpError(403, 'That link expired. Open the room again.');
  const base = { 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' };
  if (tok.mode === 't') {                                      // photos browsers can't show (HEIC, TIFF, PSD): the Drive's preview image
    const f = await g(`${DRIVE}/${encodeURIComponent(tok.fid)}?fields=thumbnailLink`);
    if (!f.thumbnailLink) throw new HttpError(404, 'The Drive has no preview of that one yet.');
    const r = await g(f.thumbnailLink.replace(/=s\d+(-[a-z]+)?$/, '=s2400'), { raw: true });
    if (!r.ok) throw new HttpError(404, 'The Drive has no preview of that one yet.');
    return new Response(r.body, { headers: { ...base, 'Content-Type': r.headers.get('content-type') || 'image/jpeg' } });
  }
  if (tok.mode === 'e') {                                      // a Google Doc or Slides: as a PDF
    const r = await g(`${DRIVE}/${encodeURIComponent(tok.fid)}/export?mimeType=application/pdf`, { raw: true });
    if (!r.ok) throw new HttpError(404, 'That one could not be turned into a PDF.');
    return new Response(r.body, { headers: { ...base, 'Content-Type': 'application/pdf' } });
  }
  const asked = request.headers.get('range') || '';
  const m = asked.match(/^bytes=(\d*)-(\d*)$/);
  let start = 0, end = null;
  if (m && m[1] !== '') { start = +m[1]; end = m[2] !== '' ? +m[2] : null; }
  else if (m && m[2] !== '') {                                 // "the last N bytes"
    const f = await g(`${DRIVE}/${encodeURIComponent(tok.fid)}?fields=size`);
    start = Math.max(0, Number(f.size || 0) - Number(m[2]));
  }
  const last = end == null ? start + CAP - 1 : Math.min(end, start + CAP - 1);
  const r = await g(`${DRIVE}/${encodeURIComponent(tok.fid)}?alt=media`, { raw: true, headers: { Range: `bytes=${start}-${last}` } });
  if (r.status === 416) return new Response(null, { status: 416, headers: { 'Content-Range': r.headers.get('content-range') || '' } });
  if (!r.ok) throw new HttpError(404, 'That file is not in the Drive anymore.');
  let type = r.headers.get('content-type') || 'application/octet-stream';
  if (/quicktime/.test(type)) type = 'video/mp4';               // H.264 .mov files play everywhere when called mp4
  const h = { ...base, 'Content-Type': type };
  const len = r.headers.get('content-length');
  if (len) h['Content-Length'] = len;
  const cr = r.headers.get('content-range');
  const whole = cr && /^bytes 0-(\d+)\/(\d+)$/.test(cr) && (() => { const [, b, t] = cr.match(/^bytes 0-(\d+)\/(\d+)$/); return +b === +t - 1; })();
  if (r.status === 206 && !(whole && !asked)) { h['Content-Range'] = cr; return new Response(r.body, { status: 206, headers: h }); }
  return new Response(r.body, { status: 200, headers: h });
}
