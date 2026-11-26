import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { qualityIdentity } from '../adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = path.join(ROOT, 'inkwave-public');

async function loadModuleWithThree(relPath) {
  const fullPath = path.join(ROOT, relPath);
  const context = vm.createContext({
    console,
    Math,
    Float32Array,
    Int32Array,
    Uint8Array,
    Uint32Array,
    Symbol,
    Object,
    Array,
    Number,
    Map,
    Set,
    WeakMap,
    Error,
    TypeError,
    RangeError,
  });
  const modules = new Map();
  const load = (requested) => {
    if (modules.has(requested)) return modules.get(requested);
    const text = fs.readFileSync(requested, 'utf8');
    const mod = new vm.SourceTextModule(text, {
      context,
      identifier: requested,
      initializeImportMeta(meta) { meta.url = pathToFileURL(requested).href; },
    });
    modules.set(requested, mod);
    return mod;
  };
  const entry = load(fullPath);
  await entry.link((spec, from) => {
    if (spec === 'three') return load(path.join(UPSTREAM, 'vendor/three/build/three.module.js'));
    if (spec.startsWith('three/addons/')) {
      return load(path.join(UPSTREAM, 'vendor/three/jsm', spec.slice('three/addons/'.length)));
    }
    return load(path.resolve(path.dirname(from.identifier), spec));
  });
  await entry.evaluate();
  return entry.namespace;
}

function createMockPaintHarness({ N = 2048, withState = true, prevRenderTarget = null } = {}) {
  const calls = {
    getParameter: [],
    activeTexture: 0,
    bindTexture: [],
    unbindTexture: 0,
    bindFramebuffer: [],
    copyTexSubImage2D: [],
    generateMipmap: [],
    texParameteri: [],
    fullRegen: 0,
  };
  const atlasTex = { id: 'atlas' };
  const prevFbo = prevRenderTarget ? { id: 'prev-fbo' } : null;
  let texSeq = 0, fboSeq = 0;

  const gl = {
    TEXTURE_2D: 0x0de1,
    RGBA: 0x1908,
    RGBA8: 0x8058,
    UNSIGNED_BYTE: 0x1401,
    TEXTURE_BASE_LEVEL: 0x813c,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    LINEAR_MIPMAP_LINEAR: 0x2703,
    LINEAR: 0x2601,
    CLAMP_TO_EDGE: 0x812f,
    READ_FRAMEBUFFER: 0x8ca8,
    DRAW_FRAMEBUFFER: 0x8ca9,
    READ_FRAMEBUFFER_BINDING: 0x8caa,
    DRAW_FRAMEBUFFER_BINDING: 0x8ca6,
    TEXTURE_BINDING_2D: 0x8069,
    PIXEL_PACK_BUFFER: 0x88eb,
    PIXEL_UNPACK_BUFFER: 0x88ec,
    PIXEL_PACK_BUFFER_BINDING: 0x88ed,
    PIXEL_UNPACK_BUFFER_BINDING: 0x88ef,
    PACK_ALIGNMENT: 0x0d05,
    PACK_ROW_LENGTH: 0x0d02,
    PACK_SKIP_PIXELS: 0x0d04,
    PACK_SKIP_ROWS: 0x0d03,
    UNPACK_ALIGNMENT: 0x0cf5,
    UNPACK_ROW_LENGTH: 0x0cf2,
    UNPACK_IMAGE_HEIGHT: 0x806e,
    UNPACK_SKIP_PIXELS: 0x0cf4,
    UNPACK_SKIP_ROWS: 0x0cf3,
    UNPACK_SKIP_IMAGES: 0x806d,
    UNPACK_FLIP_Y_WEBGL: 0x9240,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241,
    COLOR_ATTACHMENT0: 0x8ce0,
    FRAMEBUFFER_COMPLETE: 0x8cd5,
    getParameter(pname) {
      calls.getParameter.push(pname);
      if (pname === this.READ_FRAMEBUFFER_BINDING) return prevFbo;
      if (pname === this.TEXTURE_BINDING_2D) return { id: 'prev-tex' };
      return null;
    },
    getTexParameter(_target, pname) {
      return pname === this.TEXTURE_BASE_LEVEL ? 0 : null;
    },
    createTexture() { return { id: `scratch-tex-${++texSeq}` }; },
    createFramebuffer() { return { id: `scratch-fbo-${++fboSeq}` }; },
    deleteTexture() {},
    deleteFramebuffer() {},
    bindBuffer() {},
    pixelStorei() {},
    texSubImage2D() {},
    readPixels(_x, _y, _w, _h, _f, _t, buf) { buf.fill(0); },
    bindTexture(target, tex) { calls.bindTexture.push({ via: 'gl', target, tex }); },
    bindFramebuffer(target, fbo) { calls.bindFramebuffer.push({ via: 'gl', target, fbo }); },
    texStorage2D() {},
    texParameteri(target, pname, param) { calls.texParameteri.push({ target, pname, param }); },
    framebufferTexture2D() {},
    checkFramebufferStatus() { return this.FRAMEBUFFER_COMPLETE; },
    copyTexSubImage2D(target, level, xoffset, yoffset, x, y, w, h) {
      calls.copyTexSubImage2D.push({ target, level, xoffset, yoffset, x, y, w, h });
    },
    generateMipmap(target) { calls.generateMipmap.push(target); },
    isContextLost() { return false; },
  };

  const propMap = new WeakMap();
  const rtTexture = {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    colorSpace: THREE.NoColorSpace,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
  };
  const rt = { width: N, height: N, samples: 0, texture: rtTexture };
  propMap.set(rtTexture, { __webglTexture: atlasTex });
  if (prevRenderTarget) propMap.set(prevRenderTarget, { __webglFramebuffer: prevFbo });

  const state = withState ? {
    activeTexture() { calls.activeTexture++; },
    bindTexture(target, tex) { calls.bindTexture.push({ via: 'state', target, tex }); },
    unbindTexture() { calls.unbindTexture++; },
    bindFramebuffer(target, fbo) { calls.bindFramebuffer.push({ via: 'state', target, fbo }); },
  } : undefined;

  let activeRt = prevRenderTarget;
  const renderer = {
    state,
    properties: { get: (k) => propMap.get(k) || {} },
    getContext: () => gl,
    getRenderTarget: () => activeRt,
    setRenderTarget: (t) => { activeRt = t; },
  };

  const mat = {
    vertexShader: 'void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }',
    fragmentShader: 'void main(){ gl_FragColor = vec4(1.0); }',
  };

  class MockPaintSystem {
    constructor() {
      this.renderer = renderer;
      this.size = N;
      this.rt = rt;
      this.mat = mat;
      this.mesh = { material: mat };
      this.level = { native: false };
      this.aPos = new Float32Array(64 * 8);
      this.quads = 0;
      this.dryMesh = { visible: false, geometry: { attributes: { position: null }, index: null, drawRange: { count: 0 } } };
      this._mipRequested = false;
      this._mipsDirty = false;
      this._mipRebuildCount = 0;
      this.clock = 1.0;
    }
    _initGPU() {}
    clear() {}
    _drawQuads() {}
    _regenerateMipmaps() { calls.fullRegen++; }
    dispose() {}
  }

  function addQuadPixels(paint, x0, y0, x1, y1) {
    const q = paint.quads++;
    const i = q * 8;
    const nx0 = (x0 / N) * 2 - 1, nx1 = (x1 / N) * 2 - 1;
    const ny0 = (y0 / N) * 2 - 1, ny1 = (y1 / N) * 2 - 1;
    paint.aPos[i] = nx0; paint.aPos[i + 1] = ny0;
    paint.aPos[i + 2] = nx1; paint.aPos[i + 3] = ny0;
    paint.aPos[i + 4] = nx1; paint.aPos[i + 5] = ny1;
    paint.aPos[i + 6] = nx0; paint.aPos[i + 7] = ny1;
  }

  return { MockPaintSystem, calls, gl, renderer, prevFbo, atlasTex, addQuadPixels };
}

test('paint-regional-mips: zero gl.getParameter calls during generate() and cached allocate(), restores state via renderer.state', async () => {
  const { installPaintRegionalMips } = await loadModuleWithThree('patches/local-quality/paint-regional-mips.mjs');
  const prevRt = { id: 'prev-rt' };
  const h = createMockPaintHarness({ N: 2048, withState: true, prevRenderTarget: prevRt });
  installPaintRegionalMips(h.MockPaintSystem);

  const paint = new h.MockPaintSystem();
  paint._initGPU();
  // Second _initGPU on the same gl (after nativeMipCompatibility is cached) must make zero gl.getParameter calls
  h.calls.getParameter.length = 0;
  paint._initGPU();
  assert.equal(h.calls.getParameter.length, 0, 'allocate() makes zero gl.getParameter calls when renderer.state exists');

  const s = paint._iwPaintRegionalMips;
  assert.ok(s, 'regional mips state should allocate');
  assert.equal(s.renderer, h.renderer, 'renderer must be stored on state');
  assert.equal(s.grid, 8, '2048px atlas with 256px tiles has 8x8 grid');
  assert.equal(s.dirtyTiles.length, 64, 'Uint8Array bitset length is 8*8=64');

  h.calls.getParameter.length = 0;
  h.calls.bindTexture.length = 0;
  h.calls.bindFramebuffer.length = 0;
  h.calls.copyTexSubImage2D.length = 0;
  h.calls.texParameteri.length = 0;

  // Single splat in tile (1, 2)
  h.addQuadPixels(paint, 300, 550, 340, 590);
  paint._mipRequested = true;
  paint._drawQuads();

  assert.equal(h.calls.getParameter.length, 0, 'generate() must make ZERO gl.getParameter calls when renderer.state exists');
  assert.equal(h.calls.fullRegen, 0, 'single tile uses partial mip update');
  assert.equal(s.partial, 1);
  assert.ok(h.calls.activeTexture >= 1, 'uses renderer.state.activeTexture()');
  assert.ok(h.calls.unbindTexture >= 1, 'restores texture via renderer.state.unbindTexture()');
  // Last framebuffer bind must restore prevFbo via renderer.state
  const lastFboBind = h.calls.bindFramebuffer[h.calls.bindFramebuffer.length - 1];
  assert.equal(lastFboBind.via, 'state');
  assert.equal(lastFboBind.target, h.gl.READ_FRAMEBUFFER);
  assert.equal(lastFboBind.fbo, h.prevFbo);
  // Last TEXTURE_BASE_LEVEL must be reset to 0
  const lastBase = h.calls.texParameteri[h.calls.texParameteri.length - 1];
  assert.equal(lastBase.pname, h.gl.TEXTURE_BASE_LEVEL);
  assert.equal(lastBase.param, 0);
  // Dirty bitset must be cleared after generate()
  assert.equal(s.dirtyCount, 0);
  assert.equal(s.dirty, false);
});

test('paint-regional-mips: safe fallback when renderer.state is absent', async () => {
  const { installPaintRegionalMips } = await loadModuleWithThree('patches/local-quality/paint-regional-mips.mjs');
  const h = createMockPaintHarness({ N: 2048, withState: false, prevRenderTarget: { id: 'mock-rt' } });
  installPaintRegionalMips(h.MockPaintSystem);

  const paint = new h.MockPaintSystem();
  paint._initGPU();
  h.calls.getParameter.length = 0;
  h.calls.bindFramebuffer.length = 0;

  h.addQuadPixels(paint, 50, 50, 80, 80);
  paint._mipRequested = true;
  paint._drawQuads();

  assert.equal(h.calls.fullRegen, 0);
  assert.ok(h.calls.getParameter.includes(h.gl.READ_FRAMEBUFFER_BINDING), 'fallback queries READ_FRAMEBUFFER_BINDING');
  assert.ok(h.calls.getParameter.includes(h.gl.TEXTURE_BINDING_2D), 'fallback queries TEXTURE_BINDING_2D');
  const lastFboBind = h.calls.bindFramebuffer[h.calls.bindFramebuffer.length - 1];
  assert.equal(lastFboBind.via, 'gl');
  assert.equal(lastFboBind.fbo, h.prevFbo);
});

test('paint-regional-mips: disjoint distant tiles stay partial without full-atlas fallback, and >8 tiles fall back', async () => {
  const { installPaintRegionalMips } = await loadModuleWithThree('patches/local-quality/paint-regional-mips.mjs');
  const h = createMockPaintHarness({ N: 2048, withState: true });
  installPaintRegionalMips(h.MockPaintSystem);

  const paint = new h.MockPaintSystem();
  paint._initGPU();
  const s = paint._iwPaintRegionalMips;

  // Two splats on opposite corners of the 2048x2048 atlas: tile (0,0) and tile (7,7).
  // Old monolithic AABB would span 8x8=64 tiles and force full gl.generateMipmap!
  // Tile dirty bitset marks only 2 tiles -> partial rebuild of exactly those 2 tiles.
  h.addQuadPixels(paint, 16, 16, 48, 48);
  h.addQuadPixels(paint, 1900, 1900, 1950, 1950);
  paint._mipRequested = true;
  h.calls.copyTexSubImage2D.length = 0;
  paint._drawQuads();

  assert.equal(h.calls.fullRegen, 0, '2 disjoint corner tiles must NOT trigger full-atlas fallback');
  assert.equal(s.partial, 1);
  // Level 0 copies should be exactly (0, 0) and (1792, 1792) of size 256x256
  const level0Copies = h.calls.copyTexSubImage2D.filter(c => c.level === 0);
  assert.equal(level0Copies.length, 2);
  assert.deepEqual(level0Copies.map(c => [c.x, c.y, c.w, c.h]), [
    [0, 0, 256, 256],
    [1792, 1792, 256, 256],
  ]);

  // Exactly 8 disjoint tiles across the atlas: still partial!
  paint.quads = 0;
  for (let t = 0; t < 8; t++) {
    const px = t * 256 + 64, py = t * 256 + 64;
    h.addQuadPixels(paint, px, py, px + 32, py + 32);
  }
  paint._mipRequested = true;
  h.calls.copyTexSubImage2D.length = 0;
  paint._drawQuads();
  assert.equal(h.calls.fullRegen, 0, '8 disjoint tiles must stay on partial path');
  assert.equal(h.calls.copyTexSubImage2D.filter(c => c.level === 0).length, 8);
  assert.equal(s.partial, 2);

  // 9 disjoint tiles (> 8): must fall back to full atlas mipmap!
  paint.quads = 0;
  for (let t = 0; t < 8; t++) {
    const px = t * 256 + 64, py = t * 256 + 64;
    h.addQuadPixels(paint, px, py, px + 32, py + 32);
  }
  h.addQuadPixels(paint, 64, 1792 + 64, 96, 1792 + 96); // 9th tile: (0, 7)
  paint._mipRequested = true;
  paint._drawQuads();
  assert.equal(s.full, 1, '9 dirty tiles (>8) must trigger full-atlas fallback');
  assert.equal(s.dirtyCount, 0, 'bitset resets after full fallback');
});

test('paint-regional-mips: dryMesh per-triangle tracking marks interior tiles and disjoint drying rects accurately', async () => {
  const { installPaintRegionalMips } = await loadModuleWithThree('patches/local-quality/paint-regional-mips.mjs');
  const h = createMockPaintHarness({ N: 2048, withState: true });
  installPaintRegionalMips(h.MockPaintSystem);

  const paint = new h.MockPaintSystem();
  paint._initGPU();
  const s = paint._iwPaintRegionalMips;

  // Two disjoint drying quads: tile (0,0) and tile (7,7), 2 triangles each = 12 vertices
  const verts = [];
  const pushQuad = (x0, y0, x1, y1) => {
    const nx0 = (x0 / 2048) * 2 - 1, nx1 = (x1 / 2048) * 2 - 1;
    const ny0 = (y0 / 2048) * 2 - 1, ny1 = (y1 / 2048) * 2 - 1;
    verts.push(nx0, ny0, 0, nx1, ny0, 0, nx1, ny1, 0, nx0, ny0, 0, nx1, ny1, 0, nx0, ny1, 0);
  };
  pushQuad(32, 32, 96, 96);
  pushQuad(1850, 1850, 1950, 1950);

  const posAttr = new THREE.BufferAttribute(new Float32Array(verts), 3);
  paint.dryMesh = {
    visible: true,
    geometry: {
      attributes: { position: posAttr },
      index: null,
      drawRange: { count: 12 },
    },
  };
  paint._mipRequested = true;
  h.calls.copyTexSubImage2D.length = 0;
  paint._drawQuads();

  assert.equal(s.partial, 1);
  assert.equal(s.full, 0);
  const level0Copies = h.calls.copyTexSubImage2D.filter(c => c.level === 0);
  assert.deepEqual(level0Copies.map(c => [c.x, c.y]), [[0, 0], [1792, 1792]]);
});

test('grade-output-fusion: toggles on extraPass.enabled, syncs toneMapping/colorSpace defines, preserves passes & disposes both materials', async () => {
  const fusion = await loadModuleWithThree('patches/local-quality/grade-output-fusion.mjs');
  const { setupGradeOutputFusion, syncGradeOutputFusion, disposeGradeOutputFusion } = fusion;

  const linearFragment = `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      gl_FragColor = c;
    }
  `;
  let linearDisposed = 0;
  const uniforms = { tDiffuse: { value: null }, uExposure: { value: 1.0 } };
  const linearMat = {
    uniforms,
    fragmentShader: linearFragment,
    dispose() { linearDisposed++; },
  };
  const gradePass = { uniforms, material: linearMat, enabled: true };
  const outputPass = { enabled: true };
  const extraPass = { enabled: false };
  const passes = [{ name: 'render' }, gradePass, extraPass, outputPass];
  const renderer = {
    toneMapping: THREE.NeutralToneMapping,
    outputColorSpace: THREE.SRGBColorSpace,
    toneMappingExposure: 1.0,
  };
  const owner = { renderer, grade: gradePass, outputPass, extraPass, composer: { passes } };

  assert.equal(setupGradeOutputFusion(owner), true);
  assert.equal(owner._gradeLinearMat, linearMat);
  assert.ok(owner._gradeOutputMat, 'fused RawShaderMaterial created');
  assert.equal(owner._gradeOutputMat.isRawShaderMaterial, true);
  assert.equal(owner._gradeOutputMat.uniforms, uniforms, 'fused material shares exact uniforms object');
  assert.equal(uniforms.toneMappingExposure.value, 1.0);
  assert.ok(owner._gradeOutputMat.fragmentShader.includes('#include <tonemapping_pars_fragment>'));
  assert.ok(owner._gradeOutputMat.fragmentShader.includes('#include <colorspace_pars_fragment>'));
  assert.ok(owner._gradeOutputMat.fragmentShader.includes('NeutralToneMapping'));
  assert.ok(owner._gradeOutputMat.fragmentShader.includes('sRGBTransferOETF'));

  // Initial state: extraPass.enabled === false -> fused
  assert.equal(gradePass.material, owner._gradeOutputMat);
  assert.equal(outputPass.enabled, false);
  assert.deepEqual({ ...owner._gradeOutputMat.defines }, { SRGB_TRANSFER: '', NEUTRAL_TONE_MAPPING: '' });
  assert.equal(owner.composer.passes, passes, 'composer.passes array identity preserved');
  assert.equal(owner.composer.passes.length, 4);

  // Unchanged toneMapping / outputColorSpace should not bump material.version
  const v0 = owner._gradeOutputMat.version;
  renderer.toneMappingExposure = 1.25;
  assert.equal(owner._syncGradeOutputFusion(), true);
  assert.equal(uniforms.toneMappingExposure.value, 1.25);
  assert.equal(owner._gradeOutputMat.version, v0);

  // Dynamic toneMapping & outputColorSpace change updates defines and bumps material.version (needsUpdate = true)
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  syncGradeOutputFusion(owner);
  assert.deepEqual({ ...owner._gradeOutputMat.defines }, { ACES_FILMIC_TONE_MAPPING: '' });
  assert.equal(owner._gradeOutputMat.version, v0 + 1);

  // Restore Neutral + SRGB
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  syncGradeOutputFusion(owner);
  assert.deepEqual({ ...owner._gradeOutputMat.defines }, { SRGB_TRANSFER: '', NEUTRAL_TONE_MAPPING: '' });
  assert.equal(owner._gradeOutputMat.version, v0 + 2);

  // Enable extraPass (ScreenFX): switches back to linear Grade + enabled OutputPass
  extraPass.enabled = true;
  assert.equal(syncGradeOutputFusion(owner), false);
  assert.equal(gradePass.material, linearMat);
  assert.equal(outputPass.enabled, true);
  assert.equal(owner.composer.passes, passes, 'composer.passes identity preserved on unfuse');

  // Disable extraPass again: re-fuses
  extraPass.enabled = false;
  assert.equal(syncGradeOutputFusion(owner), true);
  assert.equal(gradePass.material, owner._gradeOutputMat);
  assert.equal(outputPass.enabled, false);

  // Dispose: simulates _disposeComposer where grade.dispose() disposes active material
  let fusedDisposed = 0;
  const origFusedDispose = owner._gradeOutputMat.dispose.bind(owner._gradeOutputMat);
  owner._gradeOutputMat.dispose = () => { fusedDisposed++; origFusedDispose(); };

  gradePass.material.dispose(); // active is _gradeOutputMat
  disposeGradeOutputFusion(owner, { gradeDisposed: true });
  assert.equal(fusedDisposed, 1, 'fused material disposed exactly once');
  assert.equal(linearDisposed, 1, 'linear material disposed exactly once');
  assert.equal(owner._gradeLinearMat, null);
  assert.equal(owner._gradeOutputMat, null);
});

test('full adaptBuildSource composition for src/core/renderer.js wires grade-output-fusion cleanly and registers identity/preload', () => {
  const raw = fs.readFileSync(path.join(UPSTREAM, 'src/core/renderer.js'), 'utf8');
  const composed = adaptBuildSource('src/core/renderer.js', raw);

  assert.ok(composed.includes("from '../../patches/local-quality/grade-output-fusion.mjs'"));
  assert.ok(composed.includes('this.outputPass = new OutputPass();'));
  assert.ok(composed.includes('setupGradeOutputFusion(this);'));
  assert.ok(composed.includes('this._syncGradeOutputFusion?.();'));
  assert.ok(composed.includes('disposeGradeOutputFusion(this, { gradeDisposed: true });'));
  // Existing adapters remain intact
  assert.ok(composed.includes('installPausedFrameRetention(Renderer);'));
  assert.ok(composed.includes('installHalfResGtao(ao, { basePdRadius: 6 });'));
  assert.ok(composed.includes('configureComposerColorTargets(THREE, composer, composerColorTarget);'));
  assert.ok(composed.includes('if (uExposure != 1.0) c.rgb *= uExposure;'));
  assert.ok(composed.includes('_iwComposerPass = true;'));
  // _syncGradeOutputFusion runs before composer.render()
  assert.ok(composed.indexOf('this._syncGradeOutputFusion?.();') < composed.indexOf('this.composer.render();'));

  // Registered in qualityIdentity() and scripts/build-inkwave.mjs deferredIntegrationPreloads
  const id = qualityIdentity();
  assert.equal(typeof id['grade-output-fusion.mjs'], 'string');
  assert.equal(id['grade-output-fusion.mjs'].length, 64);

  const buildScript = fs.readFileSync(path.join(ROOT, 'scripts/build-inkwave.mjs'), 'utf8');
  assert.ok(buildScript.includes("'patches/local-quality/grade-output-fusion.mjs'"));
});
