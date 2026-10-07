import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../adapter.mjs';
import { syncWorldTexlib, updateLobbyTexlib, stageHasPack, stagePackFor, SLOT, SLOT_LAYER, SLOT_NSTR } from '../texlib.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function compose(rel) {
  const raw = fs.readFileSync(path.join(ROOT, 'inkwave-public', rel), 'utf8');
  return adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, raw))));
}

async function loadComposedModule(rel, globals = {}) {
  const context = vm.createContext({ console, performance, ...globals });
  const modules = new Map();
  const upstream = path.join(ROOT, 'inkwave-public');

  function resolve(spec, from) {
    if (spec === 'three') return path.join(upstream, 'vendor/three/build/three.module.js');
    if (spec.startsWith('three/addons/')) return path.join(upstream, 'vendor/three/jsm', spec.slice(13));
    if (spec.startsWith('../patches/') || spec.startsWith('../../patches/')) {
      return path.resolve(path.dirname(from), spec).replace('/inkwave-public/patches/', '/patches/');
    }
    return path.resolve(path.dirname(from), spec);
  }

  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const relPath = path.relative(upstream, file);
    let code;
    if (relPath.startsWith('..')) {
      code = fs.readFileSync(file, 'utf8');
    } else {
      code = compose(relPath);
    }
    const mod = new vm.SourceTextModule(code, { context, identifier: file });
    modules.set(file, mod);
    return mod;
  }

  const rootMod = load(path.join(upstream, rel));
  await rootMod.link((spec, from) => load(resolve(spec, from.identifier)));
  await rootMod.evaluate();
  return rootMod.namespace;
}

// Stand-in mock renderer for headless real Three.js target construction
function createMockRenderer(THREE, maxAnisotropy = 16) {
  let currentRT = null;
  const renderer = {
    coordinateSystem: THREE.WebGLCoordinateSystem ?? 2000,
    capabilities: {
      getMaxAnisotropy: () => maxAnisotropy,
    },
    autoClear: true,
    xr: { enabled: false },
    initRenderTarget(rt) {
      rt.__initialized = true;
    },
    getRenderTarget() {
      return currentRT;
    },
    setRenderTarget(rt, layer = 0) {
      currentRT = rt;
      if (rt) rt.__activeLayer = layer;
    },
    async compileAsync(scene, cam) {
      return Promise.resolve();
    },
    compile(scene, cam) {},
    render(scene, cam) {},
    readRenderTargetPixels(rt, x, y, w, h, buf, face, attachment) {
      buf[0] = 128; buf[1] = 128; buf[2] = 128; buf[3] = 255;
    },
  };
  return renderer;
}

test('real native catalog generation: coldboot Tidewater produces 25 shared layers (stage=null), Cargo pack produces 28 layers (stage=cargo)', async () => {
  const THREE = await import(path.join(ROOT, 'inkwave-public/vendor/three/build/three.module.js'));
  const texlibMod = await loadComposedModule('src/world/texlib.js');
  const { createTextureLibrary, MATERIALS, STAGE_SURFACES } = texlibMod;
  globalThis.__inkwave_stage_surfaces = STAGE_SURFACES;

  assert.equal(MATERIALS.length, 25, 'Unpatched STAGE_SURFACES must not be unconditionally appended to base MATERIALS');

  const renderer = createMockRenderer(THREE);

  // 1. Cold boot on Tidewater (no stage pack) -> pack identity normalized to null
  const tideLib = await createTextureLibrary(renderer, { size: 256, stage: 'tidewater' });
  assert.equal(tideLib.names.length, 25, 'Tidewater cold boot must generate exactly 25 shared layers');
  assert.equal(tideLib.albedo.image.depth, 25, 'Albedo array target depth must be 25');
  assert.equal(tideLib.normal.image.depth, 25, 'Normal array target depth must be 25');
  assert.equal(tideLib.orm.image.depth, 25, 'ORM array target depth must be 25');
  assert.equal(tideLib.size, 256);
  assert.equal(tideLib.stage, null, 'Normalized pack identity for shared-only stage must be null');
  assert.equal(tideLib.albedo.colorSpace, THREE.SRGBColorSpace);
  assert.equal(tideLib.normal.colorSpace, THREE.NoColorSpace);
  assert.equal(tideLib.orm.colorSpace, THREE.NoColorSpace);
  assert.equal(tideLib.layers['cargo:tarmac'], undefined, 'Cargo tarmac must not exist in Tidewater library');
  assert.equal(tideLib.layers['cargo:quay'], undefined, 'Cargo quay must not exist in Tidewater library');
  assert.equal(tideLib.layers['cargo:chequer'], undefined, 'Cargo chequer must not exist in Tidewater library');
  assert.equal(tideLib.layers.concrete, 0);
  assert.equal(tideLib.layers.gel, 24);

  // 2. Cargo stage (includes 3 stage pack layers)
  const cargoLib = await createTextureLibrary(renderer, { size: 256, stage: 'cargo' });
  assert.equal(cargoLib.names.length, 28, 'Cargo library must generate 25 shared + 3 Cargo layers = 28 layers');
  assert.equal(cargoLib.albedo.image.depth, 28);
  assert.equal(cargoLib.normal.image.depth, 28);
  assert.equal(cargoLib.orm.image.depth, 28);
  assert.equal(cargoLib.stage, 'cargo');
  assert.equal(cargoLib.layers['cargo:tarmac'], 25);
  assert.equal(cargoLib.layers['cargo:quay'], 26);
  assert.equal(cargoLib.layers['cargo:chequer'], 27);
  assert.equal(cargoLib.layers.concrete, 0);
  assert.equal(cargoLib.layers.gel, 24);
  assert.ok(cargoLib.meta['cargo:tarmac']);
  assert.equal(cargoLib.meta['cargo:tarmac'].scale, 4.0);
  assert.equal(cargoLib.meta['cargo:tarmac'].mode, 2); // HEX
  assert.equal(cargoLib.meta['cargo:tarmac'].mask, true);

  // Clean disposal
  tideLib.dispose();
  assert.equal(tideLib.disposed, true);
  cargoLib.dispose();
  assert.equal(cargoLib.disposed, true);
});

test('slot metadata before-after: Cargo -> Tidewater -> Cargo preserves 32 slots and stable semantics without shader mismatch', async () => {
  const THREE = await import(path.join(ROOT, 'inkwave-public/vendor/three/build/three.module.js'));
  const texlibMod = await loadComposedModule('src/world/texlib.js');
  const levelMatMod = await loadComposedModule('src/world/levelMaterial.js');
  const { createTextureLibrary } = texlibMod;
  const { createLevelMaterial } = levelMatMod;
  const renderer = createMockRenderer(THREE);

  const dummyPaint = { texture: new THREE.DataTexture(new Uint8Array(16), 2, 2), size: 2 };
  const dummyMurals = { userData: {} };

  // Phase 1: Cargo stage active
  const cargoLib1 = await createTextureLibrary(renderer, { size: 512, stage: 'cargo' });
  const cargoMat1 = createLevelMaterial(dummyPaint.texture, dummyPaint.size, dummyMurals, { texlib: cargoLib1 });
  assert.equal(cargoMat1.defines.TL_SLOTS, 32, 'TL_SLOTS must remain stable at 32');

  const uTL_cargo = cargoMat1.userData.uniforms.uTL.value;
  const uTLt_cargo = cargoMat1.userData.uniforms.uTLt.value;
  assert.equal(uTL_cargo.length, 32);
  // Shared slot 0: concrete
  assert.equal(uTL_cargo[0].x, 0, 'Slot 0 is concrete (layer 0)');
  // Cargo slots 28, 29, 30
  assert.equal(uTL_cargo[28].x, 25, 'Cargo slot 28 points to layer 25 (tarmac)');
  assert.equal(uTL_cargo[28].y, 1 / 4.0, 'Tarmac scale 4.0');
  assert.equal(uTL_cargo[28].z, 2, 'Tarmac HEX mode 2');
  assert.equal(uTL_cargo[28].w, 7, 'Tarmac sym 7');
  assert.equal(uTLt_cargo[28].x, 2, 'Tarmac tint mode 2 (mask)');
  assert.equal(uTLt_cargo[28].z, 3, 'Tarmac onWall 3 (PATTERN.concrete)');

  assert.equal(uTL_cargo[29].x, 26, 'Cargo slot 29 points to layer 26 (quay)');
  assert.equal(uTL_cargo[29].y, 1 / 4.8, 'Quay scale 4.8');
  assert.equal(uTL_cargo[29].z, 1, 'Quay GRID mode 1');
  assert.equal(uTL_cargo[29].w, 7, 'Quay sym 7');

  assert.equal(uTL_cargo[30].x, 27, 'Cargo slot 30 points to layer 27 (chequer)');
  assert.equal(uTL_cargo[30].y, 1 / 1.2, 'Chequer scale 1.2');
  assert.equal(uTL_cargo[30].z, 1, 'Chequer GRID mode 1');
  assert.equal(uTL_cargo[30].w, 3, 'Chequer sym 3');
  assert.equal(uTLt_cargo[30].z, 18, 'Chequer onWall 18 (hullpaint)');

  // Phase 2: Transition to Tidewater (retire Cargo, install 25-layer library)
  cargoMat1.dispose();
  cargoLib1.dispose();

  const tideLib = await createTextureLibrary(renderer, { size: 512, stage: 'tidewater' });
  const tideMat = createLevelMaterial(dummyPaint.texture, dummyPaint.size, dummyMurals, { texlib: tideLib });
  assert.equal(tideMat.defines.TL_SLOTS, 32, 'TL_SLOTS must remain stable at 32 on Tidewater');

  const uTL_tide = tideMat.userData.uniforms.uTL.value;
  const uTLt_tide = tideMat.userData.uniforms.uTLt.value;
  // Shared slot 0 must be identical
  assert.equal(uTL_tide[0].x, 0);
  assert.equal(uTL_tide[0].y, uTL_cargo[0].y);
  assert.equal(uTL_tide[0].z, uTL_cargo[0].z);
  assert.equal(uTL_tide[0].w, uTL_cargo[0].w);

  // Inactive Cargo slots 28..30 must map safely to concrete layer 0 without out-of-bounds layer access
  for (const s of [28, 29, 30]) {
    assert.equal(uTL_tide[s].x, 0, `Inactive slot ${s} must map to layer 0 (concrete)`);
    assert.equal(uTL_tide[s].y, 1 / 4.0, `Inactive slot ${s} scale falls back to concrete`);
    assert.equal(uTL_tide[s].z, 1, `Inactive slot ${s} mode falls back to concrete`);
    assert.equal(uTL_tide[s].w, 7, `Inactive slot ${s} sym falls back to concrete`);
    assert.equal(uTLt_tide[s].x, 1, `Inactive slot ${s} tint falls back to concrete`);
  }

  // Phase 3: Transition back to Cargo (Cargo -> Tidewater -> Cargo)
  tideMat.dispose();
  tideLib.dispose();

  const cargoLib2 = await createTextureLibrary(renderer, { size: 512, stage: 'cargo' });
  const cargoMat2 = createLevelMaterial(dummyPaint.texture, dummyPaint.size, dummyMurals, { texlib: cargoLib2 });

  const uTL_cargo2 = cargoMat2.userData.uniforms.uTL.value;
  const uTLt_cargo2 = cargoMat2.userData.uniforms.uTLt.value;
  assert.equal(uTL_cargo2[28].x, 25);
  assert.equal(uTL_cargo2[28].y, 1 / 4.0);
  assert.equal(uTL_cargo2[29].x, 26);
  assert.equal(uTL_cargo2[30].x, 27);
  assert.equal(uTLt_cargo2[30].z, 18);

  cargoMat2.dispose();
  cargoLib2.dispose();
  dummyPaint.texture.dispose();
});

test('generic stage pack support: dynamic STAGE_SURFACES and injected extra stage without leaking into baseline', async () => {
  const THREE = await import(path.join(ROOT, 'inkwave-public/vendor/three/build/three.module.js'));
  const texlibMod = await loadComposedModule('src/world/texlib.js');
  const { createTextureLibrary, MATERIALS, STAGE_SURFACES } = texlibMod;
  const renderer = createMockRenderer(THREE);

  // Verify baseline is exactly 25 materials
  assert.equal(MATERIALS.length, 25);
  assert.equal(STAGE_SURFACES.length, 3);

  // Injected extra stage (e.g. pending Practice PR #183) with 1 custom surface
  const practiceSurface = {
    stage: 'practice',
    slot: 31,
    name: 'practice:grid',
    group: 2,
    mat: {
      detail: 0.5, scale: 2.0, tint: true, mask: false, alpha: false, mode: 1, sym: 7, hr: [-0.002, 0.002], ao: 0.5,
      prep: 'f[0] = FB(uv, ivec2(4), 2, 0.5, 9901u);',
      surf: 's.alb = vec3(0.5); s.a = 1.0; s.h = 0.0; s.rough = 0.5; s.cav = 1.0;',
    },
  };

  const customSurfaces = [...STAGE_SURFACES, practiceSurface];

  // Verify stagePackFor dynamically recognizes practice without any hardcoding
  assert.equal(stageHasPack('practice', customSurfaces), true);
  assert.equal(stagePackFor('practice', customSurfaces), 'practice');
  assert.equal(stageHasPack('tidewater', customSurfaces), false);
  assert.equal(stagePackFor('tidewater', customSurfaces), null);

  // Generate library for practice stage
  const practiceLib = await createTextureLibrary(renderer, { size: 256, stage: 'practice', surfaces: customSurfaces });
  assert.equal(practiceLib.names.length, 26, 'Practice library must generate 25 shared + 1 practice layer = 26 layers');
  assert.equal(practiceLib.albedo.image.depth, 26);
  assert.equal(practiceLib.stage, 'practice');
  assert.equal(practiceLib.layers['practice:grid'], 25);
  assert.equal(practiceLib.layers['cargo:tarmac'], undefined, 'Cargo surfaces must not leak into practice pack');

  // Verify baseline is NOT mutated
  assert.equal(MATERIALS.length, 25, 'Baseline MATERIALS must remain untouched');
  assert.equal(STAGE_SURFACES.length, 3, 'Baseline STAGE_SURFACES must remain untouched');

  practiceLib.dispose();
});

test('coldboot-to-first-world single generation and Tidewater/Kelpline zero-generation reuse', async () => {
  const THREE = await import(path.join(ROOT, 'inkwave-public/vendor/three/build/three.module.js'));
  const texlibMod = await loadComposedModule('src/world/texlib.js');
  const { createTextureLibrary, STAGE_SURFACES } = texlibMod;
  const renderer = createMockRenderer(THREE);

  let generationCount = 0;
  const createFn = async (r, opts) => {
    generationCount++;
    return createTextureLibrary(r, opts);
  };

  const game = { texlib: null };

  // 1. Cold boot on Tidewater: normalized coldStage is null (stagePackFor('tidewater', STAGE_SURFACES) === null)
  const coldStage = stagePackFor('tidewater', STAGE_SURFACES);
  assert.equal(coldStage, null, 'Tidewater cold stage pack identity must be null');

  game.texlib = await createFn(renderer, { size: 256, stage: coldStage, surfaces: STAGE_SURFACES });
  assert.equal(generationCount, 1, 'Cold boot performs initial generation');
  assert.equal(game.texlib.stage, null, 'Cold boot library stores stage: null');
  assert.equal(game.texlib.names.length, 25);

  const initialLib = game.texlib;

  // 2. First _buildWorld call on Tidewater
  const firstBuild = await syncWorldTexlib(game, 'tidewater', renderer, 256, createFn, STAGE_SURFACES);
  assert.equal(firstBuild.nextTexlib, initialLib, 'First _buildWorld must reuse coldboot library');
  assert.equal(firstBuild.oldTexlib, null);
  assert.equal(generationCount, 1, 'First _buildWorld must NOT trigger a second generation');

  // 3. Stage transition Tidewater -> Kelpline: both have stagePack === null
  const kelpBuild = await syncWorldTexlib(game, 'kelpline', renderer, 256, createFn, STAGE_SURFACES);
  assert.equal(kelpBuild.nextTexlib, initialLib, 'Kelpline transition reuses existing shared library');
  assert.equal(kelpBuild.oldTexlib, null);
  assert.equal(generationCount, 1, 'Tidewater -> Kelpline must cause 0 new generations');

  // 4. Transition Kelpline -> Cargo: requires Cargo pack
  const cargoBuild = await syncWorldTexlib(game, 'cargo', renderer, 256, createFn, STAGE_SURFACES);
  assert.equal(generationCount, 2, 'Kelpline -> Cargo triggers generation');
  assert.equal(cargoBuild.nextTexlib.stage, 'cargo');
  assert.equal(cargoBuild.nextTexlib.names.length, 28);
  assert.equal(cargoBuild.oldTexlib, initialLib);

  // Commit transition and dispose old library
  game.texlib = cargoBuild.nextTexlib;
  cargoBuild.oldTexlib.dispose();
  assert.equal(initialLib.disposed, true);

  // 5. Transition Cargo -> Tidewater: returns to shared pack
  const cargoLibRef = game.texlib;
  const backToTide = await syncWorldTexlib(game, 'tidewater', renderer, 256, createFn, STAGE_SURFACES);
  assert.equal(generationCount, 3);
  assert.equal(backToTide.nextTexlib.stage, null);
  assert.equal(backToTide.nextTexlib.names.length, 25);
  assert.equal(backToTide.oldTexlib, cargoLibRef);

  game.texlib = backToTide.nextTexlib;
  cargoLibRef.dispose();
  assert.equal(cargoLibRef.disposed, true);

  // Clean up
  game.texlib.dispose();
});

test('async Game._buildWorld integration: bounded replacement/disposal, residency lifecycle (1 steady, 2 transient), and lobby safety', async () => {
  const THREE = await import(path.join(ROOT, 'inkwave-public/vendor/three/build/three.module.js'));
  const texlibMod = await loadComposedModule('src/world/texlib.js');
  const { createTextureLibrary, STAGE_SURFACES } = texlibMod;
  const renderer = createMockRenderer(THREE);

  const game = {
    texlib: null,
    showcase: {
      lob: {
        set: {
          texlib: null,
          mat: {
            surface: {
              userData: {
                shaderUniforms: {
                  tAlbedo: { value: null },
                  tNormal: { value: null },
                  tOrm: { value: null },
                  uTL: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) },
                  uTLt: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) },
                },
                texlibHolder: { lib: null },
              },
            },
            ground: {
              userData: {
                shaderUniforms: {
                  tAlbedo: { value: null },
                  tNormal: { value: null },
                  tOrm: { value: null },
                  uAs: { value: new THREE.Vector4() },
                },
                texlibHolder: { lib: null },
              },
            },
          },
        },
      },
    },
  };

  const createFn = (r, opts) => createTextureLibrary(r, opts);

  // 1. Initial cold boot on Tidewater
  const cold = await syncWorldTexlib(game, 'tidewater', renderer, 256, createFn, STAGE_SURFACES);
  assert.ok(cold.nextTexlib);
  assert.equal(cold.nextTexlib.names.length, 25);
  assert.equal(cold.oldTexlib, null);
  game.texlib = cold.nextTexlib;
  updateLobbyTexlib(game, cold.nextTexlib);

  // Residency check: 1 steady state
  let steadyResidency = (game.texlib && !game.texlib.disposed ? 1 : 0);
  assert.equal(steadyResidency, 1, 'Steady state residency after cold boot is 1');

  const lobbySet = game.showcase.lob.set;
  assert.equal(lobbySet.texlib, cold.nextTexlib);
  assert.equal(lobbySet.mat.surface.userData.shaderUniforms.tAlbedo.value, cold.nextTexlib.albedo);
  assert.equal(lobbySet.mat.ground.userData.shaderUniforms.tAlbedo.value, cold.nextTexlib.albedo);
  assert.equal(lobbySet.mat.ground.userData.shaderUniforms.uAs.value.x, cold.nextTexlib.layers.asphalt);

  // 2. Transition to Cargo: during generation, both old and candidate libraries exist (transient residency 2)
  const cargoSwitch = await syncWorldTexlib(game, 'cargo', renderer, 256, createFn, STAGE_SURFACES);
  assert.ok(cargoSwitch.nextTexlib);
  assert.equal(cargoSwitch.nextTexlib.names.length, 28);
  assert.equal(cargoSwitch.oldTexlib, cold.nextTexlib);

  // During transition before commit: both libraries are valid in memory
  let transientResidency = (cargoSwitch.nextTexlib ? 1 : 0) + (cargoSwitch.oldTexlib && !cargoSwitch.oldTexlib.disposed ? 1 : 0);
  assert.equal(transientResidency, 2, 'Residency is temporarily 2 during generation/transition');

  // Retire previous level/material refs, update lobby, dispose old library
  const oldTideLib = cargoSwitch.oldTexlib;
  game.texlib = cargoSwitch.nextTexlib;
  updateLobbyTexlib(game, cargoSwitch.nextTexlib);
  oldTideLib.dispose();

  // After commit & disposal: residency returns to 1 steady-state
  steadyResidency = (game.texlib && !game.texlib.disposed ? 1 : 0) + (oldTideLib && !oldTideLib.disposed ? 1 : 0);
  assert.equal(steadyResidency, 1, 'Residency returns to 1 steady-state after transition');

  assert.equal(oldTideLib.disposed, true, 'Old Tidewater library must be disposed');
  assert.equal(lobbySet.texlib, cargoSwitch.nextTexlib, 'LobbySet must reference fresh Cargo texlib');
  assert.equal(lobbySet.mat.surface.userData.shaderUniforms.tAlbedo.value, cargoSwitch.nextTexlib.albedo);
  assert.notEqual(lobbySet.mat.surface.userData.shaderUniforms.tAlbedo.value, oldTideLib.albedo, 'LobbySet must not point to disposed texture');
  assert.equal(lobbySet.mat.ground.userData.shaderUniforms.tAlbedo.value, cargoSwitch.nextTexlib.albedo);

  // Clean up
  game.texlib.dispose();
});

test('native compiled LobbySet materials: precompile and postcompile update holders and uniforms with correct sampler and meta', async () => {
  const THREE = await import(path.join(ROOT, 'inkwave-public/vendor/three/build/three.module.js'));
  const texlibMod = await loadComposedModule('src/world/texlib.js');
  const matsMod = await loadComposedModule('src/game/lobbySet-mats.js');
  const { createTextureLibrary } = texlibMod;
  const { surfaceMaterial, groundMaterial, makeUniforms } = matsMod;
  const renderer = createMockRenderer(THREE);

  const tideLib = await createTextureLibrary(renderer, { size: 256, stage: null });
  const cargoLib = await createTextureLibrary(renderer, { size: 256, stage: 'cargo' });
  const tideLib2 = await createTextureLibrary(renderer, { size: 256, stage: null });

  const U = makeUniforms();
  const dummyDecal = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  const dummyMask = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  const dummyEnv = new THREE.DataTexture(new Uint8Array(4), 1, 1);

  // --- Part 1: surfaceMaterial precompile update ---
  const surfMat = surfaceMaterial(U, tideLib, dummyDecal, dummyEnv);
  assert.ok(surfMat.userData.texlibHolder);
  assert.equal(surfMat.userData.texlibHolder.lib, tideLib);
  assert.equal(surfMat.userData.shaderUniforms, undefined, 'Shader uniforms undefined before compilation');

  // Fake game structure pointing to surfMat
  const game = {
    lobbySet: {
      surfaceMat: surfMat,
      groundMat: null,
    },
  };

  // Precompile update to Cargo library
  updateLobbyTexlib(game, cargoLib);
  assert.equal(surfMat.userData.texlibHolder.lib, cargoLib, 'Precompile update modifies texlibHolder.lib');

  // Trigger compilation (Three.js onBeforeCompile callback)
  const surfShader = {
    uniforms: {},
    defines: {},
    vertexShader: '#include <common>\n#include <uv_vertex>\n#include <beginnormal_vertex>',
    fragmentShader: '#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <normal_fragment_maps>',
  };
  surfMat.onBeforeCompile(surfShader);

  assert.ok(surfMat.userData.shaderUniforms, 'Shader uniforms attached on compilation');
  assert.equal(surfShader.uniforms.tAlbedo.value, cargoLib.albedo, 'Precompiled material picks up updated cargoLib albedo');
  assert.equal(surfShader.uniforms.tNormal.value, cargoLib.normal);
  assert.equal(surfShader.uniforms.tOrm.value, cargoLib.orm);
  assert.equal(surfShader.defines.LS_TEXLIB, 1);

  // Verify meta / slot layer uniforms
  const uTL = surfShader.uniforms.uTL.value;
  assert.equal(uTL.length, 12);
  assert.equal(uTL[0].x, cargoLib.layers.concrete);
  assert.equal(uTL[SLOT.asphalt].x, cargoLib.layers.asphalt);

  // --- Part 2: surfaceMaterial postcompile update ---
  updateLobbyTexlib(game, tideLib2);
  assert.equal(surfMat.userData.texlibHolder.lib, tideLib2, 'Postcompile update updates holder');
  assert.equal(surfShader.uniforms.tAlbedo.value, tideLib2.albedo, 'Postcompile update mutates sampler uniform');
  assert.equal(surfShader.uniforms.tNormal.value, tideLib2.normal);
  assert.equal(surfShader.uniforms.tOrm.value, tideLib2.orm);
  assert.notEqual(surfShader.uniforms.tAlbedo.value, cargoLib.albedo, 'Must not reference previous library');

  // Verify in-place Vector4 mutation of uTL
  assert.equal(uTL[0].x, tideLib2.layers.concrete);
  assert.equal(uTL[SLOT.asphalt].x, tideLib2.layers.asphalt);

  // --- Part 3: groundMaterial precompile and postcompile update ---
  const groundMat = groundMaterial(U, tideLib, dummyMask, [0, 0, 10, 10], dummyEnv);
  game.lobbySet.groundMat = groundMat;

  assert.equal(groundMat.userData.texlibHolder.lib, tideLib);

  // Precompile update to Cargo
  updateLobbyTexlib(game, cargoLib);
  assert.equal(groundMat.userData.texlibHolder.lib, cargoLib);

  const groundShader = {
    uniforms: {},
    defines: {},
    vertexShader: '#include <common>',
    fragmentShader: '#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>\n#include <lights_fragment_end>',
  };
  groundMat.onBeforeCompile(groundShader);

  assert.equal(groundShader.uniforms.tAlbedo.value, cargoLib.albedo);
  assert.equal(groundShader.uniforms.uAs.value.x, cargoLib.layers.asphalt);

  // Postcompile update to tideLib2
  updateLobbyTexlib(game, tideLib2);
  assert.equal(groundShader.uniforms.tAlbedo.value, tideLib2.albedo);
  assert.equal(groundShader.uniforms.uAs.value.x, tideLib2.layers.asphalt);

  // Clean up
  tideLib.dispose();
  cargoLib.dispose();
  tideLib2.dispose();
  dummyDecal.dispose();
  dummyMask.dispose();
  dummyEnv.dispose();
});

test('native _buildWorld epoch cancellation: uncommitted candidate library disposed on cancellation without corrupting current texlib', async () => {
  const THREE = await import(path.join(ROOT, 'inkwave-public/vendor/three/build/three.module.js'));
  const texlibMod = await loadComposedModule('src/world/texlib.js');
  const { createTextureLibrary, STAGE_SURFACES } = texlibMod;
  const renderer = createMockRenderer(THREE);

  const composedMain = compose('src/main.js');

  // Extract the adapted _buildWorld method directly from main.js
  const at = composedMain.indexOf('  async _buildWorld(');
  const until = composedMain.indexOf('\n  // deck slabs over the sea:', at);
  assert.ok(at >= 0 && until > at, 'Must find _buildWorld in composed main.js');
  const buildWorldSource = composedMain.slice(at, until);

  const initialLib = await createTextureLibrary(renderer, { size: 256, stage: null });
  let candidateCreated = null;

  // Track disposal
  const disposedResources = [];
  const resource = (name, obj = {}) => ({
    name,
    disposed: false,
    dispose() { this.disposed = true; disposedResources.push(name); },
    ...obj,
  });

  const scene = {
    children: new Set(),
    add(...items) { for (const it of items) this.children.add(it); },
    remove(...items) { for (const it of items) this.children.delete(it); },
  };

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    Promise,
    G: {
      scene,
      renderer,
      paint: resource('paint', { texture: {}, size: 64 }),
    },
    MAP_LAYOUTS: {
      tidewater: { id: 'tidewater' },
      cargo: { id: 'cargo' },
    },
    effectiveQuality: () => ({ paintAtlas: 256 }),
    dressingFor: () => [],
    Level: class {
      constructor(layout) { this.id = layout.id; this.bounds = {}; }
      buildGeometry() { return resource('geo:' + this.id, { index: { count: 1 } }); }
    },
    Physics: class { constructor(level) {} },
    SwimWake: class { reset() {} },
    Decor: class { constructor() {} dispose() {} },
    NavGraph: class { constructor() {} },
    Minimap: class { constructor() {} },
    createLevelMaterial: (tex, size, murals, opts) => resource('mat', { opts }),
    THREE,
    STAGE_SURFACES,
    syncWorldTexlib: async (game, layoutId, r, size, createFn, surfaces) => {
      // Simulate asynchronous texlib generation for Cargo
      const lib = await createTextureLibrary(renderer, { size: 256, stage: layoutId, surfaces });
      candidateCreated = lib;
      // Invalidate worldCurrent right before returning to _buildWorld to test cancellation handling
      game._worldBuild = { newEpoch: true };
      return { nextTexlib: lib, oldTexlib: game.texlib };
    },
    updateLobbyTexlib: (game, lib) => {},
  };

  const context = vm.createContext(sandbox);
  const Game = vm.runInContext(`class Game {\n${buildWorldSource}\n};\nGame;`, context);
  const game = new Game();

  game.texlib = initialLib;
  game.layoutId = 'tidewater';
  game.settings = { quality: 'medium' };
  game.mobile = false;
  game.murals = { userData: { setStage: () => {} } };
  game._loadLightmap = async () => resource('lightmap');

  // Trigger epoch cancellation during _buildWorld
  await game._buildWorld({ id: 'cargo', layout: 'cargo' });

  // Assertions:
  // 1. The candidate Cargo library must have been cleanly disposed upon epoch cancellation
  assert.ok(candidateCreated, 'Candidate cargo library was generated');
  assert.equal(candidateCreated.disposed, true, 'Uncommitted candidate library must be disposed on epoch cancellation');

  // 2. game.texlib must NOT have been overwritten with the cancelled candidate
  assert.equal(game.texlib, initialLib, 'Current texlib must remain untouched');
  assert.equal(!!game.texlib.disposed, false, 'Current texlib must NOT be disposed');
  assert.equal(game.layoutId, 'tidewater', 'layoutId must not be committed for cancelled build');

  initialLib.dispose();
});

test('generation failure resilience: preserves valid current library without disposal or use-after-free, cleans up disposed library', async () => {
  const THREE = await import(path.join(ROOT, 'inkwave-public/vendor/three/build/three.module.js'));
  const texlibMod = await loadComposedModule('src/world/texlib.js');
  const { createTextureLibrary, STAGE_SURFACES } = texlibMod;
  const renderer = createMockRenderer(THREE);

  const initialLib = await createTextureLibrary(renderer, { size: 256, stage: null });

  const game = {
    texlib: initialLib,
    showcase: {
      lob: {
        set: {
          texlib: initialLib,
          mat: {
            surface: {
              userData: {
                shaderUniforms: { tAlbedo: { value: initialLib.albedo } },
                texlibHolder: { lib: initialLib },
              },
            },
          },
        },
      },
    },
  };

  // Failing createFn that throws or rejects
  const failingCreateFn = async () => {
    throw new Error('GPU context lost during texture generation');
  };

  // Case A: Generation failure with currently valid library
  const result = await syncWorldTexlib(game, 'cargo', renderer, 256, failingCreateFn, STAGE_SURFACES);

  // Must preserve current library
  assert.equal(result.nextTexlib, initialLib, 'Must preserve valid current library on failure');
  assert.equal(result.oldTexlib, null, 'oldTexlib must be null so current library is NOT disposed');
  assert.equal(!!initialLib.disposed, false, 'Valid library must remain not disposed');

  // Case B: Generation failure when current library was already disposed
  initialLib.dispose();
  assert.equal(initialLib.disposed, true);
  game.texlib = initialLib;

  const resultDisposed = await syncWorldTexlib(game, 'cargo', renderer, 256, failingCreateFn, STAGE_SURFACES);
  assert.equal(resultDisposed.nextTexlib, null, 'Must return null when both generation fails and current library is disposed');
  assert.equal(resultDisposed.oldTexlib, null);

  // updateLobbyTexlib must ignore disposed library
  updateLobbyTexlib(game, initialLib);
  const lobbySurface = game.showcase.lob.set.mat.surface;
  assert.notEqual(lobbySurface.userData.texlibHolder.lib, initialLib, 'Lobby holder must not retain disposed library');
});

test('resolution fidelity and renderer state: no arbitrary resolution downgrade, state restored after generation', async () => {
  const THREE = await import(path.join(ROOT, 'inkwave-public/vendor/three/build/three.module.js'));
  const texlibMod = await loadComposedModule('src/world/texlib.js');
  const { createTextureLibrary } = texlibMod;
  const renderer = createMockRenderer(THREE);

  const initialRT = { isDummyRT: true };
  renderer.setRenderTarget(initialRT);
  renderer.autoClear = true;
  renderer.xr.enabled = false;

  // High desktop quality: size 512
  const highLib = await createTextureLibrary(renderer, { size: 512, stage: 'tidewater' });
  assert.equal(highLib.size, 512);
  assert.equal(highLib.albedo.image.width, 512);
  assert.equal(highLib.albedo.image.height, 512);
  assert.equal(highLib.stats.size, 512);
  assert.ok(highLib.stats.ms >= 0);
  assert.ok(highLib.stats.compileMs >= 0);

  // Touch / mobile quality: size 256
  const lowLib = await createTextureLibrary(renderer, { size: 256, stage: 'tidewater' });
  assert.equal(lowLib.size, 256);
  assert.equal(lowLib.albedo.image.width, 256);
  assert.equal(lowLib.albedo.image.height, 256);
  assert.equal(lowLib.stats.size, 256);

  // Renderer state must be restored to exact prior values
  assert.equal(renderer.getRenderTarget(), initialRT, 'Renderer active render target must be restored');
  assert.equal(renderer.autoClear, true, 'autoClear must be restored');
  assert.equal(renderer.xr.enabled, false, 'xr.enabled must be restored');

  // Mipmap generation verified on textures
  for (const t of [highLib.albedo, highLib.normal, highLib.orm]) {
    assert.equal(t.generateMipmaps, true, 'Full mip chain must be enabled on all 3 array attachments');
    assert.equal(t.minFilter, THREE.LinearMipmapLinearFilter);
    assert.equal(t.magFilter, THREE.LinearFilter);
  }

  highLib.dispose();
  lowLib.dispose();
});

test('negative control: unpatched upstream baseline generates all 28 layers unconditionally on cold boot', async () => {
  const THREE = await import(path.join(ROOT, 'inkwave-public/vendor/three/build/three.module.js'));
  const rawTexlibCode = fs.readFileSync(path.join(ROOT, 'inkwave-public/src/world/texlib.js'), 'utf8');

  // Verify that upstream source contains the eager push of STAGE_SURFACES into MATERIALS
  assert.match(rawTexlibCode, /for\s*\(\s*const\s+s\s+of\s+STAGE_SURFACES\s*\)\s*MATERIALS\.push/);

  // In unpatched baseline, createTextureLibrary ignores stage and always creates depth = 28
  const context = vm.createContext({ console, performance });
  const upstream = path.join(ROOT, 'inkwave-public');
  function resolve(spec, from) {
    if (spec === 'three') return path.join(upstream, 'vendor/three/build/three.module.js');
    return path.resolve(path.dirname(from), spec);
  }
  function loadRaw(file) {
    const code = fs.readFileSync(file, 'utf8');
    const mod = new vm.SourceTextModule(code, { context, identifier: file });
    return mod;
  }
  const rawMod = loadRaw(path.join(upstream, 'src/world/texlib.js'));
  await rawMod.link((spec, from) => loadRaw(resolve(spec, from.identifier)));
  await rawMod.evaluate();

  const renderer = createMockRenderer(THREE);
  const baselineLib = await rawMod.namespace.createTextureLibrary(renderer, { size: 256, stage: 'tidewater' });
  assert.equal(baselineLib.names.length, 28, 'Unpatched baseline unconditionally generates 28 layers including Cargo');
  assert.equal(baselineLib.albedo.image.depth, 28, 'Unpatched baseline pins 28 layers on coldboot Tidewater');
  baselineLib.dispose();
});

// Resolve the same module URLs the built browser uses. Injecting createFn would
// conceal a broken default dynamic-import route during a real stage transition.
async function publishedLoader(overrides = {}) {
  const errors = [];
  const context = vm.createContext({ console: { ...console, error: (...v) => errors.push(v) }, performance });
  const modules = new Map();
  const resolve = (spec, from) => {
    if (spec === 'three') return 'https://inkwave.test/vendor/three/build/three.module.js';
    if (spec.startsWith('three/addons/')) return 'https://inkwave.test/vendor/three/jsm/' + spec.slice(13);
    return new URL(spec, from).href;
  };
  const load = (url) => {
    if (modules.has(url)) return modules.get(url);
    const rel = new URL(url).pathname.slice(1);
    const code = overrides[rel] ?? (rel.startsWith('patches/')
      ? fs.readFileSync(path.join(ROOT, rel), 'utf8') : compose(rel));
    const mod = new vm.SourceTextModule(code, {
      context, identifier: url,
      importModuleDynamically: async (spec, from) => {
        const child = load(resolve(spec, from.identifier));
        if (child.status === 'unlinked') await child.link(linker);
        if (child.status === 'linked') await child.evaluate();
        return child;
      },
    });
    modules.set(url, mod);
    return mod;
  };
  const linker = (spec, from) => load(resolve(spec, from.identifier));
  return {
    errors,
    async get(rel) {
      const mod = load('https://inkwave.test/' + rel);
      if (mod.status === 'unlinked') await mod.link(linker);
      if (mod.status === 'linked') await mod.evaluate();
      return mod.namespace;
    },
  };
}

test('native world commit uses the published default factory route and preserves single cold generation', async () => {
  const loader = await publishedLoader();
  const THREE = await loader.get('vendor/three/build/three.module.js');
  const native = await loader.get('src/world/texlib.js');
  const runtime = await loader.get('patches/local-quality/texlib.mjs');
  const levelMaterial = await loader.get('src/world/levelMaterial.js');
  const renderer = createMockRenderer(THREE);
  let generations = 0;
  renderer.compileAsync = async () => { generations++; };
  const cold = await native.createTextureLibrary(renderer, { size: 256, stage: 'tidewater' });
  const reuse = await runtime.syncWorldTexlib({ texlib: cold }, 'tidewater', renderer, 256, null, native.STAGE_SURFACES);
  assert.equal(reuse.nextTexlib, cold);
  assert.equal(generations, 1, 'first world must reuse cold generation');

  const main = compose('src/main.js');
  const at = main.indexOf('  async _buildWorld(');
  const until = main.indexOf('\n  // deck slabs over the sea:', at);
  assert.ok(at >= 0 && until > at);
  const G = { scene: new THREE.Scene(), renderer, teamColors: [], paint: null };
  const resources = [];
  class Paint {
    constructor(_r, _l, opts) { this.size = opts.atlasSize; this.texture = new THREE.DataTexture(new Uint8Array(4), 1, 1); resources.push(this); }
    dispose() { this.disposed = true; this.texture.dispose(); }
  }
  const context = vm.createContext({
    G, THREE, console, Promise,
    MAP_LAYOUTS: { tidewater: {}, cargo: {}, kelpline: {} },
    effectiveQuality: () => ({ paintAtlas: 2048 }), dressingFor: () => [],
    Level: class { constructor() { this.bounds = {}; } buildGeometry() { return new THREE.BoxGeometry(); } },
    Physics: class {}, SwimWake: class { reset() {} }, Decor: class { dispose() {} },
    NavGraph: class {}, Minimap: class {}, PaintSystem: Paint,
    createLevelMaterial: levelMaterial.createLevelMaterial,
    STAGE_SURFACES: native.STAGE_SURFACES,
    syncWorldTexlib: runtime.syncWorldTexlib, updateLobbyTexlib: runtime.updateLobbyTexlib,
  });
  const Game = vm.runInContext(`class Game {\n${main.slice(at, until)}\n}; Game;`, context);
  const game = new Game();
  game.texlib = cold; game.layoutId = 'tidewater'; game.settings = {}; game.mobile = false;
  game.murals = { userData: { setStage() {} } }; game._loadLightmap = async () => null;
  await game._buildWorld({ id: 'cargo' });
  assert.equal(game.texlib.names.length, 28, 'default factory must actually load native Cargo pack');
  assert.equal(game.texlib.stage, 'cargo');
  assert.equal(game.levelMat.userData.uniforms.uTL.value[28].x, 25);
  assert.equal(cold.disposed, true);
  assert.equal(generations, 2);
  const cargo = game.texlib;
  await game._buildWorld({ id: 'kelpline' });
  assert.equal(game.texlib.names.length, 25);
  assert.equal(game.texlib.stage, null);
  assert.equal(cargo.disposed, true);
  assert.equal(generations, 3);
  assert.equal(loader.errors.length, 0);
  game.texlib.dispose(); game.levelMat.dispose(); game.grateMat.dispose();
  game.levelMesh.geometry.dispose(); game.grateMesh.geometry.dispose();
  for (const p of resources) if (!p.disposed) p.dispose();
});

test('negative control catches the former misplaced runtime-relative factory import', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'patches/local-quality/texlib.mjs'), 'utf8');
  assert.ok(source.includes("import('../../src/world/texlib.js')"));
  const loader = await publishedLoader({
    'patches/local-quality/texlib.mjs': source.replace("import('../../src/world/texlib.js')", "import('./world/texlib.js')"),
  });
  const THREE = await loader.get('vendor/three/build/three.module.js');
  const native = await loader.get('src/world/texlib.js');
  const runtime = await loader.get('patches/local-quality/texlib.mjs');
  const renderer = createMockRenderer(THREE);
  const result = await runtime.syncWorldTexlib({}, 'cargo', renderer, 256, null, native.STAGE_SURFACES);
  assert.equal(result.nextTexlib, null, 'broken route must fail rather than being hidden by injected factory');
  assert.equal(loader.errors.length, 1);
});


test('actual native factory failures retire candidate resources and restore renderer while preserving the live library', async () => {
  for (const failure of ['compile', 'render']) {
    const loader = await publishedLoader();
    const THREE = await loader.get('vendor/three/build/three.module.js');
    const native = await loader.get('src/world/texlib.js');
    const runtime = await loader.get('patches/local-quality/texlib.mjs');
    const renderer = createMockRenderer(THREE);
    const current = await native.createTextureLibrary(renderer, { size: 256, stage: null });
    const prevRT = new THREE.WebGLRenderTarget(1, 1);
    renderer.setRenderTarget(prevRT); renderer.xr.enabled = true;
    const disposed = { materials: 0, geometry: 0, candidate: 0 };
    let materialCount = 0;
    renderer.compileAsync = async (scene) => {
      materialCount = scene.children.length;
      for (const mesh of scene.children) mesh.material.addEventListener('dispose', () => disposed.materials++);
      scene.children[0].geometry.addEventListener('dispose', () => disposed.geometry++);
      if (failure === 'compile') throw Error('native compilation failed');
    };
    renderer.initRenderTarget = (rt) => rt.addEventListener('dispose', () => disposed.candidate++);
    renderer.render = () => { if (failure === 'render') throw Error('native layer render failed'); };
    const result = await runtime.syncWorldTexlib({ texlib: current }, 'cargo', renderer, 256, null, native.STAGE_SURFACES);
    assert.equal(result.nextTexlib, current, 'valid current library remains available on native failure');
    assert.equal(result.oldTexlib, null);
    assert.equal(current.disposed, undefined);
    assert.equal(renderer.getRenderTarget(), prevRT, 'renderer target restored');
    assert.equal(renderer.autoClear, true);
    assert.equal(renderer.xr.enabled, true);
    assert.equal(disposed.materials, materialCount, 'native temporary generator programs all disposed');
    assert.equal(disposed.geometry, 1, 'native temporary generator geometry disposed once');
    if (failure === 'render') assert.equal(disposed.candidate, 1, 'initialized native candidate target disposed once');
    assert.equal(loader.errors.length, 1);
    current.dispose(); prevRT.dispose();
  }
});

test('native lobby materials invalidate cached programs only when texlib presence changes', async () => {
  const THREE = await import(path.join(ROOT, 'inkwave-public/vendor/three/build/three.module.js'));
  const native = await loadComposedModule('src/world/texlib.js');
  const mats = await loadComposedModule('src/game/lobbySet-mats.js');
  const lib = await native.createTextureLibrary(createMockRenderer(THREE), { size: 256 });
  const texture = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  const surface = mats.surfaceMaterial(mats.makeUniforms(), null, texture, texture);
  const ground = mats.groundMaterial(mats.makeUniforms(), null, texture, new THREE.Vector4(), texture);
  const game = { showcase: { lob: { set: { mat: { surface, ground } } } } };
  const versions = [surface.version, ground.version];
  updateLobbyTexlib(game, lib);
  [surface, ground].forEach((m, i) => assert.equal(m.version, versions[i] + 1, 'Three renderer requires needsUpdate to acquire the newly texlib-enabled shader'));
  updateLobbyTexlib(game, lib);
  [surface, ground].forEach((m, i) => assert.equal(m.version, versions[i] + 1, 'Stable texlib presence updates uniforms without recompiling'));
  lib.dispose();
  surface.userData.shaderUniforms = { tAlbedo: { value: lib.albedo }, tNormal: { value: lib.normal }, tOrm: { value: lib.orm } };
  updateLobbyTexlib(game, null);
  [surface, ground].forEach((m, i) => {
    assert.equal(m.version, versions[i] + 2, 'Disposed library removal must acquire the procedural shader');
    assert.equal(m.userData.texlibHolder.lib, null);
  });
  assert.equal(surface.userData.shaderUniforms.tAlbedo.value, null);
  assert.equal(game.showcase.lob.set.texlib, null);
  surface.dispose(); ground.dispose(); texture.dispose();
});
