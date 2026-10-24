// The portal API. One function routes everything (vercel.json sends /api/p/<route> here),
// which keeps the project well under the Hobby plan's function limit. The website and the native apps share it.
import { HttpError, json, body, origin, clean, lower, esc, env } from './_lib/util.js';
import { requireSession, readSession } from './_lib/session.js';
import { who, load } from './_lib/roster.js';
import * as auth from './_lib/auth.js';
import * as client from './_lib/client.js';
import * as team from './_lib/team.js';
import * as pay from './_lib/pay.js';
import { post, markRead, history, shape, clientChan } from './_lib/messages.js';
import { send, NOTIFY } from './_lib/mail.js';
import { kv, limited } from './_lib/kv.js';

const signed = fn => async ctx => { ctx.user = await requireSession(ctx.request); return fn(ctx); };
const clientOnly = fn => signed(ctx => { if (ctx.user.side !== 'client') throw new HttpError(403, 'That is for clients.'); return fn(ctx); });
const teamOnly = fn => signed(ctx => { if (ctx.user.side !== 'team') throw new HttpError(403, 'That is for the crew.'); return fn(ctx); });
const bySide = (c, t) => signed(ctx => (ctx.user.side === 'team' ? t(ctx) : c(ctx)));

/* ---------- the whole portal in one request ---------- */
async function portal({ user, q }) {
  const config = { pay: pay.payConfig(), notify: NOTIFY() };
  const as = lower(q.get('as'));
  if (user.side === 'team' && as) {
    const ctx = await team.teamContext(user.email);
    if (!ctx.admin) throw new HttpError(403, 'Only admins can open a client view.');
    return json({ side: 'client', viewAs: as, data: await client.clientData(as, q.get('project')), config });
  }
  if (user.side === 'team') return json({ side: 'team', data: await team.teamData(user.email), config });
  return json({ side: 'client', data: await client.clientData(user.email, q.get('project')), config });
}

/* ---------- chat ---------- */
async function chatAccess(user, cid) {
  if (user.side === 'client') {
    const { mine, me } = await client.context(user.email);
    if (!mine.some(p => client.isActive(p) && clientChan(p.code) === cid)) throw new HttpError(403, 'That conversation is not yours.');
    const p = mine.find(x => clientChan(x.code) === cid);
    return { name: (me && (me.name || me.company)) || user.email.split('@')[0], tz: '', ch: { id: cid, kind: 'client', name: 'DEPARTURZ', code: String(p.code) }, project: p };
  }
  const ctx = await team.teamContext(user.email);
  const ch = team.channelList(ctx).find(x => x.id === cid);
  if (!ch) throw new HttpError(403, 'You are not in that conversation.');
  return { name: ctx.name, tz: ctx.row.tz || '', ch };
}

async function getMessages({ user, q }) {
  const cid = clean(q.get('c'), 80);
  await chatAccess(user, cid);
  const after = clean(q.get('after'), 40);
  const msgs = (await history(cid, 80)).filter(m => !after || m.at > after).map(m => shape(m, user.email));
  return json({ msgs });
}

// a short email so nobody misses a message, at most one per conversation every 15 minutes
async function nudge(key, mail) {
  if (!(await kv.set('nudge:' + key, '1', { nx: true, ex: 900 }))) return;
  await send(mail).catch(e => console.log('[nudge]', e.message));
}

async function postMessage({ user, body: b, request }) {
  const cid = clean(b.c, 80);
  const a = await chatAccess(user, cid);
  if (await limited('msg:' + user.email, 40, 60)) throw new HttpError(429, 'Slow down a little.');
  const text = clean(b.text, 4000);
  const file = b.file && b.file.id ? b.file : null;
  if (!text && !file) throw new HttpError(400, 'Write something first.');
  const msg = await post(cid, { email: user.email, name: a.name, tz: a.tz, text, file });
  const portalUrl = origin(request) + '/portal-app.html';
  const preview = `<p style="white-space:pre-wrap;background:#F1EFEA;border-radius:12px;padding:14px">${esc(text || ('Sent a file: ' + (file && file.name)))}</p>`;
  if (user.side === 'client') {
    await nudge(cid + ':team', { to: NOTIFY(), replyTo: user.email, subject: `New message from ${a.name} (${a.ch.code})`, heading: `${a.name} wrote`, html: preview + '<p>Reply from the crew portal so it stays in their thread.</p>', cta: { label: 'Open the crew portal', url: portalUrl + '#/team/comms' } });
  } else if (a.ch.kind === 'client') {
    for (const to of a.ch.to || []) await nudge(cid + ':' + to, { to, subject: `New message from DEPARTURZ`, heading: `${a.name} wrote`, html: preview, cta: { label: 'Reply in your portal', url: portalUrl + '#/client/messages' } });
  } else if (a.ch.kind === 'dm') {
    for (const to of a.ch.to || []) await nudge(cid + ':' + to, { to, subject: `${a.name} sent you a message`, heading: `${a.name} wrote`, html: preview, cta: { label: 'Open Comms', url: portalUrl + '#/team/comms' } });
  }
  await markRead(user.email, cid);
  return json({ msg: shape(msg, user.email) });
}

async function read({ user, body: b }) {
  const cid = clean(b.c, 80);
  await chatAccess(user, cid);
  await markRead(user.email, cid);
  return json({ ok: true });
}

/* ---------- files ---------- */
async function openFile({ user, q }) {
  const fid = clean(q.get('id'), 120);
  if (!fid) throw new HttpError(400, 'Which file?');
  const ok = user.side === 'team' ? await team.canOpenAsTeam(user.email, fid) : await client.canOpenAsClient(user, fid);
  if (!ok) throw new HttpError(404, 'That file is not shared with you.');
  return json(await client.openFile(fid));
}

/* ---------- route table ---------- */
const ROUTES = {
  'GET auth/config': () => auth.config(),
  'POST auth/google': auth.google,
  'POST auth/email': auth.emailLink,
  'GET auth/verify': auth.verifyPage,
  'POST auth/verify': auth.verify,
  'POST auth/logout': auth.logout,
  'GET me': signed(async ({ user }) => json({ email: user.email, side: user.side })),
  'GET crew': async () => json({ crew: await team.publicCrew() }, 200, { 'Cache-Control': 'public, max-age=60, s-maxage=300' }),
  'GET crew/photo': async ({ request, q }) => { const s = await readSession(request).catch(() => null); return team.crewPhoto(clean(q.get('k'), 40), !!(s && s.side === 'team')); },

  'GET portal': signed(portal),
  'GET messages': signed(getMessages),
  'POST messages': signed(postMessage),
  'POST read': signed(read),
  'GET file': signed(openFile),
  'POST upload/start': bySide(
    ({ user, body: b, request }) => client.uploadStart(user, b, origin(request)).then(r => json(r)),
    ({ user, body: b, request }) => team.teamUploadStart(user.email, b, origin(request)).then(r => json(r))),
  'POST upload/done': bySide(
    ({ user, body: b }) => client.uploadDone(user, b).then(r => json(r)),
    ({ user, body: b }) => team.teamUploadDone(user.email, b).then(r => json(r))),
  'POST profile': bySide(
    ({ user, body: b }) => client.profile(user, b).then(r => json(r)),
    ({ user, body: b }) => team.teamProfile(user.email, b).then(r => json(r))),

  // clients
  'POST needs/submit': clientOnly(({ user, body: b }) => client.needSubmit(user, b).then(r => json(r))),
  'POST events': clientOnly(({ user, body: b }) => client.addEvent(user, b).then(r => json(r))),
  'POST review': clientOnly(({ user, body: b }) => client.review(user, b).then(r => json(r))),
  'POST docs/accept': clientOnly(({ user, body: b }) => client.acceptDoc(user, b).then(r => json(r))),
  'GET receipt': clientOnly(({ user, q }) => client.receipt(user, q)),
  'POST pay/stripe': clientOnly(({ user, body: b, request }) => pay.stripeCheckout(user, b, origin(request)).then(r => json(r))),
  'GET pay/stripe/check': clientOnly(({ user, q }) => pay.stripeCheck(user, q.get('session')).then(r => json(r))),
  'POST pay/paypal/create': clientOnly(({ user, body: b }) => pay.paypalCreate(user, b).then(r => json(r))),
  'POST pay/paypal/capture': clientOnly(({ user, body: b }) => pay.paypalCapture(user, b).then(r => json(r))),
  'POST pay/square': clientOnly(({ user, body: b, request }) => pay.squareLink(user, b, origin(request)).then(r => json(r))),
  'POST pay/square/check': clientOnly(({ user }) => pay.squareSweep(user.email).then(n => json({ paid: n > 0 }))),
  'POST pay/manual': clientOnly(({ user, body: b }) => pay.manual(user, b).then(r => json(r))),

  // crew
  'POST tasks/toggle': teamOnly(({ user, body: b }) => team.toggleTask(user.email, b).then(r => json(r))),
  'POST hours': teamOnly(({ user, body: b }) => team.submitHours(user.email, b).then(r => json(r))),
  'POST payout-method': teamOnly(({ user, body: b }) => team.payoutMethod(user.email, b).then(r => json(r))),
  'POST admin/payout/approve': teamOnly(({ user, body: b }) => team.approvePayout(user.email, b).then(r => json(r))),
  'POST admin/payout/paid': teamOnly(({ user, body: b }) => team.markPayoutPaid(user.email, b).then(r => json(r))),
  'POST admin/kudos': teamOnly(({ user, body: b }) => team.sendKudos(user.email, b).then(r => json(r)))
};

async function handle(request) {
  const url = new URL(request.url);
  const r = (url.searchParams.get('r') || url.pathname.replace(/^\/api\/p\/?/, '')).replace(/^\/+|\/+$/g, '');
  const fn = ROUTES[request.method + ' ' + r];
  if (!fn) return json({ error: 'Not found' }, 404);
  try {
    // cookies only ride along on JSON requests from our own pages (forms from other sites can't send JSON),
    // and the one plain form we accept carries its own one-time token
    if (request.method === 'POST' && r !== 'auth/verify' && !(request.headers.get('content-type') || '').includes('application/json') && !(request.headers.get('authorization') || '').startsWith('Bearer ')) {
      throw new HttpError(415, 'Send JSON.');
    }
    const ctx = { request, url, q: url.searchParams, body: request.method === 'POST' ? await body(request) : {} };
    return await fn(ctx);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status >= 500) console.error('[portal]', r, e && e.stack || e, e && e.extra ? JSON.stringify(e.extra).slice(0, 500) : '');
    return json({ error: e instanceof HttpError ? e.message : 'Something went wrong on our side. Try again in a minute.' }, status);
  }
}

export const GET = handle;
export const POST = handle;
