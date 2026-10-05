import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptPaintMipmaps, MIP_POLICY, shouldRebuildMipmaps } from '../issue-190-adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));

function loadAdaptedSource(rel, patched) {
  const raw = fs.readFileSync(path.join(SRC, rel), 'utf8');
  return patched ? adaptPaintMipmaps(rel, raw) : raw;
}

async function createPaintSystemRealm(patched) {
  const rel = 'src/world/paint.js';
  const code = loadAdaptedSource(rel, patched);
  const context = vm.createContext({
    console,
    performance,
    URL,
    Math,
    Float32Array,
    Uint8Array,
    Uint32Array,
  });
  const modules = new Map();
  const load = requested => {
    if (modules.has(requested)) return modules.get(requested);
    let text = requested === path.join(SRC, rel) ? code : fs.readFileSync(requested, 'utf8');
    const m = new vm.SourceTextModule(text, {
      context,
      identifier: requested,
      initializeImportMeta(meta) { meta.url = pathToFileURL(requested).href; },
    });
    modules.set(requested, m);
    return m;
  };
  const entry = new vm.SourceTextModule(
    `export { PaintSystem } from './inkwave-public/src/world/paint.js'; export * as THREE from 'three'; export { G } from './inkwave-public/src/core/ctx.js';`,
    { context, identifier: path.join(ROOT, `paint-entry-${patched ? 'patched' : 'unpatched'}.mjs`) }
  );
  await entry.link((spec, from) => {
    if (spec === 'three') return load(path.join(SRC, 'vendor/three/build/three.module.js'));
    return load(path.resolve(path.dirname(from.identifier), spec));
  });
  await entry.evaluate();
  return entry.namespace;
}

function createInstrumentedPaintHarness(ns, { atlasSize = 2048 } = {}) {
  const { THREE, PaintSystem, G } = ns;
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const face = {
    paintable: true,
    turf: true,
    origin: v(0, 0, 0),
    u: v(1, 0, 0),
    v: v(0, 0, 1),
    n: v(0, 1, 0),
    su: 20,
    sv: 20,
    block: 0,
    wall: false,
  };
  const block = {
    aabbMin: v(-10, -5, -10),
    aabbMax: v(30, 5, 30),
    faces: [0, -1, -1, -1, -1, -1],
  };
  const level = {
    faces: [face],
    blocks: [block],
    pointInside: () => false,
    queryBlocks: () => [0],
  };

  let mipCalls = 0;
  let currentRenderTarget = null;
  const renderer = {
    capabilities: { getMaxAnisotropy: () => 8 },
    autoClear: true,
    getRenderTarget: () => currentRenderTarget,
    setRenderTarget: rt => { currentRenderTarget = rt; },
    getClearColor: col => col.set(0),
    getClearAlpha: () => 0,
    setClearColor: () => {},
    clear: () => {},
    render: (scene, camera) => {
      // Native Three.js WebGLRenderer.render() behavior:
      // At the end of the pass, textures.updateRenderTargetMipmap() checks if the target texture
      // has generateMipmaps: true and rebuilds mips via gl.generateMipmap.
      if (currentRenderTarget) {
        for (const tex of currentRenderTarget.textures) {
          if (tex.generateMipmaps) mipCalls++;
        }
      }
    },
  };

  const paint = new PaintSystem(renderer, level, { atlasSize });
  return {
    THREE,
    G,
    paint,
    renderer,
    getMipCalls: () => mipCalls,
    resetMipCalls: () => { mipCalls = 0; },
  };
}

test('issue 190 adapter modifies paint.js cleanly and rejects conflict / double application', () => {
  const rel = 'src/world/paint.js';
  const raw = fs.readFileSync(path.join(SRC, rel), 'utf8');
  const patched = adaptPaintMipmaps(rel, raw);
  assert.notEqual(patched, raw);
  assert.ok(patched.includes('generateMipmaps: false'));
  assert.ok(patched.includes('_regenerateMipmaps()'));
  assert.ok(patched.includes('_mipRequested'));
  assert.throws(() => adaptPaintMipmaps(rel, patched), /INKWAVE paint mipmap patch conflict/);
  // Unrelated files pass through unchanged
  assert.equal(adaptPaintMipmaps('src/game/character.js', 'const x = 1;'), 'const x = 1;');
});

test('issue 190 presentation policy decision function enforces active, drying and settle intervals', () => {
  // Not dirty: never rebuilds
  assert.equal(shouldRebuildMipmaps({ dirty: false, clock: 10, lastMipClock: 0 }), false);

  // Active growth: limits to ACTIVE_INTERVAL (0.10s / ~10 Hz)
  assert.equal(shouldRebuildMipmaps({ dirty: true, activeGrowth: true, clock: 0.05, lastMipClock: 0 }), false);
  assert.equal(shouldRebuildMipmaps({ dirty: true, activeGrowth: true, clock: 0.10, lastMipClock: 0 }), true);

  // Active drying: limits to DRYING_INTERVAL (0.25s / ~4 Hz)
  assert.equal(shouldRebuildMipmaps({ dirty: true, activeGrowth: false, activeDrying: true, clock: 0.10, lastMipClock: 0 }), false);
  assert.equal(shouldRebuildMipmaps({ dirty: true, activeGrowth: false, activeDrying: true, clock: 0.25, lastMipClock: 0 }), true);

  // Growth just ended: immediate settle sync
  assert.equal(shouldRebuildMipmaps({ dirty: true, activeGrowth: false, activeDrying: true, growthJustEnded: true, clock: 0.03, lastMipClock: 0 }), true);

  // Idle / stationary settled: immediate settle sync
  assert.equal(shouldRebuildMipmaps({ dirty: true, activeGrowth: false, activeDrying: false, clock: 0.01, lastMipClock: 0 }), true);
});

test('negative main control: unpatched regenerates mips every paint frame, patched bounds to ~10 Hz', async () => {
  const unpatchedNs = await createPaintSystemRealm(false);
  const patchedNs = await createPaintSystemRealm(true);

  const envUnpatched = createInstrumentedPaintHarness(unpatchedNs);
  const envPatched = createInstrumentedPaintHarness(patchedNs);

  // Baseline RT check
  assert.equal(envUnpatched.paint.rt.texture.generateMipmaps, true);
  assert.equal(envPatched.paint.rt.texture.generateMipmaps, false);
  assert.equal(envPatched.paint.rt.texture.minFilter, envPatched.THREE.LinearMipmapLinearFilter);

  envUnpatched.resetMipCalls();
  envPatched.resetMipCalls();

  let unpatchedClaimed = 0;
  let patchedClaimed = 0;

  // 60 consecutive processed frames with active paint
  for (let i = 0; i < 60; i++) {
    const seed = (i * 0.12345) % 1;
    const pos = new envUnpatched.THREE.Vector3(5 + (i % 10) * 0.4, 0, 5 + Math.floor(i / 10) * 0.4);
    unpatchedClaimed += envUnpatched.paint.splat(pos, 0.45, i % 2, { seed });
    envUnpatched.paint.flush(1 / 60);

    const posP = new envPatched.THREE.Vector3(5 + (i % 10) * 0.4, 0, 5 + Math.floor(i / 10) * 0.4);
    patchedClaimed += envPatched.paint.splat(posP, 0.45, i % 2, { seed });
    envPatched.paint.flush(1 / 60);
  }

  // Negative control assertion: Unpatched forces full-atlas mip generation every processed frame
  assert.equal(envUnpatched.getMipCalls(), 60, 'Unpatched baseline must rebuild mips on all 60 frames (60 Hz)');

  // Patched assertion: Bounded presentation policy reduces mips to ~10 Hz (at least 80% reduction)
  const patchedCalls = envPatched.getMipCalls();
  assert.ok(patchedCalls <= 12 && patchedCalls >= 7, `Patched mip calls (${patchedCalls}) must be bounded ~10 Hz across 60 frames`);

  // Authoritative CPU turf score and cell grid must be byte-for-byte identical
  assert.equal(patchedClaimed, unpatchedClaimed, 'Claimed turf area must match unpatched');
  assert.deepEqual([...envPatched.paint.counts], [...envUnpatched.paint.counts]);
  assert.ok(Buffer.from(envPatched.paint.grid).equals(Buffer.from(envUnpatched.paint.grid)), 'CPU grid must be identical');
});

test('10-second continuous-fire test: mip rebuild frequency is materially below 60 Hz render cadence', async () => {
  const unpatchedNs = await createPaintSystemRealm(false);
  const patchedNs = await createPaintSystemRealm(true);

  const envUnpatched = createInstrumentedPaintHarness(unpatchedNs);
  const envPatched = createInstrumentedPaintHarness(patchedNs);

  envUnpatched.resetMipCalls();
  envPatched.resetMipCalls();

  // 600 frames (10.0 seconds at 60 fps), shooting a splat every 4 frames
  for (let i = 0; i < 600; i++) {
    if (i % 4 === 0) {
      const seed = (i * 0.3871) % 1;
      const pos = new envUnpatched.THREE.Vector3(5 + (i % 20) * 0.25, 0, 5 + Math.floor(i / 20) * 0.25);
      envUnpatched.paint.splat(pos, 0.4, 0, { seed });
      envPatched.paint.splat(pos, 0.4, 0, { seed });
    }
    envUnpatched.paint.flush(1 / 60);
    envPatched.paint.flush(1 / 60);
  }

  const unpatchedTotal = envUnpatched.getMipCalls();
  const patchedTotal = envPatched.getMipCalls();

  assert.equal(unpatchedTotal, 600, 'Unpatched runs at full 60 Hz (600 rebuilds)');
  assert.ok(patchedTotal < 110, `Patched calls (${patchedTotal}) must be bounded near ~10 Hz (<= 110 calls in 10s)`);
  assert.ok(patchedTotal > 60, `Patched calls (${patchedTotal}) must maintain active visual updates (>= 60 calls)`);

  // Verify CPU turf consistency
  assert.deepEqual([...envPatched.paint.counts], [...envUnpatched.paint.counts]);
  assert.ok(Buffer.from(envPatched.paint.grid).equals(Buffer.from(envUnpatched.paint.grid)));
});

test('drying window test: unpatched rebuilds at ~20 Hz, patched bounds to ~4 Hz without altering wetness decay', async () => {
  const unpatchedNs = await createPaintSystemRealm(false);
  const patchedNs = await createPaintSystemRealm(true);

  const envUnpatched = createInstrumentedPaintHarness(unpatchedNs);
  const envPatched = createInstrumentedPaintHarness(patchedNs);

  // Single instant splat to start the drying timer
  envUnpatched.paint.splat(new envUnpatched.THREE.Vector3(5, 0, 5), 0.5, 0, { instant: true, seed: 0.42 });
  envPatched.paint.splat(new envPatched.THREE.Vector3(5, 0, 5), 0.5, 0, { instant: true, seed: 0.42 });

  envUnpatched.paint.flush(1 / 60);
  envPatched.paint.flush(1 / 60);

  // Measure drying window: 3 seconds (180 frames at 60 fps)
  envUnpatched.resetMipCalls();
  envPatched.resetMipCalls();

  for (let i = 0; i < 180; i++) {
    envUnpatched.paint.flush(1 / 60);
    envPatched.paint.flush(1 / 60);
  }

  const unpatchedDrying = envUnpatched.getMipCalls();
  const patchedDrying = envPatched.getMipCalls();

  assert.equal(unpatchedDrying, 60, 'Unpatched rebuilds mips every 3 frames (~20 Hz) during drying');
  assert.ok(patchedDrying <= 14 && patchedDrying >= 8, `Patched drying mips (${patchedDrying}) must be bounded to ~4 Hz (8-14 calls in 3s)`);

  // Verify drying timing and accumulator state are strictly identical
  assert.equal(envPatched.paint._wetUntil, envUnpatched.paint._wetUntil);
  assert.ok(Math.abs(envPatched.paint._dryAcc - envUnpatched.paint._dryAcc) < 1e-6);
});

test('settling synchronization: splat growth completion triggers immediate settle mipmap and stays idle', async () => {
  const patchedNs = await createPaintSystemRealm(true);
  const env = createInstrumentedPaintHarness(patchedNs);

  env.resetMipCalls();
  // Fire one spreading splat
  env.paint.splat(new env.THREE.Vector3(5, 0, 5), 0.5, 0, { seed: 0.55 });

  // Advance until spreading finishes
  while (env.paint.growing.length > 0) {
    env.paint.flush(1 / 60);
  }

  // Settle frame must have cleared dirty state
  assert.equal(env.paint._mipsDirty, false, 'Atlas must not remain dirty after growth completes');

  // Next frame: with no new splats and no drying quad this frame, 0 mip calls
  env.resetMipCalls();
  env.paint.flush(1 / 60);
  assert.equal(env.getMipCalls(), 0, 'No mip calls on idle frame after growth settle');

  // Fast forward past full drying window (8 seconds)
  for (let i = 0; i < 480; i++) {
    env.paint.flush(1 / 60);
  }
  assert.ok(env.paint.clock > env.paint._wetUntil, 'Drying period must be fully finished');

  // Completely idle match: 120 frames must produce exactly 0 mip calls
  env.resetMipCalls();
  for (let i = 0; i < 120; i++) {
    env.paint.flush(1 / 60);
  }
  assert.equal(env.getMipCalls(), 0, 'Idle scene must produce zero mip calls');
});

test('remote splats and cosmetic specks respect bounded policy without corrupting turf score', async () => {
  const unpatchedNs = await createPaintSystemRealm(false);
  const patchedNs = await createPaintSystemRealm(true);

  const envUnpatched = createInstrumentedPaintHarness(unpatchedNs);
  const envPatched = createInstrumentedPaintHarness(patchedNs);

  // Set net manager to applying remote splats
  envUnpatched.G.netm = { mute: 0, applying: true, recSplat: () => {} };
  envPatched.G.netm = { mute: 0, applying: true, recSplat: () => {} };

  // Remote splats
  const remoteAreaU = envUnpatched.paint.splat(new envUnpatched.THREE.Vector3(8, 0, 8), 0.5, 1, { seed: 0.1 });
  const remoteAreaP = envPatched.paint.splat(new envPatched.THREE.Vector3(8, 0, 8), 0.5, 1, { seed: 0.1 });
  assert.equal(remoteAreaP, remoteAreaU);
  assert.deepEqual([...envPatched.paint.counts], [...envUnpatched.paint.counts]);

  // Cosmetic specks (never claim turf)
  const speckAreaU = envUnpatched.paint.speck(new envUnpatched.THREE.Vector3(2, 0, 2), 0.1, 0, 0.7);
  const speckAreaP = envPatched.paint.speck(new envPatched.THREE.Vector3(2, 0, 2), 0.1, 0, 0.7);
  assert.equal(speckAreaU, 0);
  assert.equal(speckAreaP, 0);
  assert.deepEqual([...envPatched.paint.counts], [...envUnpatched.paint.counts]);

  // Specks respect bounded policy
  envPatched.resetMipCalls();
  for (let i = 0; i < 30; i++) {
    envPatched.paint.speck(new envPatched.THREE.Vector3(2 + i * 0.05, 0, 2), 0.08, 0, i * 0.1);
    envPatched.paint.flush(1 / 60);
  }
  assert.ok(envPatched.getMipCalls() <= 6, 'Cosmetic specks must follow bounded mip generation');
});

test('paint clear resets mip state and synchronizes mips', async () => {
  const patchedNs = await createPaintSystemRealm(true);
  const env = createInstrumentedPaintHarness(patchedNs);

  env.paint.splat(new env.THREE.Vector3(5, 0, 5), 0.5, 0, { instant: true, seed: 0.9 });
  env.paint.flush(1 / 60);
  assert.ok(env.paint.counts[0] > 0);

  env.resetMipCalls();
  env.paint.clear();
  assert.equal(env.paint.counts[0], 0);
  assert.equal(env.paint._mipsDirty, false);
  assert.equal(env.getMipCalls(), 1, 'Clear must synchronize mipmap chain');
});

test('regenerateMipmaps strictly uses public renderer pass into empty scene and restores state in finally', async () => {
  const patchedNs = await createPaintSystemRealm(true);
  const { THREE, PaintSystem } = patchedNs;

  const renderCalls = [];
  let currentRT = 'previous-rt';
  let autoClearVal = true;
  const renderer = {
    capabilities: { getMaxAnisotropy: () => 8 },
    autoClear: autoClearVal,
    getRenderTarget: () => currentRT,
    setRenderTarget: rt => { currentRT = rt; },
    getClearColor: col => col.set(0),
    getClearAlpha: () => 0,
    setClearColor: () => {},
    clear: () => {},
    render: (scene, camera) => {
      renderCalls.push({
        scene,
        childCount: scene.children.length,
        rt: currentRT,
        autoClear: renderer.autoClear,
        generateMipmaps: currentRT?.texture?.generateMipmaps,
      });
    },
  };

  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const face = { paintable: true, turf: true, origin: v(0, 0, 0), u: v(1, 0, 0), v: v(0, 0, 1), n: v(0, 1, 0), su: 20, sv: 20, block: 0, wall: false };
  const level = { faces: [face], blocks: [{ aabbMin: v(-10, -5, -10), aabbMax: v(30, 5, 30), faces: [0, -1, -1, -1, -1, -1] }], pointInside: () => false, queryBlocks: () => [0] };

  const paint = new PaintSystem(renderer, level, { atlasSize: 512 });
  renderCalls.length = 0; // Clear calls from initial init/clear

  // Set up sentinel state
  currentRT = 'custom-user-rt';
  renderer.autoClear = true;
  paint._mipsDirty = true;

  // Execute _regenerateMipmaps()
  paint._regenerateMipmaps();

  // Assertions:
  assert.equal(renderCalls.length, 1, 'Must execute exactly one public render pass');
  const call = renderCalls[0];
  assert.equal(call.rt, paint.rt, 'Render target must be the paint atlas RT');
  assert.equal(call.autoClear, false, 'autoClear must be false to avoid clearing existing ink');
  assert.equal(call.generateMipmaps, true, 'generateMipmaps must be true during the pass');
  assert.equal(call.childCount, 0, 'Scene MUST be empty: do NOT redraw stale quad geometry/drying');

  // Assert state restoration in finally:
  assert.equal(paint.rt.texture.generateMipmaps, false, 'generateMipmaps flag must be restored to false in finally');
  assert.equal(renderer.autoClear, true, 'autoClear must be restored to true in finally');
  assert.equal(currentRT, 'custom-user-rt', 'Render target must be restored to previous RT in finally');
  assert.equal(paint._mipsDirty, false, 'Atlas must be marked clean after regeneration');

  // Verify that an exception during render still restores state via finally
  renderer.render = () => { throw new Error('Simulated render error'); };
  currentRT = 'saved-rt';
  renderer.autoClear = true;
  assert.throws(() => paint._regenerateMipmaps(), /Simulated render error/);
  assert.equal(paint.rt.texture.generateMipmaps, false, 'generateMipmaps must be restored to false even after exception');
  assert.equal(renderer.autoClear, true, 'autoClear must be restored even after exception');
  assert.equal(currentRT, 'saved-rt', 'Render target must be restored even after exception');
});

test('native WebGL / browser probe: instruments generateMipmap and gl.getError plus draw/read pixels', async () => {
  let chromium = null;
  try {
    const pw = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright').catch(() => null);
    chromium = pw?.chromium;
    if (!chromium) {
      const { createRequire } = await import('node:module');
      const req = createRequire(import.meta.url);
      const pkg = req('/mnt/workspace/.npm-global/lib/node_modules/@playwright/test');
      chromium = pkg?.chromium;
    }
  } catch {
    // If Playwright is not resolvable, skip
  }

  if (!chromium) {
    return;
  }

  const http = await import('node:http');
  const server = http.createServer((req, res) => {
    if (req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<!DOCTYPE html><html><head>
        <script type='importmap'>
        { "imports": { "three": "/vendor/three/build/three.module.js" } }
        </script>
      </head><body><canvas id='c'></canvas></body></html>`);
      return;
    }
    const rel = req.url.slice(1);
    if (rel === 'src/world/paint.js') {
      res.writeHead(200, { 'content-type': 'application/javascript' });
      res.end(adaptPaintMipmaps(rel, fs.readFileSync(path.join(SRC, rel), 'utf8')));
      return;
    }
    const file = path.join(SRC, rel);
    if (fs.existsSync(file)) {
      res.writeHead(200, { 'content-type': 'application/javascript' });
      res.end(fs.readFileSync(file));
    } else {
      res.writeHead(404);
      res.end('Not found: ' + rel);
    }
  });

  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);

    const result = await page.evaluate(async () => {
      const THREE = await import('three');
      const { PaintSystem } = await import('/src/world/paint.js');

      const canvas = document.getElementById('c');
      canvas.width = 512;
      canvas.height = 512;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
      const gl = renderer.getContext();

      let mipCalls = 0;
      let maxError = 0;
      const origGenerateMipmap = gl.generateMipmap.bind(gl);
      gl.generateMipmap = function(...args) {
        mipCalls++;
        const res = origGenerateMipmap(...args);
        const err = gl.getError();
        if (err !== 0) maxError = err;
        return res;
      };

      const v = (x, y, z) => new THREE.Vector3(x, y, z);
      const face = {
        paintable: true, turf: true,
        origin: v(0, 0, 0), u: v(1, 0, 0), v: v(0, 0, 1), n: v(0, 1, 0),
        su: 20, sv: 20, block: 0, wall: false
      };
      const block = {
        aabbMin: v(-10, -5, -10), aabbMax: v(30, 5, 30),
        faces: [0, -1, -1, -1, -1, -1]
      };
      const level = {
        faces: [face], blocks: [block],
        pointInside: () => false,
        queryBlocks: () => [0]
      };

      const paint = new PaintSystem(renderer, level, { atlasSize: 512 });
      const initCalls = mipCalls;
      const initError = gl.getError();

      // Splat team 1
      paint.splat(v(5, 0, 5), 1.0, 1, { instant: true, seed: 0.1 });
      paint.flush(1 / 60);

      // Read back pixels from RT to ensure actual GPU paint draw
      const buf = new Uint8Array(512 * 512 * 4);
      renderer.readRenderTargetPixels(paint.rt, 0, 0, 512, 512, buf);
      let paintedPixels = 0;
      for (let i = 0; i < buf.length; i += 4) {
        if (buf[i + 3] > 0) paintedPixels++;
      }

      // Advance 60 frames (1 second of drying)
      const startCalls = mipCalls;
      for (let f = 0; f < 60; f++) {
        paint.flush(1 / 60);
      }
      const dryingCalls = mipCalls - startCalls;

      // Force empty-scene mipmap regeneration directly and inspect GL state
      const preRegenCalls = mipCalls;
      paint._regenerateMipmaps();
      const regenCalls = mipCalls - preRegenCalls;
      const finalError = gl.getError();

      return {
        initCalls,
        initError,
        paintedPixels,
        dryingCalls,
        regenCalls,
        finalError,
        maxError,
        counts: [...paint.counts],
      };
    });

    assert.equal(result.initError, 0, 'gl.getError must be 0 after init');
    assert.equal(result.maxError, 0, 'gl.getError must remain 0 across all generateMipmap calls');
    assert.equal(result.finalError, 0, 'gl.getError must remain 0 after all operations');
    assert.equal(result.initCalls, 1, 'Initial clear must synchronize mipmap chain exactly once');
    assert.ok(result.paintedPixels > 1000, `Actual GPU paint pass must draw pixels (got ${result.paintedPixels})`);
    assert.ok(result.dryingCalls <= 6 && result.dryingCalls >= 3, `Drying mip calls (${result.dryingCalls}) must be bounded ~4 Hz over 60 frames`);
    assert.equal(result.regenCalls, 1, '_regenerateMipmaps via empty scene pass must trigger exactly 1 native gl.generateMipmap');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
