import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

let cached;
async function boot() {
  if (cached) return cached;
  const api = await fixture({ productionComposition: true, fullRuntime: true, extraExports: `
    export { Minimap } from './inkwave-public/src/game/minimap.js';
    export { MAP_LAYOUTS } from './inkwave-public/src/world/maps.js';
    export { map3ArtColliders } from './inkwave-public/src/world/stages/map3-art.js';
  ` });
  api.labels = [];
  api.context.document = { createElement(name) {
    assert.equal(name, 'canvas');
    const canvas = { width: 0, height: 0 }, context = new Proxy({
      canvas,
      createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
      fillText: text => api.labels.push(text),
    }, { get: (target, key) => key in target ? target[key] : () => {} });
    canvas.getContext = () => context; return canvas;
  } };
  api.G.settings = { minimap: true }; api.G.netm = null; api.G.local = null;
  return cached = api;
}

function make(api, id, map3 = true) {
  const layout = api.MAP_LAYOUTS[id];
  const level = new api.Level(map3 ? layout : { ...layout, map3: undefined }, api.map3ArtColliders(layout));
  // Real paint packing, dead-cell mask, CPU splats and samples; GPU calls alone
  // are inert. This is an ink/Canvas2D selection test, not a rendered GPU test.
  const renderer = {
    capabilities: { getMaxAnisotropy: () => 1 }, getRenderTarget: () => null,
    setRenderTarget() {}, getClearColor: c => c.set(0), getClearAlpha: () => 0,
    setClearColor() {}, clear() {}, render() {},
  };
  const paint = new api.PaintSystem(renderer, level, { atlasSize: 1024, maxDensity: 2 });
  const map = new api.Minimap(level, paint, 2, { deferActivation: true });
  api.G.level = level; api.G.paint = paint; api.G.local = null;
  map.ensure();
  return { level, paint, map };
}

function pixel(map, x, z) {
  const p = map.toCanvas(x, z);
  return Math.floor(p.y) * map.w + Math.floor(p.x);
}
function pointFace(level, x, y, z) {
  return level.faces.find(f => f.turf && Math.abs(f.origin.y - y) < 1e-8 &&
    x > level.blocks[f.block].aabbMin.x && x < level.blocks[f.block].aabbMax.x &&
    z > level.blocks[f.block].aabbMin.z && z < level.blocks[f.block].aabbMax.z);
}

for (const [id, x, z, upperY] of [['tidewater', -19, -3, 4.8], ['kelpline', 7, 0, 3.6]]) {
  test(`${id}: real upper/lower ink remains independent and cached map projection follows the actor after hysteresis`, async t => {
    const api = await boot(), { G, THREE } = api, { level, paint, map } = make(api, id);
    const lower = pointFace(level, x, 0, z), upper = pointFace(level, x, upperY, z);
    assert.ok(lower && upper && lower !== upper);
    paint.splat(new THREE.Vector3(x, .03, z), 1.25, 0, { face: lower.id, seed: .4, instant: true });
    paint.splat(new THREE.Vector3(x, upperY + .03, z), 1.25, 1, { face: upper.id, seed: .7, instant: true });
    const sample = f => {
      const p = new THREE.Vector3(x, f.origin.y, z).sub(f.origin);
      return paint.sample(f.id, p.dot(f.u), p.dot(f.v));
    };
    assert.equal(sample(lower), 1); assert.equal(sample(upper), 2);
    const ix = pixel(map, x, z), upperCells = map.pixCell, upperBase = map.base;
    assert.equal(paint.grid[upperCells[ix]], 2);
    G.local = { alive: true, pos: new THREE.Vector3(x, 0, z) };
    map.update(.1, true);
    assert.equal(map.map3Layer, 'upper', 'brief crossing does not switch the raster');
    map.update(.1, true);
    assert.equal(map.map3Layer, 'lower');
    assert.equal(paint.grid[map.pixCell[ix]], 1, 'lower ink owns same XZ in the lower map');
    assert.ok(Math.abs(map.hgt[ix]) < .01);
    const lowerCells = map.pixCell, lowerBase = map.base;
    assert.notEqual(lowerCells, upperCells); assert.notEqual(lowerBase, upperBase);
    const builds = { count: 0 }, build = map._build;
    map._build = function (...args) { builds.count++; return build.apply(this, args); };
    G.local.pos.y = 1.5;
    map.update(.3, true);
    assert.equal(map.map3Layer, 'lower', 'jump beneath ceiling remains in lower projection');
    // Rising onto the actual upper deck uses its independent paint cells.
    G.local.pos.y = upperY; map.update(.2, true);
    assert.equal(map.map3Layer, 'upper'); assert.equal(map.pixCell, upperCells); assert.equal(map.base, upperBase);
    assert.equal(paint.grid[map.pixCell[ix]], 2);
    G.local.pos.y = 0; map.update(.2, true);
    assert.equal(map.map3Layer, 'lower'); assert.equal(map.pixCell, lowerCells); assert.equal(map.base, lowerBase);
    assert.equal(builds.count, 0, 'repeated layer switching reuses both static rasters');
    assert.ok(api.labels.includes('↓ 下層') && api.labels.includes('↑ 上層'));
    assert.equal(sample(lower), 1); assert.equal(sample(upper), 2, 'projection never mutates paint ownership');
    // Viewer flip rebuilds the selected layer once, without reusing reversed pixels.
    map.setViewerTeam(1); map.update(.2, true);
    assert.equal(map.flip, true); assert.equal(map.map3Layer, 'lower');
    assert.equal(paint.grid[map.pixCell[pixel(map, x, z)]], 1);
    for (const b of level.blocks.filter(b => b.hidden && !b.paint)) assert.ok(!map.topBlock.includes(b.id), 'support piers do not become minimap floors');
    t.diagnostic(`real paint turf ${paint.turfArea.toFixed(2)} WU²; separate same-XZ paint cells, two cached rasters, label, jump hysteresis and viewer flip verified`);
  });
}

test('ordinary layouts without MAP3 retain the original highest-floor projection', async () => {
  const api = await boot(), { map, paint } = make(api, 'kelpline', false);
  const before = map.pixCell;
  api.G.local = { alive: true, pos: new api.THREE.Vector3(7, 0, 0) };
  for (let i = 0; i < 30; i++) map.update(1 / 60);
  assert.equal(map.map3Layer, undefined); assert.equal(map._map3Layers, undefined);
  assert.equal(map.pixCell, before); assert.ok(Math.abs(map.hgt[pixel(map, 7, 0)] - 3.6) < 1e-6);
  assert.ok(paint.turfArea > 0);
});
