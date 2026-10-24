import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { fixture as sessionFixture, flush } from './net-fixture.mjs';
import { validMeUpdate, validLobbySnapshot, validNetworkAppearance } from '../session-admission.mjs';
import { validStartRoster } from '../../network-replication/queue-recovery.mjs';
import { RoomDurableObject } from '../../../server/src/index.js';

let clock = 1000;
const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true,
  vmPerformance: { now: () => clock }, extraExports: "export {Transport,COMPAT} from './inkwave-public/src/net/transport.js'; export {NetSession} from './inkwave-public/src/net/session.js'; export {resolveStyle} from './inkwave-public/src/game/character-style.js'; export {outboundQueueStatus,discardSoloTick} from './patches/network-replication/outbound-prefix.mjs';" });

function guest(sendTo) {
  const nm = new f.NetMatch({ myId: 'guest', hostId: 'host', isHost: false, tr: { sendTo } }, { id: 'round' });
  nm.match = { boss: { log: { sent: 0, sentDmg: 0 } } };
  const actor = { nid: 1, remote: false, owner: 'guest', alive: true, netLife: 2 };
  return { nm, actor, log: nm.match.boss.log };
}

test('refused Boss packets recover in exact sequence order and accepted packets are never retried', () => {
  clock = 1000; const accepted = [], attempts = []; let open = false;
  const { nm, actor, log } = guest((host, data) => { attempts.push(data); if (!open) return false; accepted.push([host, data]); return true; });
  assert.equal(nm.sendBossHit(actor, 12.5, false, 'shooter'), false);
  assert.equal(nm.sendBossHit(actor, 20, true, 'shooter'), false);
  assert.equal(attempts.length, 1, 'per-hit callers cannot accelerate retry attempts');
  assert.equal(log.sent, 0); assert.equal(log.sendRefused, 1); assert.equal(nm.bossHitPending.length, 2);
  open = true; clock += 51; nm._flushBossHits();
  assert.deepEqual(accepted.map(([host, m]) => [host, m.q, m.m, m.l, m.d]), [
    ['host', 1, 'round', 2, 12.5], ['host', 2, 'round', 2, 20],
  ]);
  assert.equal(accepted[0][1], attempts[0], 'retry preserves the original authenticated claim ID');
  assert.equal(log.sent, 2); assert.equal(log.sentDmg, 32.5); assert.equal(nm.bossHitPending.length, 0);
  clock += 100; nm._flushBossHits(); assert.equal(accepted.length, 2);
});

test('Boss pending ledger is bounded and retires on life, host, transport, owner, death, or match changes', () => {
  for (const change of [
    x => x.actor.netLife++, x => x.nm.s.hostId = 'next', x => x.nm.s.tr = { sendTo() { throw Error('must not send'); } },
    x => x.actor.owner = 'other', x => x.actor.alive = false, x => x.nm.cfg.id = 'next-round',
  ]) {
    clock = 1000; let attempts = 0; const x = guest(() => { attempts++; return false; });
    x.nm.sendBossHit(x.actor, 10, false, 'shooter'); change(x); clock += 51; x.nm._flushBossHits();
    assert.equal(attempts, 1); assert.equal(x.nm.bossHitPending.length, 0); assert.equal(x.log.sent, 0); assert.equal(x.log.sendDropped, 1);
  }
  clock = 1000; let attempts = 0; const x = guest(() => { attempts++; throw Error('send refused'); });
  for (let i = 0; i < 1000; i++) x.nm.sendBossHit(x.actor, 10, false, 'shooter');
  assert.equal(x.nm.bossHitPending.length, 64); assert.equal(attempts, 1); assert.equal(x.log.sendDropped, 936);
  clock += 751; for (let i = 0; i < 16; i++) x.nm._flushBossHits();
  assert.equal(x.nm.bossHitPending.length, 0); assert.equal(attempts, 1); assert.equal(x.log.sendDropped, 1000);
});

test('Boss local refusal retry limits are independent of 30/60/120Hz rendering', () => {
  for (const hz of [30, 60, 120]) {
    clock = 1000; let attempts = 0; const { nm, actor, log } = guest(() => { attempts++; return false; });
    nm.sendBossHit(actor, 10, false, 'shooter');
    for (let i = 1; i <= hz; i++) { clock = 1000 + i * 1000 / hz; nm._flushBossHits(); }
    assert.equal(attempts, 8); assert.equal(log.sent, 0); assert.equal(nm.bossHitPending.length, 0);
  }
});

test('suspended actor and Boss FIFOs retain the newest forty accepted timestamps without splice', () => {
  const { nm } = guest(() => true), actor = f.make();
  Object.assign(actor, { nid: 1, owner: 'host', netLife: 0 }); nm.byNid.set(1, actor); nm._setupActor(actor);
  nm.s._members = new Map([['host', 'Host'], ['guest', 'Guest']]); f.G.netm = nm; f.G.match = nm.match;
  const boss = { sim: false, net: { buf: [] }, constructor: { unpack(_row, t) { return { t }; } } }; nm.match.boss = boss;
  const noSplice = () => { throw Error('discard array allocation'); };
  actor.net.buf.splice = noSplice; boss.net.buf.splice = noSplice;
  for (let i = 0; i < 200; i++) {
    const ts = i / 20, row = [1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 1, 100, 100, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
    const packet = { k: 't', ts, u: i * 3, a: [row], l: { 1: 0 }, B: [ts, 0, 0, 0, 0, 0, 0, 100, 1, 8, -1, 0, 0, 0, 0, -1, [], 100] };
    nm.onMessage('host', packet); nm.onMessage('host', packet);
    if (i > 0) nm.onMessage('host', { ...packet, ts: ts - .05 });
    assert.equal(actor.net.buf.length, Math.min(40, i + 1)); assert.equal(boss.net.buf.length, Math.min(40, i + 1));
  }
  const expected = Array.from({ length: 40 }, (_, i) => (160 + i) / 20);
  assert.deepEqual(Array.from(actor.net.buf, s => s.t), expected); assert.deepEqual(Array.from(boss.net.buf, s => s.t), expected);
});

test('Boss interpolation caches immutable next rows and clears them when interpolation has no successor', () => {
  const { nm } = guest(() => true), vector = () => new f.THREE.Vector3();
  const snap = (t, crabs) => ({ t, x: 0, y: 0, z: 0, vx: 0, vz: 0, yaw: 0, bt: t, hp: 100, crabs });
  const first = snap(0, [[1, 0, 0, 0, 0, 10]]), second = snap(.05, [[1, 10, 20, 30, 0, 8]]);
  const n = { buf: [first, second], err: vector(), errV: vector() };
  let clears = 0, sets = 0;
  n.crabLookup = new class extends Map { clear() { clears++; super.clear(); } set(k, v) { sets++; return super.set(k, v); } }();
  nm.match.boss = { sim: false, net: n }; nm.peers.set('host', { tr: .025 });
  nm._sampleBoss(1 / 120); const row = n.cur.crabs[0];
  for (let i = 0; i < 20; i++) { nm._sampleBoss(1 / 120); assert.equal(n.cur.crabs[0], row, 'terminal composition already reuses interpolation rows'); }
  assert.deepEqual(Array.from(n.cur.crabs[0]), [1, 5, 10, 15, 0, 8]);
  assert.equal(clears, 1); assert.equal(sets, 1);
  nm.peers.get('host').tr = .06; nm._sampleBoss(1 / 120);
  assert.equal(clears, 2); assert.equal(n.crabLookup.size, 0);
  n.buf.push(snap(.1, [[2, 20, 0, 0, 0, 5]])); nm._sampleBoss(1 / 120);
  assert.equal(clears, 3); assert.equal(n.crabLookup.has(1), false); assert.equal(n.crabLookup.has(2), true);
});

test('confirmed solo host discards combat backlog before actor/codec packing and resumes cleanly with a peer', () => {
  const s = new f.NetSession(); Object.assign(s, { myId: 'host', hostId: 'host', state: 'match' }); s._members.set('host', 'Host');
  const n = new f.NetMatch(s, { id: 'solo', map: 'reef' }), a = f.make(); Object.assign(a, { nid: 1, owner: 'host', netLife: 0 });
  const match = { actors: [a], state: 'playing', time: 180, playing: () => true, canRespawn: () => false };
  n.bind(match); s.match = n; f.G.netm = n; f.G.match = match;
  const frames = []; s.tr = { broadcast(data) { frames.push(data); return true; }, sendTo() { return true; } };
  try {
    n.out.push(['retained-before-final-leave']);
    for (let i = 0; i < 1000; i++) n._rec(['tr', 1, 'jump', {}]);
    assert.equal(n.out.length, 1, 'solo events never accumulate while their IDs still advance');
    match.boss = { sim: true, pack() { throw Error('solo snapshot packing must not run'); } };
    for (let i = 0; i < 200; i++) { clock += 50; assert.equal(n._sendTick(), true); }
    assert.equal(frames.length, 0); assert.equal(n.out.length, 0);
    assert.equal(f.outboundQueueStatus(n).failed, false); assert.equal(f.outboundQueueStatus(n).discardedSoloRows, 1001);
    assert.equal(s._inkwaveEventSeq, 1000);
    match.boss = null; s._members.set('peer', 'Peer'); n._rec(['tr', 1, 'jump', {}]); clock += 50;
    assert.equal(n._sendTick(), true); const tick = frames.find(p => p.k === 't'); assert(tick);
    assert.equal(tick.e.length, 1); assert.equal(tick.e[0].at(-1), 1001); assert.equal(n.out.length, 0);
    // Lifecycle messages are independent of the combat-only skip.
    s._members.delete('peer'); n._sendNow({ k: 'end' }); assert.equal(frames.at(-1).k, 'end');
    const original = f.G.netm; f.G.netm = {}; n.out.push(['obsolete']);
    assert.equal(f.discardSoloTick(n, f.G), false); assert.equal(n.out.length, 1); f.G.netm = original;
  } finally { n.dispose(); }
});

test('production transport byte admission equals TextEncoder at UTF8 boundaries and isolated surrogates', () => {
  const tr = new f.Transport(); let sent = 0; tr.ws = { readyState: 1, bufferedAmount: 0, send() { sent++; } };
  const encoder = new TextEncoder();
  const values = ['', 'a'.repeat(65536), 'a'.repeat(65537), 'あ'.repeat(21845), 'あ'.repeat(21846),
    '😀'.repeat(16384), '😀'.repeat(16385), '\ud800'.repeat(21845), '\udc00'.repeat(21846)];
  let seed = 123;
  for (let n = 0; n < 500; n++) {
    let s = ''; for (let j = 0; j < n; j++) { seed = (seed * 1664525 + 1013904223) >>> 0; s += String.fromCharCode(seed & 65535); }
    values.push(s);
  }
  for (const value of values) assert.equal(tr._raw(value), encoder.encode(value).length <= 65536);
  assert.equal(sent, values.filter(s => encoder.encode(s).length <= 65536).length);
  tr.ws.bufferedAmount = 524289; assert.equal(tr._raw('ok'), false);
  tr.ws.bufferedAmount = 0; tr.ws.readyState = 3; assert.equal(tr._raw('ok'), false);
});

test('host waits for matching relay START result, rejects stale ACK, and can retry after membership rejection', async () => {
  const x = await sessionFixture(); const p = x.net.create('Host'), socket = x.sockets[0]; x.welcome(socket); await p;
  let begins = 0; x.net._begin = () => { begins++; };
  assert.equal(x.net.start(), true); const first = x.net._pendingStart;
  assert.equal(begins, 0); assert.equal(x.net.canStart(), false); assert.equal(x.net.start(), false);
  x.message(socket, { t: 'start_result', id: 'stale', ok: true }); assert.equal(begins, 0);
  x.message(socket, { t: 'start_result', id: first.id, ok: false }); assert.equal(x.net._pendingStart, null); assert.equal(begins, 0);
  assert.equal(x.net.start(), true); const second = x.net._pendingStart;
  x.message(socket, { t: 'start_result', id: first.id, ok: true }); assert.equal(begins, 0);
  x.message(socket, { t: 'start_result', id: second.id, ok: true }); assert.equal(begins, 1);
  x.message(socket, { t: 'start_result', id: second.id, ok: true }); assert.equal(begins, 1);
  assert.equal(x.timer(5000), undefined); x.net.leave(true); await flush(); assert.equal(x.timers.size, 0);
});

test('unconfirmed START timeout and reconnect retire pending result callbacks', async () => {
  const x = await sessionFixture(); let p = x.net.create('Host'); x.welcome(x.sockets[0]); await p;
  x.net.start(); const cfg = x.net._pendingStart, timeout = x.timer(5000); assert(timeout);
  x.run(timeout); assert.equal(x.net.state, 'error'); assert.equal(x.net._pendingStart, null);
  p = x.net.create('Host'); x.welcome(x.sockets.at(-1)); await p;
  x.net._control({ t: 'start_result', id: cfg.id, ok: true }); assert.equal(x.net.state, 'lobby'); assert.equal(x.net.match, null);
  x.net.start(); x.net.leave(true); assert.equal(x.timers.size, 0);
});

test('guest me flood coalesces the latest values and cannot update an active match lobby', async () => {
  const x = await sessionFixture(), p = x.net.create('Host'); x.welcome(x.sockets[0]); await p;
  const socket = x.sockets[0]; x.net._control({ t: 'join', m: { id: 'guest', name: 'Guest' } }); socket.sent.length = 0;
  for (let i = 0; i < 80; i++) x.net._message('guest', { k: 'me', ping: i });
  assert.equal(socket.sent.length, 0); assert.equal(x.net.lobby.players.find(p => p.id === 'guest').ping, 79);
  const timer = x.timer(100); assert(timer); x.run(timer);
  const sent = JSON.parse(socket.sent.at(-1).slice(2)); assert.equal(sent.k, 'lobby'); assert.equal(sent.l.players[1].ping, 79);
  assert.equal(socket.sent.length, 1);
  x.net._message('guest', { k: 'me', ping: 90 }); assert(x.timer(100));
  x.net.state = 'match'; x.run(x.timer(100));
  x.net._message('guest', { k: 'me', name: 'Injected', ping: 100 }); assert.equal(x.net.lobby.players[1].name, 'Guest'); assert.equal(socket.sent.length, 1);
  x.net.leave(true); assert.equal(x.timers.size, 0);
});

test('client emotes admit legal names once per sender at 1.3 seconds and clean up departed senders', async () => {
  const x = await sessionFixture(), p = x.net.create('Host'); x.welcome(x.sockets[0]); await p;
  x.net._control({ t: 'join', m: { id: 'guest', name: 'Guest' } }); const events = []; x.net.on('emote', value => events.push(value));
  x.net._message('guest', { k: 'emote', n: 'unknown' });
  for (let i = 0; i < 80; i++) x.net._message('guest', { k: 'emote', n: 'wave' });
  assert.equal(events.length, 1); x.advance(1299); x.net._message('guest', { k: 'emote', n: 'flex' }); assert.equal(events.length, 1);
  x.advance(1); x.net._message('guest', { k: 'emote', n: 'flex' }); assert.equal(events.length, 2);
  x.net._control({ t: 'leave', id: 'guest', host: x.net.myId }); assert.equal(x.net._emoteTimes.has('guest'), false);
  x.net._message('guest', { k: 'emote', n: 'wave' }); assert.equal(events.length, 2);
  x.net.leave(true); assert.equal(x.timers.size, 0);
});

test('appearance values are checked at me, lobby and roster admission without coercing nested JSON', async () => {
  const numeric = { hair: -3.5, skin: 9, outfit: 12, eyes: 1, hat: 0, brows: 1,
    splashtag: { title: 'Grand Champion', num: '#7777', banner: 4, badges: ['star', { key: 'crown' }] } };
  assert.equal(validNetworkAppearance(numeric), true);
  const x = await sessionFixture(), p = x.net.create('Host'); x.welcome(x.sockets[0]); await p;
  x.net._control({ t: 'join', m: { id: 'guest', name: 'Guest' } });
  for (const field of ['hair', 'skin', 'outfit', 'eyes', 'hat', 'brows']) {
    for (const bad of [{ toString: 0, valueOf: 0 }, [], '1', Infinity, NaN]) {
      const style = { ...numeric, [field]: bad }; assert.equal(validMeUpdate({ style }, { shooter: {} }), false);
      assert.equal(validLobbySnapshot({ map: 'map', time: 'day', duration: 180, bots: true, difficulty: 'normal', mode: 'turf',
        players: [{ id: 'guest', name: 'Guest', team: 0, weapon: 'shooter', style }] }, [{ id: 'map' }], { shooter: {} }, 1), false);
      assert.equal(validStartRoster([{ nid: 0, owner: 'guest', bot: false, team: 0, slot: 0, weapon: 'shooter', style }], 'guest', { shooter: {} }), false);
      x.net._message('guest', { k: 'me', style }); assert.notEqual(x.net.lobby.players[1].style, style);
      assert.doesNotThrow(() => f.resolveStyle(style));
    }
  }
  x.net._message('guest', { k: 'me', style: numeric }); assert.equal(x.net.lobby.players[1].style, numeric);
  assert.deepEqual(f.resolveStyle(numeric).splashtag, numeric.splashtag);
  x.net.leave(true);
});

test('physical respawn holds reuse per-actor scratch while preserving every input poll and property order', () => {
  const a = f.make(), calls = [], held = new Set();
  const input = { mouse: { left: false, right: false },
    down(key) { calls.push('key:' + key); return held.has(key); },
    padButton(key) { calls.push('button:' + key); return held.has(key); },
    padValue(key) { calls.push('value:' + key); return held.has(key) ? 1 : 0; },
    mobile: { active: true, root: {}, down(key) { calls.push('touch:' + key); return held.has(key); }, gyro: { discard() {} } } };
  const c = new f.PlayerController(a, {}, input); c.enabled = false; c.update(1 / 60);
  const snapshot = a.s3.physicalRespawnHeld;
  assert.deepEqual(Object.keys(snapshot), ['fire', 'jump', 'sub', 'special', 'squid']);
  assert.deepEqual(calls, ['value:7', 'touch:fire', 'key:Space', 'button:0', 'touch:jump', 'key:KeyE', 'button:5', 'touch:sub',
    'key:KeyF', 'key:KeyQ', 'button:3', 'button:11', 'touch:special', 'key:ShiftLeft', 'key:ShiftRight', 'value:6', 'touch:squid', 'key:KeyN']);
  held.add('Space'); held.add(7); calls.length = 0; c.update(1 / 120);
  assert.equal(a.s3.physicalRespawnHeld, snapshot); assert.equal(snapshot.fire, true); assert.equal(snapshot.jump, true);
  const b = f.make(); c.a = b; c.update(1 / 30); assert.notEqual(b.s3.physicalRespawnHeld, snapshot);
});

test('actual eight-member relay and guarded session cannot exhaust host quota from 80 guest me updates', async () => {
  const room = new RoomDurableObject({}, {}); room.compat = f.COMPAT;
  class Socket {
    constructor() { this.sent = []; this.listeners = {}; this.bufferedAmount = 0; }
    accept() {} send(text) { this.sent.push(text); this.receive?.(text); }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    close(code) { this.closed = code; }
  }
  const peers = Array.from({ length: 8 }, (_, i) => { const ws = new Socket(); room.handleSession(ws, 'P' + i); return ws; });
  const [host, attacker] = peers, welcome = JSON.parse(host.sent[0]), ids = [...room.members.keys()];
  const x = await sessionFixture(), p = x.net.create('Host'), socket = x.sockets[0];
  socket.send = raw => { socket.sent.push(raw); room._handleMessage(ids[0], host, raw); };
  x.welcome(socket, { id: welcome.id, host: welcome.id, members: ids.map(id => ({ id, name: 'Player' })) }); await p;
  host.receive = text => x.message(socket, text);
  for (const id of ids.slice(1)) x.net._control({ t: 'join', m: { id, name: 'Guest' } });
  socket.sent.length = 0;
  for (let group = 0; group < 10; group++) {
    for (let i = 0; i < 8; i++) room._handleMessage(ids[1], attacker, 's|' + ids[0] + '|' + JSON.stringify({ k: 'me', ping: group * 8 + i }));
    const timer = x.timer(100); if (timer) x.run(timer); else x.advance(100);
  }
  const lobby = socket.sent.filter(s => s.startsWith('b|')).map(s => JSON.parse(s.slice(2))).filter(d => d.k === 'lobby');
  assert(lobby.length <= 10); assert.equal(lobby.at(-1).l.players[1].ping, 79);
  assert.equal(host.closed, undefined); assert.equal(room.members.size, 8); assert(room.members.get(ids[0]).framesLeft > 100);
  x.net.leave(true); assert.equal(x.timers.size, 0);
});

test('heartbeat watchdog detects an unanswered OPEN socket once and gives suspended timers a fresh deadline', async () => {
  const x = await sessionFixture(); let p = x.net.create('Host'); x.welcome(x.sockets[0]); await p;
  const first = x.sockets[0], interval = x.timer(2000), stale = x.timers.get(interval).fn;
  for (let i = 0; i < 9; i++) x.run(interval);
  assert.equal(x.net.state, 'lobby'); x.run(interval);
  assert.equal(x.net.state, 'error'); assert.equal(x.net.tr, null); assert.equal(x.timers.size, 0); assert.equal(first.closed.length, 1);
  p = x.net.create('Host'); x.welcome(x.sockets.at(-1)); await p; stale(); assert.equal(x.net.state, 'lobby');
  const next = x.timer(2000); x.advance(60000); x.run(next); assert.equal(x.net.state, 'lobby');
  for (let i = 0; i < 9; i++) x.run(next); assert.equal(x.net.state, 'lobby');
  x.message(x.sockets.at(-1), 'pong'); x.run(next); assert.equal(x.net.state, 'lobby');
  x.net.leave(true); assert.equal(x.timers.size, 0);
});

for (const operation of ['START', 'GO', 'UNLOCK']) for (const fault of ['backlog', 'closed', 'throw']) {
  test(`${operation} ${fault} cannot advance the host alone and retires timers on explicit failure`, async () => {
    const x = await sessionFixture(), p = x.net.create('Host'); x.welcome(x.sockets[0]); await p;
    const ws = x.sockets[0]; let launches = 0, disposed = 0;
    x.G.game.netMatchGo = () => launches++;
    if (operation !== 'START') {
      x.net.state = operation === 'GO' ? 'starting' : 'match'; x.net._setupReady = true;
      x.net._startCfg = { id: 'round' }; x.net.match = { go() { launches++; }, dispose() { disposed++; } };
    }
    if (fault === 'backlog') ws.bufferedAmount = 524289;
    if (fault === 'closed') ws.readyState = 3;
    if (fault === 'throw') ws.send = () => { throw Error('refused'); };
    const before = ws.sent.length;
    const result = operation === 'START' ? x.net.start() : operation === 'GO' ? x.net._go() : x.net.endMatch();
    assert.equal(result, false); assert.equal(x.net.controlFailure.kind, operation); assert.equal(x.net.state, 'error');
    assert.equal(x.net.tr, null); assert.equal(x.net.match, null); assert.equal(launches, 0); assert.equal(ws.sent.length, before);
    assert.equal(x.timers.size, 0); assert.equal(disposed, operation === 'START' ? 0 : 1);
  });
}

for (const kind of ['res', 'end']) test(`${kind} refusal aborts the current production match once and never reports local delivery`, () => {
  const s = new f.NetSession(); Object.assign(s, { myId: 'host', hostId: 'host', state: 'match' }); s._members.set('host', 'Host');
  const n = new f.NetMatch(s, { id: 'critical', map: 'reef' }), m = { actors: [], state: 'results', time: 0 };
  s.match = n; n.match = m; f.G.netm = n; f.G.match = m;
  let aborts = 0; f.G.game = { match: m, netMatchAborted() { aborts++; } };
  const tr = new f.Transport(); s.tr = tr; tr.ws = { readyState: 1, bufferedAmount: 524289, send() { throw Error('must not send'); } };
  assert.equal(kind === 'res' ? n.sendResult({ coverage: [50, 50], winner: 0 }) : n.sendEnd(), false); assert.equal(s.state, 'error'); assert.equal(aborts, 1); assert.equal(s.tr, null);
  assert.equal(n._sendNow({ k: kind }), false); assert.equal(aborts, 1);
});

test('new host reconciles room admission only after its round has completed', async () => {
  const x = await sessionFixture(), p = x.net.join('BCEFG', 'Guest'); x.welcome(x.sockets[0], { id: 'guest', host: 'host' }); await p;
  const ws = x.sockets[0]; ws.sent.length = 0;
  x.net._control({ t: 'leave', id: 'host', host: 'guest' });
  assert.equal(x.net.isHost, true); assert(ws.sent.includes('{"t":"lock","v":false}')); assert.equal(x.net.state, 'lobby');
  x.net.leave(true); assert.equal(x.timers.size, 0);
  const y = await sessionFixture(), next = y.net.join('BCEFG', 'Guest'); y.welcome(y.sockets[0], { id: 'guest', host: 'host' }); await next;
  y.net.state = 'starting'; y.net._startCfg = { id: 'round' }; y.sockets[0].sent.length = 0;
  y.net._control({ t: 'leave', id: 'host', host: 'guest' });
  assert.equal(y.net.isHost, true); assert.equal(y.sockets[0].sent.includes('{"t":"lock","v":false}'), false);
  y.net.leave(true);
});
