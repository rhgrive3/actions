import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
function world() {
  const { G, THREE } = f;
  G.projectiles.clear(); G.scene ||= new THREE.Scene(); G.actors = []; G.netm = null; G.time = 0;
  G.match = { state: 'playing', mode: 'turf', actors: G.actors, playing: () => true };
  G.level = new f.Level({ bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    spawnPads: [[-40, 0, 0], [40, 0, 0]], spawnBarrier: 0, half: [], single: [
      { kind: 'box', min: [-50, -.5, -50], max: [50, 0, 50] }] });
  G.physics = new f.Physics(G.level);
  const owner = f.make('support'), target = f.make();
  Object.assign(owner, { nid: 7, owner: 'A', isLocal: true });
  Object.assign(target, { nid: 2, owner: 'me', team: 1 }); target.pos.set(40, 0, 40);
  G.actors = G.match.actors = [owner, target];
  return { owner, target };
}
function tick(hz) { f.G.time += 1 / hz; f.G.projectiles.update(1 / hz); }
function armed(owner, hz) {
  owner.aimDir.set(0, -1, 0);
  const s = f.G.projectiles.throwBomb(owner);
  for (let i = 0; i < hz * 2 && s.activeAt === null; i++) tick(hz);
  assert.notEqual(s.activeAt, null); return s;
}
function network(owner, target) {
  const s = { myId: 'me', hostId: 'B', isHost: false, _members: new Set(['me', 'A', 'B']),
    tr: { broadcast() { return true; }, sendTo() { return true; } } };
  const n = new f.NetMatch(s, { id: 'sensor-epoch', mode: 'turf', map: 'tidewater' });
  n.match = f.G.match; n.byNid = new Map([[7, owner], [2, target]]); f.G.netm = n;
  owner.remote = true; n._setupActor(owner); return n;
}

for (const hz of [30, 60, 120]) test(`an active sensor can mark a genuinely new life of the same Actor, ${hz}Hz`, () => {
  const { owner, target } = world(), s = armed(owner, hz);
  const pos = s.pos.clone(); pos.y -= .7; target.pos.copy(pos); tick(hz);
  assert.ok(target.s3.revealedUntil[0] > f.G.time);
  const before = target.netLife || 0;
  target.spawnAt(pos, 0);
  assert.equal(target.netLife, before + 1);
  assert.equal(target.s3.revealedUntil, undefined);
  tick(hz);
  assert.ok(target.s3.revealedUntil?.[0] > f.G.time, 'prior-life contact must not suppress this life');
  const until = target.s3.revealedUntil[0]; tick(hz);
  assert.equal(target.s3.revealedUntil[0], until, 'same-life duplicates never extend the mark');
});

for (const hz of [30, 60, 120]) test(`sensor contact at/after area expiry cannot mark a new entrant, ${hz}Hz`, () => {
  const { owner, target } = world(), s = armed(owner, hz);
  target.pos.copy(s.pos); target.pos.y -= .7;
  f.G.time = s.expires; f.G.projectiles.update(1 / hz);
  assert.equal(target.s3.revealedUntil, undefined);
  assert.equal(f.G.projectiles._s3SupportSensors.length, 0);
});

test('support packets use the native-admitted remote life rather than the stale local counter', () => {
  const { owner, target } = world(), n = network(owner, target);
  try {
    owner.netLife = 0; owner.net.lastLife = 2;
    n._play('A', [1, 'ks', 'p', 7, 1, 0, .7, 0, 0, 0, 1, 2]);
    assert.equal(f.G.projectiles._s3SupportSensors.length, 1);
    assert.equal(f.G.projectiles._s3SupportSensors[0].sourceLife, 2);
    n._play('A', [1, 'ks', 'c', 7, 2, 0, 0, 1.6, 2]);
    assert.equal(f.G.projectiles._s3SupportCoolers.length, 1);
    const before = f.G.projectiles._s3SupportSensors.length;
    n._play('A', [1, 'ks', 'p', 7, 3, 0, .7, 0, 0, 0, 1, 1]);
    assert.equal(f.G.projectiles._s3SupportSensors.length, before, 'old life remains rejected');
  } finally { n.dispose(); f.G.netm = null; }
});

test('replayed sensor contacts distinguish successive target lives and reject old-life claims', () => {
  const { owner, target } = world(), n = network(owner, target);
  try {
    target.pos.set(0, 0, 0);
    n._play('A', [1, 'ks', 'p', 7, 1, 0, .7, 0, 0, 0, 1, 0]);
    n._play('A', [1, 'ks', 'm', 7, 1, 2, 0, 480, 0, 'l']);
    assert.ok(target.s3.revealedUntil[0] > 0);
    target.spawnAt(new f.THREE.Vector3(), 0);
    n._play('A', [1, 'ks', 'm', 7, 1, 2, 0, 480, 0, 'l']);
    assert.equal(target.s3.revealedUntil, undefined);
    n._play('A', [1, 'ks', 'm', 7, 1, 2, target.netLife, 480, 0, 'l']);
    assert.ok(target.s3.revealedUntil?.[0] > 0);
  } finally { n.dispose(); f.G.netm = null; }
});

test('a sensor mark arriving at expiry cannot extend the ended field before the next cleanup tick', () => {
  const { owner, target } = world(), n = network(owner, target);
  try {
    n._play('A', [1, 'ks', 'p', 7, 1, 0, .7, 0, 0, -1, 0, 0]);
    const sensor = f.G.projectiles._s3SupportSensors[0];
    for (let i = 0; i < 120 && sensor.activeAt === null; i++) tick(60);
    assert.notEqual(sensor.activeAt, null);
    target.pos.copy(sensor.pos); target.pos.y -= .7;
    f.G.time = sensor.expires;
    assert.equal(f.G.projectiles._s3SupportSensors.length, 1, 'expiry has not yet reached the collection cleanup');
    n._play('A', [1, 'ks', 'm', 7, 1, 2, 0, 480, 0, 'l']);
    assert.equal(target.s3.revealedUntil, undefined);
  } finally { n.dispose(); f.G.netm = null; }
});

test('native peer departure retires the old support serial admission before a new owner starts', () => {
  const { owner, target } = world(), n = network(owner, target);
  try {
    n._play('A', [1, 'ks', 'c', 7, 8, 0, 0, 1.6, 0]);
    n._play('A', [1, 'ks', 'p', 7, 9, 0, .7, 0, 0, 0, 1, 0]);
    n.onLeave('A', false);
    assert.equal(owner.owner, 'B');
    n._play('B', [1, 'ks', 'p', 7, 1, 0, .7, 0, 0, 0, 1, 0]);
    assert.ok(f.G.projectiles._s3SupportSensors.some(s => s.seq === 1));
    n._play('B', [1, 'ks', 'c', 7, 1, 0, 0, 1.6, 0]);
    assert.equal(f.G.projectiles._s3SupportCoolers[0].seq, 1);
    const count = f.G.projectiles._s3SupportSensors.length;
    n._play('A', [1, 'ks', 'p', 7, 10, 0, .7, 0, 0, 0, 1, 0]);
    assert.equal(f.G.projectiles._s3SupportSensors.length, count, 'former owner cannot keep authoring');
  } finally { n.dispose(); f.G.netm = null; }
});
