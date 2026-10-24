// Run the whole site and portal on your computer with pretend Google, Drive and email:
//   npm run dev        then open http://localhost:3000/portal.html
// Sign in with jordan@lumencoffee.example (client) or amara@crew.example / nate@departurz.example (crew).
// Sign-in links are printed here instead of emailed. Nothing touches your real accounts.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const site = [path.join(root, 'public'), root, path.resolve(root, '..')].find(d => fs.existsSync(path.join(d, 'portal.html')));
const PORT = Number(process.env.PORT || 3000);
const base = `http://localhost:${PORT}`;

Object.assign(process.env, {
  SESSION_SECRET: process.env.SESSION_SECRET || 'dev-only-secret-change-me-dev-only-secret',
  CLIENTS_SHEET_ID: 'clients-sheet', TEAM_SHEET_ID: 'team-sheet',
  GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: 'mock', GOOGLE_DRIVE_CLIENT_ID: 'mock', GOOGLE_REFRESH_TOKEN: 'mock',
  RESEND_API_KEY: 'mock', PORTAL_URL: base, CRON_SECRET: 'dev', UPSTASH_REDIS_REST_URL: '', KV_REST_API_URL: ''
});

const mock = await import('./mock-google.mjs');
const { demo } = await import('./demo-data.mjs');
mock.install(base);
const d = demo();
mock.seedSheet('clients-sheet', d.clients);
mock.seedSheet('team-sheet', d.team);
const portalRoot = mock.addFolder('DEPARTURZ Portal');
process.env.CLIENTS_FOLDER_ID = mock.addFolder('Clients', portalRoot);
process.env.TEAM_FOLDER_ID = mock.addFolder('Team', portalRoot);

// a sample cut and a finished file in the Lumen project's folders
const proj = mock.addFolder('DPZ-0142 · Lumen Coffee brand film', process.env.CLIENTS_FOLDER_ID);
const out = mock.addFolder('From DEPARTURZ', proj);
const cut = mock.addFile('Teaser 15s, draft v1.mp4', out, 214e6, 'video/mp4');
mock.addFile('Stills, selects (48).zip', out, 1.2e9, 'application/zip');
const docs = mock.addFolder('Documents', proj);
mock.addFile('Domain setup guide.pdf', docs, 420e3, 'application/pdf');   // shows up as DPZ-0142-D5
const rowsP = mock.store.sheets['clients-sheet'].Projects;
const head = rowsP[0];
rowsP[1][head.indexOf('drive_folder_id')] = proj;
rowsP[1][head.indexOf('review_file_id')] = cut;

const api = await import('../api/p.js');
const cron = await import('../api/cron.js');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2' };

async function toWeb(req, bodyBuf, url) {
  return new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : bodyBuf });
}
async function sendWeb(res, r) {
  const headers = {};
  r.headers.forEach((v, k) => { headers[k] = v; });
  const setCookie = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  if (setCookie.length) headers['set-cookie'] = setCookie.map(c => c.replace('; Secure', ''));
  res.writeHead(r.status, headers);
  res.end(Buffer.from(await r.arrayBuffer()));
}

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const buf = Buffer.concat(chunks);
  const url = new URL(req.url, base);
  try {
    if (url.pathname.startsWith('/__upload/')) {
      const r = mock.handleUpload(url.pathname.split('/').pop(), req.headers['content-range'], buf.length);
      res.writeHead(r.status, { 'Content-Type': 'application/json' }); return res.end(r.body);
    }
    if (url.pathname === '/__dev/mail') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(mock.store.mail)); }
    if (url.pathname === '/__dev/sheets') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(mock.store.sheets)); }
    if (url.pathname.startsWith('/api/p/') || url.pathname === '/api/p') {
      const r = url.pathname.replace(/^\/api\/p\/?/, '');
      const u = new URL(base + '/api/p'); url.searchParams.forEach((v, k) => u.searchParams.set(k, v)); u.searchParams.set('r', r);
      const out = await api[req.method === 'POST' ? 'POST' : 'GET'](await toWeb(req, buf, u));
      return sendWeb(res, out);
    }
    if (url.pathname === '/api/cron') return sendWeb(res, await cron.GET(new Request(base + '/api/cron', { headers: { authorization: 'Bearer dev' } })));
    let file = path.join(site, decodeURIComponent(url.pathname === '/' ? (fs.existsSync(path.join(site, 'index.html')) && site !== path.resolve(root, '..') ? '/index.html' : '/departurz.html') : url.pathname));
    if (!file.startsWith(site) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  } catch (e) { console.error(e); res.writeHead(500); res.end(String(e)); }
}).listen(PORT, () => {
  console.log(`\n  DEPARTURZ portal (pretend Google) on ${base}/portal.html`);
  console.log('  Client: jordan@lumencoffee.example   Crew: amara@crew.example   Admin: nate@departurz.example\n');
});

// print sign-in links as they're "emailed"
let seen = 0;
setInterval(() => {
  for (; seen < mock.store.mail.length; seen++) {
    const m = mock.store.mail[seen];
    const link = (m.html.match(/href="([^"]+auth\/verify[^"]+)"/) || [])[1];
    console.log(`  [email to ${m.to}] ${m.subject}${link ? '\n    ' + link.replace(/&amp;/g, '&') : ''}`);
  }
}, 500);
