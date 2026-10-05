import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { loadNative } from './prop-retention-fixture.mjs';
const fixed = await loadNative(true), raw = await loadNative(false);
const placements = fixed.dressingFor('halyard');
const parts = kit => [...kit._buckets.values()].reduce((n, a) => n + a.length, 0);
const anim = kit => [kit._spin.length, kit._blink.length, kit._flags.length, kit._banners.length];
const hash = array => crypto.createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
const meshState = kit => [...kit._meshes, ...kit._inst].map(m => ({
  name: m.name, count: m.count ?? 1, material: m.material.type,
  attributes: Object.fromEntries(Object.entries(m.geometry.attributes).map(([k, a]) => [k, hash(a.array)])),
  index: m.geometry.index && hash(m.geometry.index.array),
}));
function make(N, list = placements) {
  const kit = new N.PropKit(new N.THREE.Scene(), { quality: 'high', castShadow: true });
  const cols = list.flatMap(p => kit.add(p.type, p).colliders);return { kit, cols };
}
test('actual Halyard final geometry, colliders and live animation match raw, static sources are released', () => {
  const a = make(raw), b = make(fixed);
  const refs = [...b.kit._buckets.values()].flat().map(p => p.g);
  const disposed = new Set();for (const g of new Set(refs)) g.addEventListener('dispose', () => disposed.add(g));
  a.kit.build();b.kit.build();
  assert.ok(parts(a.kit) > 12000);assert.equal(parts(b.kit), 0);
  assert.deepEqual(meshState(b.kit), meshState(a.kit));assert.deepEqual(b.cols, a.cols);
  assert.deepEqual(b.kit.stats(), a.kit.stats());assert.deepEqual(anim(b.kit), anim(a.kit));
  assert.equal(disposed.size, 0);b.kit.update(1 / 60, 1);a.kit.update(1 / 60, 1);
  assert.deepEqual(b.kit._inst.map(m => hash(m.instanceMatrix.array)), a.kit._inst.map(m => hash(m.instanceMatrix.array)));
  a.kit.dispose();b.kit.dispose();assert.equal(disposed.size, 0);
});
test('same-instance rebuild and add-after-build retain exact instance counts, triangles and animation', () => {
  const { kit } = make(fixed);kit.build();
  const before = meshState(kit), stats = kit.stats(), animations = anim(kit);
  for (let i = 0; i < 3; i++) {
    kit.build();assert.equal(parts(kit), 0);assert.deepEqual(meshState(kit), before);
    assert.deepEqual(kit.stats(), stats);assert.deepEqual(anim(kit), animations);kit.update(1 / 60, i + 2);
  }
  const added = { ...placements[0], pos: [150, 0, 150] };kit.add(added.type, added);kit.build();
  const expected = make(fixed, [...placements, added]).kit;expected.build();
  assert.deepEqual(meshState(kit), meshState(expected));assert.deepEqual(kit.stats(), expected.stats());assert.deepEqual(anim(kit), anim(expected));
  kit.dispose();expected.dispose();
});
test('clear/rematch rebuild has bounded placement and animation records; headless accounting stays available', () => {
  const { kit } = make(fixed);kit.build();const stats = kit.stats(), animations = anim(kit);
  for (let i = 0; i < 3; i++) {
    kit.clear();assert.equal(kit._placements.length, 0);
    for (const p of placements) kit.add(p.type, p);kit.build();
    assert.equal(parts(kit), 0);assert.equal(kit._placements.length, placements.length);
    assert.deepEqual(kit.stats(), stats);assert.deepEqual(anim(kit), animations);
  }
  kit.dispose();const headless = new fixed.PropKit(null, { headless: true });
  headless.add(placements[0].type, placements[0]);const tris = headless.stats().triangles;
  headless.build();assert.equal(headless.stats().triangles, tris);assert.ok(parts(headless) > 0);headless.dispose();
});

test('pending PR183 Practice dressing remains isolated and banner instances survive repeated build', async () => {
  const { PLACEMENTS } = await import('./fixtures/pr183/props.mjs');
  const practiceFixed = await loadNative(true, true), practiceRaw = await loadNative(false, true);
  const a = make(practiceRaw, PLACEMENTS), b = make(practiceFixed, PLACEMENTS);
  a.kit.build();b.kit.build();assert.equal(parts(b.kit), 0);
  assert.deepEqual(meshState(b.kit), meshState(a.kit));assert.deepEqual(b.cols, a.cols);assert.deepEqual(b.kit.stats(), a.kit.stats());
  b.kit.build();assert.deepEqual(b.kit.stats(), a.kit.stats());a.kit.dispose();b.kit.dispose();
  const banner = make(fixed, [{ type: 'banner', pos: [0, 0, 0], team: 1 }]).kit;banner.build();
  const state = meshState(banner), stats = banner.stats();assert.equal(banner._banners.length, 1);
  banner.build();assert.deepEqual(meshState(banner), state);assert.deepEqual(banner.stats(), stats);assert.equal(banner._banners.length, 1);
  banner.update(1 / 60, 3);banner.dispose();
});
