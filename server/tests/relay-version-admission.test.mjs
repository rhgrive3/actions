// #1654: clients of different game builds must not share a room. The relay checks
// the wire major and a gameplay-compatibility token at join, before accepting the
// player, and pins the room to its creator's token for the room's lifetime.
import assert from 'node:assert/strict';
import test from 'node:test';
import { relay, RoomDurableObject, callWithPlatform, connect, joinPath, request, COMPAT, WIRE } from './relay-fixture.mjs';

const OLD = 'iw-gameplay-20260101-r9';
const refusal = socket => socket.sent.map(x => JSON.parse(x)).find(x => x.t === 'err');

function spyEnv() {
  const calls = { idFromName: 0, get: 0, fetch: 0 };
  return { calls, env: { ROOMS: {
    idFromName(n) { calls.idFromName++; return n; },
    get() { calls.get++; return { fetch: async () => { calls.fetch++; return new Response('routed'); } }; },
  } } };
}
async function viaWorker(path) {
  const { env, calls } = spyEnv();
  const { result, pairs } = callWithPlatform(() => relay.fetch(request(path), env));
  return { response: await result, calls, server: pairs[0]?.[1] };
}

test('legacy and unknown clients are refused before any Durable Object, with a readable message', async () => {
  const legacy = [
    '/room/BCEFG?name=P&v=1',                                   // the pre-#1654 client: v=1, no compat
    '/room/BCEFG?name=P',                                       // no version at all
    `/room/BCEFG?name=P&v=3&compat=${COMPAT}`,                  // a newer wire major than this relay
    `/room/BCEFG?name=P&v=02&compat=${COMPAT}`,                 // not the canonical major
    `/room/BCEFG?name=P&v=${WIRE}`,                             // compat missing
    `/room/BCEFG?name=P&v=${WIRE}&compat=`,
    `/room/BCEFG?name=P&v=${WIRE}&compat=short`,                // < 8 characters
    `/room/BCEFG?name=P&v=${WIRE}&compat=${'a'.repeat(81)}`,    // > 80 characters
    `/room/BCEFG?name=P&v=${WIRE}&compat=bad%20token%21%21`,    // characters outside [A-Za-z0-9_-]
    `/room/BCEFG?name=P&v=${WIRE}&compat=<script>alert(1)</script>`,
  ];
  for (const path of legacy) {
    const { response, calls, server } = await viaWorker(path);
    assert.equal(response.status, 101, path);
    assert.deepEqual(calls, { idFromName: 0, get: 0, fetch: 0 }, `${path} must not allocate a room`);
    const err = refusal(server);
    assert.match(err.e, /update|reload/i, 'the player is told to reload, whichever build they run');
    assert.equal(server.closed?.code, 1008);
  }
});

test('current clients are routed to their room', async () => {
  for (const compat of [COMPAT, OLD, 'abcdefgh', 'A_b-C_d-1', 'x'.repeat(80)]) {
    const { response, calls } = await viaWorker(joinPath('BCEFG', { compat }));
    assert.equal(await response.text(), 'routed', compat);
    assert.deepEqual(calls, { idFromName: 1, get: 1, fetch: 1 });
  }
});

test('the room Durable Object enforces the same admission when reached directly', async () => {
  const room = new RoomDurableObject({}, {});
  for (const options of [{ v: null }, { v: '1' }, { compat: null }, { compat: 'short' }]) {
    const { response, socket, allocated } = await connect(room, 'BCEFG', { create: true, ...options });
    assert.equal(response.status, 101);
    assert.equal(allocated, 1, 'only the refusal socket exists');
    assert.match(refusal(socket).e, /update|reload/i);
    assert.equal(room.members.size, 0, 'a refused client never becomes a member or the pinned creator');
    assert.equal(room.compat, null);
  }
});

test('a room is pinned to its creator, and a different build is refused before joining', async () => {
  const room = new RoomDurableObject({}, {});
  const host = await connect(room, 'BCEFG', { create: true, name: 'H' });
  assert.equal(host.socket.control('welcome').compat, COMPAT);
  assert.equal(host.socket.control('welcome').proto, 2);
  const same = await connect(room, 'BCEFG', { name: 'S' });
  assert.ok(same.socket.control('welcome'), 'same build joins');
  assert.equal(same.socket.control('welcome').compat, COMPAT);
  const old = await connect(room, 'BCEFG', { name: 'O', compat: OLD });
  assert.equal(old.socket.control('welcome'), null, 'no welcome, no roster entry');
  assert.match(refusal(old.socket).e, /different game version.*reload/i);
  assert.equal(old.socket.closed?.code, 1008);
  assert.equal(room.members.size, 2);
  assert.deepEqual(host.socket.sent.filter(x => JSON.parse(x).t === 'join').map(x => JSON.parse(x).m.name), ['S'],
    'existing players are never told about the refused client');
});

test('creating over an occupied code still reports the code as taken', async () => {
  const room = new RoomDurableObject({}, {});
  await connect(room, 'BCEFG', { create: true });
  for (const compat of [COMPAT, OLD]) {
    const taken = await connect(room, 'BCEFG', { create: true, compat });
    assert.equal(refusal(taken.socket).e, 'Room code taken', 'the client retries with another code');
  }
  assert.equal(room.members.size, 1);
});

test('a missing room is reported as missing, whatever build asks', async () => {
  const room = new RoomDurableObject({}, {});
  const { socket } = await connect(room, 'BCEFG', { compat: OLD });
  assert.equal(refusal(socket).e, 'Room not found');
});

test('the pin survives host migration, and applies to the new host and later joiners alike', async () => {
  const room = new RoomDurableObject({}, {});
  const host = await connect(room, 'BCEFG', { create: true, name: 'H' });
  const guest = await connect(room, 'BCEFG', { name: 'G' });
  host.socket.emit('close');
  assert.equal(room.hostId, guest.socket.id);
  const old = await connect(room, 'BCEFG', { name: 'O', compat: OLD });
  assert.match(refusal(old.socket).e, /different game version/i, 'the departed creator does not unpin the room');
  const next = await connect(room, 'BCEFG', { name: 'N' });
  assert.ok(next.socket.control('welcome'));
  assert.equal(room.members.size, 2);
});

test('the same player may reconnect while the room is occupied', async () => {
  const room = new RoomDurableObject({}, {});
  await connect(room, 'BCEFG', { create: true, name: 'H' });
  const guest = await connect(room, 'BCEFG', { name: 'G' });
  guest.socket.emit('close');
  const again = await connect(room, 'BCEFG', { name: 'G' });
  assert.ok(again.socket.control('welcome'));
});

test('an emptied room forgets its pin, so the next creator may use any build', async () => {
  const room = new RoomDurableObject({}, {});
  const host = await connect(room, 'BCEFG', { create: true, name: 'H' });
  const guest = await connect(room, 'BCEFG', { name: 'G' });
  host.socket.emit('close');
  guest.socket.emit('close');
  assert.equal(room.members.size, 0);
  assert.equal(room.compat, null);
  const fresh = await connect(room, 'BCEFG', { create: true, name: 'F', compat: OLD });
  assert.equal(fresh.socket.control('welcome').compat, OLD);
  const mismatched = await connect(room, 'BCEFG', { name: 'M', compat: COMPAT });
  assert.match(refusal(mismatched.socket).e, /different game version/i);
});

test('every admitted member of a room shares one compatibility token', async () => {
  const room = new RoomDurableObject({}, {});
  await connect(room, 'BCEFG', { create: true, name: 'H' });
  const tokens = [COMPAT, OLD, COMPAT, 'iw-gameplay-other-1', COMPAT, COMPAT, OLD, COMPAT, COMPAT];
  for (const [i, compat] of tokens.entries()) await connect(room, 'BCEFG', { name: 'P' + i, compat });
  assert.equal(room.members.size, 7, 'the creator plus the six matching joiners; refused clients take no seat');
});
