import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const publicRoot = path.join(root, 'inkwave-public');
const context = vm.createContext({ console }), cache = new Map();
function load(file) {
  if (file.startsWith(path.join(root, 'src') + path.sep)) file = path.join(publicRoot, path.relative(root, file));
  if (cache.has(file)) return cache.get(file);
  const m = new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file }); cache.set(file, m); return m;
}
const entry = new vm.SourceTextModule(`export * as THREE from 'three'; export {Level} from './src/world/level.js'; export * from './src/world/stages/map3-art.js'; export * from './src/world/stages/map3-layout.js';`, { context, identifier: path.join(publicRoot, 'map3-art-entry.js') });
await entry.link((specifier, importer) => load(specifier === 'three' ? path.join(publicRoot, 'vendor/three/build/three.module.js') : specifier.startsWith('three/addons/') ? path.join(publicRoot, 'vendor/three/jsm', specifier.slice('three/addons/'.length)) : path.resolve(path.dirname(importer.identifier), specifier).replace('/inkwave-public/patches/', '/patches/')));
await entry.evaluate();
const { THREE, Level, MAP3_LAYOUTS, MAP3_ART_SKIN_EPSILON, createMap3Art, map3ArtColliders } = entry.namespace;
const tolerance = MAP3_ART_SKIN_EPSILON + 2e-5;
function inside(record, min, max) {
  for (let axis = 0; axis < 3; axis++) {
    assert.ok(record.min[axis] >= min[axis] - tolerance, `${record.id}: min axis ${axis}: ${record.min[axis]} < ${min[axis]}`);
    assert.ok(record.max[axis] <= max[axis] + tolerance, `${record.id}: max axis ${axis}: ${record.max[axis]} > ${max[axis]}`);
  }
}
for (const id of ['tidewater', 'kelpline']) {
  test(`${id}: every structural skin stays within a real volume, exterior art stays beyond arena`, () => {
    const layout = MAP3_LAYOUTS[id], snapshot = JSON.stringify(layout), scene = new THREE.Scene();
    const art = createMap3Art(scene, { layout });
    assert.equal(JSON.stringify(layout), snapshot, 'dressing must not change terrain/colliders');
    for (const r of art.group.userData.map3Art.records) {
      if (r.constraint === 'exterior') {
        assert.ok(r.max[0] < layout.bounds.minX - 0.5 || r.min[0] > layout.bounds.maxX + 0.5, `${r.id}: exterior geometry entered playable bounds`);
      } else if (r.constraint === 'obstacle-skin') {
        const o = layout.map3.obstacles.find(o => o.id === r.id); assert.ok(o, r.id);
        inside(r, [o.rect[0], o.y0, o.rect[2]], [o.rect[1], o.y1, o.rect[3]]);
      } else if (r.constraint === 'floor-skin') {
        const f = layout.map3.floors.find(f => f.id === r.id); assert.ok(f, r.id);
        inside(r, [f.rect[0], f.bottom, f.rect[2]], [f.rect[1], f.y, f.rect[3]]);
      } else {
        const c = map3ArtColliders(layout).find(c => c.map3ArtSupport === r.id); assert.ok(c, r.id); inside(r, c.min, c.max);
      }
    }
    assert.ok(art.stats.draws <= 8, `material batching budget: ${art.stats.draws}`);
    assert.ok(art.stats.triangles < 150000, `triangle budget: ${art.stats.triangles}`);
    const dressed = new Set(art.group.userData.map3Art.records.filter(r => r.constraint === 'obstacle-skin').map(r => r.id));
    assert.equal(dressed.size, layout.map3.obstacles.length, 'every gameplay cover must receive its authored skin');
    for (const mesh of art.group.children) {
      assert.ok(mesh.geometry.boundingSphere.radius > 0);
      for (const key of ['position', 'normal', 'uv', 'color']) for (const value of mesh.geometry.attributes[key].array) assert.ok(Number.isFinite(value), `${mesh.name}: finite ${key}`);
    }
    art.dispose(); assert.equal(scene.children.length, 0); art.dispose();
  });
  test(`${id}: supports never overlap lower floors or route bodies`, () => {
    const layout = MAP3_LAYOUTS[id], supports = map3ArtColliders(layout);
    assert.equal(supports.filter(c => !c.map3ArtKind).length, id === 'tidewater' ? 4 : 0);
    assert.ok(supports.some(c => c.map3ArtKind), 'recognizable cover assemblies need real colliders');
    for (const c of supports) {
      if (c.map3ArtKind) {
        const owner = layout.map3.obstacles.find(o => o.id === c.map3ArtOwner) || layout.map3.floors.find(f => f.id === c.map3ArtOwner); assert.ok(owner);
        assert.ok(c.min[0] >= owner.rect[0] - tolerance && c.max[0] <= owner.rect[1] + tolerance && c.min[2] >= owner.rect[2] - tolerance && c.max[2] <= owner.rect[3] + tolerance, `${c.map3ArtSupport}: new footprint escaped its owning solid`);
        assert.ok(c.min[1] >= (owner.y1 ?? owner.y) - tolerance, 'new art must sit above its owning solid');
        if (c.obox && c.map3ArtKind === 'terminal-portal') assert.ok(c.min[1] >= 11.6, 'central portal crossmembers must clear deck by at least 8 WU');
      }
      for (const f of c.map3ArtKind ? [] : layout.map3.floors) {
        const overlapsXZ = c.min[0] < f.rect[1] && c.max[0] > f.rect[0] && c.min[2] < f.rect[3] && c.max[2] > f.rect[2];
        assert.ok(!overlapsXZ || f.y >= c.max[1] - 1e-8, `${c.map3ArtSupport} obstructs ${f.id}`);
      }
      for (const ramp of c.map3ArtKind ? [] : layout.map3.ramps) {
        const overlapsXZ = c.min[0] < ramp.rect[1] && c.max[0] > ramp.rect[0] && c.min[2] < ramp.rect[3] && c.max[2] > ramp.rect[2];
        assert.ok(!overlapsXZ || Math.min(ramp.y0, ramp.y1) >= c.max[1] - 1e-8, `${c.map3ArtSupport} obstructs ramp ${ramp.id}`);
      }
      for (const route of layout.map3.routes) for (let i = 1; i < route.points.length; i++) {
        const a = route.points[i - 1], end = route.points[i];
        const count = Math.max(1, Math.ceil(Math.hypot(...end.map((v, k) => v - a[k])) / 0.25));
        for (let j = 0; j <= count; j++) {
          const p = a.map((v, k) => v + (end[k] - v) * j / count);
          const horizontalGap = Math.hypot(Math.max(c.min[0] - p[0], 0, p[0] - c.max[0]), Math.max(c.min[2] - p[2], 0, p[2] - c.max[2]));
          assert.ok(horizontalGap >= 0.675 || p[1] >= c.max[1] - 1e-8 || p[1] + 1.6 <= c.min[1], `${c.map3ArtSupport} obstructs route ${route.id}`);
        }
      }
    }
  });
}
test('material textures are shared by live stages and are released once after last dispose', () => {
  const scene = new THREE.Scene(), a = createMap3Art(scene, { layout: MAP3_LAYOUTS.tidewater }), b = createMap3Art(scene, { layout: MAP3_LAYOUTS.kelpline });
  const texture = a.group.children.find(m => m.material.map?.name === 'map3-stone-micrograin').material.map;
  assert.equal(texture, b.group.children.find(m => m.material.map?.name === texture.name).material.map);
  let disposed = 0; texture.addEventListener('dispose', () => disposed++);
  a.dispose(); assert.equal(disposed, 0); b.dispose(); assert.equal(disposed, 1);
});
test('unrelated stages receive neither colliders nor a visual root', () => {
  const scene = new THREE.Scene(); assert.equal(createMap3Art(scene, { layout: { id: 'halyard' } }), null);
  assert.equal(map3ArtColliders({ id: 'halyard' }).length, 0); assert.equal(scene.children.length, 0);
});

for (const id of ['tidewater', 'kelpline']) test(`${id}: every art collider has a 180-degree counterpart with the same roof/rail behavior`, () => {
  const colliders = map3ArtColliders(MAP3_LAYOUTS[id]);
  const key = c => JSON.stringify([...c.min, ...c.max].map(v => Math.round(v * 1000000) / 1000000).concat([!!c.roof, !!c.rail, !!c.obox], c.obox ? [...c.size.map(v => Math.round(v * 1000000) / 1000000), Math.round(((c.rotY % 180 + 180) % 180) * 1000000) / 1000000] : []));
  const counts = new Map();
  for (const c of colliders) { const k = key(c); counts.set(k, (counts.get(k) || 0) + 1); }
  const rotated = new Map();
  for (const c of colliders) {
    const k = key({ min: [-c.max[0], c.min[1], -c.max[2]], max: [-c.min[0], c.max[1], -c.min[2]], roof: c.roof, rail: c.rail, obox: c.obox, size: c.size, rotY: c.rotY == null ? undefined : c.rotY + 180 });
    rotated.set(k, (rotated.get(k) || 0) + 1);
  }
  assert.deepEqual(rotated, counts, 'asymmetric art collision must not create unequal cover height or route clearance');
});

test('baked AO agrees with real face layout, every hidden art collider and exact PNG bytes', () => {
  for (const id of ['tidewater', 'kelpline']) {
    const layout = MAP3_LAYOUTS[id], level = new Level(layout, map3ArtColliders(layout));
    const meta = JSON.parse(fs.readFileSync(path.join(publicRoot, 'assets/lightmaps', `${id}.json`), 'utf8'));
    const png = fs.readFileSync(path.join(publicRoot, 'assets/lightmaps', `${id}.png`));
    assert.ok(level.layoutLightmap(meta.ppm, meta.size));
    assert.equal(meta.hash, level.layoutHash, `${id}: stale face atlas`);
    const digest = crypto.createHash('sha256').update(JSON.stringify(level.blocks.map(b => [b.center.toArray(), b.half.toArray(), b.axes.map(a => a.toArray()), b.solid, b.grate]))).digest('hex');
    assert.equal(meta.colliderHash, digest, `${id}: stale hidden structural/cover collider bake`);
    assert.equal(meta.pngSha256, crypto.createHash('sha256').update(png).digest('hex'));
    assert.equal(png.readUInt32BE(16), meta.size); assert.equal(png.readUInt32BE(20), meta.size);
    assert.equal(meta.structuralColliders, map3ArtColliders(layout).length);
  }
});
