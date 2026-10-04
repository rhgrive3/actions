import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { adaptQualityIssue418, replaceOnce, replaceExact } from '../issue-418-adapter.mjs';
import {
  resolveEffectiveQuality,
  updateEnvironmentShadowQuality,
  updateFXQuality,
  updatePropQuality,
  updatePaintQuality,
  applyRuntimeWorldQuality,
} from '../world-quality.mjs';

const ROOT = new URL('../../../', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, ROOT), 'utf8');

// Set up VM module loader for real native inkwave-public classes
const UPSTREAM = path.resolve(fileURLToPath(new URL('../../../inkwave-public', import.meta.url)));
const context = vm.createContext({
  console,
  performance,
  setTimeout,
  clearTimeout,
});

const vmModules = new Map();
function loadModule(file) {
  if (vmModules.has(file)) return vmModules.get(file);
  const source = fs.readFileSync(file, 'utf8');
  const mod = new vm.SourceTextModule(source, { context, identifier: file });
  vmModules.set(file, mod);
  return mod;
}
function resolveModule(spec, from) {
  if (spec === 'three') return path.join(UPSTREAM, 'vendor/three/build/three.module.js');
  if (spec.startsWith('three/addons/')) return path.join(UPSTREAM, 'vendor/three/jsm', spec.slice(13));
  return path.resolve(path.dirname(from), spec);
}

const fixtureEntry = new vm.SourceTextModule(`
  export * as THREE from 'three';
  export { Level } from './inkwave-public/src/world/level.js';
  export { MAP_LAYOUTS } from './inkwave-public/src/world/maps.js';
  export { PaintSystem } from './inkwave-public/src/world/paint.js';
  export { FX } from './inkwave-public/src/fx/fx.js';
  export { PropKit } from './inkwave-public/src/world/props.js';
  export { dressingFor } from './inkwave-public/src/world/dressing.js';
  export { effectiveQuality } from './inkwave-public/src/config.js';
  export { G } from './inkwave-public/src/core/ctx.js';
`, { context, identifier: path.resolve(fileURLToPath(new URL('../../../fixture-native.mjs', import.meta.url))) });

await fixtureEntry.link((spec, from) => loadModule(resolveModule(spec, from.identifier)));
await fixtureEntry.evaluate();
const { THREE, Level, MAP_LAYOUTS, PaintSystem, FX, PropKit, dressingFor, effectiveQuality, G } = fixtureEntry.namespace;

function fileURLToPath(url) {
  return url.pathname;
}

function makeStubRenderer() {
  let currentRT = null;
  const renderedScenes = [];
  return {
    capabilities: { getMaxAnisotropy: () => 8 },
    getRenderTarget: () => currentRT,
    setRenderTarget: (rt) => { currentRT = rt; },
    getClearColor: (c) => (c ? c.setHex(0) : new THREE.Color(0)),
    getClearAlpha: () => 0,
    setClearColor: () => {},
    clear: () => {},
    render: (scene, cam) => { renderedScenes.push({ scene, cam }); },
    autoClear: true,
    renderedScenes,
  };
}

test('negative main control: unpatched upstream main.js does not update world resources on runtime quality switch', () => {
  const rawMain = read('inkwave-public/src/main.js');
  assert.ok(rawMain.includes("if ('quality' in partial || 'shadows' in partial || 'bloom' in partial) this.R?.applySettings(this.settings);"));
  assert.ok(!rawMain.includes('applyRuntimeWorldQuality'));
  assert.ok(!rawMain.includes('this._builtQuality'));
});

test('adapter exact anchor duplicate detection rejects duplicate hooks and verifies count 2 on startup anchors', () => {
  assert.throws(() => replaceOnce('foo bar foo', 'foo', 'baz', 'duplicate test'), /expected 1 occurrence\(s\), found 2/);
  assert.throws(() => replaceOnce('bar', 'foo', 'baz', 'missing test'), /expected 1 occurrence\(s\), found 0/);

  // Exact count 2 verifies duplicate startup anchors
  const src = 'startup;\nif ((map.layout || map.id) !== this.layoutId) await this._buildWorld(map);\nmid;\nif ((map.layout || map.id) !== this.layoutId) await this._buildWorld(map);\nend;';
  const out = replaceExact(src, 'if ((map.layout || map.id) !== this.layoutId) await this._buildWorld(map);', '/* hook */', 'startup hooks', 2);
  assert.equal((out.match(/\/\* hook \*\//g) || []).length, 2);

  assert.throws(() => replaceExact(src, 'if ((map.layout || map.id) !== this.layoutId) await this._buildWorld(map);', '/* hook */', 'startup hooks', 1), /expected 1 occurrence\(s\), found 2/);
});

test('adapter transforms main.js passing actual dependencies {G, effectiveQuality, dressingFor, THREE} and reconciling layout', () => {
  const rawMain = read('inkwave-public/src/main.js');
  const patched = adaptQualityIssue418('src/main.js', rawMain);

  assert.ok(patched.includes("import { applyRuntimeWorldQuality } from '../patches/local-quality/world-quality.mjs';"));
  assert.ok(patched.includes("if ('quality' in partial) applyRuntimeWorldQuality(this, this.settings, this.mobile, { G, effectiveQuality, dressingFor, THREE });"));
  assert.ok(patched.includes("if (this.layoutId === layoutId) {\n      if (this._builtQuality !== this.settings?.quality) applyRuntimeWorldQuality(this, this.settings, this.mobile, { G, effectiveQuality, dressingFor, THREE });\n      this.mapDef = map; return;\n    }"));
  assert.ok(patched.includes("(map.layout || map.id) !== this.layoutId || this._builtQuality !== this.settings?.quality"));
});

test('effective quality resolution caps mobile touch resources safely', () => {
  const desktopHigh = resolveEffectiveQuality({ quality: 'high' }, null);
  assert.equal(desktopHigh.paintAtlas, 4096);
  assert.equal(desktopHigh.shadowSize, 4096);
  assert.equal(desktopHigh.particles, 1.0);

  const touchHigh = resolveEffectiveQuality({ quality: 'high' }, { touch: true });
  assert.equal(touchHigh.paintAtlas, 2048);
  assert.equal(touchHigh.shadowSize, 2048);
  assert.equal(touchHigh.particles, 0.7);
});

test('real native PaintSystem and Level: quality switch resizes GPU atlas while strictly preserving CPU ink grid, counts and geometry uniforms', () => {
  const level = new Level(MAP_LAYOUTS['tidewater']);
  const renderer = makeStubRenderer();
  const paint = new PaintSystem(renderer, level, { atlasSize: 4096, maxDensity: 30 });

  assert.equal(paint.size, 4096);
  const initialPpm = paint.ppm;
  assert.ok(initialPpm <= 30 && initialPpm > 20, `Initial packed ppm should be <= 30, got ${initialPpm}`);

  // Find a real paintable turf face and splat real ink
  const turfFace = level.faces.find((f) => f.paintable && f.turf);
  assert.ok(turfFace, 'Must have turf face');
  const splatPos = turfFace.origin.clone().addScaledVector(turfFace.u, 1.0).addScaledVector(turfFace.v, 1.0);
  paint.splat(splatPos, 1.5, 0);

  const initialCounts = [...paint.counts];
  const initialTurfTotal = paint.turfTotal;
  assert.ok(initialCounts[0] > 0, 'Team 0 must have live painted cells');

  const initialGridSnapshot = new Uint8Array(paint.grid);
  const initialGridRef = paint.grid;
  const initialDeadRef = paint.dead;
  const initialCountsRef = paint.counts;

  // Level mesh and material with real uniform structures
  const levelMesh = new THREE.Mesh(level.buildGeometry(paint.size));
  const grateMesh = new THREE.Mesh(level.buildGeometry(paint.size, (b) => b.grate));
  const levelMat = {
    userData: {
      uniforms: {
        uPaint: { value: paint.texture },
        uTexel: { value: 1 / 4096 },
        uAtlasSize: { value: 4096 },
        uPpm: { value: paint.ppm },
      },
    },
  };
  const grateMat = {
    userData: {
      uniforms: {
        uPaint: { value: paint.texture },
        uTexel: { value: 1 / 4096 },
        uAtlasSize: { value: 4096 },
        uPpm: { value: paint.ppm },
      },
    },
  };

  const game = { levelMesh, grateMesh, levelMat, grateMat };
  const ctx = { paint, level };

  // Switch to LOW (target size 2048)
  const changed = updatePaintQuality(game, 2048, ctx, THREE);
  assert.equal(changed, true);
  assert.equal(paint.size, 2048);
  assert.ok(paint.ppm <= 18 && paint.ppm > 10, `New packed ppm should be <= 18, got ${paint.ppm}`);

  // Authoritative CPU paint state object identity and values MUST be preserved!
  assert.equal(paint.grid, initialGridRef, 'paint.grid CPU buffer identity must be preserved');
  assert.equal(paint.dead, initialDeadRef, 'paint.dead CPU buffer identity must be preserved');
  assert.equal(paint.counts, initialCountsRef, 'paint.counts array identity must be preserved');
  assert.equal(Buffer.from(paint.grid.buffer).equals(Buffer.from(initialGridSnapshot.buffer)), true, 'CPU paint grid contents must not be wiped or mutated');
  assert.equal(paint.counts[0], initialCounts[0], 'Team 0 cell count must be preserved');
  assert.equal(paint.counts[1], initialCounts[1], 'Team 1 cell count must be preserved');
  assert.equal(paint.turfTotal, initialTurfTotal, 'turfTotal must be preserved');

  // Verify uniforms updated to 2048 and new ppm
  assert.equal(levelMat.userData.uniforms.uTexel.value, 1 / 2048);
  assert.equal(levelMat.userData.uniforms.uAtlasSize.value, 2048);
  assert.equal(levelMat.userData.uniforms.uPpm.value, paint.ppm);
  assert.equal(levelMat.userData.uniforms.uPaint.value, paint.texture);

  assert.equal(grateMat.userData.uniforms.uTexel.value, 1 / 2048);
  assert.equal(grateMat.userData.uniforms.uAtlasSize.value, 2048);
  assert.equal(grateMat.userData.uniforms.uPpm.value, paint.ppm);
  assert.equal(grateMat.userData.uniforms.uPaint.value, paint.texture);
});

test('safe rollback on resampling failure: never swallow exceptions and never dispose old atlas leaving blank ink', () => {
  const level = new Level(MAP_LAYOUTS['tidewater']);
  const renderer = makeStubRenderer();
  const paint = new PaintSystem(renderer, level, { atlasSize: 4096, maxDensity: 30 });

  const initialPpm = paint.ppm;
  const oldRT = paint.rt;
  let oldRTDisposed = false;
  oldRT.dispose = () => { oldRTDisposed = true; };

  const faceAtlasBefore = level.faces.filter((f) => f.paintable).map((f) => ({ face: f, atlas: { ...f.atlas } }));

  // Simulate GPU render failure
  renderer.render = () => {
    throw new Error('GPU context lost during atlas resampling');
  };

  const game = {};
  const ctx = { paint, level };

  assert.throws(
    () => updatePaintQuality(game, 2048, ctx, THREE),
    /GPU context lost during atlas resampling/
  );

  // Verify safe rollback:
  assert.equal(paint.size, 4096, 'Atlas size must roll back to 4096');
  assert.equal(paint.ppm, initialPpm, 'Ppm density must roll back to initial packed ppm');
  assert.equal(oldRTDisposed, false, 'Old RT must NOT be disposed when resampling fails');
  assert.equal(paint.rt, oldRT, 'Old RT reference must remain active');

  // Face atlas coordinates must be rolled back
  for (const item of faceAtlasBefore) {
    assert.deepEqual(item.face.atlas, item.atlas, 'Face atlas coords must be restored');
  }
});

test('real native FX: quality update scales capacities, particle pools and maxChecks', () => {
  const scene = new THREE.Scene();
  const fx = new FX(scene, { quality: { particles: 1.0 } });

  assert.equal(fx.q, 1.0);
  assert.equal(fx.maxChecks, 1100);
  assert.equal(fx.dCap, 2600);
  assert.equal(fx.puffs.cap, 520);
  assert.equal(fx.glows.cap, 300);
  assert.equal(fx.rings.cap, 300);

  // Switch to LOW multiplier (0.4)
  const changed = updateFXQuality(fx, 0.4, THREE);
  assert.equal(changed, true);
  assert.equal(fx.q, 0.4);
  assert.equal(fx.maxChecks, Math.round(1100 * 0.4));
  assert.equal(fx.dCap, Math.round(2600 * 0.4));
  assert.equal(fx.puffs.cap, Math.round(520 * 0.4));
  assert.equal(fx.glows.cap, Math.round(300 * 0.4));
  assert.equal(fx.rings.cap, Math.round(300 * 0.4));
  assert.equal(fx.motes.geometry.instanceCount, Math.round(300 * 0.4));

  // Same multiplier is a no-op
  assert.equal(updateFXQuality(fx, 0.4, THREE), false);
});

test('real native PropKit: quality update rebuilds props at new tier without mutating level collision boxes', () => {
  const scene = new THREE.Scene();
  const props = new PropKit(scene, { quality: 'high', headless: true });

  const dressing = dressingFor('tidewater');
  for (const it of dressing) {
    props.add(it.type, it);
  }
  props.build();

  assert.equal(props.quality, 'high');
  assert.equal(props.qf, 1.0);
  const initialPropCount = props.count;
  assert.ok(initialPropCount > 0);

  const game = {
    props,
    layoutId: 'tidewater',
    _applyNight: () => {},
    _shadowRoots: () => {},
    shadowCache: { invalidate: () => {} },
  };

  // Switch to LOW
  const changed = updatePropQuality(game, 'low', dressingFor, { teamColors: [new THREE.Color(), new THREE.Color()] });
  assert.equal(changed, true);
  assert.equal(props.quality, 'low');
  assert.equal(props.qf, 0.6);
  assert.equal(props.count, initialPropCount);

  // Same quality is a no-op
  assert.equal(updatePropQuality(game, 'low', dressingFor), false);
});

test('adapted _setSettings and _buildWorld: calls real G without invented aliases, and same-layout reconciliation preserves CPU object identities', async () => {
  const level = new Level(MAP_LAYOUTS['tidewater']);
  const renderer = makeStubRenderer();
  const paint = new PaintSystem(renderer, level, { atlasSize: 4096 });
  const scene = new THREE.Scene();
  const fx = new FX(scene, { quality: { particles: 1.0 } });
  const props = new PropKit(scene, { quality: 'high', headless: true });
  for (const it of dressingFor('tidewater')) props.add(it.type, it);
  props.build();

  const mockSun = {
    shadow: {
      mapSize: new THREE.Vector2(4096, 4096),
      radius: 3.0,
      map: { dispose: () => {} },
      needsUpdate: false,
    },
  };
  const env = {
    shadowSize: 4096,
    sun: mockSun,
    _fitShadowCam: () => {},
  };

  // Wire into real native G:
  G.level = level;
  G.paint = paint;
  G.env = env;
  G.fx = fx;
  G.physics = { level, segment: () => ({ hit: false }) };
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];

  // Verify that window.G, globalThis.G, game.G do NOT exist
  assert.equal(typeof globalThis.G, 'undefined');

  const levelMesh = new THREE.Mesh(level.buildGeometry(paint.size));
  const grateMesh = new THREE.Mesh(level.buildGeometry(paint.size, (b) => b.grate));
  const levelMat = {
    userData: {
      uniforms: {
        uPaint: { value: paint.texture },
        uTexel: { value: 1 / 4096 },
        uAtlasSize: { value: 4096 },
        uPpm: { value: paint.ppm },
      },
    },
  };

  const game = {
    settings: { quality: 'high' },
    mobile: null,
    layoutId: 'tidewater',
    _builtQuality: 'high',
    mapDef: { id: 'tidewater', layout: 'tidewater' },
    props,
    levelMesh,
    grateMesh,
    levelMat,
    shadowCache: { invalidate: () => {} },
    _applyNight: () => {},
    _shadowRoots: () => {},
  };

  // Verify that game does NOT have invented aliases game.G, game.paint, game.env, game.fx
  assert.equal(game.G, undefined);
  assert.equal(game.paint, undefined);
  assert.equal(game.env, undefined);
  assert.equal(game.fx, undefined);

  // Simulate adapted Game._setSettings implementation
  function adaptedSetSettings(partial) {
    Object.assign(game.settings, partial);
    if ('quality' in partial) {
      applyRuntimeWorldQuality(game, game.settings, game.mobile, { G, effectiveQuality, dressingFor, THREE });
    }
  }

  // Switch to LOW via adapted _setSettings
  adaptedSetSettings({ quality: 'low' });

  // Native G must be updated
  assert.equal(G.paint.size, 2048);
  assert.equal(G.env.shadowSize, 1024);
  assert.equal(G.fx.q, 0.4);
  assert.equal(game.props.quality, 'low');
  assert.equal(game._builtQuality, 'low');

  // Verify CPU object identities are preserved (NO recreation)
  assert.equal(G.level, level);
  assert.equal(G.paint, paint);
  assert.equal(G.physics.level, level);

  // Now test same-layout reconciliation in adapted _buildWorld
  let buildWorldRanFullReset = false;
  async function adaptedBuildWorld(map) {
    const layoutId = map.layout || map.id;
    if (game.layoutId === layoutId) {
      if (game._builtQuality !== game.settings?.quality) {
        applyRuntimeWorldQuality(game, game.settings, game.mobile, { G, effectiveQuality, dressingFor, THREE });
      }
      game.mapDef = map;
      return;
    }
    buildWorldRanFullReset = true;
  }

  // Change settings to HIGH and call _buildWorld with same layout
  game.settings.quality = 'high';
  await adaptedBuildWorld(game.mapDef);

  assert.equal(buildWorldRanFullReset, false, 'Same-layout reconciliation must early-return without full CPU reset');
  assert.equal(G.paint.size, 4096);
  assert.equal(G.env.shadowSize, 4096);
  assert.equal(G.fx.q, 1.0);
  assert.equal(game.props.quality, 'high');
  assert.equal(game._builtQuality, 'high');
  assert.equal(G.level, level, 'G.level identity strictly preserved across reconciliation');
});

// Combined quality/roller binding regression: visual pool reallocation cannot
// leave source-generation bookkeeping capped at the previous LOW capacity.
test('quality reallocation resizes linked roller drop bookkeeping', () => {
 const fx={q:.4,dCap:1040,dMesh:{material:{dispose(){}}},dGeo:{dispose(){}},root:{remove(){}},
   _qualityDropSource:Array(1040).fill({}),_qualityDropGeneration:new Uint32Array(1040),
   _initDrops(cap){this.dCap=cap;}};
 updateFXQuality(fx,1,THREE);
 assert.equal(fx._qualityDropSource.length,2600);
 assert.equal(fx._qualityDropGeneration.length,2600);
 assert.ok(fx._qualityDropSource.every(v=>v===null));
 fx._qualityDropGeneration[2500]=42;assert.equal(fx._qualityDropGeneration[2500],42);
});
