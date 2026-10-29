import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { sphereTriangleEntry } from '../runtime/sphere-triangle-entry.mjs';
import { sweepNativeCatalogueSphere, sweepNativeLevelSphere } from '../runtime/native-projectile-sweep.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const code = adaptBuildSource('patches/native-stages/runtime/triangle-world.mjs',
  fs.readFileSync(new URL('../runtime/triangle-world.mjs', import.meta.url), 'utf8'));
const TriangleWorld = new Function('THREE', 'sphereTriangleEntry',
  code.replace(/^import .*;$/gm, '').replace(/^export /gm, '') + '\nreturn TriangleWorld;')(THREE, sphereTriangleEntry);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const flat = hit => ({ ...hit, point: hit.point.toArray(), normal: hit.normal.toArray() });

function level() {
  return { staticBlockCount: 1, blocks: [{}], data: { triangleFace: new Int32Array([0]) },
    faces: [{ origin: V(), u: V(0, 1, 0), v: V(0, 0, 1) }], blockForTriangle: () => 0,
    triangleWorld: new TriangleWorld({
      triangles: new Float32Array([0, 0, 0, 0, 2, 0, 0, 0, 2]), normals: new Float32Array([1, 0, 0]),
      nodes: new Float32Array([0, 0, 0, 0, 2, 2, -1, 1]), order: new Uint32Array([0]),
      flags: new Uint32Array([3]), objectIds: new Uint32Array([4]),
    }),
  };
}

for (const kind of ['level', 'catalogue']) test(kind + ' sweeps reuse distinct source/moving outputs and preserve nearest ties, UVs and misses', () => {
  const stage = level(), from = V(-2, .5, .5), to = V(2, .5, .5);
  const out = { point: V(), normal: V() }, sourceOuts = [], sourceOptions = [], movingOuts = [];
  const original = stage.triangleWorld.sweepSphere;
  stage.triangleWorld.sweepSphere = function (...args) {
    sourceOuts.push(args[4]);sourceOptions.push(args[3]);
    assert(args[4], 'native wrapper supplies an output');
    return original.apply(this, args);
  };
  let movingDistance = Infinity;
  const movingSweep = (...args) => {
    const scratch = args.at(-2); movingOuts.push(scratch);
    scratch.hit = Number.isFinite(movingDistance); scratch.dist = movingDistance;
    scratch.point.set(-.75, .3, .4); scratch.normal.set(-1, 0, 0);
    scratch.block = 1; scratch.face = 2; scratch.u = .3; scratch.v = .4;
    return scratch;
  };
  const sweep = (start = from, end = to, r0 = .2, r1 = r0, skip = true) => kind === 'level'
    ? sweepNativeLevelSphere(stage, start, end, r0, out, skip, movingSweep)
    : sweepNativeCatalogueSphere({ level: stage }, start, end, r0, r1, out, skip, movingSweep);
  const first = sweep(), expected = flat(first), sourceDistance = first.dist;
  assert.equal(first, out); assert.equal(first.triangle, 0); assert.equal(first.face, 0);
  assert.equal(first.u, .5); assert.equal(first.v, .5);
  const owned = original.call(stage.triangleWorld, from, to, .2), savedOwned = flat(owned);
  stage.blocks.push({});
  for (const distance of [sourceDistance - .25, sourceDistance, sourceDistance + .25]) {
    movingDistance = distance;
    const result = sweep();
    if (distance < sourceDistance) {
      assert.equal(result.triangle, -1); assert.equal(result.block, 1); assert.equal(result.face, 2);
      assert.equal(result.u, .3); assert.equal(result.v, .4); assert.equal(result.dist, distance);
    } else assert.deepEqual(flat(result), expected, 'source keeps exact tie precedence');
    assert.notEqual(sourceOuts.at(-1), movingOuts.at(-1), 'moving scratch cannot replace source contact');
    assert.notEqual(sourceOuts.at(-1).point, movingOuts.at(-1).point);
    assert.notEqual(sourceOuts.at(-1).normal, movingOuts.at(-1).normal);
  }
  movingDistance = Infinity;
  assert.equal(sweep(V(-2, 8, 8), V(2, 8, 8)).hit, false, 'stale source output does not turn a miss into a hit');
  assert.equal(out.triangle, -1); assert.equal(out.face, -1); assert.equal(out.block, -1);
  assert.equal(out.u, 0); assert.equal(out.v, 0);
  stage.triangleWorld.flags[0] = 7;
  assert.equal(sweep().hit, false); assert.equal(sweep(from, to, .2, .2, false).hit, true);
  if (kind === 'catalogue') {
    const growing = sweep(from, to, .1, .8, false);
    assert.equal(growing.hit, true); assert(Math.abs(growing.dist - 4 * 1.9 / 4.7) < 1e-10);
  }
  assert(sourceOptions.every(value => value === sourceOptions[0]), 'one options object is retained per wrapper and level');
  assert(sourceOuts.every(value => value === sourceOuts[0]), 'one source result is retained by this level');
  assert(movingOuts.every(value => value === movingOuts[0]), 'moving result identity stays stable');
  assert.deepEqual(flat(owned), savedOwned, 'public owned hit survives wrapper reuse');
  assert.deepEqual(from.toArray(), [-2, .5, .5]); assert.deepEqual(to.toArray(), [2, .5, .5]);
});

test('supplied sphere outputs require vectors only on a hit and invalid outputs leave traversal reusable', () => {
  const world = level().triangleWorld, from = V(-2, .5, .5), to = V(2, .5, .5);
  assert.equal(world.sweepSphere(V(-2, 8, 8), V(2, 8, 8), .2, {}, {}), null);
  assert.throws(() => world.sweepSphere(from, to, .2, {}, {}), TypeError);
  const owned = world.sweepSphere(from, to, .2), out = { point: V(), normal: V() };
  assert.deepEqual(flat(world.sweepSphere(from, to, .2, {}, out)), flat(owned));
  assert.equal(world._queryDepth, 0);
});
