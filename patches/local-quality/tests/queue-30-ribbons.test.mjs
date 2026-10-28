import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { markAttributeRange } from '../../splatoon3/runtime/instance-color-upload.mjs';

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
    this.array = array; this.itemSize = itemSize; this.updates = 0; this.updateRanges = [];
  }
  setUsage() { return this; }
  clearUpdateRanges() { this.updateRanges.length = 0; }
  addUpdateRange(start, count) { this.updateRanges.push({ start, count }); }
  set needsUpdate(value) { if (value) this.updates++; }
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
  Vector3, BufferAttribute, BufferGeometry, Mesh, Sphere: class { constructor() { this.center = new Vector3(); this.radius = 0; } },
  ShaderMaterial: class { constructor(o) { Object.assign(this, o); } },
  DynamicDrawUsage: 1, DoubleSide: 2, NormalBlending: 3,
  CustomBlending: 4, OneFactor: 5, ZeroFactor: 6,
};
const RibbonPool = new Function('THREE', 'RIBBON_VERT', 'RIBBON_FRAG', 'vfxRandom', 'markAttributeRange',
  source.slice(start, end) + '\nreturn RibbonPool;'
)(THREE, '', '', () => 0.25, markAttributeRange);

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
  const ShapePool = new Function('THREE', 'markAttributeRange', source.slice(begin, finish) + '\nreturn ShapePool;')(STHREE, markAttributeRange);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(12), 3));
  geo.dispose = () => {};
  const pool = new ShapePool(STHREE, 'idle-test', geo, 8,
    ['iA', 'iB', 'iCol', 'iPar'], '', '', false, { value: 0 });
  pool.update(1 / 60);
  assert.deepStrictEqual(pool.buf.map(a => a.updates), [0, 0, 0, 0]);
  for (let i = 0; i < 180; i++) pool.update(1 / 60);
  assert.deepStrictEqual(pool.buf.map(a => a.updates), [0, 0, 0, 0]);
  pool.add(10, new Float32Array(16).fill(.5));
  pool.update(1 / 60);
  assert.deepStrictEqual(pool.buf.map(a => a.updates), [1, 1, 1, 1]);
  pool.clear();
  pool.update(1 / 60);
  assert.deepStrictEqual(pool.buf.map(a => a.updates), [1, 1, 1, 1]);
  for (let i = 0; i < 60; i++) pool.update(1 / 60);
  assert.deepStrictEqual(pool.buf.map(a => a.updates), [1, 1, 1, 1]);
  assert.equal(pool.mesh.geometry.instanceCount, 1);
});

// Triple Inkstrike carrier retirement: real canonical Three, actual director
// methods and actual SpecialVfxKit pools. CPU evidence, not renderer/pixel parity.
import * as CanonicalThree from '../../../inkwave-public/vendor/three/build/three.module.js';
import { parse } from '../../loading-cache/vendor/acorn.mjs';
import { consumeVfxPeriod } from '../../splatoon3/runtime/nonwail-vfx-clock.mjs';

const directorSource = readFileSync(new URL('../../splatoon3/runtime/special-vfx.mjs', import.meta.url), 'utf8');
const directorAst = parse(directorSource, { ecmaVersion: 'latest', sourceType: 'module' });
const directorClass = directorAst.body.find(n => n.type === 'ClassDeclaration' && n.id.name === 'Director');
const directorDefs = directorAst.body.find(n => n.type === 'VariableDeclaration' && n.declarations[0].id.name === 'DIRECTORS').declarations[0].init;
const inkstrikeEntry = directorDefs.properties.find(n => n.key.name === 'tripleInkstrike').value;
const helperNames = ['TAU', 'clamp', 'clamp01', 'smooth', 'easeOut', 'rnd', 'sgn'];
const helperNodes = directorAst.body.filter(n => n.type === 'VariableDeclaration' && helperNames.includes(n.declarations[0].id.name));
assert.equal(helperNodes.length, helperNames.length, 'extract all actual production helper declarations');
const helperSource = helperNodes.map(n => directorSource.slice(n.start, n.end)).join('\n');
let inkstrikeFixtureId = 0;

async function inkstrikeFixture({ withoutRetirement = false } = {}) {
  // A fresh module instance resets the real presentation RNG for exact parity.
  const kitUrl = new URL('../../splatoon3/runtime/special-vfx-kit.mjs', import.meta.url);
  kitUrl.searchParams.set('inkstrike-regression', String(++inkstrikeFixtureId));
  const module = await import(kitUrl.href);
  const bindings = { ...module, consumeVfxPeriod };
  let entrySource = directorSource.slice(inkstrikeEntry.start, inkstrikeEntry.end);
  if (withoutRetirement) { const attachment = 'carrier.onEnd = () => this.kit.glowRibbons.end(rib);'; assert.equal(entrySource.split(attachment).length - 1, 1, 'control removes exactly one retirement attachment'); entrySource = entrySource.replace(attachment, ''); }
  const definition = new Function(...Object.keys(bindings), helperSource + '\nreturn (' + entrySource + ');')(...Object.values(bindings));
  bindings.DIRECTORS = { tripleInkstrike: definition };
  const methods = {};
  for (const name of ['shell', 'ribbon', 'pushRibbon', 'hdr', 'endTrack', 'call']) {
    const node = directorClass.body.body.find(n => n.key.name === name);
    assert.ok(node, `extract actual Director.${name}`);
    methods[name] = new Function(...Object.keys(bindings), helperSource + '\nreturn ({' + directorSource.slice(node.start, node.end) + '})[' + JSON.stringify(name) + '];')(...Object.values(bindings));
  }
  const kit = new module.SpecialVfxKit(CanonicalThree, new CanonicalThree.Group());
  const self = { ...methods, kit, errors: 0, v: Array.from({ length: 8 }, () => new CanonicalThree.Vector3()) };
  const actor = { pos: new CanonicalThree.Vector3(2, 1, -3) };
  const track = { id: 'tripleInkstrike', d: {}, color: [1, .2, .1] };
  definition.frame.call(self, actor, track, .1);
  assert.equal(kit.shells.recs.length, 1);
  assert.equal(kit.glowRibbons.list.length, 1);
  const carrier = kit.shells.recs[0], ribbon = kit.glowRibbons.list[0];
  const camera = { position: new CanonicalThree.Vector3(2, 3, 4) };
  return { kit, self, actor, track, carrier, ribbon, module, step: dt => kit.update(dt, camera) };
}

function assertInkstrikeIdle(f) {
  assert.equal(f.carrier.retired, true);
  assert.equal(f.kit.shells.recs.includes(f.carrier), false);
  assert.equal(f.ribbon.ended, true);
  assert.equal(f.kit.glowRibbons.list.includes(f.ribbon), false);
  assert.equal(f.kit.glowRibbons._drawCount, 0);
  assert.equal(f.kit.glowRibbons._emptyUploaded, true);
  const attrs = ['pos', 'col', 'rib', 'side', 'face'].map(k => f.kit.glowRibbons[k]);
  const versions = attrs.map(a => a.version);
  for (let i = 0; i < 20; i++) f.step(.1);
  assert.deepStrictEqual(attrs.map(a => a.version), versions, 'retired empty ribbons must not mark idle attributes for upload');
}

for (const dt of [1 / 120, .1, .5]) {
  test(`Triple Inkstrike retires its ribbon at kit dt=${dt} without idle uploads`, async () => {
    const f = await inkstrikeFixture();
    try {
      for (let i = 0; i < Math.ceil(1.2 / dt); i++) f.step(dt);
      assertInkstrikeIdle(f);
    } finally { f.kit.dispose(); }
  });
}

for (const reason of ['capacity', 'dead', 'follow-false', 'shell-clear', 'kit-clear', 'dispose']) {
  test(`Triple Inkstrike ends its ribbon when its carrier retires by ${reason}`, async () => {
    const f = await inkstrikeFixture();
    try {
      f.step(.1); f.step(.1);
      let finishes = 0;
      const finish = f.carrier.onEnd;
      f.carrier.onEnd = () => { finishes++; finish?.(); };
      if (reason === 'capacity') {
        for (let i = 0; i < f.kit.shells.cap; i++) f.kit.shells.add(.01, new Float32Array(16));
      } else if (reason === 'dead') f.carrier.dead = true;
      else if (reason === 'follow-false') f.carrier.follow = () => false;
      else if (reason === 'shell-clear') f.kit.shells.clear();
      else if (reason === 'kit-clear') f.kit.clear();
      else f.kit.dispose();
      f.step(.1);
      assert.equal(f.ribbon.ended, true, 'carrier retirement ends ribbon before tail ages out');
      assert.equal(finishes, 1);
      assert.equal(f.carrier.onEnd, null);
      f.kit.shells.clear();
      f.kit.glowRibbons.end(f.ribbon); f.kit.glowRibbons.end(f.ribbon);
      for (let i = 0; i < 10; i++) f.step(.1);
      assert.equal(finishes, 1, 'repeat retirement/clear/end is idempotent');
      assertInkstrikeIdle(f);
    } finally { f.kit.dispose(); }
  });
}

test('Triple Inkstrike cancellation preserves transient carriers and still retires them at expiry', async () => {
  const f = await inkstrikeFixture();
  try {
    f.step(.1);
    f.self.endTrack(f.actor, f.track);
    assert.equal(f.carrier.dead, false, 'do not add new cancellation ownership');
    assert.equal(f.ribbon.ended, false);
    assert.deepStrictEqual(f.track.d, {});
    for (let i = 0; i < 12; i++) f.step(.1);
    assertInkstrikeIdle(f);
  } finally { f.kit.dispose(); }
});

function inkstrikeSnapshot(f) {
  const pool = f.kit.glowRibbons;
  return {
    carrier: Array.from(f.carrier.v), time: f.carrier.t,
    options: f.ribbon.o, points: f.ribbon.pts.map(p => [...p]),
    count: f.ribbon.count, ended: f.ribbon.ended,
    attributes: ['pos', 'col', 'rib', 'side', 'face'].map(k => Array.from(pool[k].array)),
    drawRange: { ...pool.mesh.geometry.drawRange }, drawCount: pool._drawCount,
  };
}

for (const dt of [1 / 120, .1]) {
  test(`Triple Inkstrike pre-expiry geometry, points and RNG are unchanged at dt=${dt}`, async () => {
    const fixed = await inkstrikeFixture(), control = await inkstrikeFixture({ withoutRetirement: true });
    try {
      for (let i = 0; i < Math.round(.4 / dt); i++) {
        fixed.step(dt); control.step(dt);
        assert.deepStrictEqual(inkstrikeSnapshot(fixed), inkstrikeSnapshot(control));
      }
      assert.equal(fixed.module.vfxRandom(), control.module.vfxRandom(), 'retirement attachment consumes no RNG');
    } finally { fixed.kit.dispose(); control.kit.dispose(); }
  });
}
