import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { batchFixture, cpuFloor } from './batch03-fixture.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const raw = fs.readFileSync(ROOT + 'inkwave-public/src/world/paint.js', 'utf8');
const composed = adaptSource('src/world/paint.js', raw);
const shader = composed.match(/float wob\(float a, float s\) \{([\s\S]*?)\n\}/);
const nativeWobble = raw.match(/export function blobWobble\(ang, seed\) \{([\s\S]*?)\n\}/);
assert.ok(shader && nativeWobble, 'shared source blob edge exists');
const wobble = new Function('ang', 'seed', nativeWobble[1]);

function footprintArea(seed, bound, cell = 0.025) {
  let area = 0;
  for (let x = -1.5; x <= 1.5; x += cell)
    for (let y = -1.5; y <= 1.5; y += cell) {
      const edge = wobble(Math.atan2(y, x), seed);
      if (Math.hypot(x, y) <= (bound ? Math.min(1, edge) : edge)) area += cell * cell;
    }
  return area;
}

test('source WidthHalf bounds the GPU, CPU and ancillary ray origins as one contract', () => {
  assert.match(composed, /sd = length\(p\) - r \* grow \* min\(1\.0, wob\(atan\(p\.y, p\.x\), seed\)\);/);
  assert.match(composed, /float edge = r \* grow \* min\(1\.0, wob\(a, seed\)\);/);
  assert.match(composed, /Math\.min\(1, blobWobble\(Math\.atan2\(py, px\), seed\)\)/);
  const ownership = fs.readFileSync(ROOT + 'patches/splatoon3/runtime/paint-ownership.mjs', 'utf8');
  assert.match(ownership, /const bodyEdge = a => r \* bodyGrow \* Math\.min\(1, wobble\(a, seed\)\);/);
});

test('numeric floor area: all seeds use a bounded, smaller source-width body in world-unit squared', () => {
  // The old INKWAVE body expanded 10-30% past the input WidthHalf in places.
  // These are reconstruction-mask m², not Nintendo-hardware measurements.
  for (const seed of [0, 0.1, 0.37, 0.77]) {
    const before = footprintArea(seed, false), after = footprintArea(seed, true);
    assert.ok(after < before * 0.9, `seed=${seed}: before=${before} after=${after}`);
    assert.ok(after <= Math.PI + 0.04, `seed=${seed}: exceeded source radius envelope`);
    assert.ok(after >= Math.PI * 0.88, `seed=${seed}: overdamped interior silhouette`);
  }
});

test('no physical m² reward for wall-only or buried ink, without losing swim ownership', async () => {
  const f = await batchFixture();
  const wall = cpuFloor(f, 8, 0.25);
  wall.face.turf = false;
  assert.equal(wall.splat(new f.THREE.Vector3(0, 0.01, 0), 1, 0, { seed: 0.37 }), 0);
  assert.ok(wall.p.grid.some(Boolean), 'a painted wall remains sampled for climbing/recovery');
  assert.deepEqual(Array.from(wall.p.counts), [0, 0], 'wall cannot add score');
  const buried = cpuFloor(f, 8, 0.25);
  buried.p.dead.fill(1);
  assert.equal(buried.splat(new f.THREE.Vector3(0, 0.01, 0), 1, 1, { seed: 0.37 }), 0);
  assert.deepEqual(Array.from(buried.p.counts), [0, 0], 'buried cells cannot add score');
  const floor = cpuFloor(f, 8, 0.25);
  const credited = floor.splat(new f.THREE.Vector3(0, 0.01, 0), 1, 0, { seed: 0.37 });
  assert.ok(credited > 0 && credited < 4, 'live floor gets a finite measured area');
  assert.equal(credited, floor.p.counts[0] * floor.face.cu * floor.face.cv);
});

test('stationary held roller makes the initial floor mark; fast steps subdivide but cap work', async () => {
  const f = await batchFixture(), a = f.make('roller'), r = a.weaponRunner;
  a.isLocal = true; a.grounded = true; a.ink = 100; a.intent.fire = true;
  r.rolling = false; r.rollT = 0; r.flick = -1; r.cooldown = 0;
  r._roller(1 / 60, { fire: true }, a.weapon);
  assert.ok(f.paint.filter(e => e.opts.kind === 'roll').length >= 3, 'initial stationary mark');
  f.paint.length = 0;
  a.pos.z += 1.2; a.vel.z = 7.92; r.rollT = 1.5;
  r._roller(1 / 60, { fire: true }, a.weapon);
  const body = f.paint.filter(e => e.opts.kind === 'roll');
  assert.equal(body.length, 12, '1.2-unit movement subdivided into 4 by 3 body bands');
  const sorted = body.filter((e, i) => i % 3 === 1).map(e => e.point.z);
  assert.ok(sorted.every((z, i) => i === 0 || z > sorted[i - 1]), 'forward coverage ordered');
  assert.ok(body.length <= 18, 'per-frame upper bound protects paint CPU/GPU cost');
});

test('Turf-point adapter composes after Storm and Tidal Slam lock transforms', () => {
  const actorRaw = fs.readFileSync(ROOT + 'inkwave-public/src/game/actor.js', 'utf8');
  const actor = adaptSource('src/game/actor.js', actorRaw);
  const begin = actor.indexOf('  addTurf(area) {');
  const end = actor.indexOf('  addTurfNoSpecial(', begin);
  assert.ok(begin >= 0 && end > begin, 'both native Turf credit entry points exist');
  const turf = actor.slice(begin, end);
  assert.match(turf, /this\\.stats\\.turf \\+= points;/);
  assert.match(turf, /this\\.special \\+ points/);
  assert.match(turf, /!this\\.specialActive && !\\(this\\.stormGaugeLock > 0\\) && !this\\.s3TidalSlamGaugeFinish/);
});
