import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { THROW_PREVIEW_INTERVAL } from '../runtime/throw-prediction.mjs';

// Supplements the existing flight/endpoint parity and UI-unit suites. It does
// not replace their tests or change the legacy nativeArc compatibility layer.
let context;
async function api() {
  const f = await (context ||= fixture({ fullRuntime: true, productionComposition: true,
    realProjectiles: true, includeCharacter: true, vmMathRandom: () => .5 }));
  assert.equal(f.Projectiles.prototype[Symbol.for('inkwave.s3.throw-prediction.v1')], true,
    'unmodified default production installer, not the retained legacy nativeArc layer');
  assert.equal(typeof f.Projectiles.prototype.s3PredictThrowTrajectory, 'function');
  return f;
}
const vec = v => Array.from(v.toArray());
function owned(r, f) {
  return { time: f.G.time, pos: vec(r.a.pos), velocity: vec(r.a.vel), ink: r.a.ink, hp: r.a.hp,
    runner: Object.fromEntries(Object.entries(r.a.weaponRunner).filter(([, v]) =>
      v == null || ['number', 'boolean', 'string'].includes(typeof v))),
    pose: Array.from(r.a.character.P), clocks: Array.from(r.a.character.tr),
    bones: Array.from(r.a.character.boneList, b => ({ position: vec(b.position), quaternion: vec(b.quaternion), world: Array.from(b.matrixWorld.elements) })),
    objects: ['list', 'pool', 'bombs', 'clouds', '_s3SubObjects', '_s3AllSpecialObjects'].map(key => [key, r.p[key]?.length]) };
}
function rig(f, id, terrain) {
  const { G, THREE } = f;
  G.scene = new THREE.Scene(); G.time = 0; G.actors = []; G.local = null; G.netm = null; G.camera = new THREE.PerspectiveCamera();
  G.camera.position.set(0, 5, -10);
  G.match = { state: 'playing', playing: () => true, canRespawn: () => false };
  // A genuine short platform supports the actor in cadence tests, but leaves
  // the forward projectile flight open. No native collision method is stubbed.
  const maxZ = terrain === 'support' ? .5 : 300;
  const boxes = [{ kind: 'box', min: [-100, -1, -100], max: [100, 0, maxZ] }];
  if (terrain === 'wall') boxes.push({ kind: 'box', min: [-100, 0, 3], max: [100, 30, 4] });
  G.level = new f.Level({ bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 300 },
    spawnPads: [[-90, 0, 0], [90, 0, 0]], spawnBarrier: 0, half: [], single: boxes });
  G.physics = new f.Physics(G.level); G.paint = { sample: () => 1, splat: () => { throw Error('preview cannot paint'); } };
  G.projectiles = new f.Projectiles(G.scene);
  class NativeCharacter extends f.Character { constructor(options) { super({ ...options, sourceMotion: false }); } }
  const a = new f.Actor({ team: 0, name: 'native guide contract', weapon: 'shooter', CharacterClass: NativeCharacter,
    style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  a.isLocal = true; a.character.actor = a; a.character.onEvent = null; G.actors.push(a); G.scene.add(a.character.root);
  a.weapon = { ...a.weapon, sub: id }; a.weaponRunner.reset(); a.pos.set(0, 0, 0); a.vel.set(0, 0, 0);
  a.grounded = true; a.ground.hit = true; a.ground.normal.set(0, 1, 0); a.intent.sub = true;
  a.aimYaw = a.yaw = a.aimPitch = a.pitch = 0; a.aimDir.set(0, 0, 1);
  for (let i = 0; i < 120; i++) { G.time += 1 / 60; a.weaponRunner.update(1 / 60, { sub: true }); a._finishFrame(1 / 60); }
  const oldWater = f.PLAYER.waterY; f.PLAYER.waterY = -10000;
  return { a, p: G.projectiles, close() { a.character.dispose(); G.projectiles.clear(); G.scene.clear(); f.PLAYER.waterY = oldWater; } };
}
function reference(r) {
  const points = [], p = r.p.s3PredictSubTrajectory(r.a,
    { maxTime: 12, activeOnly: true, anticipateRelease: true, points });
  assert.equal(p.points, points); assert.equal(p.simulationStep, 1 / 60);
  return p;
}
function chordError(points, indices) {
  let error = 0;
  for (let i = 1; i < indices.length; i++) {
    const a = points[indices[i - 1]], b = points[indices[i]], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const length2 = dx * dx + dy * dy + dz * dz;
    for (let j = indices[i - 1] + 1; j < indices[i]; j++) {
      const p = points[j], x = p.x - a.x, y = p.y - a.y, z = p.z - a.z;
      const t = length2 > 0 ? Math.max(0, Math.min(1, (x * dx + y * dy + z * dz) / length2)) : 0;
      error = Math.max(error, Math.hypot(x - t * dx, y - t * dy, z - t * dz));
    }
  }
  return error;
}

test('native64 guide interiors are ordered real-flight points and cannot shortcut a real wall/floor', async t => {
  const f = await api(), rows = [];
  for (const id of ['bomb', 'curling']) for (const terrain of ['floor', 'wall']) {
    const r = rig(f, id, terrain);
    try {
      const before = owned(r, f), p = reference(r), canonical = p.points.map(vec);
      assert.equal(p.complete, true, 'this actual native floor/wall fixture reaches an explosion');
      assert.equal(p.outcome, 'explosion');
      r.p.updateArc(r.a, true); assert.deepEqual(owned(r, f), before, 'drawing/prediction preserves native pose/clocks/projectiles');
      assert.equal(r.p._s3ThrowPrediction.complete, true, 'default production wrapper retains the independently confirmed native explosion');
      assert.equal(r.p._s3ThrowPrediction.outcome, 'explosion');
      assert.equal(r.p.arcRing.visible, true, 'a real floor/wall confirmed explosion gets the public marker');
      assert.notEqual(r.p._s3ThrowPrediction.points, p.points, 'independent API storage, not the guide cache as oracle');
      assert.ok(p.points.every((v, i) => v !== r.p._s3ThrowPrediction.points[i]), 'independent vector objects');
      const g = r.p.arcGeo, position = g.attributes.position, distance = g.attributes.lineDistance;
      assert.equal(position.count, 64, 'actual native Projectiles buffer capacity');
      assert.equal(g.drawRange.start, 0); assert.equal(g.drawRange.count, Math.min(64, p.points.length));
      const count = g.drawRange.count, indices = [], drawn = []; let previous = -1, length = 0;
      for (let i = 0; i < count; i++) {
        const value = [position.getX(i), position.getY(i), position.getZ(i)]; assert.ok(value.every(Number.isFinite));
        const matches = index => canonical[index].every((x, axis) => Math.fround(x) === value[axis]);
        const index = i === count - 1 ? p.points.length - 1 : i === 0 ? 0
          : canonical.findIndex((_v, j) => j > previous && j <= p.points.length - (count - i) && matches(j));
        assert.ok(index > previous && index < p.points.length && matches(index), 'strict increasing, in-range native point witness');
        indices.push(index); drawn.push(value); previous = index;
        if (i) {
          length += Math.hypot(...value.map((x, axis) => x - drawn[i - 1][axis]));
          const hit = new f.Hit();
          f.G.physics.segment(new f.THREE.Vector3(...drawn[i - 1]), new f.THREE.Vector3(...value), hit);
          assert.equal(hit.hit, false, 'actual float32 displayed chord stays outside the real wall/floor');
        }
        assert.equal(distance.getX(i), Math.fround(length), 'line-distance buffer follows its real float32 polyline');
      }
      const uniform = Array.from({ length: count }, (_, i) => Math.round(i * (p.points.length - 1) / (count - 1)));
      // This quality comparison is for these four native fixtures, not a claim
      // that the greedy algorithm is globally optimal for all possible paths.
      assert.ok(chordError(p.points, indices) <= chordError(p.points, uniform) + 1e-7,
        'these physical turns cannot collapse to worse geometry than the same-budget uniform samples');
      assert.deepEqual(drawn[0], vec(p.origin).map(Math.fround));
      assert.deepEqual(drawn.at(-1), vec(p.endpoint).map(Math.fround));
      if (terrain === 'wall') {
        const furthest = Math.max(...p.points.map(v => v.z));
        assert.ok(furthest < 3, 'native projectile center remains outside the solid wall');
        assert.equal(Math.max(...drawn.map(v => v[2])), Math.fround(furthest), 'compression retains the actual wall-facing turn');
      }
      // Replay a distinct, real native projectile through the same unmodified
      // Physics/Level. Its per-tick centers, not a second cached predictor,
      // independently witness every source point used by the 64-vertex guide.
      const bornBefore = new Set(r.p.bombs);
      f.G.paint.splat = () => 0; // observe flight/termination, not a paint render
      r.a.weaponRunner.update(p.simulationStep, { subReleased: true });
      for (let startup = 0; startup < 12 && !r.p.bombs.some(value => !bornBefore.has(value)); startup++) {
        r.a.weaponRunner.update(p.simulationStep, {});
        r.a._finishFrame(p.simulationStep);
      }
      const bomb = r.p.bombs.find(value => !bornBefore.has(value));
      assert.ok(bomb, 'actual native throw creates a distinct live bomb');
      assert.ok(bomb.pos.distanceTo(p.origin) < 1e-7, JSON.stringify({actual:vec(bomb.pos),forecast:vec(p.origin),id,terrain}));
      assert.ok(bomb.vel.distanceTo(p.velocity) < 1e-7);
      let burst = null;
      const explode = r.p._explodeBomb;
      r.p._explodeBomb = function(value) {
        if (value === bomb) burst = value.pos.clone();
        return explode.call(this, value);
      };
      try {
        for (let i = 1; i < p.points.length; i++) {
          f.G.time += p.simulationStep;
          r.p._updateBombs(p.simulationStep);
          assert.ok(bomb.pos.distanceTo(p.points[i]) < 1e-7,
            `native flight center at integration tick ${i} matches the independently drawn source point`);
          if (i < p.points.length - 1) assert.equal(burst, null, 'native release cannot terminate before the predicted end');
        }
        assert.ok(burst, 'native projectile actually reaches its explosion');
        assert.ok(burst.distanceTo(p.endpoint) < 1e-7);
        assert.ok(!r.p.bombs.includes(bomb), 'actual native terminal tick retires the projectile');
      } finally { r.p._explodeBomb = explode; }
      rows.push({ id, terrain, nativePoints: p.points.length, drawnVertices: count, nativeTime: p.time,
        adaptiveChordError: chordError(p.points, indices), uniformChordError: chordError(p.points, uniform) });
    } finally { r.close(); }
  }
  t.diagnostic(JSON.stringify(rows));
});

function countQueries(f) {
  let mode = null;
  const blank = () => ({ segment: 0, raycast: 0, level: {} });
  let values = blank();
  const restores = [];
  for (const name of ['segment', 'raycast']) {
    const original = f.G.physics[name];
    f.G.physics[name] = function(...args) { if (mode) values[name]++; return original.apply(this, args); };
    restores.push(() => { f.G.physics[name] = original; });
  }
  for (const name of ['queryBlocks', 'queryBlocksBand', 'queryBlocksAABB']) if (typeof f.G.level[name] === 'function') {
    const original = f.G.level[name];
    f.G.level[name] = function(...args) { if (mode) values.level[name] = (values.level[name] || 0) + 1; return original.apply(this, args); };
    restores.push(() => { f.G.level[name] = original; });
  }
  return { measure(fn) { values = blank(); mode = true; try { const result = fn(); return { result, queries: structuredClone(values) }; } finally { mode = null; } },
    restore() { for (const restore of restores) restore(); } };
}

test('native guide query cadence at30/60/120Hz matches independent real passes under the actual fixed clock', async t => {
  const f = await api(), rows = [];
  for (const id of ['bomb', 'curling']) for (const hz of [30, 60, 120]) for (const mode of ['stationary', 'walking', 'aim']) {
    const r = rig(f, id, 'support'), counter = countQueries(f);
    let forecastCalls = 0;
    const actualForecast = r.p.s3PredictThrowTrajectory;
    r.p.s3PredictThrowTrajectory = function(...args) { forecastCalls++; return actualForecast.apply(this, args); };
    try {
      const warm = counter.measure(() => r.p.updateArc(r.a, true)); assert.equal(forecastCalls, 1);
      const warmTime = f.G.time; let expectedTime = warmTime, actualTime = warmTime;
      const clock = new f.FixedClock(), dt = 1 / hz, refreshTimes = []; let totalQueries = 0, totalPasses = 0, maximumFrameQueries = 0;
      for (let frame = 0; frame < hz; frame++) {
        clock.advance(dt, step => {
          f.G.time += step;
          if (mode === 'walking') { r.a.vel.x = 4.32; r.a.pos.x += 4.32 * step; }
          if (mode === 'aim') r.a.aimYaw += 1.2 * step;
          r.a.yaw = r.a.aimYaw;
          r.a.weaponRunner.update(step, { sub: true }); r.a._finishFrame(step);
        });
        const before = owned(r, f), beforeCalls = forecastCalls, version = r.p.arcGeo.attributes.position.version;
        const actual = counter.measure(() => r.p.updateArc(r.a, true)), passes = forecastCalls - beforeCalls;
        assert.deepEqual(owned(r, f), before, 'only actual simulation ticks advance the native actor/pose/time');
        const expected = f.G.time - expectedTime >= THROW_PREVIEW_INTERVAL - 1e-9;
        assert.equal(passes, expected ? 1 : 0, 'continuous bounded input follows the declared30Hz clock, not a per-frame or stale-cache path');
        if (expected) expectedTime = f.G.time;
        if (!passes) {
          assert.equal(actual.queries.segment, 0); assert.equal(actual.queries.raycast, 0);
          assert.deepEqual(actual.queries.level, {}); assert.equal(r.p.arcGeo.attributes.position.version, version, 'cached frame does not re-upload vertices');
        } else {
          const independent = counter.measure(() => reference(r));
          assert.deepEqual(actual.queries, independent.queries, 'one real guide refresh performs exactly one independently measured native prediction pass');
          assert.notEqual(independent.result.points, r.p._s3ThrowPrediction.points);
          assert.ok(independent.result.time <= 12 + 1e-8);
          assert.equal(actual.queries.segment, Math.ceil(independent.result.time * 60 - 1e-8), 'native segment queries remain tied to real gameplay integration ticks');
          assert.ok(actual.queries.segment <= Math.ceil(12 / independent.result.simulationStep), 'finite existing horizon, not an unlimited query cap');
          assert.ok(f.G.time - actualTime >= THROW_PREVIEW_INTERVAL - 1e-9);
          actualTime = f.G.time; refreshTimes.push(actualTime); totalPasses++;
        }
        assert.ok(f.G.time - actualTime <= THROW_PREVIEW_INTERVAL + dt + 1e-9, 'current cached-guide age is bounded');
        totalQueries += actual.queries.segment; maximumFrameQueries = Math.max(maximumFrameQueries, actual.queries.segment);
      }
      assert.equal(totalPasses, 30, 'one warmed simulation second has30 actual native forecast passes');
      rows.push({ id, renderHz: hz, mode, warmupSegmentQueries: warm.queries.segment, measuredSeconds: f.G.time - warmTime,
        actualRefreshes: totalPasses, actualSegmentQueries: totalQueries, maximumQueriesPerRenderFrame: maximumFrameQueries,
        minimumRefreshInterval: Math.min(...refreshTimes.slice(1).map((time, i) => time - refreshTimes[i])) });
    } finally { counter.restore(); r.close(); }
  }
  // These are real query counts for these controlled inputs, not FPS, hardware
  // performance, or a claim that a different charge/key transition is throttled.
  t.diagnostic(JSON.stringify(rows));
});
