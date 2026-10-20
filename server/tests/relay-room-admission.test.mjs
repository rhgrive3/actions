// #1646: nothing that cannot be a real room join may reach ROOMS.idFromName,
// ROOMS.get or RoomDurableObject.fetch. Room codes are the 5 characters the
// client generates (src/net/session.js CODE_CHARS).
import assert from 'node:assert/strict';
import test from 'node:test';
import { relay, callWithPlatform, joinPath, request } from './relay-fixture.mjs';

function spyEnv() {
  const calls = { idFromName: [], get: 0, fetch: 0 };
  const env = { ROOMS: {
    idFromName(name) { calls.idFromName.push(name); return name; },
    get() { calls.get++; return { fetch: async () => { calls.fetch++; return new Response('routed'); } }; },
  } };
  return { env, calls };
}
const untouched = calls => assert.deepEqual(calls, { idFromName: [], get: 0, fetch: 0 }, 'no Durable Object binding call');

async function viaWorker(path, options) {
  const { env, calls } = spyEnv();
  const { result, pairs } = callWithPlatform(() => relay.fetch(request(path, options), env));
  return { response: await result, calls, pairs };
}

test('non-upgrade and wrongly-methoded requests never reach a Durable Object', async () => {
  for (const [path, options, status] of [
    [joinPath('BCEFG'), { upgrade: null }, 426],
    [joinPath('BCEFG'), { upgrade: 'h2c' }, 426],
    [joinPath('BCEFG'), { method: 'POST' }, 405],
    [joinPath('BCEFG'), { method: 'PUT' }, 405],
    [joinPath('BCEFG'), { method: 'DELETE' }, 405],
  ]) {
    const { response, calls } = await viaWorker(path, options);
    assert.equal(response.status, status, `${options.method || 'GET'} ${options.upgrade ?? 'no upgrade'}`);
    untouched(calls);
  }
});

test('malformed room paths are refused before any Durable Object is selected', async () => {
  for (const path of ['/room', '/room/', '/room//', '/room/BCEFG/extra', '/room/BCEFG/x/y']) {
    const { response, calls } = await viaWorker(path);
    assert.equal(response.status, 404, path);
    untouched(calls);
  }
  const slash = await viaWorker('/room/BCEFG/?' + joinPath('BCEFG').split('?')[1]);
  assert.equal(await slash.response.text(), 'routed', 'a trailing slash is still the same single segment');
  assert.deepEqual(slash.calls.idFromName, ['BCEFG']);
});

test('codes outside the generated alphabet/length get "Room not found" without a Durable Object', async () => {
  const invalid = ['TOOLONG', 'BCEF', 'B', 'ABCDE', 'BCEF0', 'bcefO', 'BCEF-', 'BC%20FG', 'B'.repeat(4096),
    'ＢＣＥＦＧ', 'ﬀBCE', 'BCEF\u0000', '%252e%252e', 'BCEFG%2F..', '__proto__', 'constructor'];
  for (const code of invalid) {
    const { response, calls, pairs } = await viaWorker('/room/' + code + '?v=2&compat=x');
    assert.equal(response.status, 101, `${code.slice(0, 12)}: answered locally`);
    untouched(calls);
    const server = pairs[0]?.[1];
    assert.equal(JSON.parse(server.sent[0]).t, 'err', 'the player sees the standard refusal');
    assert.equal(JSON.parse(server.sent[0]).e, 'Room not found');
    assert.equal(server.closed?.code, 1008);
  }
});

test('an encoded dot segment normalizes to the health route, not a room', async () => {
  const { response, calls } = await viaWorker('/room/%2e%2e');
  assert.equal(new URL('https://relay.test/room/%2e%2e').pathname, '/');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', service: 'inkwave-relay' });
  untouched(calls);
});

test('valid generated codes still reach their room, case-insensitively', async () => {
  for (const code of ['BCEFG', 'bcefg', 'Bcefg', '23456', 'XYZ89']) {
    const { response, calls } = await viaWorker(joinPath(code));
    assert.equal(await response.text(), 'routed');
    assert.deepEqual(calls.idFromName, [code.toUpperCase()]);
    assert.equal(calls.get, 1);
    assert.equal(calls.fetch, 1);
  }
});

test('every code the client can generate is accepted by the relay', async () => {
  const CODE_CHARS = 'BCEFGHJKLMNPQRTUVXYZ23456789'; // copied from src/net/session.js
  for (let i = 0; i < 400; i++) {
    const code = Array.from({ length: 5 }, () => CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]).join('');
    const { calls } = await viaWorker(joinPath(code));
    assert.deepEqual(calls.idFromName, [code], code);
  }
  for (const c of CODE_CHARS) {
    const { calls } = await viaWorker(joinPath(c.repeat(5)));
    assert.equal(calls.fetch, 1, c);
  }
});

test('OPTIONS preflight and the health route are unchanged and never allocate rooms', async () => {
  const preflight = await viaWorker('/room/BCEFG', { method: 'OPTIONS' });
  assert.equal(preflight.response.status, 200);
  untouched(preflight.calls);
  const health = await viaWorker('/health', { upgrade: null });
  assert.equal(health.response.status, 200);
  untouched(health.calls);
  const root = await viaWorker('/', { upgrade: null });
  assert.equal(root.response.status, 200);
  const other = await viaWorker('/anything', { upgrade: null });
  assert.equal(other.response.status, 404);
  untouched(other.calls);
});
