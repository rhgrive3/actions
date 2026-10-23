import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { RoomDurableObject } from '../src/index.js';
import { createLocalRelay } from '../../scripts/lib/inkwave-local-relay-fixture.mjs';

const compat = 'iw-gameplay-20261023-start-admission-v1';
class Socket extends EventEmitter {
  constructor() { super(); this.sent = []; this.readyState = 1; this.bufferedAmount = 0; }
  accept() {}
  send(text) { if (this.throwSend) throw Error('refused'); this.sent.push(text); this.receive?.(text); }
  addEventListener(event, fn) { this.on(event, fn); }
  close(code = 1000, reason = 'bye') { if (this.closed) return; this.closed = { code, reason }; this.readyState = 3; this.emit('close'); }
  serializeAttachment(value) { this.attachment = structuredClone(value); }
  deserializeAttachment() { return structuredClone(this.attachment); }
  get welcome() { return this.sent.map(s => { try { return JSON.parse(s); } catch {} }).find(o => o?.t === 'welcome'); }
  get id() { return this.welcome.id; }
  get results() { return this.sent.map(s => { try { return JSON.parse(s); } catch {} }).filter(o => o?.t === 'start_result'); }
  get messages() { return this.sent.filter(s => s.startsWith('m|')); }
  message(data) { this.emit('message', { data }); }
}
const req = (create = false, token = compat) => ({ url: '/room/BCEFG?v=2&compat=' + token + (create ? '&create=1' : ''), method: 'GET', headers: { upgrade: 'websocket' } });
function world(count = 3, state = {}) {
  const room = new RoomDurableObject(state, {}); room.compat = compat;
  const sockets = Array.from({ length: count }, (_, i) => { const ws = new Socket(); room.handleSession(ws, 'P' + i); return ws; });
  return { room, sockets };
}
const start = (host, members, extra = {}) => ({ k: 'start', id: 'round', proto: 2, compat, host: host.id,
  roster: members.map((s, nid) => ({ nid, owner: s.id, bot: false })), ...extra });

test('START admission rejects stale membership, then atomically freezes the exact human roster', async () => {
  const { room, sockets: [h, g, late] } = world();
  h.message('b|' + JSON.stringify(start(h, [h, g])));
  assert.deepEqual(h.results.at(-1), { t: 'start_result', id: 'round', ok: false });
  assert.equal(room.locked, false); assert.equal(g.messages.length, 0); assert.equal(late.messages.length, 0);
  const cfg = start(h, [h, g, late]);
  h.message('b|' + JSON.stringify(cfg));
  assert.equal(h.results.at(-1).ok, true); assert.equal(room.locked, true);
  assert.equal(g.messages.at(-1), 'm|' + h.id + '|' + JSON.stringify(cfg));
  assert.equal(late.messages.at(-1), g.messages.at(-1));
  h.message('b|' + JSON.stringify(cfg));
  assert.equal(h.results.at(-1).ok, false); assert.equal(g.messages.length, 1);
  // The locked admission branch precedes handleSession, even if the new JOIN was already requested.
  const rooms = new Map([['BCEFG', room]]), join = createLocalRelay({ rooms }), newcomer = new Socket();
  assert.equal((await join(newcomer, req())).accepted, false);
  assert.equal(room.members.size, 3); assert.equal(newcomer.welcome, undefined);
});

test('START rejects forged host, duplicate humans/nids, bot ownership, bad epoch, and directed bypass', () => {
  for (const change of [
    c => c.host = 'spoof', c => c.proto = 1, c => c.compat = 'old-version',
    c => c.roster[1].owner = c.roster[0].owner, c => c.roster[1].nid = 0,
    c => c.roster[1].bot = true, c => c.roster.push({ nid: 7, owner: 'spoof', bot: true }),
  ]) {
    const { room, sockets: [h, g] } = world(2), cfg = start(h, [h, g]); change(cfg);
    h.message('b|' + JSON.stringify(cfg)); assert.equal(h.results.at(-1)?.ok, false);
    assert.equal(room.locked, false); assert.equal(g.messages.length, 0);
  }
  const { room, sockets: [h, g] } = world(2), cfg = start(h, [h, g]);
  g.message('b|' + JSON.stringify(cfg)); h.message('s|' + g.id + '|' + JSON.stringify(cfg));
  assert.equal(h.results.length, 0); assert.equal(g.messages.length, 0); assert.equal(room.locked, false);
  cfg.roster.push({ nid: 2, owner: h.id, bot: true });
  h.message('b|' + JSON.stringify(cfg)); assert.equal(h.results.at(-1).ok, true);
});

test('failed host result send cannot launch peers; host handoff rejects the departed socket', () => {
  const { room, sockets: [h, g] } = world(2), cfg = start(h, [h, g]);
  h.throwSend = true; h.message('b|' + JSON.stringify(cfg));
  assert.equal(g.messages.length, 0); assert.equal(room.locked, false);
  h.throwSend = false; h.close(); assert.equal(room.hostId, g.id);
  h.message('b|' + JSON.stringify(cfg)); assert.equal(g.messages.length, 0);
  g.message('b|' + JSON.stringify(start(g, [g], { id: 'next' })));
  assert.equal(g.results.at(-1).ok, true); assert.equal(room.locked, true);
});

test('hibernated heartbeats spend frame quota, while normal two-second heartbeat remains valid', async () => {
  let clock = 1000; const before = Date.now; Date.now = () => clock;
  const state = { sockets: [], setWebSocketAutoResponse(pair) { this.auto = pair; }, acceptWebSocket(ws) { this.sockets.push(ws); }, getWebSockets() { return this.sockets.filter(w => !w.closed); } };
  try {
    const room = new RoomDurableObject(state, {}), h = new Socket(); room.handleSession(h, 'H', true);
    assert.equal(state.auto, undefined);
    for (let i = 0; i < 100; i++) { await room.webSocketMessage(h, 'ping'); clock += 2000; }
    assert.equal(h.closed, undefined); assert.equal(h.sent.filter(s => s === 'pong').length, 100);
    const resumed = new RoomDurableObject(state, {});
    for (let i = 0; i < 161; i++) await resumed.webSocketMessage(h, 'ping');
    assert.equal(h.closed.code, 1008); assert.equal(resumed.members.size, 0);
  } finally { Date.now = before; }
});

test('JOIN churn cannot spend the host quota; eight players and one immediate reconnect each fit the burst', async () => {
  const before = Date.now; let clock = 1000; Date.now = () => clock;
  try {
    const rooms = new Map(), connect = createLocalRelay({ rooms }), h = new Socket(); await connect(h, req(true));
    const room = rooms.get('BCEFG');
    h.receive = text => { if (text.startsWith('{')) { const o = JSON.parse(text); if (o.t === 'join' || o.t === 'leave') h.emit('message', 'b|{"k":"lobby"}'); } };
    let accepted = 0;
    for (let i = 0; i < 1000; i++) { const ws = new Socket(); const result = await connect(ws, req()); if (result.accepted) { accepted++; ws.close(); } else assert.equal(result.status, 429); }
    assert.equal(accepted, 15); assert.equal(room.members.size, 1); assert.equal(h.closed, undefined);
    assert.equal(room.members.get(h.id).framesLeft, 130);
    clock += 250; const retry = new Socket(); assert.equal((await connect(retry, req())).accepted, true); retry.close(); h.close();
    clock += 10000;
    const peers = [];
    for (let i = 0; i < 8; i++) { const ws = new Socket(); peers.push(ws); assert.equal((await connect(ws, req(i === 0))).accepted, true); }
    for (let i = 1; i < 8; i++) { peers[i].close(); const replacement = new Socket(); assert.equal((await connect(replacement, req())).accepted, true); peers[i] = replacement; }
    assert.equal(room.members.size, 8); for (const ws of peers) ws.close();
  } finally { Date.now = before; }
});

test('room JOIN budget survives eviction and refills before allocating another WebSocket pair', async () => {
  const before = Date.now; let clock = 1000; Date.now = () => clock;
  const state = { sockets: [], acceptWebSocket(ws) { this.sockets.push(ws); }, getWebSockets() { return this.sockets.filter(w => !w.closed); } };
  try {
    const room = new RoomDurableObject(state, {}); room.compat = compat;
    const h = new Socket(); room.handleSession(h, 'Host', true);
    for (let i = 0; i < 15; i++) { const g = new Socket(); room.handleSession(g, 'Guest', true); room._cleanupMember(g.id, g); g.close(); }
    const restored = new RoomDurableObject(state, {}); assert.equal(restored.joinsLeft, 0);
    assert.equal((await restored.fetch({ ...req(), url: 'https://relay.test' + req().url, headers: new Headers({ Upgrade: 'websocket' }) })).status, 429);
    clock += 250; assert.equal(restored._admitJoin(), true); assert.equal(restored.joinsLeft, 0);
    assert.equal(restored.hostId, h.id);
  } finally { Date.now = before; }
});

test('occupied CREATE collisions remain retryable across COMPAT; JOIN still rejects mismatched versions', async () => {
  const rooms = new Map(), connect = createLocalRelay({ rooms }), h = new Socket(); await connect(h, req(true));
  for (const token of [compat, 'another-valid-compat']) {
    const collision = new Socket(), result = await connect(collision, req(true, token));
    assert.equal(result.accepted, false); assert.match(JSON.parse(collision.sent[0]).e, /Room code taken/);
    assert.equal(rooms.get('BCEFG').hostId, h.id); assert.equal(rooms.get('BCEFG').members.size, 1);
  }
  assert.equal((await connect(new Socket(), req(false, 'another-valid-compat'))).status, 409); h.close();
});

test('directed hit failure closes the undeliverable owner before authenticated NACK; success never NACKs', () => {
  for (const failure of ['none', 'boundary', 'backlog', 'throw']) {
    const { room, sockets: [h, shooter, target] } = world();
    target.bufferedAmount = failure === 'backlog' ? 524289 : failure === 'boundary' ? 524288 : 0;
    target.throwSend = failure === 'throw';
    const baseline = shooter.sent.length;
    shooter.message('s|' + target.id + '|' + JSON.stringify({ k: 'hit', seq: 7, v: 2, a: 1, d: 40 }));
    if (failure === 'none' || failure === 'boundary') {
      assert.equal(target.messages.length, 1); assert.equal(shooter.messages.length, 0); assert.equal(room.members.size, 3);
    } else {
      assert.equal(target.messages.length, 0); assert.equal(room.members.size, 2); assert.equal(target.closed.code, 1013);
      const receipt = shooter.sent.slice(baseline);
      assert.equal(JSON.parse(receipt[0]).t, 'leave');
      assert.equal(receipt[1], 'm|__relay__|' + JSON.stringify({ k: 'hit_nack', seq: 7, to: target.id }));
    }
  }
});

test('binary limits run before decode, use view byteLength, and keep unauthenticated sockets inert', () => {
  const decode = TextDecoder.prototype.decode; let calls = 0;
  TextDecoder.prototype.decode = function(...args) { calls++; return decode.apply(this, args); };
  try {
    for (const size of [65537, 1024 * 1024, 4 * 1024 * 1024]) for (const view of [false, true]) {
      const { room, sockets: [h, g] } = world(2), raw = new Uint8Array(size + 12);
      const bytes = view ? new DataView(raw.buffer, 6, size) : new ArrayBuffer(size);
      const before = calls; g.message(bytes);
      assert.equal(calls, before); assert.equal(g.closed.code, 1009); assert.equal(room.members.size, 1); assert.equal(h.messages.length, 0);
    }
    const { room, sockets: [h] } = world(1), bytes = new Uint8Array(100000);
    bytes.set(new TextEncoder().encode('ping'), 10);
    h.message(new DataView(bytes.buffer, 10, 4)); assert.equal(h.sent.at(-1), 'pong');
    const before = calls; room._handleMessage(h.id, new Socket(), bytes);
    assert.equal(calls, before); assert.equal(h.closed, undefined);
    h.message(new Uint8Array(65536)); assert.equal(h.closed, undefined);
  } finally { TextDecoder.prototype.decode = decode; }
});

test('member identity collision retries are bounded and never replace host authorization', () => {
  const original = crypto.randomUUID; let value = 'same'; let count = 0;
  crypto.randomUUID = () => { count++; return value; };
  try {
    const { room, sockets: [h] } = world(1), old = room.members.get(h.id), collision = new Socket();
    room.handleSession(collision, 'Collision'); assert.equal(count, 9);
    assert.equal(collision.closed.code, 1013); assert.equal(collision.welcome, undefined);
    assert.equal(room.members.get(h.id), old); assert.equal(room.hostId, h.id); assert.equal(h.sent.length, 1);
    h.message('{"t":"lock","v":true}'); assert.equal(room.locked, true);
    collision.message('{"t":"lock","v":false}'); assert.equal(room.locked, true);
    let tries = 0; crypto.randomUUID = () => ++tries === 1 ? value : 'unique';
    const g = new Socket(); room.handleSession(g, 'Guest'); assert.equal(tries, 2); assert.notEqual(g.id, h.id);
    assert.equal(new Set(g.welcome.members.map(m => m.id)).size, 2);
    crypto.randomUUID = () => { throw Error('random source unavailable'); };
    const broken = new Socket(); room.handleSession(broken, 'Broken'); assert.equal(broken.welcome, undefined); assert.equal(room.members.size, 2);
    const copy = new Socket(); copy.attachment = structuredClone(h.attachment);
    const restored = new RoomDurableObject({ getWebSockets: () => [h, copy, g] }, {});
    assert.equal(restored.members.get(h.id).ws, h); assert.equal(copy.closed.code, 1008); assert.equal(restored.members.size, 2);
  } finally { crypto.randomUUID = original; }
});

test('emote semantic quota survives hibernation, rejects unsupported names, and leaves combat unaffected', () => {
  const original = Date.now; let at = 1000; Date.now = () => at;
  try {
    const { room, sockets: [h, g, peer] } = world(), emit = name => g.message('b|' + JSON.stringify({ k: 'emote', n: name }));
    emit('unknown'); emit({}); emit('wave'); for (let i = 0; i < 79; i++) emit(i % 2 ? 'flex' : 'dance');
    assert.equal(h.messages.length, 1); assert.equal(peer.messages.length, 1); assert.equal(g.closed, undefined);
    const restored = new RoomDurableObject({ getWebSockets: () => [h, g, peer] }, {});
    at += 1299; restored._handleMessage(g.id, g, 'b|{"k":"emote","n":"booyah"}'); assert.equal(h.messages.length, 1);
    at++; restored._handleMessage(g.id, g, 'b|{"k":"emote","n":"booyah"}'); assert.equal(h.messages.length, 2);
    restored._handleMessage(g.id, g, 'b|{"k":"t","ts":1}'); assert.equal(h.messages.length, 3);
    h.message('{"t":"lock","v":true}');
    // Old instance is not used after eviction; apply lock to restored instance too.
    restored._handleMessage(h.id, h, '{"t":"lock","v":true}'); at += 2000;
    restored._handleMessage(g.id, g, 'b|{"k":"emote","n":"wave"}'); assert.equal(h.messages.length, 3);
  } finally { Date.now = original; }
});

test('unchanged attachments are skipped while host admission budget and failed writes stay persistent', () => {
  const { room, sockets: [h] } = world(1); let hostWrites = 0;
  const originalHost = h.serializeAttachment.bind(h); h.serializeAttachment = value => { hostWrites++; originalHost(value); };
  const peers = [];
  for (let i = 0; i < 7; i++) {
    const g = new Socket(); g.writes = 0; const original = g.serializeAttachment.bind(g);
    g.serializeAttachment = value => { g.writes++; original(value); }; room.handleSession(g, 'Guest'); peers.push(g);
  }
  assert.equal(hostWrites, 7, 'JOIN security budget changes only the authoritative host attachment');
  assert(peers.every(g => g.writes === 1));
  const before = hostWrites; for (const g of peers.slice(1)) g.close();
  assert.equal(hostWrites, before); assert.equal(peers[0].writes, 1);
  room._syncAttachments(); assert.equal(hostWrites, before);
  let failed = true, attempts = 0; const g = peers[0], write = g.serializeAttachment.bind(g);
  g.serializeAttachment = value => { attempts++; if (failed) throw Error('persist failed'); write(value); };
  const m = room.members.get(g.id); m.bytesLeft--;
  room._syncAttachments(); failed = false; room._syncAttachments(); assert.equal(attempts, 2);
  room._syncAttachments(); assert.equal(attempts, 2);
  h.close(); assert.equal(room.hostId, g.id); assert.equal(g.attachment.isHost, true);
  assert.equal(g.attachment.joinsLeft, room.joinsLeft);
  const restored = new RoomDurableObject({ getWebSockets: () => [g] }, {});
  assert.equal(restored.hostId, g.id); assert.equal(restored.joinsLeft, room.joinsLeft);
  assert.equal(restored.members.get(g.id).bytesLeft, m.bytesLeft);
});

test('failed WELCOME or JOIN cannot commit a ghost and earlier JOIN recipients receive compensation', () => {
  for (const failed of ['welcome', 'host', 'peer']) {
    const { room, sockets: [h, g] } = world(2), newcomer = new Socket(), recipient = failed === 'host' ? h : g;
    if (failed === 'welcome') newcomer.throwSend = true;
    else {
      const send = recipient.send.bind(recipient); let once = true;
      recipient.send = text => { if (once && text.includes('"t":"join"')) { once = false; throw Error('one JOIN failed'); } send(text); };
    }
    const oldHostId = h.id;
    assert.equal(room.handleSession(newcomer, 'New'), false); assert.equal(newcomer.closed.code, 1013);
    assert.equal([...room.members.values()].some(m => m.ws === newcomer), false);
    if (failed === 'peer') {
      const id = newcomer.welcome.id;
      const controls = h.sent.map(text => { try { return JSON.parse(text); } catch {} }).filter(o => o?.m?.id === id || o?.id === id);
      assert.deepEqual(controls.map(o => o.t), ['join', 'leave']); assert.equal(room.hostId, oldHostId);
    }
    const resumed = new RoomDurableObject({ getWebSockets: () => [h, g, newcomer].filter(w => !w.closed) }, {});
    assert.equal([...resumed.members.values()].some(m => m.ws === newcomer), false);
    assert.equal(resumed.members.size, room.members.size);
  }
});
