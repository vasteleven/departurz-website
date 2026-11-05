// The /setup page: connects the departurzedits Drive and builds the portal's home from a browser, so nothing has to
// be run in a terminal or pasted into Vercel. Locked by SETUP_KEY (a phrase Nate puts in Vercel himself).
// Google sends the refresh token straight to this function, and it's kept in Redis with the sheet IDs.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError, env, clean, lower, isEmail, esc, origin } from './util.js';
import { kv, limited } from './kv.js';
import { resetGoogle } from './google.js';
import { buildPortal, saveStored, loadStored } from './setupcore.js';
import { bust } from './roster.js';

const clientId = () => env('GOOGLE_DRIVE_CLIENT_ID') || env('GOOGLE_CLIENT_ID');
const clientSecret = () => env('GOOGLE_DRIVE_CLIENT_SECRET') || env('GOOGLE_CLIENT_SECRET');
const hasRedis = () => !!(env('UPSTASH_REDIS_REST_URL') || env('KV_REST_API_URL')) || !env('VERCEL');

// what's in place, for the checklist on the page (never the values themselves)
export async function status() {
  await loadStored(true);
  return {
    google: !!(clientId() && clientSecret()), redis: hasRedis(), key: !!env('SETUP_KEY'), cron: !!env('CRON_SECRET'),
    email: !!env('RESEND_API_KEY'), drive: !!(env('GOOGLE_REFRESH_TOKEN') && env('CLIENTS_SHEET_ID') && env('TEAM_SHEET_ID'))
  };
}

function keyOk(given) {
  const want = Buffer.from(String(env('SETUP_KEY') || '')), got = Buffer.from(String(given || ''));
  return want.length > 0 && want.length === got.length && timingSafeEqual(want, got);
}

export async function start(request, b) {
  if (!hasRedis()) throw new HttpError(409, 'Connect Upstash for Redis to the project first (Vercel > Storage), then redeploy.');
  if (!(clientId() && clientSecret())) throw new HttpError(409, 'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel first, then redeploy.');
  if (!env('SETUP_KEY')) throw new HttpError(409, 'Add SETUP_KEY in Vercel first, then redeploy.');
  if (await limited('setup', 20, 3600)) throw new HttpError(429, 'Too many tries. Wait an hour and try again.');
  if (!keyOk(clean(b.key, 200))) throw new HttpError(403, 'That setup key does not match the SETUP_KEY in Vercel.');
  const email = lower(clean(b.email, 200)), name = clean(b.name, 80) || 'Nate';
  if (!isEmail(email)) throw new HttpError(400, 'Enter the email you will sign in to the portal with.');
  const state = randomBytes(18).toString('hex');
  const redirect = origin(request) + '/api/p/setup/google';
  await kv.set('setup:' + state, JSON.stringify({ email, name, example: b.example !== false, redirect }), { ex: 900 });
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: clientId(), redirect_uri: redirect, response_type: 'code', access_type: 'offline', prompt: 'consent', state,
    scope: 'openid email https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets',
    login_hint: env('DRIVE_ACCOUNT', 'departurzedits@gmail.com')
  });
  return { url };
}

const page = (title, body, ok) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · DEPARTURZ</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0A0A0A;color:#F2F0EB;font-family:Arial,Helvetica,sans-serif;padding:24px;box-sizing:border-box}
main{max-width:560px;width:100%}h1{text-transform:uppercase;font-size:34px;line-height:1;margin:0 0 6px}.bar{height:4px;width:120px;background:linear-gradient(90deg,#3FB8EE,#9E80F2);margin:0 0 22px;border-radius:4px}
p,li{color:#BEBCB6;font-size:15px;line-height:1.6}ul{padding-left:18px}a{color:#3FB8EE}b{color:#F2F0EB}.btn{display:inline-block;margin-top:14px;background:${ok ? 'linear-gradient(90deg,#3FB8EE,#9E80F2)' : '#F2F0EB'};color:#0A0A0A;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:99px}</style></head>
<body><main><h1>${esc(title)}</h1><div class="bar"></div>${body}</main></body></html>`, { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function google(request, q) {
  const state = clean(q.get('state'), 80);
  let s = state ? await kv.get('setup:' + state) : null;
  if (!s) return page('That link expired', `<p>Open <a href="/setup">the setup page</a> and start again. It only takes a minute.</p>`);
  await kv.del('setup:' + state);
  s = typeof s === 'string' ? JSON.parse(s) : s;
  if (q.get('error')) return page('Google said no', `<p>${esc(q.get('error'))}. Open <a href="/setup">the setup page</a> and try again, and click <b>Allow</b> on Google's screen.</p>`);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: clean(q.get('code'), 1000), client_id: clientId(), client_secret: clientSecret(), redirect_uri: s.redirect, grant_type: 'authorization_code' })
  });
  const j = await r.json().catch(() => ({}));
  if (!j.refresh_token) return page('No connection came back', `<p>${esc(j.error_description || j.error || 'Google did not send a refresh token.')}</p><p>Go to <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a> as departurzedits@gmail.com, remove <b>DEPARTURZ</b>, then start again from <a href="/setup">the setup page</a>.</p>`);
  let account = '';
  try { account = JSON.parse(Buffer.from(String(j.id_token).split('.')[1], 'base64url').toString()).email || ''; } catch (e) {}
  const sc = String(j.scope || '');
  if (!/auth\/drive(\s|$)/.test(sc) || !/auth\/spreadsheets(\s|$)/.test(sc)) return page('Drive access was not given', `<p>On Google's screen, tick the boxes for <b>Google Drive</b> and <b>Google Sheets</b>, then click Continue. Start again from <a href="/setup">the setup page</a>.</p>`);

  process.env.GOOGLE_REFRESH_TOKEN = j.refresh_token; resetGoogle();
  const have = Object.fromEntries(['CLIENTS_SHEET_ID', 'TEAM_SHEET_ID', 'CLIENTS_FOLDER_ID', 'TEAM_FOLDER_ID', 'BOOKS_SHEET_ID'].filter(k => env(k)).map(k => [k, env(k)]));
  const lines = [];
  let out;
  try { out = await buildPortal({ admin: s.email, adminName: s.name, example: s.example, have, log: m => lines.push(m) }); }
  catch (e) { console.error('[setup]', e.stack || e); return page('Setup stopped', `<p>${esc(e.message)}</p><p>Nothing is lost: start again from <a href="/setup">the setup page</a> and it picks up where it stopped.</p>`); }
  await saveStored({ GOOGLE_REFRESH_TOKEN: j.refresh_token, ...out, ...(env('SESSION_SECRET') ? {} : { SESSION_SECRET: randomBytes(32).toString('hex') }) });
  bust();
  const sheet = id => `https://docs.google.com/spreadsheets/d/${id}/edit`;
  const warn = account && lower(account) !== lower(env('DRIVE_ACCOUNT', 'departurzedits@gmail.com')) ? `<p><b>Heads up:</b> this connected <b>${esc(account)}</b>, not departurzedits@gmail.com. If that was a mistake, start again from <a href="/setup">the setup page</a> and pick the right account.</p>` : '';
  return page('The portal is set up', `<p>Connected to the Drive${account ? ` of <b>${esc(account)}</b>` : ''}.</p>${warn}
<ul>${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
<p>Your control panel, in the <a href="https://drive.google.com/drive/folders/${esc(out.root)}">DEPARTURZ Portal folder</a>:</p>
<ul><li><a href="${sheet(out.CLIENTS_SHEET_ID)}">DEPARTURZ Clients</a> (clients, projects, timelines, invoices, documents, reviews)</li><li><a href="${sheet(out.TEAM_SHEET_ID)}">DEPARTURZ Team</a> (crew, tasks, pay, cuts)</li><li><a href="${sheet(out.BOOKS_SHEET_ID)}">DEPARTURZ Books</a></li></ul>
<p>You're on the Team tab as the owner: <b>${esc(s.email)}</b>. Sign in with that email.</p>
<a class="btn" href="/portal">Open the portal</a>`, true);
}
