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
  const textures = {
    updateRenderTargetMipmap(rt) {
      for (const tex of rt.textures) {
        if (tex.generateMipmaps) mipCalls++;
      }
    },
  };
  const renderer = {
    capabilities: { getMaxAnisotropy: () => 8 },
    autoClear: true,
    getRenderTarget: () => currentRenderTarget,
    setRenderTarget: rt => { currentRenderTarget = rt; },
    getClearColor: col => col.set(0),
    getClearAlpha: () => 0,
    setClearColor: () => {},
    clear: () => {},
    render: () => {
      if (currentRenderTarget) textures.updateRenderTargetMipmap(currentRenderTarget);
    },
    textures,
    properties: { get: () => ({ __webglTexture: {} }) },
    getContext: () => ({
      TEXTURE_2D: 0x0DE1,
      bindTexture: () => {},
      generateMipmap: () => { mipCalls++; },
    }),
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
