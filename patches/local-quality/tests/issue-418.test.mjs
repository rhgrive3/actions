import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { adaptQualityIssue418 } from '../issue-418-adapter.mjs';
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

test('negative main control: unpatched upstream main.js does not update world resources on runtime quality switch', () => {
  const rawMain = read('inkwave-public/src/main.js');
  // Upstream only forwarded to renderer:
  assert.ok(rawMain.includes("if ('quality' in partial || 'shadows' in partial || 'bloom' in partial) this.R?.applySettings(this.settings);"));
  assert.ok(!rawMain.includes('applyRuntimeWorldQuality'));
  assert.ok(!rawMain.includes('this._builtQuality'));
});

test('adapter transforms main.js with runtime quality hook and layout+quality gate', () => {
  const rawMain = read('inkwave-public/src/main.js');
  const patched = adaptQualityIssue418('src/main.js', rawMain);

  assert.ok(patched.includes("import { applyRuntimeWorldQuality } from '../patches/local-quality/world-quality.mjs';"));
  assert.ok(patched.includes("if ('quality' in partial) applyRuntimeWorldQuality(this, this.settings, this.mobile);"));
  assert.ok(patched.includes("this.layoutId === layoutId && this._builtQuality === this.settings?.quality"));
  assert.ok(patched.includes("this._builtQuality = this.settings?.quality;"));
  assert.ok(patched.includes("(map.layout || map.id) !== this.layoutId || this._builtQuality !== this.settings?.quality"));
});

test('effective quality resolution caps mobile touch resources safely', () => {
  const desktopHigh = resolveEffectiveQuality({ quality: 'high' }, null);
  assert.equal(desktopHigh.paintAtlas, 4096);
  assert.equal(desktopHigh.shadowSize, 4096);
  assert.equal(desktopHigh.particles, 1.0);

  const desktopLow = resolveEffectiveQuality({ quality: 'low' }, null);
  assert.equal(desktopLow.paintAtlas, 2048);
  assert.equal(desktopLow.shadowSize, 1024);
  assert.equal(desktopLow.particles, 0.4);

  const touchHigh = resolveEffectiveQuality({ quality: 'high' }, { touch: true });
  assert.equal(touchHigh.paintAtlas, 2048);
  assert.equal(touchHigh.shadowSize, 2048);
  assert.equal(touchHigh.particles, 0.7);

  const touchLow = resolveEffectiveQuality({ quality: 'low' }, { touch: true });
  assert.equal(touchLow.paintAtlas, 2048);
  assert.equal(touchLow.shadowSize, 1024);
  assert.equal(touchLow.particles, 0.4);
});

test('environment shadow quality safely updates mapSize, disposes old target, refits camera, and invalidates shadow cache', () => {
  let disposed = false;
  let camRefitted = false;
  let cacheInvalidated = false;

  const mockSun = {
    shadow: {
      mapSize: new THREE.Vector2(4096, 4096),
      radius: 3.0,
      map: {
        dispose: () => { disposed = true; },
      },
      needsUpdate: false,
    },
  };
  const mockEnv = {
    shadowSize: 4096,
    sun: mockSun,
    _fitShadowCam: () => { camRefitted = true; },
  };
  const mockCache = {
    invalidate: () => { cacheInvalidated = true; },
  };

  // Switching 4096 -> 1024 (e.g. LOW preset)
  const changed = updateEnvironmentShadowQuality(mockEnv, 1024, mockCache);
  assert.equal(changed, true);
  assert.equal(mockEnv.shadowSize, 1024);
  assert.equal(mockSun.shadow.mapSize.x, 1024);
  assert.equal(mockSun.shadow.mapSize.y, 1024);
  assert.equal(disposed, true);
  assert.equal(mockSun.shadow.map, null);
  assert.equal(camRefitted, true);
  assert.equal(cacheInvalidated, true);
  assert.equal(mockSun.shadow.needsUpdate, true);

  // Calling again with same size is a no-op
  disposed = false;
  camRefitted = false;
  cacheInvalidated = false;
  const noop = updateEnvironmentShadowQuality(mockEnv, 1024, mockCache);
  assert.equal(noop, false);
  assert.equal(disposed, false);
});

test('fx pool quality resizes particle capacities and disposes old pool geometries', () => {
  const disposedGeos = [];
  const mockRoot = {
    remove: () => {},
  };
  let dropsCap = 0;
  let spritesPuff = 0;
  let spritesGlow = 0;
  let ringsCap = 0;
  let motesCap = 0;

  const mockFx = {
    q: 1.0,
    maxChecks: 1100,
    root: mockRoot,
    dMesh: { material: { dispose: () => {} } },
    dGeo: { dispose: () => disposedGeos.push('dGeo') },
    puffs: { mesh: { material: { dispose: () => {} } }, geo: { dispose: () => disposedGeos.push('puffs') } },
    glows: { mesh: { material: { dispose: () => {} } }, geo: { dispose: () => disposedGeos.push('glows') } },
    rings: { mesh: { material: { dispose: () => {} } }, geo: { dispose: () => disposedGeos.push('rings') } },
    motes: { material: { dispose: () => {} }, geometry: { dispose: () => disposedGeos.push('motes') } },
    _initDrops: (cap) => { dropsCap = cap; },
    _initSprites: (p, g) => { spritesPuff = p; spritesGlow = g; },
    _initRings: (cap) => { ringsCap = cap; },
    _initMotes: (cap) => { motesCap = cap; },
  };

  // Switch to LOW multiplier (0.4)
  const changed = updateFXQuality(mockFx, 0.4);
  assert.equal(changed, true);
  assert.equal(mockFx.q, 0.4);
  assert.equal(mockFx.maxChecks, Math.round(1100 * 0.4));
  assert.deepEqual(disposedGeos, ['dGeo', 'puffs', 'glows', 'rings', 'motes']);
  assert.equal(dropsCap, Math.round(2600 * 0.4));
  assert.equal(spritesPuff, Math.round(520 * 0.4));
  assert.equal(spritesGlow, Math.round(300 * 0.4));
  assert.equal(ringsCap, Math.round(300 * 0.4));
  assert.equal(motesCap, Math.round(300 * 0.4));

  // Same multiplier is a no-op
  assert.equal(updateFXQuality(mockFx, 0.4), false);
});

test('prop quality rebuilds detail meshes at new tier without affecting layout colliders', () => {
  let cleared = false;
  let built = false;
  let nightApplied = false;
  let shadowRootsReset = false;
  let cacheInvalidated = false;
  const addedTypes = [];

  const mockProps = {
    quality: 'high',
    qf: 1.0,
    clear: () => { cleared = true; },
    add: (type, it) => { addedTypes.push(type); },
    build: () => { built = true; },
    setTeamColors: () => {},
  };

  const mockGame = {
    props: mockProps,
    layoutId: 'tidewater',
    _applyNight: () => { nightApplied = true; },
    _shadowRoots: () => { shadowRootsReset = true; },
    shadowCache: { invalidate: () => { cacheInvalidated = true; } },
  };

  const mockDressing = (id) => [
    { type: 'bench', pos: [0, 0, 0] },
    { type: 'barrel', pos: [5, 0, 5] },
  ];

  const changed = updatePropQuality(mockGame, 'low', mockDressing);
  assert.equal(changed, true);
  assert.equal(mockProps.quality, 'low');
  assert.equal(mockProps.qf, 0.6);
  assert.equal(cleared, true);
  assert.equal(built, true);
  assert.deepEqual(addedTypes, ['bench', 'barrel']);
  assert.equal(nightApplied, true);
  assert.equal(shadowRootsReset, true);
  assert.equal(cacheInvalidated, true);

  // Same quality is a no-op
  assert.equal(updatePropQuality(mockGame, 'low', mockDressing), false);
});

test('paint atlas quality switches GPU size and strictly preserves authoritative CPU paint distribution', () => {
  let rtDisposed = false;
  let levelBuiltSize = 0;
  let grateBuiltSize = 0;
  let layoutDensity = 0;
  let initGpuCalled = false;

  const mockOldRT = {
    dispose: () => { rtDisposed = true; },
  };

  const initialGrid = new Uint8Array([0, 1, 1, 2, 0, 1, 2, 2]);
  const initialDead = new Uint8Array([0, 0, 1, 0, 0, 0, 0, 0]);
  const initialCounts = [3, 3];
  const initialTurfTotal = 6;
  const initialTurfArea = 0.375;
  const initialVersion = 17;

  const mockFaces = [
    { atlas: { x: 0, y: 0, w: 512, h: 512, ppm: 30, pad: 8 }, su: 10, sv: 10 },
  ];

  const mockPaint = {
    size: 4096,
    rt: mockOldRT,
    texture: { id: 'mockTex' },
    level: {},
    paintFaces: mockFaces,
    grid: new Uint8Array(initialGrid),
    dead: new Uint8Array(initialDead),
    counts: [...initialCounts],
    turfTotal: initialTurfTotal,
    turfArea: initialTurfArea,
    version: initialVersion,
    clock: 5.2,
    growing: [{ id: 1 }],
    _q: [],
    rip: new Float32Array(96),
    ripP: new Float32Array(96),
    _ripS: new Float32Array(24),
    _wetUntil: 12.0,
    _dryAcc: 0.05,
    geo: { dispose: () => {} },
    mat: { dispose: () => {} },
    dryMesh: { geometry: { dispose: () => {} }, material: { dispose: () => {} } },
    _layout: (density) => {
      layoutDensity = density;
      mockFaces[0].atlas = { x: 0, y: 0, w: 256, h: 256, ppm: density, pad: 8 };
    },
    _initGPU: () => {
      initGpuCalled = true;
      // Native _initGPU calls clear() which would wipe state if not protected:
      mockPaint.rt = { texture: { id: 'newTex' }, dispose: () => {} };
      mockPaint.grid = new Uint8Array(mockPaint.grid.length); // simulated naive wipe
    },
    sampleWorld: (faceId, p) => 1,
    coverage: function() { return [this.counts[0] / this.turfTotal, this.counts[1] / this.turfTotal]; },
  };

  const mockLevel = {
    buildGeometry: (size, filter) => {
      if (filter) {
        grateBuiltSize = size;
      } else {
        levelBuiltSize = size;
      }
      return { dispose: () => {} };
    },
  };

  const mockLevelMat = {
    userData: { uniforms: { uPaint: { value: null }, uTexel: { value: 0 } } },
  };
  const mockGrateMat = {
    userData: { uniforms: { uPaint: { value: null }, uTexel: { value: 0 } } },
  };

  const mockGame = {
    levelMesh: { geometry: { dispose: () => {} } },
    grateMesh: { geometry: { dispose: () => {} } },
    levelMat: mockLevelMat,
    grateMat: mockGrateMat,
  };

  const mockCtx = {
    paint: mockPaint,
    level: mockLevel,
  };

  // Switch 4096 -> 2048 (LOW preset)
  const changed = updatePaintQuality(mockGame, 2048, mockCtx);
  assert.equal(changed, true);
  assert.equal(mockPaint.size, 2048);
  assert.equal(layoutDensity, 18);
  assert.equal(initGpuCalled, true);
  assert.equal(rtDisposed, true);
  assert.equal(levelBuiltSize, 2048);
  assert.equal(grateBuiltSize, 2048);
  assert.equal(mockLevelMat.userData.uniforms.uTexel.value, 1 / 2048);
  assert.equal(mockGrateMat.userData.uniforms.uTexel.value, 1 / 2048);

  // Authoritative CPU state MUST be strictly preserved!
  assert.deepEqual(mockPaint.grid, initialGrid);
  assert.deepEqual(mockPaint.dead, initialDead);
  assert.deepEqual(mockPaint.counts, initialCounts);
  assert.equal(mockPaint.turfTotal, initialTurfTotal);
  assert.equal(mockPaint.turfArea, initialTurfArea);
  assert.equal(mockPaint.version, initialVersion);
  assert.equal(mockPaint.clock, 5.2);
  assert.deepEqual(mockPaint.coverage(), [0.5, 0.5]);

  // Same size is a no-op
  assert.equal(updatePaintQuality(mockGame, 2048, mockCtx), false);
});

test('applyRuntimeWorldQuality coordinates all four systems in paused / menu / match modes without mutating gameplay actors', () => {
  let paintSize = 4096;
  let shadowSize = 4096;
  let fxQ = 1.0;
  let propQ = 'high';

  const mockGame = {
    settings: { quality: 'low' },
    mobile: null,
    layoutId: 'kelpline',
    _builtQuality: 'high',
    match: {
      paused: true,
      state: 'playing',
      time: 85.5,
      actors: [{ hp: 100, pos: { x: 1, y: 0, z: 2 } }],
    },
    props: {
      quality: 'high',
      clear: () => {},
      add: () => {},
      build: () => { propQ = 'low'; },
      setTeamColors: () => {},
    },
    levelMat: { userData: { uniforms: { uPaint: {}, uTexel: {} } } },
    grateMat: { userData: { uniforms: { uPaint: {}, uTexel: {} } } },
    levelMesh: { geometry: { dispose: () => {} } },
    grateMesh: { geometry: { dispose: () => {} } },
    shadowCache: { invalidate: () => {} },
    _applyNight: () => {},
    _shadowRoots: () => {},
  };

  const mockCtx = {
    paint: {
      size: 4096,
      rt: { dispose: () => {} },
      texture: {},
      level: {},
      paintFaces: [{ atlas: { x: 0, y: 0, w: 10, h: 10, ppm: 30, pad: 8 }, su: 1, sv: 1 }],
      grid: new Uint8Array([1, 2]),
      counts: [1, 1],
      turfTotal: 2,
      turfArea: 0.125,
      version: 3,
      _layout: (d) => { paintSize = 2048; },
      _initGPU: () => {},
    },
    env: {
      shadowSize: 4096,
      sun: { shadow: { mapSize: new THREE.Vector2(4096, 4096), radius: 3, map: { dispose: () => {} } } },
      _fitShadowCam: () => { shadowSize = 1024; },
    },
    fx: {
      q: 1.0,
      root: { remove: () => {} },
      dMesh: { material: { dispose: () => {} } },
      dGeo: { dispose: () => {} },
      _initDrops: () => { fxQ = 0.4; },
    },
    level: {
      buildGeometry: () => ({ dispose: () => {} }),
    },
    teamColors: [new THREE.Color(), new THREE.Color()],
  };

  applyRuntimeWorldQuality(mockGame, mockGame.settings, mockGame.mobile, { G: mockCtx });

  assert.equal(paintSize, 2048);
  assert.equal(shadowSize, 1024);
  assert.equal(fxQ, 0.4);
  assert.equal(propQ, 'low');
  assert.equal(mockGame._builtQuality, 'low');

  // Verify gameplay actor / match state is 100% untouched
  assert.equal(mockGame.match.paused, true);
  assert.equal(mockGame.match.state, 'playing');
  assert.equal(mockGame.match.time, 85.5);
  assert.equal(mockGame.match.actors[0].hp, 100);
});
