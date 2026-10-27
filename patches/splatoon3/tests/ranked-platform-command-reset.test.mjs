import { installRankedDocument } from './ranked-dom-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../reliability/tests/controls-fixture.mjs';
import { resetPlatformInput } from '../../local-quality/platform-input.mjs';
import { rebasePlatformGame } from '../../local-quality/platform-game.mjs';

// Real composed controller -> Actor -> NetMatch -> Transport JSON -> host
// command admission. Only socket, scene/physics and wall time are controlled.
// The native transport rounds owner timestamps to 1 ms. These synchronous
// 20 Hz sends must advance the sender's monotonic clock by 50 ms, rather
// than accidentally sharing performance.now() when the runner is fast.
let wireClockMs = 10_000;
const f = await fixture({ ranked: true, network: true, session: true, production: true,
  clock: { now: () => wireClockMs } });
installRankedDocument(f.context.document); f.context.structuredClone = structuredClone;
f.installRanked(f);
const stage = { id: 'ranked-platform-reset', clams: { spawns: [], goals: [[0, 0, 20], [0, 0, -20]] } };
let time = 10;
function world(hz) {
  f.G.projectiles = new f.Projectiles(new f.THREE.Scene());
  const actor = (owner, nid, team) => Object.assign(f.make(), { owner, nid, team, slot: 0, netLife: 1, invuln: 0 });
  const a = actor('guest', 1, 0), proxy = actor('guest', 1, 0), local = actor('host', 2, 1);
  const match = (a, actors) => ({ mode: 'clams', state: 'playing', actors, local: a, time: 300,
    ranked: new f.RankedEngine('clams', stage), rankedGains: [0, 0], rankedBarrierHits: [],
    rankedWorld: { zoneCoverage: () => [], floorAt: () => 0, blocked: () => false },
    playing() { return true; }, canRespawn: () => false });
  const gm = match(a, [a]), hm = match(local, [proxy, local]), raw = [];
  const transport = new f.Transport();
  transport.ws = { readyState: 1, bufferedAmount: 0, send: s => raw.push(s) };
  const net = (host, m) => {
    const s = { myId: host ? 'host' : 'guest', hostId: 'host', isHost: host,
      _members: new Set(['host', 'guest']), tr: host ? { broadcast() { return true; }, sendTo() { return true; } } : transport };
    const nm = new f.NetMatch(s, { id: stage.id, mode: 'clams', map: 'tidewater' }); nm.bind(m); return nm;
  };
  const guest = net(false, gm), host = net(true, hm);
  const select = (nm, m) => Object.assign(f.G, { netm: nm, match: m, actors: m.actors, mode: 'match', settings: { aimAssist: 0 }, time });
  select(guest, gm);
  const input = new f.Input({}), rig = { yaw: 0, pitch: 0, mode: 'follow', target: a };
  const c = gm.controller = new f.PlayerController(a, rig, input); c.computeAim = () => {}; c.enabled = true;
  f.G.rig = rig;
  for (const m of [gm, hm]) m.ranked.rule.state.inventories['1'] = { team: 0, small: 2, power: false };
  const frame = () => { select(guest, gm); c.update(1 / hz); a.update(0); f.buildFrame(gm, { G: f.G }); };
  const send = () => {
    select(guest, gm); time += .05; f.G.time = time; wireClockMs += 50;
    const start = raw.length; guest._sendTick();
    const packets = raw.slice(start).filter(s => s.startsWith('b|')).map(s => JSON.parse(s.slice(2))).filter(p => p.k === 't');
    for (const p of packets) { select(host, hm); host.onMessage('guest', p); hm.ranked.update(1 / 60, f.buildFrame(hm, { G: f.G })); }
    return packets;
  };
  return { a, gm, hm, input, c, frame, send, transport,
    close() { guest.dispose(); host.dispose(); f.G.projectiles.clear(); } };
}

for (const hz of [30, 60, 120]) for (const boundary of ['blur-or-screen', 'resume']) {
  test(`${boundary} clears queued throw and held wire fire before the next actor tick, ${hz}Hz`, () => {
    const w = world(hz);
    try {
      w.input.mouse.left = true; w.input.pressed.add('KeyC'); w.frame();
      assert.equal(w.a._rankedInput.fire, true); assert.equal(w.a._rankedThrowPending, true);
      w.transport.ws.bufferedAmount = 512 * 1024 + 1;
      assert.equal(w.send().length, 0, 'real transport refuses the old command');
      const aim = [...w.a._rankedInput.aim];
      if (boundary === 'resume') rebasePlatformGame({ input: w.input, match: w.gm });
      else resetPlatformInput(w.input, w.c);
      w.transport.ws.bufferedAmount = 0;
      // There is deliberately no controller/Actor update before the resumed
      // 20Hz send: the network can advance before fixed simulation does.
      const [packet] = w.send();
      assert.equal(packet.rki.fire, false, 'stale held fire cannot reach host');
      assert.equal(packet.rki.throw, false, 'refused throw cannot outlive the platform boundary');
      assert.equal(w.a.intent.throw, false);
      assert.deepEqual([...packet.rki.aim], aim, 'neutralization preserves aim');
      assert.equal(w.hm.ranked.events.filter(e => e.kind === 'clam-throw').length, 0);
      assert.equal(w.hm.ranked.rule.state.inventories['1'].small, 2);
      w.input.mouse.left = true; w.input.pressed.add('KeyC'); w.frame();
      assert.equal(w.send()[0].rki.throw, true, 'new deliberate press still reaches host');
      assert.equal(w.hm.ranked.events.filter(e => e.kind === 'clam-throw').length, 1);
      assert.equal(w.send()[0].rki.throw, false, 'new edge is consumed once');
    } finally { w.close(); }
  });
}
