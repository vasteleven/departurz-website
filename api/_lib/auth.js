// Signing in: "Sign in with Google", or a one-tap link by email. No passwords anywhere.
// Only emails on the Clients or Team sheet get in.
import { HttpError, env, json, redirect, lower, isEmail, clean, today, esc, firstName, origin } from './util.js';
import { verifyGoogleIdToken } from './google.js';
import { who, patch, add, load, emails } from './roster.js';
import { createSession, sessionCookie, clearCookie, readSession, createLinkToken, useLinkToken } from './session.js';
import { kv, limited } from './kv.js';
import { send } from './mail.js';
import { subscribe, TAGS } from './kit.js';
import { payConfig } from './pay.js';

const APP = () => env('APP_SCHEME', 'departurz');
const ip = request => (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';

// The portal can only sign people in once its accounts are connected (see SETUP.md). Until then the sign-in page
// shows visitors a friendly "opens with your first project" note instead of a setup error.
export function ready() {
  const has = k => !!env(k);
  const redis = !!(env('UPSTASH_REDIS_REST_URL') || env('KV_REST_API_URL')) || !env('VERCEL') || !!kv.memory;
  return has('SESSION_SECRET') && redis && has('CLIENTS_SHEET_ID') && has('TEAM_SHEET_ID') && has('GOOGLE_REFRESH_TOKEN')
    && (has('RESEND_API_KEY') || has('GOOGLE_CLIENT_ID'));
}

export function config() {
  return json({ live: true, ready: ready(), google: env('GOOGLE_CLIENT_ID', ''), email: !!env('RESEND_API_KEY'), notify: env('NOTIFY_EMAIL', 'wecreate@departurz.com'), pay: payConfig() });
}

// first sign-in: welcome them into Kit (project updates, thank-yous, offers) and note when they were last here
async function arrived(user) {
  const tasks = [];
  if (user.side === 'client') {
    tasks.push((async () => {
      const c = await load('clients');
      const row = c.Clients.find(r => lower(r.email) === user.email);
      if (!row || !row.kit_synced) {
        const codes = c.Projects.filter(p => emails(p.client_email).includes(user.email)).map(p => 'Project ' + p.code);
        const tags = [TAGS.client, ...codes];
        const r = row || {};
        if (!/^no$/i.test(r.updates || '')) tags.push(TAGS.updates);
        if (!/^no$/i.test(r.thanks || '')) tags.push(TAGS.thanks);
        if (!/^no$/i.test(r.offers || '')) tags.push(TAGS.offers);
        const ok = await subscribe({ email: user.email, name: r.name, tags }).catch(e => { console.log('[kit]', e.message); return false; });
        const v = { kit_synced: ok ? today() : '', seen_at: today() };
        // someone listed on a project but not yet on the Clients tab gets a row, so their settings have a home
        if (row) await patch('clients', 'Clients', row._row, v);
        else await add('clients', 'Clients', { email: user.email, updates: 'yes', thanks: 'yes', offers: 'yes', ...v });
      } else await patch('clients', 'Clients', row._row, { seen_at: today() });
    })());
  } else if (user.row) tasks.push(patch('team', 'Team', user.row._row, { seen_at: today() }));
  // never let a slow Kit or Sheets call hold up signing in
  await Promise.race([Promise.all(tasks).catch(e => console.log('[arrived]', e.message)), new Promise(r => setTimeout(r, 2500))]);
}

async function finish(user, app, request) {
  const token = await createSession(user);
  await arrived(user);
  if (app) return json({ side: user.side, token });
  return json({ side: user.side, next: `/portal-app.html#/${user.side}` }, 200, { 'Set-Cookie': sessionCookie(token) });
}

const NOT_LISTED = "That email isn't on our guest list yet. If you're working with DEPARTURZ, ask Nate to add you, or email wecreate@departurz.com.";

export async function google({ request, body: b }) {
  if (await limited('g:' + ip(request), 30, 600)) throw new HttpError(429, 'Too many tries. Wait a few minutes.');
  const g = await verifyGoogleIdToken(clean(b.credential, 5000));
  const user = await who(g.email);
  if (!user) throw new HttpError(403, NOT_LISTED);
  return finish(user, !!b.app, request);
}

export async function emailLink({ request, body: b }) {
  const email = lower(clean(b.email, 200));
  if (!isEmail(email)) throw new HttpError(400, 'That email does not look right.');
  if (await limited('e:' + ip(request), 8, 900) || await limited('e:' + email, 4, 900)) throw new HttpError(429, 'Too many links requested. Try again in 15 minutes.');
  const user = await who(email);
  // same answer either way, so the form can't be used to check who our clients are
  if (user) {
    const t = await createLinkToken(email);
    if (b.app) await kv.set('linkapp:' + t.slice(-24), '1', { ex: 1200 });
    const link = `${origin(request)}/api/p/auth/verify?t=${encodeURIComponent(t)}`;
    await send({
      to: email, subject: 'Your DEPARTURZ sign-in link', heading: `Hi ${firstName(user.name)}, you're cleared`,
      html: `<p>Tap the button to open your portal. The link works once and expires in 20 minutes.</p><p style="color:#6B6A66;font-size:13px">Didn't ask for this? You can ignore it. Nobody gets in without this email.</p>`,
      cta: { label: 'Open my portal', url: link }
    });
  }
  return json({ ok: true });
}

// the link in the email opens a page with one button, so email scanners that preview links can't use it up
export async function verifyPage({ url }) {
  const t = clean(url.searchParams.get('t'), 2000);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in · DEPARTURZ</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0A0A0A;color:#F2F0EB;font-family:Arial,Helvetica,sans-serif;padding:24px}main{max-width:420px;text-align:center}b.l{display:block;font-weight:900;letter-spacing:.1em;font-size:20px;margin-bottom:28px}h1{font-size:44px;line-height:.95;text-transform:uppercase;margin:0 0 12px;background:linear-gradient(90deg,#3FB8EE,#9E80F2);-webkit-background-clip:text;background-clip:text;color:transparent}p{color:#BEBCB6;margin:0 0 26px}button{background:#F2F0EB;color:#0A0A0A;border:0;border-radius:999px;font-weight:800;font-size:16px;padding:16px 30px;cursor:pointer}</style></head>
<body><main><b class="l">DEPARTURZ</b><h1>Cleared for boarding.</h1><p>One tap and you're in.</p>
<form method="post" action="/api/p/auth/verify"><input type="hidden" name="t" value="${esc(t)}"><button type="submit">Open my portal</button></form></main></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}

export async function verify({ request, body: b }) {
  const t = clean(b.t, 2000);
  const email = await useLinkToken(t);
  if (!email) return redirect('/portal.html?link=expired');
  const user = await who(email);
  if (!user) return redirect('/portal.html?link=denied');
  const token = await createSession(user);
  await arrived(user);
  if (await kv.get('linkapp:' + t.slice(-24))) return redirect(`${APP()}://signed-in?token=${encodeURIComponent(token)}`);
  return new Response(null, { status: 303, headers: { Location: `/portal-app.html#/${user.side}`, 'Set-Cookie': sessionCookie(token), 'Cache-Control': 'no-store' } });
}

export async function logout({ request }) {
  const s = await readSession(request);
  if (s) await kv.set('revoked:' + s.email + ':' + s.iat, '1', { ex: 31 * 86400 });
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });
}
