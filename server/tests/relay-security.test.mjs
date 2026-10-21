import assert from 'node:assert/strict';
import test from 'node:test';
import relay, { RoomDurableObject } from '../src/index.js';

class Socket {
  constructor() { this.sent = []; this.events = new Map(); this.closed = null; this.bufferedAmount = 0; }
  send(v) { this.sent.push(v); }
  addEventListener(k, f) { this.events.set(k, f); }
  emit(k, data) { this.events.get(k)?.({ data }); }
  close(code, reason) { this.closed = { code, reason }; this.emit('close'); }
  get id() { return JSON.parse(this.sent.find(x => x.startsWith('{"t":"welcome"'))).id; }
}
function roomWith(...names) {
  const room = new RoomDurableObject({}, {});
  const sockets = names.map(name => {
    const ws = new Socket();
    room.handleSession(ws, name);
    return ws;
  });
  return { room, sockets };
}
const compatible = 'iw-gameplay-20261020-r3';
const req = (path, method = 'GET', upgrade = 'websocket') => ({
  url: 'https://relay.test' + path, method,
  headers: new Headers(upgrade ? { Upgrade: upgrade } : {}),
});

test('pre-upgrade admission refuses invalid paths and methods without allocating any room object', async () => {
  let called = 0;
  const env = { ROOMS: {
    idFromName(code) { called++; assert.equal(code, 'BCEFG'); return code; },
    get(id) { called++; return { fetch: async () => { called++; return new Response('ok'); } }; },
  } };
  for (const path of ['/room/TOOLONG?v=2&compat=' + compatible,
    '/room/ABCDE?v=2&compat=' + compatible,
    '/room/BCEFG/extra?v=2&compat=' + compatible,
    '/room/%252e%252e?v=2&compat=' + compatible]) {
    assert.equal((await relay.fetch(req(path), env)).status, 400);
  }
  assert.equal((await relay.fetch(req('/room/BCEFG?v=2&compat=' + compatible, 'POST'), env)).status, 405);
  assert.equal((await relay.fetch(req('/room/BCEFG?v=2&compat=' + compatible, 'GET', null), env)).status, 426);
  assert.equal((await relay.fetch(req('/room/BCEFG?v=1&compat=' + compatible), env)).status, 426);
  assert.equal((await relay.fetch(req('/room/BCEFG?v=2&compat=bad'), env)).status, 426);
  assert.equal(called, 0, 'invalid requests must never touch ROOMS');
  // WHATWG URL parsing normalizes this encoded dot segment to the health root.
  const normalized = req('/room/%2e%2e?v=2&compat=' + compatible);
  assert.equal(new URL(normalized.url).pathname, '/');
  const health = await relay.fetch(normalized, env);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {status:'ok',service:'inkwave-relay'});
  assert.equal(called, 0, 'normalized health requests never allocate a room');
  assert.equal((await relay.fetch(req('/room/BCEFG?v=2&compat=' + compatible), env)).status, 200);
  assert.equal(called, 3);
});

test('only the current host can lock or unlock, including host handoff and stale sockets', () => {
  const { room, sockets: [host, guest, next] } = roomWith('H', 'G', 'N');
  guest.emit('message', '{"t":"lock","v":true}');
  assert.equal(room.locked, false);
  host.emit('message', '{"t":"lock","v":"true"}');
  assert.equal(room.locked, false, 'boolean required');
  host.emit('message', '{"t":"lock","v":true}');
  assert.equal(room.locked, true);
  guest.emit('message', '{"t":"lock","v":false}');
  assert.equal(room.locked, true);
  host.close(1000, 'bye');
  assert.equal(room.hostId, guest.id);
  host.emit('message', '{"t":"lock","v":false}');
  assert.equal(room.locked, true);
  guest.emit('message', '{"t":"lock","v":false}');
  assert.equal(room.locked, false);
  next.emit('message', '{"t":"lock","v":true}');
  assert.equal(room.locked, false);
  guest.close(1000, 'bye');
  next.close(1000, 'bye');
  assert.equal(room.hostId, null);
  assert.equal(room.compat, null);
});

test('broadcast and directed packets require bounded, recognized JSON envelopes', () => {
  const { room, sockets: [h, g, v] } = roomWith('H', 'G', 'V');
  const baseline = h.sent.length;
  g.emit('message', 'b|not-json');
  g.emit('message', 'b|{"x":1}');
  g.emit('message', 's|' + v.id + '|{"k":null}');
  g.emit('message', 'b|[]');
  assert.equal(h.sent.length, baseline);
  g.emit('message', 'b|{"k":"state","a":[1,2]}');
  assert.ok(h.sent.includes('m|' + g.id + '|{"k":"state","a":[1,2]}'));
  const huge = 'b|' + JSON.stringify({ k: 'state', data: 'a'.repeat(70 * 1024) });
  const previous = h.sent.length;
  g.emit('message', huge);
  assert.equal(g.closed?.code, 1009);
  assert.deepEqual(h.sent.slice(previous).map(x=>JSON.parse(x)), [{t:'leave',id:g.id,host:h.id}], 'only one membership cleanup control is sent; the oversized data is never relayed');
  assert.equal(h.sent.filter(x=>x.startsWith('m|')).length, 1, 'only the prior valid state envelope was relayed');
  assert.ok(!room.members.has(g.id));
});

test('sender quotas stop bursts, while routine 20 Hz updates still fan out', () => {
  const { sockets: [h, g, v] } = roomWith('H', 'G', 'V');
  for (let i = 0; i < 20; i++) g.emit('message', 'b|' + JSON.stringify({ k: 's', t: i }));
  assert.equal(g.closed, null);
  assert.equal(h.sent.filter(x => x.startsWith('m|')).length, 20);
  assert.equal(v.sent.filter(x => x.startsWith('m|')).length, 20);
  for (let i = 0; i < 170 && !g.closed; i++) g.emit('message', 'b|{"k":"s"}');
  assert.equal(g.closed?.code, 1008);
  assert.equal(h.closed, null);
});

test('backpressured recipients are not fed an unbounded queue', () => {
  const { sockets: [h, g] } = roomWith('H', 'G');
  const n = h.sent.length;
  h.bufferedAmount = 1024 * 1024;
  g.emit('message', 'b|{"k":"s"}');
  assert.equal(h.sent.length, n);
  assert.equal(h.closed?.code, 1013);
});

test('incompatible peers rejected before WebSocketPair allocation', async () => {
  const room = new RoomDurableObject({}, {});
  const host = new Socket();
  room.compat = compatible;
  room.handleSession(host, 'H');
  const saved=globalThis.WebSocketPair;let allocations=0;
  globalThis.WebSocketPair=class{constructor(){allocations++;throw new Error('Rejected peers must not allocate sockets');}};
  try {
    const response = await room.fetch(req('/room/BCEFG?v=2&compat=iw-gameplay-OLDER0001'));
    assert.equal(response.status, 409);
    assert.equal(room.members.size, 1);
    assert.equal(room.compat, compatible);
    const old = await room.fetch(req('/room/BCEFG?v=1&compat=' + compatible));
    assert.equal(old.status, 426);
    assert.equal(allocations, 0);
  } finally {if(saved===undefined)delete globalThis.WebSocketPair;else globalThis.WebSocketPair=saved;}
});
