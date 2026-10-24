// Upstash Redis (Vercel Marketplace > Upstash for Redis, free tier) for chat, one-time sign-in links and rate limits.
// Without it (local testing) a small in-memory stand-in is used, which forgets everything on restart.
import { Redis } from '@upstash/redis';
import { env, HttpError } from './util.js';

const url = env('UPSTASH_REDIS_REST_URL') || env('KV_REST_API_URL');
const token = env('UPSTASH_REDIS_REST_TOKEN') || env('KV_REST_API_TOKEN');

function memory() {
  const m = new Map(), exp = new Map();
  const alive = k => { if (exp.has(k) && Date.now() > exp.get(k)) { m.delete(k); exp.delete(k); } return m.has(k); };
  return {
    memory: true,
    async get(k) { return alive(k) ? m.get(k) : null; },
    async set(k, v, o = {}) { if (o.nx && alive(k)) return null; m.set(k, v); if (o.ex) exp.set(k, Date.now() + o.ex * 1000); else exp.delete(k); return 'OK'; },
    async del(k) { const had = alive(k); m.delete(k); exp.delete(k); return had ? 1 : 0; },
    async incr(k) { const v = (alive(k) ? Number(m.get(k)) : 0) + 1; m.set(k, v); return v; },
    async expire(k, s) { if (alive(k)) exp.set(k, Date.now() + s * 1000); return 1; },
    async rpush(k, ...vals) { const a = alive(k) ? m.get(k) : []; a.push(...vals); m.set(k, a); return a.length; },
    async llen(k) { return alive(k) ? m.get(k).length : 0; },
    async lrange(k, s, e) { const a = alive(k) ? m.get(k) : []; const n = a.length; const st = s < 0 ? Math.max(0, n + s) : s; const en = e < 0 ? n + e : e; return a.slice(st, en + 1); },
    async ltrim(k, s, e) { const a = await this.lrange(k, s, e); m.set(k, a); return 'OK'; }
  };
}

// on Vercel every request can land on a different machine, so a real Redis is required there
function missing() {
  const fail = async () => { throw new HttpError(503, 'The portal needs its Redis database. In Vercel, add Upstash for Redis (Storage tab) to this project.'); };
  return { get: fail, set: fail, del: fail, incr: fail, expire: fail, rpush: fail, llen: fail, lrange: fail, ltrim: fail };
}
export const kv = url && token ? new Redis({ url, token }) : env('VERCEL') ? missing() : memory();

// a simple fixed-window rate limit; returns true when the caller is over the limit
export async function limited(key, max, seconds) {
  const n = await kv.incr('rl:' + key);
  if (n === 1) await kv.expire('rl:' + key, seconds);
  return n > max;
}
