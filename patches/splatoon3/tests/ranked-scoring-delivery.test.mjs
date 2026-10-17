import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

async function world({ bridge = false, gap = false, mode = 'rainmaker', map = null } = {}) {
  const f = await fixture({ fullRuntime: true, productionComposition: true, extraExports: `
    export { installRanked, buildFrame } from './patches/splatoon3/runtime/ranked/install.mjs';
    export { RankedEngine } from './patches/splatoon3/runtime/ranked/engine.mjs';
    export { RankedWorld } from './patches/splatoon3/runtime/ranked/world.mjs';
    export { createRankedStage } from './patches/splatoon3/runtime/ranked/stages.mjs';
    export { MAP_LAYOUTS } from './inkwave-public/src/world/maps.js';
  ` });
  f.context.structuredClone = structuredClone; f.installRanked(f.installedRuntime);
  const single = gap
    ? [{ kind: 'box', min: [-15, -1, -15], max: [15, 0, -.4] },
      { kind: 'box', min: [-15, -1, .4], max: [15, 0, 15] }]
    : [{ kind: 'box', min: [-15, -1, -15], max: [15, 0, 15] }];
  if (bridge) single.push({ kind: 'box', min: [-3, 2.8, -3], max: [3, 3, 3] });
  f.G.level = new f.Level(map ? f.MAP_LAYOUTS[map] : { bounds: { minX: -15, maxX: 15, minZ: -15, maxZ: 15 },
    spawnPads: [[0, 0, -12], [0, 0, 12]], spawnBarrier: 0, half: [], single });
  f.G.physics = new f.Physics(f.G.level);
  const a = f.make(); a.nid = 1; a.slot = 0;
  delete a._integrate;
  a.pos.set(0, 0, -4); a.invuln = 999; a.s3.spawnArmor = null;
  const e = new f.RankedEngine(mode, map ? f.createRankedStage(f.G) : { id: 'layered-scoring',
    rainmaker: { center: [0, 0, -4], checkpoints: [[], []], goals: [[0, 0, 12], [0, 0, -12]] },
    clams: { spawns: [], goals: [[0, 0, 4], [0, 0, -4]] } });
  // Use the production support/segment methods over real Level/Physics;
  // presentation allocation and zone-ink indexing are outside these rules.
  const w = { level: f.G.level, physics: f.G.physics,
    _a: new f.THREE.Vector3(), _b: new f.THREE.Vector3(), _hit: new f.Hit(), zoneCoverage: () => [] };
  w.floorAt = f.RankedWorld.prototype.floorAt;
  w.blocked = f.RankedWorld.prototype.blocked;
  const m = f.G.match = { mode, state: 'playing', ranked: e, actors: [a], local: a,
    rankedWorld: w, rankedBarrierHits: [], playing: () => true, canRespawn: () => false };
  const frame = () => f.buildFrame(m, { G: f.G, PLAYER: f.PLAYER });
  function tick() { f.G.time += 1 / 60; a.update(1 / 60); e.update(1 / 60, frame()); }
  return { ...f, a, e, m, frame, tick };
}

test('a grounded Rainmaker carrier can advance below a bridge without a false fall/drop', async () => {
  const f = await world({ bridge: true });
  f.m.rankedBarrierHits.push({ team: 0, damage: 1000, kind: 'shooter' });
  f.e.update(1 / 60, f.frame()); assert.equal(f.e.rule.state.carrier, '1');
  assert.equal(f.G.level.groundHeight(0, 0), 3, 'the upper floor exists');
  f.a.intent.move.set(0, 0, 1);
  for (let i = 0; i < 110; i++) f.tick();
  assert.equal(f.a.alive, true); assert.equal(f.a.grounded, true);
  assert.ok(f.a.pos.z > 3, 'real movement crosses below the overpass');
  assert.equal(f.e.rule.state.carrier, '1', 'supported lower floor retains possession');
  assert.ok(f.e.counts[0] < 60, 'walking toward the attack goal advances the best count');
  assert.equal(f.e.events.some(e => e.kind === 'rainmaker-drop'), false);
});

test('Halyard Marina gangway footprint support retains the Rainmaker and advances the count', async () => {
  const f = await world({ map: 'halyard' }), y = f.G.level.groundHeight(1.6, 6.5);
  f.a.spawnAt(new f.THREE.Vector3(1.78, y, 6.5), 0);
  assert.equal(f.a.grounded, true, 'the actual footprint is supported by the thin gangway');
  assert.equal(f.m.rankedWorld.floorAt(f.a.pos.x, f.a.pos.z), null, 'the centre ray itself is over the water');
  f.e.rule.state.pos = f.a.pos.toArray();
  f.m.rankedBarrierHits.push({ team: 0, damage: 1000, kind: 'shooter' });
  f.e.update(1 / 60, f.frame());
  const before = f.e.counts[0];
  assert.equal(f.e.rule.state.carrier, '1');
  f.a.intent.move.set(0, 0, 1);
  for (let i = 0; i < 60; i++) f.tick();
  assert.ok(f.a.pos.z > 8.8, 'real movement reaches the enemy fuel dock');
  assert.equal(f.a.alive, true); assert.equal(f.a.grounded, true);
  assert.equal(f.e.rule.state.carrier, '1');
  assert.ok(f.e.counts[0] < before, `${before} -> ${f.e.counts[0]} count progress`);
});

test('a Rainmaker carrier can jump across a gap and resume scoring on the next floor', async () => {
  const f = await world({ gap: true });
  f.m.rankedBarrierHits.push({ team: 0, damage: 1000, kind: 'shooter' });
  f.e.update(1 / 60, f.frame());
  f.a.intent.move.set(0, 0, 1);
  let jumped = false, crossedAir = false;
  for (let i = 0; i < 110; i++) {
    f.a.intent.jump = !jumped && f.a.pos.z > -1.4;
    jumped ||= f.a.intent.jump;
    f.tick();
    if (Math.abs(f.a.pos.z) < .4 && !f.a.grounded) {
      crossedAir = true;
      assert.equal(f.e.rule.state.carrier, '1', 'a live airborne carrier retains possession over water');
    }
  }
  assert.equal(crossedAir, true); assert.equal(f.a.alive, true); assert.equal(f.a.grounded, true);
  assert.equal(f.e.rule.state.carrier, '1'); assert.ok(f.e.counts[0] < 60);
});

test('a physical fall death still resets an own-side Rainmaker instead of becoming an ordinary splat drop', async () => {
  const f = await world({ gap: true });
  f.m.rankedBarrierHits.push({ team: 0, damage: 1000, kind: 'shooter' });
  f.e.update(1 / 60, f.frame());
  f.a.pos.set(0, f.PLAYER.fallDeathY - 1, -8);
  f.a.grounded = false; f.a.alive = false;
  f.m.rankedWorld.floorAt = () => null;
  f.e.update(1 / 60, f.frame());
  assert.equal(f.e.rule.state.carrier, null);
  assert.deepEqual(Array.from(f.e.rule.state.pos), [0, 0, -4]);
  assert.equal(f.e.events.some(e => e.kind === 'rainmaker-reset' && e.reason === 'fall'), true);
});

for (const geometry of ['bridge', 'gap']) test(`a Power Clam reaches the basket across a ${geometry} through actual throw/segment/floor rules`, async () => {
  const f = await world({ [geometry]: true, mode: 'clams' });
  for (let i = 0; i < 8; i++) f.e.rule._newClam('small', null, f.a.pos.toArray());
  f.e.update(1 / 60, f.frame());
  assert.equal(f.e.rule.state.inventories['1'].power, true, 'eight real pickups form Power');
  f.a.aimYaw = 0; f.a.aimPitch = -.1; f.a.aimDir.set(0, 0, 1); f.a.intent.throw = true;
  f.tick();
  for (let i = 0; i < 180; i++) f.tick();
  assert.equal(f.e.counts[0], 80, 'physical goal entry breaks the barrier and scores twenty');
  assert.equal(f.e.rule.state.baskets[0].barrierOpen, true);
  assert.equal(f.e.events.some(e => e.kind === 'clam-lost'), false);
});

test('the throw uses the new aim on the same tick as turning toward the basket', async () => {
  const f = await world({ mode: 'clams' });
  for (let i = 0; i < 8; i++) f.e.rule._newClam('small', null, f.a.pos.toArray());
  f.e.update(1 / 60, f.frame());
  f.a.aimDir.set(0, 0, -1); // previous Actor tick faced away
  f.a.aimYaw = 0; f.a.aimPitch = -.1; f.a.intent.throw = true;
  f.tick();
  assert.ok(f.frame().inputs['1'].aim[2] > .9, 'current controller yaw, not the cached old aimDir');
  for (let i = 0; i < 180; i++) f.tick();
  assert.equal(f.e.counts[0], 80);
});
