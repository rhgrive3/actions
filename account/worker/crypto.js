// Password hashing and session tokens with Web Crypto only (Workers and Node share this code path).

const enc = new TextEncoder();
// Workers' PBKDF2 refuses more than 100000 iterations; the count is stored per hash so it can move later.
export const PBKDF2_MAX_ITERATIONS = 100000;
const HASH_PREFIX = 'pbkdf2_sha256';
const KEY_BITS = 256;

export function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s) {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
}

export const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));
export const randomToken = () => b64url(randomBytes(32));

export async function sha256Hex(text) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Length-independent comparison of two byte arrays. */
export function timingSafeEqual(a, b) {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, KEY_BITS));
}

export async function hashPassword(password, iterations = PBKDF2_MAX_ITERATIONS) {
  const it = Math.min(PBKDF2_MAX_ITERATIONS, Math.max(1, iterations | 0));
  const salt = randomBytes(16);
  const hash = await derive(password, salt, it);
  return `${HASH_PREFIX}$${it}$${b64url(salt)}$${b64url(hash)}`;
}

export function hashIterations(stored) {
  const parts = String(stored || '').split('$');
  return parts.length === 4 && parts[0] === HASH_PREFIX ? Number(parts[1]) : 0;
}

/** Verifies `password` against a stored hash. With `stored` null it still spends the same work (unknown users). */
export async function verifyPassword(password, stored, iterations = PBKDF2_MAX_ITERATIONS) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== HASH_PREFIX) {
    await derive(password, randomBytes(16), iterations);
    return false;
  }
  const it = Number(parts[1]);
  if (!Number.isSafeInteger(it) || it < 1 || it > PBKDF2_MAX_ITERATIONS) return false;
  const actual = await derive(password, fromB64url(parts[2]), it);
  return timingSafeEqual(actual, fromB64url(parts[3]));
}
