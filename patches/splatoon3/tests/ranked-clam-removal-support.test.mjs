import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceLoadedActorFixture } from './source-loaded-actor-fixture.mjs';

// Real composed Match.removeActor, Actor/Character and RankedWorld/Physics.
// No renderer or network transport; the fixture owns the isolated stage.
const f = await sourceLoadedActorFixture({ random: () => .5,
  extraExports: "export { RankedWorld } from './patches/splatoon3/runtime/ranked/world.mjs';" });
const { G } = f;
const stage = { id: 'clam-removal-support', clams: { spawns: [], goals: [[0, 0, 40], [0, 0, -40]] } };
const plain = value => JSON.parse(JSON.stringify(value));

async function world(team, position) {
  G.netm = null;
  G.level = new f.Level({ bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    spawnPads: [[-5, 0, 0], [5, 0, 0]], spawnBarrier: 0, half: [], single: [
      { kind: 'box', min: [-10, -.5, -10], max: [10, 0, 10] },
      { kind: 'box', min: [-20, -4, -4], max: [-15, -3, 4] },
    ] });
  G.physics = new f.Physics(G.level);
  const a = await f.make(team);
  a.nid = 1; a.character.onEvent = null; a.pos.fromArray(position);
  const m = Object.assign(Object.create(f.Match.prototype), {
    mode: 'clams', state: 'playing', actors: G.actors, local: a,
    ranked: new f.RankedEngine('clams', stage), rankedGains: [0, 0], rankedBarrierHits: [],
    rankedEffects: { event() {}, update() {} },
    playing() { return this.state === 'playing'; }, canRespawn: () => false,
  });
  m.rankedWorld = new f.RankedWorld(f, m, stage); G.match = m;
  const e = m.ranked, r = e.rule;
  r.state.inventories['1'] = { team, small: 0, power: true };
  return { a, m, e, r, dispose() { m.rankedWorld.dispose(); f.reset(); } };
}

for (const hz of [30, 60, 120]) for (const team of [0, 1]) {
  test(`removed last Power Clam holder over water cannot keep overtime alive: ${hz}Hz/team${team}`, async () => {
    const x = await world(team, [12, f.PLAYER.fallDeathY - .1, 0]);
    try {
      const dt = 1 / hz;
      x.e.counts[team] = 70; x.e.counts[1 - team] = 50; x.e.leader = 1 - team;
      x.r.state.scoredPoints[team] = 30; x.r.state.scoredPoints[1 - team] = 50;
      x.e.time = dt; x.m.advanceRanked(dt);
      assert.equal(x.e.overtime, true, 'held Power Clam opens comeback overtime');
      assert.equal(x.m.rankedWorld.floorAt(12, 0, x.a.pos.y + .25), null);
      x.m.removeActor(x.a);
      assert.equal(x.r.state.clams[0].grounded, false, 'removal must retain the live no-support verdict');
      x.m.advanceRanked(dt);
      assert.equal(x.r.state.clams.length, 0, 'water drop follows ordinary projectile loss');
      assert.equal(x.e.winner, 1 - team);
      assert.equal(x.e.reason, 'clam-overtime-power-clams-lost');
      assert.equal(x.m.state, 'finish');
    } finally { x.dispose(); }
  });
}

for (const [name, pos, supported] of [
  ['dry floor', [0, 0, 0], true],
  ['supported trench below waterline', [-17, -3, 0], true],
  ['air above a gap', [12, 3, 0], false],
]) test(`removal preserves support and remaining lifetime: ${name}`, async () => {
  const x = await world(0, pos);
  try {
    x.m.advanceRanked(1 / 60);
    x.m.removeActor(x.a);
    const c = x.r.state.clams[0];
    assert.equal(c.grounded, supported);
    assert.equal(c.expiresIn, 10);
    assert.equal(x.r.state.inventories['1'], undefined);
    x.m.removeActor(x.a);
    assert.equal(x.r.state.clams.length, 1, 'duplicate removal cannot duplicate the drop');
    const replica = new f.RankedEngine('clams', stage);
    assert.equal(replica.restore(x.e.snapshot()), true);
    assert.deepEqual(plain(replica.snapshot()), plain(x.e.snapshot()));
    const frame = f.buildFrame(x.m, f);
    for (let i = 0; i < 120; i++) {
      x.e.update(1 / 60, frame); replica.update(1 / 60, frame);
    }
    assert.deepEqual(plain(replica.snapshot()), plain(x.e.snapshot()), 'host takeover retains support and loss');
    assert.equal(x.r.state.clams.length, supported ? 1 : 0);
    if (supported) assert.ok(Math.abs(c.expiresIn - 8) < 1e-8);
  } finally { x.dispose(); }
});

test('the installed native NetMatch.onLeave uses the same support-aware drop', async () => {
  const x = await world(1, [12, f.PLAYER.fallDeathY - .1, 0]);
  let nm;
  try {
    x.m.advanceRanked(1 / 60);
    const session = { myId: 'viewer', hostId: 'host', isHost: false,
      _members: new Set(['viewer', 'host']), tr: { broadcast() { return true; }, sendTo() { return true; } } };
    nm = new f.NetMatch(session, { id: 'clam-peer-removal', mode: 'clams', map: 'tidewater' });
    nm.match = x.m; G.netm = nm; x.a.owner = 'departed';
    nm.byNid.set(x.a.nid, x.a); nm._setupActor(x.a);
    nm.onLeave('departed', false);
    assert.equal(x.r.state.clams.length, 1);
    assert.equal(x.r.state.clams[0].grounded, false);
    assert.equal(x.r.state.inventories['1'], undefined);
    // The native takeover policy retains this squidkid under the surviving
    // host. Keep it from picking up the dropped objective in this loss check.
    assert.equal(x.a.owner, 'host');
    x.m.advanceRanked(1 / 60);
    assert.equal(x.r.state.clams.length, 0);
  } finally { nm?.dispose(); G.netm = null; x.dispose(); }
});
