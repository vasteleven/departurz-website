// One-time: lets the portal use the departurzedits@gmail.com Drive and Sheets.
//   1. Put GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local (see SETUP.md, step 2).
//   2. npm run google-token
//   3. A browser opens. Sign in as departurzedits@gmail.com and allow access.
//   4. The refresh token is saved to .env.local and printed. Paste it into Vercel as GOOGLE_REFRESH_TOKEN.
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { exec } from 'node:child_process';
import { loadEnv, saveEnv } from './env.mjs';

loadEnv();
const id = process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
const secret = process.env.GOOGLE_DRIVE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
if (!id || !secret) {
  console.error('\n  Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local first (SETUP.md, step 2).\n');
  process.exit(1);
}
const PORT = Number(process.env.TOKEN_PORT || 5174);
const redirect = `http://localhost:${PORT}/oauth`;
const state = randomBytes(16).toString('hex');
const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: id, redirect_uri: redirect, response_type: 'code', access_type: 'offline', prompt: 'consent', state,
  scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets',
  login_hint: process.env.DRIVE_ACCOUNT || 'departurzedits@gmail.com'
});

const page = (title, body) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:Arial;background:#0A0A0A;color:#F2F0EB;display:grid;place-items:center;min-height:100vh;margin:0"><div style="max-width:440px;text-align:center"><h1 style="text-transform:uppercase">${title}</h1><p style="color:#BEBCB6">${body}</p></div>`;

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, redirect);
  if (u.pathname !== '/oauth') { res.writeHead(404); return res.end(); }
  if (u.searchParams.get('state') !== state || !u.searchParams.get('code')) {
    res.writeHead(400, { 'Content-Type': 'text/html' }); return res.end(page('That didn’t work', u.searchParams.get('error') || 'Run npm run google-token again.'));
  }
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: u.searchParams.get('code'), client_id: id, client_secret: secret, redirect_uri: redirect, grant_type: 'authorization_code' })
  });
  const j = await r.json();
  if (!j.refresh_token) {
    res.writeHead(400, { 'Content-Type': 'text/html' }); res.end(page('No token came back', 'Remove the app’s access at myaccount.google.com/permissions, then run it again.'));
    console.error('\n  Google did not return a refresh token:', j.error_description || j.error || j, '\n'); process.exit(1);
  }
  saveEnv('GOOGLE_REFRESH_TOKEN', j.refresh_token);
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(page('Connected', 'The portal can now use the DEPARTURZ Drive and Sheets. You can close this tab.'));
  console.log('\n  Connected. Saved to .env.local. Add this to Vercel as GOOGLE_REFRESH_TOKEN:\n\n  ' + j.refresh_token + '\n\n  Next: npm run setup -- --admin you@departurz.com\n');
  setTimeout(() => process.exit(0), 300);
});
server.listen(PORT, () => {
  console.log('\n  Opening Google. Sign in as departurzedits@gmail.com and click Allow.');
  console.log('  If nothing opens, paste this into your browser:\n\n  ' + url + '\n');
  const open = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open';
  exec(`${open} "${url}"`);
});
