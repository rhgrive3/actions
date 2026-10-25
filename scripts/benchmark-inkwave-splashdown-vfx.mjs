#!/usr/bin/env node
// Local, paired WebGL comparison of the production Splashdown impact recipes.
// This isolates presentation shaders; Actor/paint/network acceptance is separate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { persistentDirectory, sampleStats } from './lib/inkwave-runtime-evidence.mjs';

const opt = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const roots = { before: fs.realpathSync(opt('--before')), after: fs.realpathSync(opt('--after')) };
const evidence = persistentDirectory(opt('--evidence-dir', '.browser-evidence/splashdown-vfx'));
const repeats = Number(opt('--repeats', '9'));
assert.ok(Number.isInteger(repeats) && repeats >= 3 && repeats <= 31, '3..31 repetitions');
const manifests = {};
for (const [name, root] of Object.entries(roots)) {
  const m = manifests[name] = JSON.parse(fs.readFileSync(path.join(root, 'inkwave-build.json')));
  assert.equal(m.build.optimization, 'esbuild-minify', 'production build required');
  assert.equal(hash(JSON.stringify(m.files)), m.inputHash, 'input manifest seal');
  assert.equal(hash(JSON.stringify(m.artifacts)), m.contentHash, 'artifact manifest seal');
  for (const [file, digest] of Object.entries(m.artifacts)) {
    const resolved = fs.realpathSync(path.resolve(root, file));
    assert.ok(resolved.startsWith(root + path.sep), file);
    assert.equal(hash(fs.readFileSync(resolved)), digest, file);
  }
}
const changedInputs = [...new Set([...Object.keys(manifests.before.files), ...Object.keys(manifests.after.files)])]
  .filter(key => manifests.before.files[key] !== manifests.after.files[key]);
assert.deepEqual(changedInputs, ['patch/runtime/special-vfx-kit.mjs'], 'isolate the shader change');
const receipts = new Set(), errors = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') {
    res.setHeader('content-type', 'text/html');
    res.end('<!doctype html><link rel="icon" href="data:,"><script type="importmap">{"imports":{"three":"/before/vendor/three/build/three.module.js","three/addons/":"/before/vendor/three/jsm/"}}</script>');
    return;
  }
  try {
    const [, name, ...parts] = decodeURIComponent(url.pathname).split('/');
    assert.ok(Object.hasOwn(roots, name));
    const relative = parts.join('/'), file = fs.realpathSync(path.resolve(roots[name], relative));
    assert.ok(file.startsWith(roots[name] + path.sep));
    const bytes = fs.readFileSync(file);
    assert.equal(hash(bytes), manifests[name].artifacts[relative], 'served artifact identity');
    receipts.add(name + '/' + relative);
    res.setHeader('content-type', /\.m?js$/.test(file) ? 'text/javascript' : 'application/octet-stream');
    res.end(bytes);
  } catch (e) { errors.push(String(e)); res.writeHead(404); res.end(); }
});
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const result = await page.evaluate(async ({ repeats }) => {
    const THREE = await import('three');
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(960, 720); document.body.appendChild(renderer.domElement);
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!timer) throw Error('GPU elapsed-time queries required for this comparison');
    const camera = new THREE.PerspectiveCamera(45, 4 / 3, .1, 150);
    camera.position.set(12, 10, 15); camera.lookAt(0, 1, 3); camera.updateMatrixWorld();
    const fixtures = {};
    for (const name of ['before', 'after']) {
      const { installSpecialVfx } = await import('/' + name + '/patches/splatoon3/runtime/special-vfx.mjs');
      // Only the FX owner is a sink: these are the complete emitted Director,
      // effect recipes, pool buffers, geometry, materials and GLSL programs.
      class FX {
        constructor(root) { this.root = root; this.q = 1; }
        setCollider() {} update() {} clear() {}
      }
      const scene = new THREE.Scene(); scene.background = new THREE.Color('#13202b');
      const root = new THREE.Group(); scene.add(root);
      const G = { scene, time: 0, teamColors: [new THREE.Color('#ff7711')], actors: [] };
      installSpecialVfx({ FX, THREE, G });
      const fx = G.fx = new FX(root); fx.setCollider();
      fixtures[name] = { scene, fx, d: fx.s3SpecialVfx, G,
        actor: { color: G.teamColors[0], team: 0 }, samples: [] };
      fx.update(0, camera);
      renderer.render(scene, camera); gl.finish(); // compile before timed draws
      fx.s3SpecialVfx.event({ actor: fixtures[name].actor, id: 'tripleSplashdown', action: 'impact', index: -1, pos: [0, 0, 0] });
    }
    const draw = f => { const start = performance.now(); renderer.render(f.scene, camera); gl.finish(); return performance.now() - start; };
    const syncPixel = new Uint8Array(4);
    const measure = async f => {
      const query = gl.createQuery(), start = performance.now();
      gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
      renderer.render(f.scene, camera);
      gl.endQuery(timer.TIME_ELAPSED_EXT);
      // gl.finish alone can return before Chromium's GPU service completes.
      // Readback fences the work; the query independently measures rendering.
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, syncPixel);
      const cpuMs = performance.now() - start, deadline = performance.now() + 15_000;
      while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
        if (performance.now() > deadline) throw Error('GPU query timeout');
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      if (gl.getParameter(timer.GPU_DISJOINT_EXT)) throw Error('Disjoint GPU query');
      const gpuMs = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(query);
      if (!(gpuMs > 0 && Number.isFinite(gpuMs))) throw Error('Invalid GPU query duration');
      return { cpuMs, gpuMs };
    };
    const read = () => { const pixels = new Uint8Array(960 * 720 * 4); gl.readPixels(0, 0, 960, 720, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels; };
    const difference = (a, b) => { let channels = 0, maxDelta = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { channels++; maxDelta = Math.max(maxDelta, Math.abs(a[i] - b[i])); } return { channels, maxDelta }; };
    const state = f => ({ sprites: [Array.from(f.d.kit.sparks.p), Array.from(f.d.kit.puffs.p)],
      shapes: f.d.kit.pools.slice(2).map(p => p.recs.map(r => ({ t: r.t, life: r.life, v: Array.from(r.v) }))), stats: f.d.kit.stats() });
    const frames = [], images = [];
    for (let frame = 1; frame <= 60; frame++) {
      for (const f of Object.values(fixtures)) {
        // Body lands first; both independent fists follow 17 fixed ticks later.
        // This is a controlled recipe workload, not a new gameplay clock.
        if (frame === 18) for (const index of [1, 0]) f.d.event({ actor: f.actor, id: 'tripleSplashdown', action: 'impact', index, pos: [index ? 3.27 : -3.27, 0, 5.663806140045589] });
        f.d.kit.update(1 / 60, camera);
      }
      if (![1, 6, 17, 18, 24, 30, 36, 45, 52, 60].includes(frame)) continue;
      if (JSON.stringify(state(fixtures.before)) !== JSON.stringify(state(fixtures.after))) throw Error('Presentation state differs at frame ' + frame);
      const pixels = {}, timing = { before: [], after: [] }, cpuTiming = { before: [], after: [] }, counts = {};
      for (const name of ['before', 'after']) {
        const f = fixtures[name]; draw(f); pixels[name] = read();
        counts[name] = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, ...f.d.kit.stats() };
        images.push({ name: name + '-f' + String(frame).padStart(2, '0') + '.png', data: renderer.domElement.toDataURL('image/png') });
      }
      const pixelDelta = difference(pixels.before, pixels.after);
      if (pixelDelta.channels) throw Error('Pixel mismatch ' + JSON.stringify({ frame, ...pixelDelta }));
      for (let i = 0; i < repeats; i++) for (const name of (i % 2 ? ['after', 'before'] : ['before', 'after'])) {
        const sample = await measure(fixtures[name]); timing[name].push(sample.gpuMs); cpuTiming[name].push(sample.cpuMs);
      }
      const error = gl.getError(); if (error !== gl.NO_ERROR || gl.isContextLost()) throw Error('WebGL error ' + error);
      frames.push({ frame, pixelDelta, counts, timing, cpuTiming });
    }
    // An empty/undrawn effect cannot pass by producing identical backgrounds.
    const f = fixtures.after; draw(f); const full = read(); f.d.kit.root.visible = false; draw(f);
    const negativeControl = difference(full, read());
    if (negativeControl.channels < 100) throw Error('Missing effect in visual negative control');
    const boundaryCases = [];
    for (const kind of [0, 1, 2, 3]) for (const phase of [.01, .5, .95]) {
      const pixels = {};
      for (const name of ['before', 'after']) {
        const f = fixtures[name], kit = f.d.kit; kit.clear(); kit.root.visible = true;
        for (let i = 0; i < 12; i++) {
          kit.puffs.spawnRaw((i % 4 - 1.5) * 3, .5 + Math.floor(i / 4) * 2.5, 2,
            0, 0, 0, 1, 1.4, 1.4, 1, .3, .1, kind === 2 ? (.03 + (phase - .5) * .0002) / (1 - Math.pow(.1, 1.6)) : .8, kind,
            .8, 0, i * .23, 0, .37, 0, .001, 0);
          kit.puffs.p[i * kit.puffs.S + 6] = kind === 2 ? .1 : phase;
        }
        kit.update(0, camera); draw(f); pixels[name] = read();
      }
      const pixelDelta = difference(pixels.before, pixels.after);
      if (pixelDelta.channels) throw Error('Billboard boundary mismatch ' + JSON.stringify({ kind, phase, ...pixelDelta }));
      boundaryCases.push({ kind, phase, pixelDelta });
    }
    const cpuTiming = { before: [], after: [] };
    for (const f of Object.values(fixtures)) {
      f.d.kit.clear();
      for (let i = 0; i < 520; i++) f.d.kit.puffs.spawnRaw(i / 100, 1, 2, .1, .2, .3, 30, .1, .1, 1, .3, .1, 1, 2, .8, 0, 0, 0, .37, .03, .001, 0);
      for (let i = 0; i < 200; i++) f.d.kit.puffs.update(1e-6);
    }
    for (let i = 0; i < repeats; i++) for (const name of (i % 2 ? ['after', 'before'] : ['before', 'after'])) {
      const pool = fixtures[name].d.kit.puffs, start = performance.now();
      for (let k = 0; k < 1000; k++) pool.update(1e-6);
      cpuTiming[name].push(performance.now() - start);
    }
    if (JSON.stringify(state(fixtures.before)) !== JSON.stringify(state(fixtures.after))) throw Error('CPU benchmark changed presentation state');
    const environment = { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      viewport: [960, 720], antialias: false, quality: 1, gpuTimerQuery: !!gl.getExtension('EXT_disjoint_timer_query_webgl2') };
    for (const f of Object.values(fixtures)) f.d.kit.dispose(); renderer.dispose();
    return { frames, boundaryCases, cpuTiming, negativeControl, environment, images };
  }, { repeats });
  for (const { name, data } of result.images) fs.writeFileSync(path.join(evidence, name), Buffer.from(data.split(',')[1], 'base64'));
  delete result.images;
  for (const row of result.frames) row.stats = Object.fromEntries(Object.entries(row.timing).map(([name, values]) => [name, sampleStats(values)]));
  const pairedTotals = Object.fromEntries(['before', 'after'].map(name => [name, Array.from({ length: repeats }, (_, i) => result.frames.reduce((sum, f) => sum + f.timing[name][i], 0))]));
  result.totals = Object.fromEntries(Object.entries(pairedTotals).map(([name, values]) => [name, sampleStats(values)]));
  result.cpuStats = Object.fromEntries(Object.entries(result.cpuTiming).map(([name, values]) => [name, sampleStats(values)]));
  result.cpuScope = 'Synthetic 520-particle equal-drag pool, 200 warm-up + 1000 updates per repetition; same finite dt=1e-6, complete state equality, not full-game frame time.';
  result.scope = 'Production impact recipes/pools/GLSL, controlled 60 Hz presentation, same renderer. timing/totals use non-disjoint GPU TIME_ELAPSED queries on SwiftShader; cpuTiming includes submission and one-pixel readback. Neither establishes device FPS or gameplay/paint performance.';
  result.environment = { ...result.environment, browser: browser.version(), cpu: os.cpus()[0].model, node: process.version, repeats };
  result.builds = Object.fromEntries(Object.entries(manifests).map(([name, m]) => [name, { revision: m.build.revision, inputHash: m.inputHash, contentHash: m.contentHash, kitSHA256: m.files['patch/runtime/special-vfx-kit.mjs'] }]));
  result.changedInputs = changedInputs; result.verifiedRequests = [...receipts].sort(); result.errors = errors;
  result.driverSHA256 = hash(fs.readFileSync(new URL(import.meta.url)));
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  assert.deepEqual(errors, [], 'browser/server errors');
  console.log(JSON.stringify({ evidence, totals: result.totals, cpu: result.cpuStats, pixelComparisons: result.frames.length + result.boundaryCases.length, errors }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
