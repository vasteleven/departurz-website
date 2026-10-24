// Sessions: a signed token in an httpOnly cookie for the website, or a Bearer token for the native apps.
import { SignJWT, jwtVerify } from 'jose';
import { HttpError, need, cookies } from './util.js';
import { kv } from './kv.js';

const key = () => new TextEncoder().encode(need('SESSION_SECRET'));
const COOKIE = 'dpz';
const DAYS = 30;

export async function createSession(user) {
  return new SignJWT({ email: user.email, side: user.side })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(DAYS + 'd').setSubject(user.email).sign(key());
}

export function sessionCookie(token) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DAYS * 86400}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export async function readSession(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : cookies(request)[COOKIE];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    if (await kv.get('revoked:' + payload.email + ':' + payload.iat)) return null;
    return { email: payload.email, side: payload.side, iat: payload.iat };
  } catch { return null; }
}

export async function requireSession(request) {
  const s = await readSession(request);
  if (!s) throw new HttpError(401, 'Please sign in.');
  return s;
}

/* one-tap email links: good for 20 minutes, and only once */
export async function createLinkToken(email) {
  const jti = Math.random().toString(36).slice(2) + Date.now().toString(36);
  await kv.set('link:' + jti, email, { ex: 20 * 60 });
  return new SignJWT({ email, purpose: 'link' }).setProtectedHeader({ alg: 'HS256' }).setJti(jti).setIssuedAt().setExpirationTime('20m').sign(key());
}
export async function useLinkToken(token) {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    if (payload.purpose !== 'link' || !payload.jti) return null;
    const email = await kv.get('link:' + payload.jti);
    if (!email || email !== payload.email) return null;
    await kv.del('link:' + payload.jti);
    return payload.email;
  } catch { return null; }
}
