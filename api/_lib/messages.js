// Chat: client threads, crew channels and direct messages, kept in Redis (the newest 500 per conversation).
import { createHash } from 'node:crypto';
import { kv } from './kv.js';
import { clean, id, lower } from './util.js';

const KEEP = 500;
export const dmId = (a, b) => 'dm-' + createHash('sha256').update([lower(a), lower(b)].sort().join('|')).digest('hex').slice(0, 12);
export const clientChan = code => 'client-' + String(code).replace(/[^A-Za-z0-9_-]/g, '');
export const groupChan = name => 'ch-' + String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const parse = r => { if (r && typeof r === 'object') return r; try { return JSON.parse(r); } catch { return null; } };

export async function history(cid, n = 60) {
  const raw = await kv.lrange('chat:' + cid, -n, -1);
  return (raw || []).map(parse).filter(Boolean);
}

export async function post(cid, { email, name, tz, text, file }) {
  const msg = { id: id('m'), from: lower(email), name: clean(name, 80), tz: tz || '', at: new Date().toISOString(), text: clean(text, 4000) };
  if (file && file.id) msg.file = { id: clean(file.id, 120), name: clean(file.name, 200), mime: clean(file.mime, 100) };
  await kv.rpush('chat:' + cid, JSON.stringify(msg));
  if ((await kv.llen('chat:' + cid)) > KEEP + 50) await kv.ltrim('chat:' + cid, -KEEP, -1);
  return msg;
}

export async function lastRead(email, cid) { return (await kv.get(`read:${lower(email)}:${cid}`)) || ''; }
export async function markRead(email, cid) { await kv.set(`read:${lower(email)}:${cid}`, new Date().toISOString()); }

// what the portal pages draw: "me" for your own messages, a name for everyone else
export function shape(m, me) {
  const mine = lower(m.from) === lower(me);
  return { id: m.id, from: mine ? 'me' : (m.name || 'DEPARTURZ'), tz: m.tz || '', at: m.at, text: m.text || '', file: m.file ? m.file.name : '', fileId: m.file ? m.file.id : '' };
}

export async function thread(cid, me, n = 60) {
  const [msgs, read] = await Promise.all([history(cid, n), lastRead(me, cid)]);
  const unread = msgs.filter(m => lower(m.from) !== lower(me) && m.at > read).length;
  return { msgs: msgs.map(m => shape(m, me)), unread };
}
