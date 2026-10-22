// ZEVANT account API: sign-up, sign-in, sessions and account settings on Cloudflare Workers + D1.
import {
  checkLoginId, checkDisplayName, checkPassword, cleanDisplayName, normalizeLoginId, PASSWORD_MAX,
} from '../shared/rules.js';
import { hashPassword, verifyPassword, hashIterations, randomToken, sha256Hex, PBKDF2_MAX_ITERATIONS } from './crypto.js';
import {
  ApiError, json, readJson, str, assertTrustedMutation, readCookie, cookieName, sessionCookie, clearCookie,
} from './http.js';
import * as db from './store.js';
import { deviceLabel } from './device.js';

const MINUTE = 60 * 1000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
export const PERSISTENT_TTL = 30 * DAY;   // "stay signed in"
export const SHORT_TTL = DAY;             // browser-session cookie; the server still expires it after a day idle
const TOUCH_EVERY = 15 * MINUTE;          // sliding expiry without a D1 write on every request
const LIMITS = {
  loginId: { windowMs: 15 * MINUTE, limit: 8, lockMs: 15 * MINUTE },
  loginIp: { windowMs: 15 * MINUTE, limit: 40, lockMs: 15 * MINUTE },
  register: { windowMs: DAY, limit: 5, lockMs: 6 * HOUR },
  reauth: { windowMs: 15 * MINUTE, limit: 8, lockMs: 15 * MINUTE },
};
const TURNSTILE_VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function accountConfig(env) {
  const it = Number(env.PBKDF2_ITERATIONS);
  return {
    iterations: Number.isSafeInteger(it) && it >= 1000 ? Math.min(it, PBKDF2_MAX_ITERATIONS) : PBKDF2_MAX_ITERATIONS,
    registrationOpen: String(env.REGISTRATION_OPEN ?? 'true').toLowerCase() !== 'false',
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || '',
    turnstileSecret: env.TURNSTILE_SECRET_KEY || '',
  };
}

const clientIp = (request) => request.headers.get('CF-Connecting-IP') || 'local';
const ipKey = async (prefix, request) => `${prefix}:${(await sha256Hex('zv-ip:' + clientIp(request))).slice(0, 32)}`;

async function assertNotLocked(env, keys, now) {
  let until = 0;
  for (const key of keys) {
    const row = await db.throttleState(env.DB, key);
    if (row && row.locked_until > now) until = Math.max(until, row.locked_until);
  }
  if (until) throw new ApiError(429, 'rate_limited', { retryAfter: Math.ceil((until - now) / 1000) });
}

async function verifyTurnstile(cfg, token, request) {
  if (!cfg.turnstileSecret) return;
  if (!token) throw new ApiError(400, 'captcha_required');
  const form = new FormData();
  form.append('secret', cfg.turnstileSecret);
  form.append('response', token);
  if (request.headers.get('CF-Connecting-IP')) form.append('remoteip', request.headers.get('CF-Connecting-IP'));
  let ok = false;
  try { ok = (await (await fetch(TURNSTILE_VERIFY, { method: 'POST', body: form })).json())?.success === true; }
  catch { throw new ApiError(503, 'captcha_unavailable'); }
  if (!ok) throw new ApiError(400, 'captcha_failed');
}

// ------------------------------------------------------------------------------------- sessions
async function startSession(env, request, url, user, persistent, now) {
  const token = randomToken();
  const ttl = persistent ? PERSISTENT_TTL : SHORT_TTL;
  await db.insertSession(env.DB, {
    id: crypto.randomUUID(), tokenHash: await sha256Hex(token), userId: user.id, now, expiresAt: now + ttl, persistent,
    userAgent: str(request.headers.get('User-Agent'), 256) || null, country: str(request.cf?.country, 8) || null,
  });
  return sessionCookie(env, url, token, persistent ? ttl / 1000 : null);
}

/** The signed-in session for this request, sliding its expiry. `cookie` is a Set-Cookie to send back, if any. */
async function resolveSession(env, request, url, now) {
  const token = readCookie(request, cookieName(url));
  if (!token) return { row: null, cookie: null };
  if (token.length > 128) return { row: null, cookie: clearCookie(env, url) };
  const row = await db.sessionWithUser(env.DB, await sha256Hex(token), now);
  if (!row) return { row: null, cookie: clearCookie(env, url) };
  let cookie = null;
  if (now - row.last_seen_at >= TOUCH_EVERY) {
    const ttl = row.persistent ? PERSISTENT_TTL : SHORT_TTL;
    await db.touchSession(env.DB, row.session_id, now, now + ttl);
    if (row.persistent) cookie = sessionCookie(env, url, token, ttl / 1000);
  }
  return { row, token, cookie };
}

async function requireSession(env, request, url, now) {
  const s = await resolveSession(env, request, url, now);
  if (!s.row) throw new ApiError(401, 'not_signed_in', {}, s.cookie ? { 'Set-Cookie': s.cookie } : {});
  return s;
}

async function requirePassword(env, user, password, cfg, now) {
  const key = 'reauth:' + user.id;
  await assertNotLocked(env, [key], now);
  if (!password || !(await verifyPassword(password, user.password_hash, cfg.iterations))) {
    const hit = await db.throttleHit(env.DB, key, now, LIMITS.reauth);
    if (hit?.locked_until > now) throw new ApiError(429, 'rate_limited', { retryAfter: Math.ceil((hit.locked_until - now) / 1000) });
    throw new ApiError(400, 'wrong_password', { field: 'currentPassword' });
  }
  await db.throttleClear(env.DB, key);
}

const fieldError = (field, code) => new ApiError(400, code, { field });

// ------------------------------------------------------------------------------------- handlers
async function getConfig(ctx) {
  const { cfg } = ctx;
  return json(200, { registrationOpen: cfg.registrationOpen, turnstileSiteKey: cfg.turnstileSecret ? cfg.turnstileSiteKey : '' });
}

async function getSession({ env, request, url, now }) {
  const s = await resolveSession(env, request, url, now);
  const headers = s.cookie ? { 'Set-Cookie': s.cookie } : {};
  return json(200, { user: s.row ? db.publicUser(s.row) : null }, headers);
}

async function register({ env, request, url, now, cfg }) {
  if (!cfg.registrationOpen) throw new ApiError(403, 'registration_closed');
  const body = await readJson(request);
  const loginId = str(body.loginId, 64).trim(), password = str(body.password, PASSWORD_MAX + 1);
  const displayName = cleanDisplayName(str(body.displayName, 128));
  let code;
  if ((code = checkLoginId(loginId))) throw fieldError('loginId', code);
  if ((code = checkDisplayName(displayName))) throw fieldError('displayName', code);
  if ((code = checkPassword(password, loginId))) throw fieldError('password', code);
  const regKey = await ipKey('register', request);
  await assertNotLocked(env, [regKey], now);
  await verifyTurnstile(cfg, str(body.turnstileToken, 4096), request);
  const norm = normalizeLoginId(loginId);
  if (await db.userByLogin(env.DB, norm)) throw fieldError('loginId', 'login_id_taken');
  const user = { id: crypto.randomUUID(), loginId, loginIdNorm: norm, displayName, passwordHash: await hashPassword(password, cfg.iterations), now };
  if (!(await db.insertUser(env.DB, user))) throw fieldError('loginId', 'login_id_taken');
  await db.throttleHit(env.DB, regKey, now, LIMITS.register);
  const row = await db.userById(env.DB, user.id);
  const cookie = await startSession(env, request, url, row, body.remember !== false, now);
  return json(201, { user: db.publicUser(row) }, { 'Set-Cookie': cookie });
}

async function login({ env, request, url, now, cfg }) {
  const body = await readJson(request);
  const loginId = str(body.loginId, 64).trim(), password = str(body.password, PASSWORD_MAX + 1);
  if (!loginId) throw fieldError('loginId', 'login_id_required');
  if (!password) throw fieldError('password', 'password_required');
  const norm = normalizeLoginId(loginId);
  const idKey = 'login:' + norm, ipK = await ipKey('loginip', request);
  await assertNotLocked(env, [idKey, ipK], now);
  const user = norm.length <= 64 ? await db.userByLogin(env.DB, norm) : null;
  const ok = await verifyPassword(password, user?.password_hash ?? null, cfg.iterations);
  if (!user || !ok) {
    const [a, b] = [await db.throttleHit(env.DB, idKey, now, LIMITS.loginId), await db.throttleHit(env.DB, ipK, now, LIMITS.loginIp)];
    const until = Math.max(a?.locked_until || 0, b?.locked_until || 0);
    if (until > now) throw new ApiError(429, 'rate_limited', { retryAfter: Math.ceil((until - now) / 1000) });
    throw new ApiError(401, 'invalid_credentials');
  }
  await db.throttleClear(env.DB, idKey);
  // upgrade hashes made with fewer iterations than the current setting
  if (hashIterations(user.password_hash) < cfg.iterations) await db.setPasswordHash(env.DB, user.id, await hashPassword(password, cfg.iterations), now, false);
  await db.touchLogin(env.DB, user.id, now);
  const cookie = await startSession(env, request, url, user, body.remember !== false, now);
  return json(200, { user: db.publicUser(user) }, { 'Set-Cookie': cookie });
}

async function logout({ env, request, url }) {
  const token = readCookie(request, cookieName(url));
  if (token && token.length <= 128) await db.deleteSessionByToken(env.DB, await sha256Hex(token));
  return json(204, null, { 'Set-Cookie': clearCookie(env, url) });
}

async function sessions({ env, request, url, now }) {
  const { row, cookie } = await requireSession(env, request, url, now);
  const list = (await db.listSessions(env.DB, row.id, now)).map((s) => ({
    id: s.id, current: s.id === row.session_id, createdAt: s.created_at, lastSeenAt: s.last_seen_at,
    expiresAt: s.expires_at, persistent: !!s.persistent, device: deviceLabel(s.user_agent), country: s.country || '',
  }));
  return json(200, { sessions: list }, cookie ? { 'Set-Cookie': cookie } : {});
}

async function revokeSessions({ env, request, url, now }) {
  const body = await readJson(request);
  const { row } = await requireSession(env, request, url, now);
  if (body.scope === 'others') await db.deleteOtherSessions(env.DB, row.id, row.session_id);
  else {
    const id = str(body.id, 64);
    if (!id) throw fieldError('id', 'session_required');
    if (id === row.session_id) throw fieldError('id', 'session_current');
    await db.deleteSession(env.DB, id, row.id);
  }
  return sessions({ env, request, url, now });
}

async function updateProfile({ env, request, url, now }) {
  const body = await readJson(request);
  const { row, cookie } = await requireSession(env, request, url, now);
  const name = cleanDisplayName(str(body.displayName, 128));
  const code = checkDisplayName(name);
  if (code) throw fieldError('displayName', code);
  await db.setDisplayName(env.DB, row.id, name, now);
  return json(200, { user: db.publicUser(await db.userById(env.DB, row.id)) }, cookie ? { 'Set-Cookie': cookie } : {});
}

async function changePassword({ env, request, url, now, cfg }) {
  const body = await readJson(request);
  const { row } = await requireSession(env, request, url, now);
  const current = str(body.currentPassword, PASSWORD_MAX + 1), next = str(body.newPassword, PASSWORD_MAX + 1);
  const code = checkPassword(next, row.login_id);
  if (code) throw fieldError('newPassword', code);
  if (next === current) throw fieldError('newPassword', 'password_same');
  await requirePassword(env, row, current, cfg, now);
  await db.setPasswordHash(env.DB, row.id, await hashPassword(next, cfg.iterations), now);
  // a new password signs every other device out; this device gets a fresh token
  await db.deleteOtherSessions(env.DB, row.id, '');
  const cookie = await startSession(env, request, url, row, !!row.persistent, now);
  return json(200, { user: db.publicUser(await db.userById(env.DB, row.id)) }, { 'Set-Cookie': cookie });
}

async function deleteAccount({ env, request, url, now, cfg }) {
  const body = await readJson(request);
  const { row } = await requireSession(env, request, url, now);
  if (str(body.confirm, 64).trim().toLowerCase() !== row.login_id_norm) throw fieldError('confirm', 'confirm_mismatch');
  await requirePassword(env, row, str(body.password, PASSWORD_MAX + 1), cfg, now);
  await db.deleteUser(env.DB, row.id);
  await db.throttleClear(env.DB, 'login:' + row.login_id_norm);
  return json(204, null, { 'Set-Cookie': clearCookie(env, url) });
}

const ROUTES = {
  'GET /api/account/config': getConfig,
  'GET /api/account/session': getSession,
  'POST /api/account/register': register,
  'POST /api/account/login': login,
  'POST /api/account/logout': logout,
  'GET /api/account/sessions': sessions,
  'POST /api/account/sessions/revoke': revokeSessions,
  'PATCH /api/account/profile': updateProfile,
  'POST /api/account/password': changePassword,
  'POST /api/account/delete': deleteAccount,
};
const PATHS = new Set(Object.keys(ROUTES).map((k) => k.split(' ')[1]));

export async function handleAccount(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '');
  const handler = ROUTES[`${request.method} ${path}`];
  if (!handler) {
    if (PATHS.has(path)) throw new ApiError(405, 'method_not_allowed');
    throw new ApiError(404, 'not_found');
  }
  if (!env.DB) throw new ApiError(503, 'storage_unavailable');
  if (request.method !== 'GET') assertTrustedMutation(request, env, url);
  return handler({ env, request, url, now: Date.now(), cfg: accountConfig(env) });
}
