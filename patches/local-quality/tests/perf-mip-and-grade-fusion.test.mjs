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
    Uint16Array,
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

function createMockPaintHarness({ N = 2048, withState = true, prevRenderTarget = null, prevRenderTargetProps = null } = {}) {
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
  const prevMsaaFbo = prevRenderTarget?.samples > 0 ? { id: 'prev-msaa-fbo' } : null;
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
  if (prevRenderTarget) {
    propMap.set(prevRenderTarget, prevRenderTargetProps ?? {
      __webglFramebuffer: prevFbo,
      ...(prevMsaaFbo ? { __webglMultisampledFramebuffer: prevMsaaFbo } : {}),
    });
  }

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

  return { MockPaintSystem, calls, gl, renderer, prevFbo, prevMsaaFbo, atlasTex, addQuadPixels };
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

test('paint-regional-mips: prevRenderTarget null restores null framebuffer via renderer.state', async () => {
  const { installPaintRegionalMips } = await loadModuleWithThree('patches/local-quality/paint-regional-mips.mjs');
  const h = createMockPaintHarness({ N: 2048, withState: true, prevRenderTarget: null });
  installPaintRegionalMips(h.MockPaintSystem);

  const paint = new h.MockPaintSystem();
  paint._initGPU();
  h.calls.bindFramebuffer.length = 0;

  h.addQuadPixels(paint, 64, 64, 96, 96);
  paint._mipRequested = true;
  paint._drawQuads();

  assert.equal(h.calls.fullRegen, 0);
  const lastFboBind = h.calls.bindFramebuffer[h.calls.bindFramebuffer.length - 1];
  assert.equal(lastFboBind.via, 'state');
  assert.equal(lastFboBind.target, h.gl.READ_FRAMEBUFFER);
  assert.equal(lastFboBind.fbo, null);
});

test('paint-regional-mips: multisampled prevRenderTarget (samples: 4) restores __webglMultisampledFramebuffer and falls back to __webglFramebuffer', async () => {
  const { installPaintRegionalMips } = await loadModuleWithThree('patches/local-quality/paint-regional-mips.mjs');

  // Case 1: samples: 4 with __webglMultisampledFramebuffer present
  const msaaRt = { id: 'msaa-rt', samples: 4 };
  const h1 = createMockPaintHarness({ N: 2048, withState: true, prevRenderTarget: msaaRt });
  installPaintRegionalMips(h1.MockPaintSystem);
  const p1 = new h1.MockPaintSystem();
  p1._initGPU();
  h1.calls.bindFramebuffer.length = 0;

  h1.addQuadPixels(p1, 64, 64, 96, 96);
  p1._mipRequested = true;
  p1._drawQuads();

  const lastFbo1 = h1.calls.bindFramebuffer[h1.calls.bindFramebuffer.length - 1];
  assert.equal(lastFbo1.via, 'state');
  assert.equal(lastFbo1.target, h1.gl.READ_FRAMEBUFFER);
  assert.equal(lastFbo1.fbo, h1.prevMsaaFbo, 'must restore __webglMultisampledFramebuffer when samples > 0');

  // Case 2: samples: 4 without __webglMultisampledFramebuffer falls back to __webglFramebuffer
  const fallbackFbo = { id: 'fallback-fbo' };
  const msaaRtFallback = { id: 'msaa-rt-fallback', samples: 4 };
  const h2 = createMockPaintHarness({
    N: 2048,
    withState: true,
    prevRenderTarget: msaaRtFallback,
    prevRenderTargetProps: { __webglFramebuffer: fallbackFbo },
  });
  installPaintRegionalMips(h2.MockPaintSystem);
  const p2 = new h2.MockPaintSystem();
  p2._initGPU();
  h2.calls.bindFramebuffer.length = 0;

  h2.addQuadPixels(p2, 64, 64, 96, 96);
  p2._mipRequested = true;
  p2._drawQuads();

  const lastFbo2 = h2.calls.bindFramebuffer[h2.calls.bindFramebuffer.length - 1];
  assert.equal(lastFbo2.via, 'state');
  assert.equal(lastFbo2.fbo, fallbackFbo, 'must fall back to __webglFramebuffer when __webglMultisampledFramebuffer is absent');
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

test('paint-regional-mips: N=512 4-tile stays partial and 5-tile 25%-area triggers full fallback', async () => {
  const { installPaintRegionalMips } = await loadModuleWithThree('patches/local-quality/paint-regional-mips.mjs');
  const h = createMockPaintHarness({ N: 512, withState: true });
  installPaintRegionalMips(h.MockPaintSystem);

  const paint = new h.MockPaintSystem();
  paint._initGPU();
  const s = paint._iwPaintRegionalMips;
  assert.equal(s.size, 128, 'N=512 uses 128px tiles');
  assert.equal(s.grid, 4, 'N=512 has 4x4=16 tiles');

  // 4 tiles = exactly 25% area (4 * 128^2 === 512^2 * 0.25) -> stays partial
  for (let t = 0; t < 4; t++) {
    const px = t * 128 + 32, py = t * 128 + 32;
    h.addQuadPixels(paint, px, py, px + 16, py + 16);
  }
  paint._mipRequested = true;
  h.calls.copyTexSubImage2D.length = 0;
  paint._drawQuads();
  assert.equal(s.partial, 1, '4 tiles (25% area) must remain partial');
  assert.equal(s.full, 0);
  assert.equal(h.calls.copyTexSubImage2D.filter(c => c.level === 0).length, 4);

  // 5 tiles (> 25% area even though <= 8 tiles) -> triggers full fallback
  paint.quads = 0;
  for (let t = 0; t < 4; t++) {
    const px = t * 128 + 32, py = t * 128 + 32;
    h.addQuadPixels(paint, px, py, px + 16, py + 16);
  }
  h.addQuadPixels(paint, 32, 3 * 128 + 32, 48, 3 * 128 + 48); // 5th tile: (0, 3)
  paint._mipRequested = true;
  paint._drawQuads();
  assert.equal(s.full, 1, '5 tiles on N=512 (>25% area) must trigger full fallback');
  assert.equal(s.partial, 1, '5 tiles on N=512 must not increment partial counter');
  assert.equal(paint._mipRequested, true, 'native full mipmap request remains active on fallback');
  assert.equal(s.dirtyCount, 0);
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

test('paint-regional-mips: indexed dryMesh marks exact tiles via geometry.index', async () => {
  const { installPaintRegionalMips } = await loadModuleWithThree('patches/local-quality/paint-regional-mips.mjs');
  const h = createMockPaintHarness({ N: 2048, withState: true });
  installPaintRegionalMips(h.MockPaintSystem);

  const paint = new h.MockPaintSystem();
  paint._initGPU();
  const s = paint._iwPaintRegionalMips;

  const toNdc = (px) => (px / 2048) * 2 - 1;
  // 8 vertices: quad A in tile (1, 0) [300..360, 40..100], quad B in tile (6, 7) [1600..1660, 1840..1900]
  const positions = new Float32Array([
    toNdc(300), toNdc(40), 0,
    toNdc(360), toNdc(40), 0,
    toNdc(360), toNdc(100), 0,
    toNdc(300), toNdc(100), 0,
    toNdc(1600), toNdc(1840), 0,
    toNdc(1660), toNdc(1840), 0,
    toNdc(1660), toNdc(1900), 0,
    toNdc(1600), toNdc(1900), 0,
  ]);
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 4, 6, 7,
  ]);
  paint.dryMesh = {
    visible: true,
    geometry: {
      attributes: { position: new THREE.BufferAttribute(positions, 3) },
      index: new THREE.BufferAttribute(indices, 1),
      drawRange: { count: 12 },
    },
  };
  paint._mipRequested = true;
  h.calls.copyTexSubImage2D.length = 0;
  paint._drawQuads();

  assert.equal(s.partial, 1);
  assert.equal(s.full, 0);
  const level0Copies = h.calls.copyTexSubImage2D.filter(c => c.level === 0);
  assert.deepEqual(level0Copies.map(c => [c.x, c.y]), [[256, 0], [1536, 1792]]);
});

test('paint-regional-mips: invalid dryMesh drawRange.count triggers forceFull fallback', async () => {
  const { installPaintRegionalMips } = await loadModuleWithThree('patches/local-quality/paint-regional-mips.mjs');
  const posAttr = new THREE.BufferAttribute(new Float32Array([
    -0.9, -0.9, 0, -0.8, -0.9, 0, -0.8, -0.8, 0,
    -0.9, -0.9, 0, -0.8, -0.8, 0, -0.9, -0.8, 0,
  ]), 3);

  for (const badCount of [4, -3, Number.NaN]) {
    const h = createMockPaintHarness({ N: 2048, withState: true });
    installPaintRegionalMips(h.MockPaintSystem);
    const paint = new h.MockPaintSystem();
    paint._initGPU();
    const s = paint._iwPaintRegionalMips;

    paint.dryMesh = {
      visible: true,
      geometry: {
        attributes: { position: posAttr },
        index: null,
        drawRange: { count: badCount },
      },
    };
    paint._mipRequested = true;
    paint._drawQuads();

    assert.equal(s.full, 1, `drawRange.count=${badCount} must fall back to full mipmap rebuild`);
    assert.equal(s.partial, 0, `drawRange.count=${badCount} must not run partial update`);
    assert.equal(paint._mipRequested, true, `drawRange.count=${badCount} leaves native full mipmap request active`);
    assert.equal(s.forceFull, false, `drawRange.count=${badCount} resets forceFull after full fallback`);
  }
});

test('grade-output-fusion: toggles on extraPass.enabled, syncs _fsQuad.material and toneMapping/colorSpace defines, preserves passes & disposes both materials', async () => {
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
  const gradePass = { uniforms, material: linearMat, _fsQuad: { material: linearMat }, enabled: true };
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
  assert.equal(gradePass._fsQuad.material, owner._gradeOutputMat, '_fsQuad.material must switch to fused material');
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
  assert.equal(gradePass._fsQuad.material, linearMat, '_fsQuad.material must switch back to linearMat');
  assert.equal(outputPass.enabled, true);
  assert.equal(owner.composer.passes, passes, 'composer.passes identity preserved on unfuse');

  // Disable extraPass again: re-fuses
  extraPass.enabled = false;
  assert.equal(syncGradeOutputFusion(owner), true);
  assert.equal(gradePass.material, owner._gradeOutputMat);
  assert.equal(gradePass._fsQuad.material, owner._gradeOutputMat, '_fsQuad.material must re-fuse');
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

test('grade-output-fusion: unfused disposal (extraPass.enabled === true) and !gradeDisposed clear grade & _fsQuad materials', async () => {
  const { setupGradeOutputFusion, disposeGradeOutputFusion } = await loadModuleWithThree('patches/local-quality/grade-output-fusion.mjs');
  const linearFragment = `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      gl_FragColor = c;
    }
  `;

  // Case 1: unfused disposal with gradeDisposed: true (active material is linearMat)
  {
    let linearDisposed = 0, fusedDisposed = 0;
    const uniforms = { tDiffuse: { value: null }, uExposure: { value: 1.0 } };
    const linearMat = { uniforms, fragmentShader: linearFragment, dispose() { linearDisposed++; } };
    const gradePass = { uniforms, material: linearMat, _fsQuad: { material: linearMat }, enabled: true };
    const outputPass = { enabled: true };
    const extraPass = { enabled: true };
    const owner = {
      renderer: { toneMapping: THREE.NeutralToneMapping, outputColorSpace: THREE.SRGBColorSpace, toneMappingExposure: 1.0 },
      grade: gradePass,
      outputPass,
      extraPass,
    };

    assert.equal(setupGradeOutputFusion(owner), true);
    assert.equal(gradePass.material, linearMat);
    assert.equal(gradePass._fsQuad.material, linearMat);
    assert.equal(outputPass.enabled, true);

    const origFusedDispose = owner._gradeOutputMat.dispose.bind(owner._gradeOutputMat);
    owner._gradeOutputMat.dispose = () => { fusedDisposed++; origFusedDispose(); };

    gradePass.material.dispose(); // active is linearMat
    disposeGradeOutputFusion(owner, { gradeDisposed: true });
    assert.equal(linearDisposed, 1, 'linearMat disposed once when active and unfused');
    assert.equal(fusedDisposed, 1, 'fusedMat disposed once when inactive and unfused');
    assert.equal(owner._gradeLinearMat, null);
    assert.equal(owner._gradeOutputMat, null);
  }

  // Case 2: !gradeDisposed clears both grade.material and grade._fsQuad.material so neither points to disposed materials
  {
    let linearDisposed = 0, fusedDisposed = 0;
    const uniforms = { tDiffuse: { value: null }, uExposure: { value: 1.0 } };
    const linearMat = { uniforms, fragmentShader: linearFragment, dispose() { linearDisposed++; } };
    const gradePass = { uniforms, material: linearMat, _fsQuad: { material: linearMat }, enabled: true };
    const outputPass = { enabled: true };
    const extraPass = { enabled: false };
    const owner = {
      renderer: { toneMapping: THREE.NeutralToneMapping, outputColorSpace: THREE.SRGBColorSpace, toneMappingExposure: 1.0 },
      grade: gradePass,
      outputPass,
      extraPass,
    };

    assert.equal(setupGradeOutputFusion(owner), true);
    const origFusedDispose = owner._gradeOutputMat.dispose.bind(owner._gradeOutputMat);
    owner._gradeOutputMat.dispose = () => { fusedDisposed++; origFusedDispose(); };

    disposeGradeOutputFusion(owner, { gradeDisposed: false });
    assert.equal(linearDisposed, 1);
    assert.equal(fusedDisposed, 1);
    assert.equal(gradePass.material, null, 'grade.material cleared when !gradeDisposed');
    assert.equal(gradePass._fsQuad.material, null, 'grade._fsQuad.material cleared when !gradeDisposed');
  }
});

test('grade-output-fusion: buildFusedFragmentShader negative guards reject missing, duplicate, or non-string gl_FragColor = c;', async () => {
  const { buildFusedFragmentShader, setupGradeOutputFusion } = await loadModuleWithThree('patches/local-quality/grade-output-fusion.mjs');

  assert.equal(buildFusedFragmentShader(null), null);
  assert.equal(buildFusedFragmentShader(123), null);
  assert.equal(buildFusedFragmentShader('void main() { gl_FragColor = vec4(1.0); }'), null);
  assert.equal(
    buildFusedFragmentShader('void main() { vec4 c = vec4(1.0); gl_FragColor = c; gl_FragColor = c; }'),
    null,
  );

  // setupGradeOutputFusion must abort cleanly and leave gradePass intact on invalid shader
  const uniforms = { tDiffuse: { value: null } };
  const linearMat = { uniforms, fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }' };
  const gradePass = { uniforms, material: linearMat, _fsQuad: { material: linearMat }, enabled: true };
  const outputPass = { enabled: true };
  const owner = {
    renderer: { toneMapping: THREE.NeutralToneMapping, outputColorSpace: THREE.SRGBColorSpace, toneMappingExposure: 1.0 },
    grade: gradePass,
    outputPass,
    extraPass: { enabled: false },
    _gradeOutputMat: { stale: true },
    _gradeOutputState: { outputColorSpace: 'stale', toneMapping: -1 },
    _syncGradeOutputFusion: () => true,
  };

  assert.equal(setupGradeOutputFusion(owner), false);
  assert.equal(owner._gradeLinearMat, linearMat);
  assert.equal(owner._gradeOutputMat, null);
  assert.equal(owner._gradeOutputState, null);
  assert.equal(owner._syncGradeOutputFusion, null);
  assert.equal(gradePass.material, linearMat);
  assert.equal(gradePass._fsQuad.material, linearMat);
  assert.equal(outputPass.enabled, true);
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

test('paint-regional-mips: _regenerateMipmaps clears forceFull when visible and preserves it when hidden', async () => {
  const { installPaintRegionalMips } = await loadModuleWithThree('patches/local-quality/paint-regional-mips.mjs');
  const h = createMockPaintHarness({ N: 2048 });
  installPaintRegionalMips(h.MockPaintSystem);
  const ps = new h.MockPaintSystem();
  ps._initGPU();
  const state = ps._iwPaintRegionalMips;
  assert.ok(state, 'regional mip state allocated');
  // Simulate forceFull triggered on a draw without _mipRequested
  state.forceFull = true;
  const prevDoc = globalThis.document;
  try {
    globalThis.document = { hidden: true };
    ps._regenerateMipmaps();
    assert.equal(state.forceFull, true, 'hidden tab preserves forceFull');

    globalThis.document = { hidden: false };
    ps._regenerateMipmaps();
    assert.equal(state.forceFull, false, 'visible full rebuild clears forceFull');
  } finally {
    globalThis.document = prevDoc;
  }
  // Subsequent small splat can now take the partial path again
  h.addQuadPixels(ps, 300, 550, 340, 590);
  ps._mipRequested = true;
  const partialBefore = state.partial;
  ps._drawQuads();
  assert.equal(state.partial, partialBefore + 1, 'partial mip rebuild resumes after _regenerateMipmaps clears forceFull');
  ps.dispose();
});
