import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../splatoon3/runtime/special-vfx-kit.mjs', import.meta.url), 'utf8');
const start = source.indexOf('class RibbonPool {');
const end = source.indexOf('// Instanced shape pools', start);
assert.ok(start > -1 && end > start, 'extract real production RibbonPool');

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  normalize() {
    const len = Math.sqrt(this.lengthSq());
    if (len) { this.x /= len; this.y /= len; this.z /= len; }
    return this;
  }
  crossVectors(a, b) {
    const x = a.y * b.z - a.z * b.y;
    const y = a.z * b.x - a.x * b.z;
    const z = a.x * b.y - a.y * b.x;
    return this.set(x, y, z);
  }
}
class BufferAttribute {
  constructor(array, itemSize) {
    this.array = array; this.itemSize = itemSize; this.updates = 0;
  }
  setUsage() { return this; }
  clearUpdateRanges() {}
  addUpdateRange() { this.updates++; }
}
class BufferGeometry {
  constructor() { this.attributes = {}; }
  setAttribute(k, a) { this.attributes[k] = a; }
  setIndex(i) { this.indices = i; }
  setDrawRange(first, count) { this.drawRange = { first, count }; }
}
class Mesh {
  constructor(geometry, material) { this.geometry = geometry; this.material = material; }
}
const THREE = {
  Vector3, BufferAttribute, BufferGeometry, Mesh,
  ShaderMaterial: class { constructor(o) { Object.assign(this, o); } },
  DynamicDrawUsage: 1, DoubleSide: 2, NormalBlending: 3,
  CustomBlending: 4, OneFactor: 5, ZeroFactor: 6,
};
const RibbonPool = new Function('THREE', 'RIBBON_VERT', 'RIBBON_FRAG', 'vfxRandom',
  source.slice(start, end) + '\nreturn RibbonPool;'
)(THREE, '', '', () => 0.25);

const makePool = () => new RibbonPool(THREE, 2, 8, false, { value: 0 });

test('short ribbon writes all padded slots without recomputing visible normals or leaving stale alpha', () => {
  const p = makePool(), r = p.start({ life: 10, spacing: 0.1, alpha: 0.9 });
  p.push(r, 1, 1, 1, 0);
  p.push(r, 2, 1, 1, 0);
  p.update(0.1, { x: 4, y: 6, z: 8 });
  assert.equal(p.mesh.geometry.drawRange.count, 7 * 6);
  for (let k = 2; k < 8; k++) for (let side = 0; side < 2; side++) {
    const idx = k * 2 + side, tail = 2 + side;
    assert.deepStrictEqual(Array.from(p.pos.array.slice(idx * 3, idx * 3 + 3)),
      Array.from(p.pos.array.slice(tail * 3, tail * 3 + 3)));
    assert.deepStrictEqual(Array.from(p.side.array.slice(idx * 3, idx * 3 + 3)),
      Array.from(p.side.array.slice(tail * 3, tail * 3 + 3)));
    assert.deepStrictEqual(Array.from(p.face.array.slice(idx * 3, idx * 3 + 3)),
      Array.from(p.face.array.slice(tail * 3, tail * 3 + 3)));
    assert.equal(p.col.array[idx * 4 + 3], 0);
  }
  assert.ok(p.col.array[3] > 0, 'visible head alpha is preserved');
  assert.ok(p.col.array[7] > 0, 'visible tail alpha is preserved');
});

test('pool saturation marks evicted ribbons ended; retained stale handles cannot allocate', () => {
  const p = makePool();
  const old = p.start({}); p.push(old, 1, 0, 0, 0); p.push(old, 2, 0, 0, 0);
  const active = p.start({}); p.push(active, 1, 0, 0, 0);
  const newest = p.start({});
  assert.equal(old.ended, true);
  assert.equal(old.pts.length, 0);
  for (let i = 0; i < 1000; i++) p.push(old, 1 + i, 1, 1, i);
  assert.equal(old.pts.length, 0);
  assert.deepStrictEqual(p.list, [active, newest]);
});

test('empty RibbonPool retains one warm upload and reinitializes after clearing', () => {
  const p = makePool();
  p.update(0, { x: 0, y: 1, z: 4 });
  const attrs = [p.pos, p.col, p.rib, p.side, p.face];
  const first = attrs.map(a => a.updates);
  for (let i = 0; i < 100; i++) p.update(i + 1, { x: 0, y: 1, z: 4 });
  assert.deepStrictEqual(attrs.map(a => a.updates), first);
  const r = p.start({});
  p.push(r, 0, 0, 0, 0); p.push(r, 1, 0, 0, 0);
  p.update(0, { x: 0, y: 1, z: 4 });
  p.clear();
  p.update(1, { x: 0, y: 1, z: 4 });
  assert.equal(p.mesh.geometry.drawRange.count, 6);
  assert.equal(p.col.array[3], 0);
  assert.equal(r.ended, true);
  const after = attrs.map(a => a.updates);
  for (let i = 0; i < 100; i++) p.update(i + 2, { x: 0, y: 1, z: 4 });
  assert.deepStrictEqual(attrs.map(a => a.updates), after);
});


test('idle ShapePool preserves warmed instancing without 4 redundant uploads per frame', () => {
  const begin = source.indexOf('class ShapePool {');
  const finish = source.indexOf('// The kit attached to one FX instance', begin);
  assert.ok(begin > 0 && finish > begin);
  class InstancedBufferGeometry extends BufferGeometry {}
  class InstancedBufferAttribute extends BufferAttribute {}
  const STHREE = { ...THREE, InstancedBufferGeometry, InstancedBufferAttribute };
  const ShapePool = new Function('THREE', source.slice(begin, finish) + '\nreturn ShapePool;')(STHREE);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(12), 3));
  geo.dispose = () => {};
  const pool = new ShapePool(STHREE, 'idle-test', geo, 8,
    ['iA', 'iB', 'iCol', 'iPar'], '', '', false, { value: 0 });
  pool.update(1 / 60);
  assert.deepStrictEqual(pool.buf.map(a => a.updates), [1, 1, 1, 1]);
  for (let i = 0; i < 180; i++) pool.update(1 / 60);
  assert.deepStrictEqual(pool.buf.map(a => a.updates), [1, 1, 1, 1]);
  pool.add(10, new Float32Array(16));
  pool.update(1 / 60);
  assert.deepStrictEqual(pool.buf.map(a => a.updates), [2, 2, 2, 2]);
  pool.clear();
  pool.update(1 / 60);
  assert.deepStrictEqual(pool.buf.map(a => a.updates), [3, 3, 3, 3]);
  for (let i = 0; i < 60; i++) pool.update(1 / 60);
  assert.deepStrictEqual(pool.buf.map(a => a.updates), [3, 3, 3, 3]);
  assert.equal(pool.mesh.geometry.instanceCount, 1);
});
