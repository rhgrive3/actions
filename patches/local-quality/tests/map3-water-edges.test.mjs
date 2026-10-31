import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

let random = .5;
const f = await fixture({ productionComposition: true, fullRuntime: true, vmMathRandom: () => random, extraExports: `
  export { MAP_LAYOUTS } from './inkwave-public/src/world/maps.js';
  export { map3ArtColliders } from './inkwave-public/src/world/stages/map3-art.js';
  export { createMap3WaterEdges } from './inkwave-public/src/world/stages/map3-water-edges.js';
  export { initFxHooks } from './inkwave-public/src/fx/fxHooks.js';
` });

// Reproduce main's existing legacy input independently. Its low-top predicate
// is correct for the original flat maps, but omits MAP3's raised filled quays.
function legacyFootprint(level) {
  return level.blocks.filter(b => (b.aligned || b.axes[1].y > .9999) &&
    b.aabbMax.y < .01 && b.aabbMax.y > -2.5 && b.aabbMin.y < -1).map(b => ({
    minX: b.aabbMin.x, maxX: b.aabbMax.x, minZ: b.aabbMin.z, maxZ: b.aabbMax.z,
  }));
}
function scene(level) {
  const emissions = [];
  const G = { level, env: { seaState: 1, footprint: legacyFootprint(level) },
    camera: new f.THREE.PerspectiveCamera(60, 16 / 9, .15, 1000), actors: [],
    fx: { seaSpray: (p, n, strength) => emissions.push({ x: p.x, y: p.y, z: p.z, nx: n.x, nz: n.z, strength }) },
  };
  return { G, hooks: f.initFxHooks(G), emissions };
}
const worlds = Object.fromEntries(['tidewater', 'kelpline'].map(id => {
  const layout = f.MAP_LAYOUTS[id];
  return [id, new f.Level(layout, f.map3ArtColliders(layout))];
}));

for (const id of ['tidewater', 'kelpline']) test(`${id}: spray uses the real external water boundary, never a filled courtyard or covered ramp`, t => {
  const level = worlds[id], waterY = level.layout.map3.waterY;
  const before = JSON.stringify(level.blocks.map(b => [b.center.toArray(), b.half.toArray(), b.axes.map(a => a.toArray()), b.solid, b.grate]));
  const former = scene(level);
  // Same actual solids and legacy environment footprint; omit only MAP3's
  // opt-in to exercise the pre-fix path as a genuine negative control.
  former.G.level = { bounds: level.bounds };
  former.hooks._buildEdges();
  const falseShore = former.hooks.edges.filter(e => level.groundHeight(e.x, e.z) > waterY);
  assert.ok(falseShore.length > 0, 'the former path demonstrably emitted inside/under actual solids');

  const { hooks } = scene(level); hooks._buildEdges();
  assert.ok(hooks.edges.length > 0, 'real open-water spray remains available');
  const unique = new Set();
  for (const edge of hooks.edges) {
    const key = [edge.x, edge.z, edge.nx, edge.nz].map(x => x.toFixed(6)).join(',');
    assert.ok(!unique.has(key), 'overlapping floor edges cannot duplicate emitters'); unique.add(key);
    assert.ok(level.groundHeight(edge.x, edge.z) <= waterY,
      `emitter must have an open vertical water column at ${edge.x},${edge.z}`);
    assert.ok(level.groundHeight(edge.x + edge.nx * .55, edge.z + edge.nz * .55) <= waterY,
      'outward side is water, including real ramp toe and overhead-deck geometry');
    assert.ok(level.groundHeight(edge.x - edge.nx * .1, edge.z - edge.nz * .1) > waterY,
      'inward side must be an actual physical bank');
  }
  assert.equal(JSON.stringify(level.blocks.map(b => [b.center.toArray(), b.half.toArray(), b.axes.map(a => a.toArray()), b.solid, b.grate])), before,
    'cosmetic boundary extraction must not modify any terrain/collider');
  t.diagnostic(`${former.hooks.edges.length} legacy candidates included ${falseShore.length} dry/covered columns; ${hooks.edges.length} real bank candidates remain, with no dry columns.`);
});

test('actual ambient selection emits only at checked water columns and performs no new per-frame terrain queries', t => {
  let emissions = 0;
  for (const id of ['tidewater', 'kelpline']) {
    const level = worlds[id], { G, hooks, emissions: emitted } = scene(level);
    hooks._buildEdges(); hooks.featherT = Infinity;
    const originalHeight = level.groundHeight;
    let queries = 0;
    level.groundHeight = function (...args) { queries++; return originalHeight.apply(this, args); };
    try {
      const cached = hooks.edges;
      for (let i = 0; i < cached.length; i++) {
        const edge = cached[i]; random = (i + .5) / cached.length;
        G.camera.position.set(edge.x - edge.nx * 10, 4, edge.z - edge.nz * 10);
        G.camera.lookAt(edge.x, 0, edge.z); G.camera.updateMatrixWorld();
        hooks.sprayT = 0; hooks._ambient(1 / 60);
        assert.equal(hooks.edges, cached, 'the same live Level reuses its cached candidates');
      }
      assert.equal(queries, 0, 'real geometry checks belong to rebuild, not the frame loop');
    } finally { level.groundHeight = originalHeight; }
    assert.equal(emitted.length, hooks.edges.length, 'each selected water edge emits through the unchanged ambient recipe');
    for (const effect of emitted) assert.ok(level.groundHeight(effect.x, effect.z) <= level.layout.map3.waterY);
    emissions += emitted.length;
  }
  t.diagnostic(`${emissions} actual ambient seaSpray calls originate in checked open water; no frame-loop ground queries added.`);
});

test('the MAP3 opt-in leaves ordinary/native footprints and existing ambient edge sampling unchanged', () => {
  assert.equal(f.createMap3WaterEdges({ layout: { id: 'halyard' } }), null);
  assert.equal(f.createMap3WaterEdges({ layout: f.MAP_LAYOUTS.tidewater, native: true }), null);
  const bounds = { minX: -4, maxX: 4, minZ: -2, maxZ: 2 };
  const G = { level: { bounds }, env: { footprint: [bounds] }, fx: {}, actors: [] };
  const hooks = f.initFxHooks(G); hooks._buildEdges();
  assert.equal(hooks.edges.length, 14, 'the original 1.6-WU perimeter sampling remains for other maps');
  assert.ok(hooks.edges.some(e => e.z === -2.05 && e.nz === -1));
  assert.ok(hooks.edges.some(e => e.x === 4.05 && e.nx === 1));
});
