// Account Worker API against an in-memory D1 (node:sqlite). Run: node --test account/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createD1 } from './d1-fake.mjs';
import worker from '../worker/index.js';
import { PERSISTENT_TTL } from '../worker/account.js';
import { hashIterations } from '../worker/crypto.js';

const MIGRATION = fileURLToPath(new URL('../migrations/0001_accounts.sql', import.meta.url));
const ORIGIN = 'https://zevant.example';

function setup(envExtra = {}) {
  const assets = [];
  const env = {
    DB: createD1(MIGRATION), PBKDF2_ITERATIONS: '1000',
    ASSETS: { fetch: async (req) => { assets.push(new URL(req.url).pathname); return new Response('asset'); } },
    ...envExtra,
  };
  const call = async (method, path, { body, cookie, headers = {}, origin = ORIGIN, raw } = {}) => {
    const h = new Headers(headers);
    if (method !== 'GET' && method !== 'OPTIONS' && !('X-Zevant-Request' in headers)) h.set('X-Zevant-Request', '1');
    if (origin) h.set('Origin', origin);
    if (cookie) h.set('Cookie', cookie);
    if (body !== undefined && !h.has('Content-Type')) h.set('Content-Type', 'application/json');
    const res = await worker.fetch(new Request(ORIGIN + path, { method, headers: h, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) }), env, {});
    const text = await res.text();
    return { status: res.status, headers: res.headers, data: text ? JSON.parse(text) : null, cookie: cookieOf(res) };
  };
  return { env, call, assets };
}

function cookieOf(res) {
  const sc = res.headers.get('Set-Cookie');
  if (!sc) return null;
  const [pair] = sc.split(';');
  return { header: sc, pair, value: pair.slice(pair.indexOf('=') + 1) };
}

const NEW = { loginId: 'Inkling_01', displayName: 'イカすプレイヤー', password: 'tidal-wave-42!', remember: true };

async function registered(env = {}) {
  const ctx = setup(env);
  const r = await ctx.call('POST', '/api/account/register', { body: NEW });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { ...ctx, session: r.cookie.pair, user: r.data.user };
}

function withNow(t, fn) {
  const real = Date.now;
  Date.now = () => t;
  return Promise.resolve().then(fn).finally(() => { Date.now = real; });
}

test('register creates the account and a hardened session cookie', async () => {
  const { call } = setup();
  const r = await call('POST', '/api/account/register', { body: NEW });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.loginId, 'Inkling_01');
  assert.equal(r.data.user.displayName, 'イカすプレイヤー');
  assert.equal(r.data.user.password_hash, undefined);
  assert.match(r.cookie.header, /^__Host-zv_session=[\w-]{43}; Path=\/; HttpOnly; SameSite=Lax; Secure; Max-Age=2592000$/);
  assert.equal(r.headers.get('Cache-Control'), 'no-store');
  const s = await call('GET', '/api/account/session', { cookie: r.cookie.pair });
  assert.equal(s.status, 200);
  assert.equal(s.data.user.loginId, 'Inkling_01');
});

test('a browser-session sign-in has no Max-Age and the token is stored hashed', async () => {
  const { call, env } = setup();
  const r = await call('POST', '/api/account/register', { body: { ...NEW, remember: false } });
  assert.doesNotMatch(r.cookie.header, /Max-Age/);
  const rows = env.DB.raw.prepare('SELECT token_hash, persistent FROM sessions').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].persistent, 0);
  assert.notEqual(rows[0].token_hash, r.cookie.value);
  assert.match(rows[0].token_hash, /^[0-9a-f]{64}$/);
});

test('register validates every field with stable error codes', async () => {
  const { call } = setup();
  const cases = [
    [{ loginId: 'ab' }, 'loginId', 'login_id_short'],
    [{ loginId: 'bad id!' }, 'loginId', 'login_id_chars'],
    [{ loginId: '_edge' }, 'loginId', 'login_id_underscore'],
    [{ loginId: 'Admin' }, 'loginId', 'login_id_reserved'],
    [{ displayName: '   ' }, 'displayName', 'display_name_required'],
    [{ displayName: 'x'.repeat(17) }, 'displayName', 'display_name_long'],
    [{ displayName: 'ab‮cd' }, 'displayName', 'display_name_chars'],
    [{ password: 'short1' }, 'password', 'password_short'],
    [{ password: 'password123' }, 'password', 'password_common'],
    [{ password: 'xxinkling_01xx' }, 'password', 'password_contains_id'],
  ];
  for (const [patch, field, code] of cases) {
    const r = await call('POST', '/api/account/register', { body: { ...NEW, ...patch } });
    assert.equal(r.status, 400, code);
    assert.deepEqual(r.data.error, { code, field });
  }
});

test('login ids are unique case-insensitively', async () => {
  const { call } = await registered();
  const r = await call('POST', '/api/account/register', { body: { ...NEW, loginId: 'INKLING_01' } });
  assert.equal(r.status, 400);
  assert.deepEqual(r.data.error, { code: 'login_id_taken', field: 'loginId' });
});

test('login accepts any letter case and rejects bad credentials identically', async () => {
  const { call } = await registered();
  const ok = await call('POST', '/api/account/login', { body: { loginId: 'inkling_01', password: NEW.password } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.displayName, NEW.displayName);
  assert.ok(ok.cookie);
  const wrong = await call('POST', '/api/account/login', { body: { loginId: 'inkling_01', password: 'nope-nope-nope' } });
  const unknown = await call('POST', '/api/account/login', { body: { loginId: 'nobody_here', password: 'nope-nope-nope' } });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.data, unknown.data);
  assert.deepEqual(wrong.data.error, { code: 'invalid_credentials' });
});

test('repeated failures lock the login id, even for the right password', async () => {
  const { call } = await registered();
  let last;
  for (let i = 0; i < 8; i++) last = await call('POST', '/api/account/login', { body: { loginId: NEW.loginId, password: 'wrong-pass-' + i } });
  assert.equal(last.status, 429);
  assert.equal(last.data.error.code, 'rate_limited');
  assert.ok(Number(last.headers.get('Retry-After')) > 0);
  const right = await call('POST', '/api/account/login', { body: { loginId: NEW.loginId, password: NEW.password } });
  assert.equal(right.status, 429);
  // the lock expires with its window
  await withNow(Date.now() + 16 * 60 * 1000, async () => {
    const later = await call('POST', '/api/account/login', { body: { loginId: NEW.loginId, password: NEW.password } });
    assert.equal(later.status, 200);
  });
});

test('mutations need the client header and a trusted Origin', async () => {
  const { call } = setup();
  const noHeader = await call('POST', '/api/account/login', { body: NEW, headers: { 'X-Zevant-Request': '0' } });
  assert.equal(noHeader.status, 403);
  const foreign = await call('POST', '/api/account/login', { body: NEW, origin: 'https://evil.example' });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.get('Access-Control-Allow-Origin'), null);
  const form = await call('POST', '/api/account/login', { raw: 'loginId=a', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(form.status, 415);
  const big = await call('POST', '/api/account/login', { raw: JSON.stringify({ x: 'y'.repeat(9000) }) , headers: { 'Content-Type': 'application/json' } });
  assert.equal(big.status, 413);
});

test('extra origins get credentialed CORS', async () => {
  const { call } = setup({ ALLOWED_ORIGINS: 'https://play.zevant.example, http://localhost:5173/' });
  const pre = await call('OPTIONS', '/api/account/login', { origin: 'http://localhost:5173' });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173');
  assert.equal(pre.headers.get('Access-Control-Allow-Credentials'), 'true');
  assert.match(pre.headers.get('Access-Control-Allow-Headers'), /X-Zevant-Request/);
  const r = await call('POST', '/api/account/register', { body: NEW, origin: 'https://play.zevant.example' });
  assert.equal(r.status, 201);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://play.zevant.example');
});

test('logout ends the session and clears the cookie', async () => {
  const { call, session } = await registered();
  const out = await call('POST', '/api/account/logout', { cookie: session });
  assert.equal(out.status, 204);
  assert.match(out.cookie.header, /Max-Age=0/);
  const s = await call('GET', '/api/account/session', { cookie: session });
  assert.equal(s.data.user, null);
  assert.match(s.cookie.header, /Max-Age=0/);
});

test('display name changes are validated and saved', async () => {
  const { call, session } = await registered();
  const bad = await call('PATCH', '/api/account/profile', { cookie: session, body: { displayName: '' } });
  assert.deepEqual(bad.data.error, { code: 'display_name_required', field: 'displayName' });
  const ok = await call('PATCH', '/api/account/profile', { cookie: session, body: { displayName: '  New\tName  ' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.displayName, 'New Name');
  const anon = await call('PATCH', '/api/account/profile', { body: { displayName: 'x' } });
  assert.equal(anon.status, 401);
});

test('password change verifies the current one and signs out other devices', async () => {
  const { call, session } = await registered();
  const other = (await call('POST', '/api/account/login', { body: { loginId: NEW.loginId, password: NEW.password } })).cookie.pair;
  const wrong = await call('POST', '/api/account/password', { cookie: session, body: { currentPassword: 'not-it-at-all', newPassword: 'brand-new-ink-9' } });
  assert.deepEqual(wrong.data.error, { code: 'wrong_password', field: 'currentPassword' });
  const same = await call('POST', '/api/account/password', { cookie: session, body: { currentPassword: NEW.password, newPassword: NEW.password } });
  assert.deepEqual(same.data.error, { code: 'password_same', field: 'newPassword' });
  const ok = await call('POST', '/api/account/password', { cookie: session, body: { currentPassword: NEW.password, newPassword: 'brand-new-ink-9' } });
  assert.equal(ok.status, 200);
  assert.ok(ok.data.user.passwordChangedAt >= ok.data.user.createdAt);
  assert.equal((await call('GET', '/api/account/session', { cookie: other })).data.user, null);
  assert.equal((await call('GET', '/api/account/session', { cookie: session })).data.user, null);
  assert.equal((await call('GET', '/api/account/session', { cookie: ok.cookie.pair })).data.user.loginId, NEW.loginId);
  const oldPw = await call('POST', '/api/account/login', { body: { loginId: NEW.loginId, password: NEW.password } });
  assert.equal(oldPw.status, 401);
});

test('device list marks the current session and can revoke others', async () => {
  const { call, session } = await registered();
  const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const phone = (await call('POST', '/api/account/login', { body: { loginId: NEW.loginId, password: NEW.password }, headers: { 'User-Agent': ua } })).cookie.pair;
  await call('POST', '/api/account/login', { body: { loginId: NEW.loginId, password: NEW.password } });
  let list = (await call('GET', '/api/account/sessions', { cookie: session })).data.sessions;
  assert.equal(list.length, 3);
  assert.equal(list.filter((s) => s.current).length, 1);
  const iphone = list.find((s) => s.device === 'Safari · iPhone');
  assert.ok(iphone);
  const self = await call('POST', '/api/account/sessions/revoke', { cookie: session, body: { id: list.find((s) => s.current).id } });
  assert.deepEqual(self.data.error, { code: 'session_current', field: 'id' });
  list = (await call('POST', '/api/account/sessions/revoke', { cookie: session, body: { id: iphone.id } })).data.sessions;
  assert.equal(list.length, 2);
  assert.equal((await call('GET', '/api/account/session', { cookie: phone })).data.user, null);
  list = (await call('POST', '/api/account/sessions/revoke', { cookie: session, body: { scope: 'others' } })).data.sessions;
  assert.deepEqual(list.map((s) => s.current), [true]);
});

test('account deletion needs the typed login id and the password', async () => {
  const { call, session, env } = await registered();
  const mismatch = await call('POST', '/api/account/delete', { cookie: session, body: { confirm: 'someone', password: NEW.password } });
  assert.deepEqual(mismatch.data.error, { code: 'confirm_mismatch', field: 'confirm' });
  const wrong = await call('POST', '/api/account/delete', { cookie: session, body: { confirm: 'INKLING_01', password: 'definitely-wrong' } });
  assert.equal(wrong.data.error.code, 'wrong_password');
  const ok = await call('POST', '/api/account/delete', { cookie: session, body: { confirm: 'INKLING_01', password: NEW.password } });
  assert.equal(ok.status, 204);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
  const again = await call('POST', '/api/account/login', { body: { loginId: NEW.loginId, password: NEW.password } });
  assert.equal(again.status, 401);
});

test('registration can be closed and sign-ups are limited per network', async () => {
  const closed = setup({ REGISTRATION_OPEN: 'false' });
  assert.equal((await closed.call('GET', '/api/account/config')).data.registrationOpen, false);
  assert.equal((await closed.call('POST', '/api/account/register', { body: NEW })).data.error.code, 'registration_closed');
  const { call } = setup();
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/api/account/register', { body: { ...NEW, loginId: 'player_' + i }, headers: { 'CF-Connecting-IP': '203.0.113.9' } })).status, 201);
  const sixth = await call('POST', '/api/account/register', { body: { ...NEW, loginId: 'player_x' }, headers: { 'CF-Connecting-IP': '203.0.113.9' } });
  assert.equal(sixth.status, 429);
  const elsewhere = await call('POST', '/api/account/register', { body: { ...NEW, loginId: 'player_y' }, headers: { 'CF-Connecting-IP': '198.51.100.7' } });
  assert.equal(elsewhere.status, 201);
});

test('Turnstile is enforced on sign-up when configured', async () => {
  const { call } = setup({ TURNSTILE_SITE_KEY: 'site-key', TURNSTILE_SECRET_KEY: 'secret' });
  assert.equal((await call('GET', '/api/account/config')).data.turnstileSiteKey, 'site-key');
  assert.equal((await call('POST', '/api/account/register', { body: NEW })).data.error.code, 'captcha_required');
  const realFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init) => { seen.push([String(url), init.body.get('response')]); return Response.json({ success: init.body.get('response') === 'good' }); };
  try {
    assert.equal((await call('POST', '/api/account/register', { body: { ...NEW, turnstileToken: 'bad' } })).data.error.code, 'captcha_failed');
    assert.equal((await call('POST', '/api/account/register', { body: { ...NEW, turnstileToken: 'good' } })).status, 201);
  } finally { globalThis.fetch = realFetch; }
  assert.equal(seen[0][0], 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  // a site key without its secret is not advertised
  const half = setup({ TURNSTILE_SITE_KEY: 'site-key' });
  assert.equal((await half.call('GET', '/api/account/config')).data.turnstileSiteKey, '');
});

test('old hashes are upgraded to the configured iteration count at sign-in', async () => {
  const { call, env } = await registered();
  const hash = () => env.DB.raw.prepare('SELECT password_hash FROM users').get().password_hash;
  assert.equal(hashIterations(hash()), 1000);
  env.PBKDF2_ITERATIONS = '2000';
  assert.equal((await call('POST', '/api/account/login', { body: { loginId: NEW.loginId, password: NEW.password } })).status, 200);
  assert.equal(hashIterations(hash()), 2000);
});

test('persistent sessions slide forward and expire when idle', async () => {
  const { call, session } = await registered();
  const t0 = Date.now();
  await withNow(t0 + 20 * 60 * 1000, async () => {
    const r = await call('GET', '/api/account/session', { cookie: session });
    assert.ok(r.data.user);
    assert.match(r.cookie.header, /Max-Age=2592000/);
  });
  await withNow(t0 + 20 * 60 * 1000 + PERSISTENT_TTL + 1000, async () => {
    assert.equal((await call('GET', '/api/account/session', { cookie: session })).data.user, null);
  });
});

test('the daily cron purges expired sessions', async () => {
  const { env } = await registered();
  env.DB.raw.prepare('UPDATE sessions SET expires_at = 1').run();
  const waits = [];
  await worker.scheduled({}, env, { waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
});

test('non-API paths are static assets; unknown API paths are JSON errors', async () => {
  const { call, assets } = setup();
  const page = await worker.fetch(new Request(ORIGIN + '/index.html'), (setup()).env, {});
  assert.equal(await page.text(), 'asset');
  assert.equal((await call('GET', '/api/nope')).data.error.code, 'not_found');
  assert.equal((await call('DELETE', '/api/account/login')).status, 405);
  assert.equal((await call('GET', '/api/health')).data.status, 'ok');
  assert.deepEqual(assets, []);
});
