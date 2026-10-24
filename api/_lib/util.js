// Small helpers shared by the portal functions.

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

export const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
export function need(k) {
  const v = env(k);
  if (!v) throw new HttpError(503, `The portal is missing the ${k} setting.`);
  return v;
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  });
}

export function redirect(location, headers = {}) {
  return new Response(null, { status: 302, headers: { Location: location, 'Cache-Control': 'no-store', ...headers } });
}

export async function body(request) {
  const type = request.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    try { return await request.json(); } catch { throw new HttpError(400, 'That request was not valid JSON.'); }
  }
  if (type.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(await request.text()));
  }
  return {};
}

export function cookies(request) {
  const out = {};
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// the public address of the site, for links in emails and Google's upload sessions
export function origin(request) {
  const set = env('PORTAL_URL');
  if (set) return set.replace(/\/$/, '');
  const u = new URL(request.url);
  const host = request.headers.get('x-forwarded-host') || u.host;
  const proto = request.headers.get('x-forwarded-proto') || u.protocol.replace(':', '');
  return `${proto}://${host}`;
}

export const clean = (v, max = 2000) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B-\u001F]/g, '').trim().slice(0, max);
export const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));
export const lower = s => String(s || '').trim().toLowerCase();
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const id = (p = '') => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
export const yes = v => v === true || /^(y|yes|true|1|x|✓)$/i.test(String(v || '').trim());

// dates live in the sheets as real dates; everything here works in YYYY-MM-DD
export function isoDay(d) {
  const x = d instanceof Date ? d : new Date(d);
  return x.getUTCFullYear() + '-' + String(x.getUTCMonth() + 1).padStart(2, '0') + '-' + String(x.getUTCDate()).padStart(2, '0');
}
export function today(tz = env('TIMEZONE', 'America/Los_Angeles')) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return p; // en-CA formats as YYYY-MM-DD
}
export function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return isoDay(new Date(Date.UTC(y, m - 1, d + n)));
}
export const money = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 });
export const firstName = n => String(n || '').trim().split(/\s+/)[0] || 'there';
