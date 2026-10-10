// Exact physics-timing boundaries and special (storm cloud / charger beam)
// retirement on the ACTUAL adapted replication code. The wire must carry the
// owner's exact delay/life/straight so the receiver integrates the same
// frame boundaries, and long-lived specials must advance on the owner's
// playback clock instead of local receipt time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

test('owner sends exact delay/life/straight without frame-boundary rounding', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'me', [['me', 'Me']]));
  const local = f.makeActor({ nid: 7, owner: 'me', remote: false, roller: false });
  f.bind(nm, [local]);
  local.character.getMuzzle = (out) => out.copy(local.pos).add(new f.THREE.Vector3(0, 1.05, 0.3));
  nm.out.length = 0;
  f.projectiles.fireShooter(local, local.weapon, 0);
  const p = f.projectiles.list[0], e = nm.out[0];
  assert.equal(e[11], p.delay, 'delay was rounded');
  assert.equal(e[12], p.life, 'life was rounded');
  assert.equal(e[13], p.straight, 'straight was rounded');
  // the shooter gravity transition is a strict `age > straight`; a rounded 0.1
  // boundary would fire the drop one frame early on the receiver
  assert.ok(e[13] === p.straight);
});

test('birth-time Slosher packets have zero remaining delay and retain scheduled beats', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'me', [['me', 'Me']]));
  const local = f.makeActor({ nid: 7, owner: 'me', remote: false, roller: false });
  local.weapon = f.WEAPONS.slosher;
  f.bind(nm, [local]);
  local.character.getMuzzle = (out) => out.copy(local.pos).add(new f.THREE.Vector3(0, 1.05, 0.3));
  nm.out.length = 0;
  f.projectiles.fireSlosh(local, local.weapon);
  assert.equal(nm.out.filter((e) => e[1] === 'p').length, 0, 'pending globs are not published at precreation');
  for (let tick = 1; tick <= 13; tick++) {
    f.G.time = tick / 60; f.clock.set(1000 + f.G.time); f.projectiles.update(1 / 60);
  }
  const events = nm.out.filter((e) => e[1] === 'p');
  assert.equal(events.length, 9, 'each scheduled Slosher glob publishes once at birth');
  // #1152: scheduling belongs to birth tick, not a second receiver delay.
  assert.deepEqual(Array.from(events,e=>e.at(-2)-1),[0,1,2,3,4,6,8,10,12]);
  for (const e of events) assert.equal(e[11],0);

});

test('a ghost storm cloud advances on the owner clock and retires at its duration', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'p2', [['me', 'Me'], ['p2', 'P2']]));
  const a = f.makeActor({ nid: 7, owner: 'p2', remote: true, roller: false });
  a.weapon = { ...a.weapon, special: 'storm' };
  f.bind(nm, [a]);
  const peer = nm._peer('p2'); peer.tr = 1000;
  // Reproduce the real admitted owner timeline: special use precedes its one Storm birth on the same simulation tick.
  const use = [1000, 'ev', 'special:use', { actor: { n: 7 }, id: 'storm' }, 4, 5];
  use._netTick = 4; use._netSeq = 5;
  const birth = [1000, 'b', 7, 'storm', 0, 0.5, 0, 0, 0, 0, 4, 6];
  birth._netTick = 4; birth._netSeq = 6;
  nm.onMessage('p2', { k:'t', ts:1000, r:2, u:4, l:{7:0}, a:[f.packActor(a,{f:1|8192})], e:[use,birth] });
  peer.tr=1000; nm._playEvents();
  nm.onMessage('p2', {k:'t',ts:1002,u:124,l:{7:0},a:[f.packActor(a,{f:1})]});
  peer.tr = 1002; peer.sim = 124;
  for (let i = 0; i < 30; i++) { f.clock.advance(1 / 60); f.projectiles.update(1 / 60); }
  const cloud = f.projectiles.clouds.find((c) => c.ghost);
  assert.ok(cloud, 'no ghost cloud was created');
  assert.equal(!!cloud._netPeer, true, 'cloud did not inherit the owner playback clock');
  assert.ok(cloud._netSteps > 0, 'cloud did not advance on the owner clock');
  // retire once the owner timeline passes the storm duration
  nm.onMessage('p2', {k:'t',ts:1030,u:1804,l:{7:0},a:[f.packActor(a,{f:1})]});
  peer.tr = 1030; peer.sim = 1804;
  for (let i = 0; i < 30; i++) { f.clock.advance(1 / 60); f.projectiles.update(1 / 60); }
  assert.equal(f.projectiles.clouds.filter((c) => c.ghost).length, 0, 'ghost cloud never retired');
});

test('a ghost charger beam ages on the owner timeline, not local receipt time', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'p2', [['me', 'Me'], ['p2', 'P2']]));
  const a = f.makeActor({ nid: 7, owner: 'p2', remote: true, roller: false });
  a.weapon = f.WEAPONS.charger;
  f.bind(nm, [a]);
  const peer = { tr: 1000 };
  nm.peers.set('p2', peer);
  const ev = [1000, 'ev', 'weapon:fire', { actor: { n: 7 }, weapon: 'charger', muzzle: [0, 1, 0], dir: [0, 0, 1], charge: 1, len: 20 }];
  nm._play('p2', ev);
  const beam = f.projectiles.beams[0];
  assert.ok(beam && beam._netPeer, 'beam was not bound to the owner clock');
  peer.tr = 1000.1;
  f.clock.advance(1 / 60);
  f.projectiles.update(1 / 60);
  assert.ok(Math.abs(beam.t - 0.116666) < 0.02, `beam age ignored owner clock: ${beam.t}`);
  peer.tr = 1000.5;                          // past life
  f.clock.advance(1 / 60);
  f.projectiles.update(1 / 60);
  assert.equal(f.projectiles.beams.length, 0, 'beam never retired');
});

test('a ghost bomb steps on the owner playback clock, not on how long it was delayed', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'p2', [['me', 'Me'], ['p2', 'P2']]));
  const a = f.makeActor({ nid: 7, owner: 'p2', remote: true, roller: false });
  f.bind(nm, [a]);
  const peer = nm._peer('p2'); peer.tr = 1000;
  nm._play('p2', [1000, 'b', 7, 'bomb', 0, 3.35, 0, 0, 6.5, 12.5, 4.8, 1.7]);
  const b = f.projectiles.bombs.find((x) => x.ghost);
  assert.ok(b && b._netPeer);
  assert.equal(b._netSteps, 0);
  peer.tr = 1001;                             // 1 s of owner time arrives at once
  f.projectiles.update(1 / 60);
  // 1 s at 60 Hz = 60 steps + the publication frame, bounded by 180
  assert.ok(b._netSteps >= 60 && b._netSteps <= 180, `unexpected step count ${b._netSteps}`);
  assert.ok(Math.abs(b.age - b._netSteps / 60) < 1e-9, 'age did not follow the step count');
});


test('future-dated owner events cannot head-of-line block later timeline playback', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'me', [['me', 'Me'], ['p2', 'P2']]));
  const played = [];
  nm._play = (id, e) => played.push([id, e]);
  const peer = nm._peer('p2');

  // Event time itself may never be newer than the enclosing authenticated sender tick.
  nm.onMessage('p2', {
    k: 't', ts: 1000, r: 2, u: 60000,
    e: [[1e12, 'ev', 'respawn', {}, 60000, 1]],
  });
  assert.equal(peer.events.length, 0, 'far-future event timestamp was admitted');

  // The same invariant applies to the owner's simulation tick carried by v2 events.
  nm.onMessage('p2', {
    k: 't', ts: 1000.05, r: 2, u: 60003,
    e: [[1000.04, 'ev', 'respawn', {}, 999999999, 2]],
  });
  assert.equal(peer.events.length, 0, 'far-future owner simulation tick was admitted');

  // A normal event immediately after malformed input must still play.
  nm.onMessage('p2', {
    k: 't', ts: 1000.10, r: 2, u: 60006,
    e: [[1000.09, 'ev', 'respawn', {}, 60006, 3]],
  });
  peer.tr = 1000.10;
  peer.sim = 60006;
  nm._playEvents();
  assert.equal(played.length, 1, 'valid tail event was starved');
  assert.equal(played[0][1][5], 3);

  // Admission is bounded per packet and per peer, so malformed traffic cannot
  // grow the FIFO without limit even when every event is otherwise well-formed.
  const flood = (ts, tick, seqBase) => Array.from({ length: 600 }, (_, i) =>
    [ts - 0.001, 'ev', 'respawn', {}, tick, seqBase + i]);
  peer.tr = 0;
  nm.onMessage('p2', { k:'t', ts:1000.15, r:2, u:60009, e:flood(1000.15, 60009, 1000) });
  assert.equal(peer.events.length, 256, 'per-packet event budget was not enforced');
  nm.onMessage('p2', { k:'t', ts:1000.20, r:2, u:60012, e:flood(1000.20, 60012, 2000) });
  assert.equal(peer.events.length, 512, 'peer event queue cap was not enforced');
  nm.onMessage('p2', { k:'t', ts:1000.25, r:2, u:60015, e:flood(1000.25, 60015, 3000) });
  assert.equal(peer.events.length, 512, 'peer event queue grew past its hard cap');
});
