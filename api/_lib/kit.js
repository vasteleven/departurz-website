// Kit: every client with a login is added as a subscriber and tagged, so the Kit automations you build
// (project updates, thank-you letters, returning-client offers) reach them. Set KIT_API_KEY (Kit > Settings > Developer).
// Without a key this quietly does nothing and the portal's own emails still go out.
import { env } from './util.js';

const API = 'https://api.kit.com/v4';
const on = () => !!env('KIT_API_KEY');
async function k(path, opts = {}) {
  const r = await fetch(API + path, { ...opts, headers: { 'X-Kit-Api-Key': env('KIT_API_KEY'), 'Content-Type': 'application/json', Accept: 'application/json', ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Kit ' + r.status + ' ' + JSON.stringify(j).slice(0, 200));
  return j;
}

let tagCache = null;
async function tagId(name) {
  if (!tagCache) {
    tagCache = {};
    let after = '';
    for (let page = 0; page < 10; page++) {
      const j = await k(`/tags?per_page=1000${after ? '&after=' + encodeURIComponent(after) : ''}`);
      (j.tags || []).forEach(t => { tagCache[t.name.toLowerCase()] = t.id; });
      if (!j.pagination || !j.pagination.has_next_page) break;
      after = j.pagination.end_cursor;
    }
  }
  const key = name.toLowerCase();
  if (!tagCache[key]) { const j = await k('/tags', { method: 'POST', body: JSON.stringify({ name }) }); tagCache[key] = j.tag.id; }
  return tagCache[key];
}

export const TAGS = { client: 'Portal client', updates: 'Portal: project updates', thanks: 'Portal: thank-yous', offers: 'Portal: offers' };

export async function subscribe({ email, name, tags = [] }) {
  if (!on()) return false;
  const first = String(name || '').split(/\s+/)[0];
  const j = await k('/subscribers', { method: 'POST', body: JSON.stringify({ email_address: email, first_name: first, state: 'active' }) });
  for (const t of tags) await k(`/tags/${await tagId(t)}/subscribers`, { method: 'POST', body: JSON.stringify({ email_address: email }) });
  return j.subscriber && j.subscriber.id;
}

export async function setTag(email, tag, value) {
  if (!on()) return false;
  const id = await tagId(tag);
  if (value) { await k(`/tags/${id}/subscribers`, { method: 'POST', body: JSON.stringify({ email_address: email }) }); return true; }
  const s = await k(`/subscribers?email_address=${encodeURIComponent(email)}`);
  const sub = (s.subscribers || [])[0];
  if (sub) await fetch(`${API}/tags/${id}/subscribers/${sub.id}`, { method: 'DELETE', headers: { 'X-Kit-Api-Key': env('KIT_API_KEY') } });
  return true;
}
