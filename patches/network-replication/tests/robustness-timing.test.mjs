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

test('a fractional slosh delay survives the wire so later globs leave on the same beat', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'me', [['me', 'Me']]));
  const local = f.makeActor({ nid: 7, owner: 'me', remote: false, roller: false });
  local.weapon = f.WEAPONS.slosher;
  f.bind(nm, [local]);
  local.character.getMuzzle = (out) => out.copy(local.pos).add(new f.THREE.Vector3(0, 1.05, 0.3));
  nm.out.length = 0;
  f.projectiles.fireSlosh(local, local.weapon);
  const events = nm.out.filter((e) => e[1] === 'p');
  assert.ok(events.length > 1, 'slosher produced no volley');
  // #64 uses the pinned UnitDelayFrame/AfterOffsetDelayFrame source values.
  // They are exact 60 Hz frame fractions and must round-trip without r3 ms loss.
  const delays = events.map((e) => e[11]).filter((d) => d > 0);
  assert.ok(delays.length > 0, 'no delayed globs were recorded');
  for (const d of delays) assert.ok(Math.abs(d * 60 - Math.round(d * 60)) < 1e-9, `delay lost source-frame precision: ${d}`);
});

test('a ghost storm cloud advances on the owner clock and retires at its duration', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'p2', [['me', 'Me'], ['p2', 'P2']]));
  const a = f.makeActor({ nid: 7, owner: 'p2', remote: true, roller: false });
  f.bind(nm, [a]);
  const peer = { tr: 1000 };
  nm.peers.set('p2', peer);
  // a ghost storm bomb placed on the floor lands immediately and spawns the cloud
  nm._play('p2', [1000, 'b', 7, 'storm', 0, 0.5, 0, 0, 0, 0, 4, 6]);
  peer.tr = 1002;
  for (let i = 0; i < 30; i++) { f.clock.advance(1 / 60); f.projectiles.update(1 / 60); }
  const cloud = f.projectiles.clouds.find((c) => c.ghost);
  assert.ok(cloud, 'no ghost cloud was created');
  assert.equal(!!cloud._netPeer, true, 'cloud did not inherit the owner playback clock');
  assert.ok(cloud._netSteps > 0, 'cloud did not advance on the owner clock');
  // retire once the owner timeline passes the storm duration
  peer.tr = 1000 + 30;
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
  const peer = { tr: 1000 };
  nm.peers.set('p2', peer);
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
