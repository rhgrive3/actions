import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createD1 } from './d1-fake.mjs';
import worker from '../worker/index.js';

const ORIGIN = 'https://zevant.example';
const DAY = 24 * 60 * 60 * 1000;
const START = 1_800_000_000_000;
const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url));

function setup(t) {
  const DB = createD1(MIGRATIONS);
  t.after(() => DB.raw.close());
  let now = START;
  t.mock.method(Date, 'now', () => now);
  const env = { DB, PBKDF2_ITERATIONS: '1000' };
  return {
    DB,
    setNow(value) { now = value; },
    async register(loginId, ip = '203.0.113.8') {
      const response = await worker.fetch(new Request(ORIGIN + '/api/account/register', {
        method: 'POST',
        headers: { Origin: ORIGIN, 'X-Zevant-Request': '1', 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
        body: JSON.stringify({ loginId, displayName: 'Quota player', password: 'wave-password-42!' }),
      }), env);
      return { status: response.status, body: await response.json(), headers: response.headers };
    },
  };
}

test('five simultaneous registrations per IP are admitted atomically', async t => {
  const ctx = setup(t);
  const result = await Promise.all(Array.from({ length: 12 }, (_, i) => ctx.register('parallel_' + i)));
  assert.equal(result.filter(r => r.status === 201).length, 5);
  assert.equal(result.filter(r => r.status === 429).length, 7);
  assert.equal(ctx.DB.raw.prepare('SELECT COUNT(*) AS n FROM users').get().n, 5);
  assert.equal(ctx.DB.raw.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 5);
  assert.equal(ctx.DB.raw.prepare('SELECT failures FROM auth_throttle').get().failures, 5);
});

test('a full daily quota remains blocked after the old six-hour lock expires', async t => {
  const ctx = setup(t);
  for (let i = 0; i < 5; i++) assert.equal((await ctx.register('daily_' + i)).status, 201);
  ctx.setNow(START + 6 * 60 * 60 * 1000 + 1);
  const denied = await ctx.register('daily_sixth');
  assert.equal(denied.status, 429);
  assert.equal(denied.body.error.code, 'rate_limited');
  assert.equal(Number(denied.headers.get('Retry-After')), 18 * 60 * 60);
  assert.equal(ctx.DB.raw.prepare('SELECT COUNT(*) AS n FROM users').get().n, 5);
});

test('quota resets at its fixed-day boundary and denial does not slide it', async t => {
  const ctx = setup(t);
  for (let i = 0; i < 4; i++) assert.equal((await ctx.register('boundary_' + i)).status, 201);
  ctx.setNow(START + 23 * 60 * 60 * 1000);
  assert.equal((await ctx.register('boundary_fifth')).status, 201);
  ctx.setNow(START + DAY - 1);
  const denied = await ctx.register('boundary_denied');
  assert.equal(denied.status, 429);
  assert.equal(Number(denied.headers.get('Retry-After')), 1);
  ctx.setNow(START + DAY);
  assert.equal((await ctx.register('boundary_next')).status, 201);
  const quota = ctx.DB.raw.prepare('SELECT failures, window_start, locked_until FROM auth_throttle').get();
  assert.equal(quota.failures, 1);
  assert.equal(quota.window_start, START + DAY);
  assert.equal(quota.locked_until, 0);
});

test('legacy expired six-hour locks still enforce their remaining daily quota', async t => {
  const ctx = setup(t);
  for (let i = 0; i < 5; i++) assert.equal((await ctx.register('legacy_' + i)).status, 201);
  ctx.DB.raw.prepare('UPDATE auth_throttle SET locked_until = ?').run(START + 6 * 60 * 60 * 1000);
  ctx.setNow(START + 7 * 60 * 60 * 1000);
  const denied = await ctx.register('legacy_sixth');
  assert.equal(denied.status, 429);
  assert.equal(Number(denied.headers.get('Retry-After')), 17 * 60 * 60);
  assert.equal(ctx.DB.raw.prepare('SELECT COUNT(*) AS n FROM users').get().n, 5);
});

test('a simultaneous duplicate login does not spend successful-registration quota', async t => {
  const ctx = setup(t);
  const duplicate = await Promise.all(Array.from({ length: 8 }, () => ctx.register('same_login')));
  assert.equal(duplicate.filter(r => r.status === 201).length, 1);
  assert.equal(duplicate.filter(r => r.body.error?.code === 'login_id_taken').length, 7);
  for (let i = 0; i < 4; i++) assert.equal((await ctx.register('unique_' + i)).status, 201);
  assert.equal((await ctx.register('unique_sixth')).status, 429);
  assert.equal(ctx.DB.raw.prepare('SELECT failures FROM auth_throttle').get().failures, 5);
});

test('invalid registration and another IP do not consume this IP quota', async t => {
  const ctx = setup(t);
  assert.equal((await ctx.register('x')).status, 400);
  assert.equal(ctx.DB.raw.prepare('SELECT COUNT(*) AS n FROM auth_throttle').get().n, 0);
  for (let i = 0; i < 5; i++) assert.equal((await ctx.register('own_' + i)).status, 201);
  assert.equal((await ctx.register('other_ip', '198.51.100.7')).status, 201);
  assert.equal((await ctx.register('own_denied')).status, 429);
});

test('a failed quota write rolls back the newly registered user', async t => {
  const ctx = setup(t);
  ctx.DB.raw.exec("CREATE TRIGGER fail_quota BEFORE INSERT ON auth_throttle BEGIN SELECT RAISE(ABORT, 'test quota failure'); END");
  t.mock.method(console, 'error', () => {});
  const result = await ctx.register('rollback_user');
  assert.equal(result.status, 500);
  assert.equal(ctx.DB.raw.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
  assert.equal(ctx.DB.raw.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
  assert.equal(ctx.DB.raw.prepare('SELECT COUNT(*) AS n FROM auth_throttle').get().n, 0);
});
