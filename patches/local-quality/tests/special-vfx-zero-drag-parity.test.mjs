import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { markAttributeRange } from '../../splatoon3/runtime/instance-color-upload.mjs';

const file = new URL('../../splatoon3/runtime/special-vfx-kit.mjs', import.meta.url);
const source = readFileSync(file, 'utf8');
const start = source.indexOf('class SpritePool {');
const end = source.indexOf('// Ribbon trails', start);
assert.ok(start >= 0 && end > start, 'Use the actual production SpritePool implementation');
const spriteClass = source.slice(start, end);

class Geometry {
  setAttribute() { return this; }
  setIndex() { return this; }
}
class Attribute {
  constructor(array) { this.array = array; this.needsUpdate = false; this.updateRanges=[]; }
  setUsage() { return this; }
  clearUpdateRanges() {this.updateRanges.length=0;}
  addUpdateRange(start,count) {this.updateRanges.push({start,count});}
}
class Mesh {
  constructor(geometry, material) { this.geometry = geometry; this.material = material; }
}
const THREE = {
  InstancedBufferGeometry: Geometry,
  InstancedBufferAttribute: Attribute,
  BufferAttribute: Attribute,
  ShaderMaterial: class { constructor(o) { Object.assign(this, o); } },
  Mesh, DynamicDrawUsage: 35048, CustomBlending: 5, NormalBlending: 1,
  OneFactor: 1, ZeroFactor: 0,
};

function makePool(expCalls) {
  const spyMath = Object.create(Math);
  spyMath.exp = (x) => { expCalls.push(x); return Math.exp(x); };
  const SpritePool = new Function(
    'THREE', 'SPRITE_VERT', 'SPARK_FRAG', 'PUFF_FRAG', 'vfxRandom', 'TAU', 'Math', 'markAttributeRange',
    spriteClass + '\nreturn SpritePool;'
  )(THREE, '', '', '', () => 0.125, 2 * Math.PI, spyMath, markAttributeRange);
  return new SpritePool(THREE, 1, false, { value: 0 });
}

function oldUpdate(state, dt) {
  const p = Float32Array.from(state);
  p[6] += dt;
  if (p[6] >= p[7]) return { p, n: 0 };
  const drag = Math.exp(-p[10] * dt);
  p[3] *= drag;
  p[5] *= drag;
  p[4] = p[4] * drag - p[11] * dt + p[22] * dt;
  p[0] += p[3] * dt;
  p[1] += p[4] * dt;
  p[2] += p[5] * dt;
  p[17] += p[18] * dt;
  return { p, n: 1 };
}

test('production SpritePool preserves the old Float32 state for zero/nonzero drag and finite/nonfinite dt', () => {
  const dragCases = [0, -0, 0.25, 1.5, Number.NaN, Number.POSITIVE_INFINITY];
  const dtCases = [0, -0, 1/30, 1/60, 1/120, -0.01, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const drag of dragCases) for (const dt of dtCases) {
    const calls = [];
    const pool = makePool(calls);
    pool.spawn(1, 2, 3, 4, 5, 6, 3, 0.1, 0.2, 1, 0.5, 0.2, 0.8, 0,
      { drag, grav: 0.75, buoy: 0.2, rot: 0.4, seed: 0.3, spin: 0.05 });
    const old = oldUpdate(pool.p, dt);
    pool.update(dt);
    assert.equal(pool.n, old.n, `count drag=${drag} dt=${dt}`);
    assert.deepStrictEqual(pool.p, old.p, `state drag=${drag} dt=${dt}`);
    const active = old.n === 1;
    const shouldExp = active && !(pool.p[10] === 0 && Number.isFinite(dt));
    assert.equal(calls.length, Number(shouldExp), `exp calls drag=${drag} dt=${dt}`);
  }
});

test('zero-drag repeated finite ticks keep all renderer attributes and object identity stable', () => {
  const calls = [];
  const pool = makePool(calls);
  pool.spawn(1, 2, 3, 2, 3, 4, 10, 0.15, 0.2, 1, 1, 1, 1, 0,
    { drag: 0, grav: 0.3, buoy: 0.1, rot: 0, seed: 0.5 });
  let expected = Float32Array.from(pool.p);
  const attrs = [pool.aPos, pool.aDir, pool.aCol, pool.aPar];
  for (let frame = 0; frame < 300; frame++) {
    expected = oldUpdate(expected, 1/60).p;
    pool.update(1/60);
    assert.deepStrictEqual(pool.p, expected);
    assert.equal(pool.mesh.geometry.instanceCount, 2);
  }
  assert.equal(calls.length, 0);
  assert.deepStrictEqual([pool.aPos, pool.aDir, pool.aCol, pool.aPar], attrs);
});


test('idle SpritePool uploads its warm buffer once and re-uploads on active-to-idle transition', () => {
  const calls = [];
  const pool = makePool(calls);
  const updateCounts = [pool.aPos, pool.aDir, pool.aCol, pool.aPar].map(a => {
    const tracker = { count: 0 };
    a.addUpdateRange = () => { tracker.count++; };
    return tracker;
  });
  pool.update(1 / 60);
  assert.deepStrictEqual(updateCounts.map(x => x.count), [1, 0, 1, 1]);
  for (let frame = 0; frame < 60; frame++) pool.update(1 / 60);
  assert.deepStrictEqual(updateCounts.map(x => x.count), [1, 0, 1, 1]);
  pool.spawn(1, 2, 3, 0, 0, 0, 2, 0.1, 0.1, 1, 1, 1, 1, 0, { drag: 0 });
  pool.update(1 / 60);
  assert.deepStrictEqual(updateCounts.map(x => x.count), [2, 0, 2, 2]);
  pool.clear();
  pool.update(1 / 60);
  assert.deepStrictEqual(updateCounts.map(x => x.count), [3, 0, 3, 3]);
  for (let frame = 0; frame < 60; frame++) pool.update(1 / 60);
  assert.deepStrictEqual(updateCounts.map(x => x.count), [3, 0, 3, 3]);
  assert.equal(pool.mesh.geometry.instanceCount, 1);
});

test('SpritePool uploads changed direction and retains its pending range until renderer consumption',()=>{
 const pool=makePool([]);pool.spawn(0,0,0,2,3,4,2,.1,.1,1,1,1,1,0,{drag:0,stretch:1});pool.update(1/60);
 assert.deepEqual(pool.aDir.updateRanges,[{start:4,count:4}]);const pending=pool.aDir.updateRanges[0];pool.update(1/60);
 assert.equal(pool.aDir.updateRanges[0],pending);pool.aDir.clearUpdateRanges();pool.aDir.needsUpdate=false;pool.update(1/60);
 assert.equal(pool.aDir.updateRanges.length,0);assert.equal(pool.aDir.needsUpdate,false);
 pool.clear();pool.spawn(0,0,0,0,0,0,2,.1,.1,1,1,1,1,0,{drag:0});pool.update(1/60);
 assert.deepEqual(Array.from(pool.aDir.array.slice(4,8)),[0,0,0,0]);assert.deepEqual(pool.aDir.updateRanges,[{start:4,count:4}]);
});
