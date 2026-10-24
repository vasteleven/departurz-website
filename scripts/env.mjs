// Reads settings from .env.local (never uploaded or committed) so the setup scripts can run on your computer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ENV_FILE = path.join(root, '.env.local');

export function loadEnv() {
  for (const f of [ENV_FILE, path.join(root, '.env')]) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

export function saveEnv(key, value) {
  if (process.env.DPZ_TEST) { process.env[key] = value; return; }
  let text = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  const line = `${key}=${value}`;
  text = new RegExp(`^${key}=.*$`, 'm').test(text) ? text.replace(new RegExp(`^${key}=.*$`, 'm'), line) : text + (text && !text.endsWith('\n') ? '\n' : '') + line + '\n';
  fs.writeFileSync(ENV_FILE, text, { mode: 0o600 });
  process.env[key] = value;
}
