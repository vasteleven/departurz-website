// One-time: builds the portal's home in the departurzedits Drive. (The site's /setup page does the same thing
// without a terminal; this is the same build for running on a computer.)
//   npm run setup -- --admin you@departurz.com --name Nate
// Creates:  DEPARTURZ Portal / Clients   DEPARTURZ Portal / Team
//           "DEPARTURZ Clients" and "DEPARTURZ Team" Google Sheets with every tab, header and dropdown
//           "DEPARTURZ Books" (Summary, Money in, Crew pay, Expenses, Settings)
// and adds you to the Team tab as the owner. Safe to run again: it reuses what already exists, and adds any tabs or
// columns a newer version of the portal needs (existing rows are never touched).
// Add --no-example to skip the example client project.
import { loadEnv, saveEnv } from './env.mjs';

loadEnv();
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const admin = (arg('admin') || process.env.ADMIN_EMAIL || '').toLowerCase();
const adminName = arg('name', 'Nate');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin)) { console.error('\n  Tell setup who the admin is:  npm run setup -- --admin you@departurz.com --name Nate\n'); process.exit(1); }
for (const k of ['GOOGLE_REFRESH_TOKEN']) if (!process.env[k]) { console.error(`\n  ${k} is missing. Run npm run google-token first.\n`); process.exit(1); }

const { buildPortal } = await import('../api/_lib/setupcore.js');
console.log('\n  Setting up the DEPARTURZ portal in the Drive…\n');
const have = Object.fromEntries(['CLIENTS_SHEET_ID', 'TEAM_SHEET_ID', 'CLIENTS_FOLDER_ID', 'TEAM_FOLDER_ID', 'BOOKS_SHEET_ID'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
const out = await buildPortal({ admin, adminName, example: !args.includes('--no-example'), have, log: m => console.log('  ✓ ' + m) });
for (const k of ['CLIENTS_SHEET_ID', 'TEAM_SHEET_ID', 'CLIENTS_FOLDER_ID', 'TEAM_FOLDER_ID', 'BOOKS_SHEET_ID']) saveEnv(k, out[k]);
console.log(`\n  Done (https://drive.google.com/drive/folders/${out.root}). Add these five to Vercel (they're also saved in .env.local):\n
  CLIENTS_SHEET_ID=${out.CLIENTS_SHEET_ID}
  TEAM_SHEET_ID=${out.TEAM_SHEET_ID}
  CLIENTS_FOLDER_ID=${out.CLIENTS_FOLDER_ID}
  TEAM_FOLDER_ID=${out.TEAM_FOLDER_ID}
  BOOKS_SHEET_ID=${out.BOOKS_SHEET_ID}\n`);
