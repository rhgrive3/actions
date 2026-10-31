#!/usr/bin/env node
// Isolated production SpecialVfxKit A/B renders. This checks actual WebGL2
// programs, shared effect state and draw budgets; it is not an iPad FPS test.
// node scripts/verify-special-vfx-visual-quality.mjs <before-kit.mjs> <evidence-dir>
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const [beforeArg, outArg] = process.argv.slice(2);
assert.ok(beforeArg && outArg, 'Supply the baseline kit and evidence directory');
const baseline = fs.readFileSync(path.resolve(beforeArg));
const out = path.resolve(outArg);
fs.mkdirSync(out, { recursive: true });
const kitPath = 'patches/splatoon3/runtime/special-vfx-kit.mjs';
const errors = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') {
    res.setHeader('content-type', 'text/html');
    res.end('<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><style>body{margin:0;background:#101827}canvas{display:block}</style>');
    return;
  }
  try {
    const [, version, ...parts] = decodeURIComponent(url.pathname).split('/');
    assert.ok(version === 'before' || version === 'after');
    const relative = parts.join('/');
    let bytes;
    if (version === 'before' && relative === kitPath) bytes = baseline;
    else {
      const resolved = fs.realpathSync(path.resolve(root, relative));
      assert.ok(resolved.startsWith(root + path.sep));
      bytes = fs.readFileSync(resolved);
    }
    res.setHeader('content-type', /\.m?js$/.test(relative) ? 'text/javascript' : 'application/octet-stream');
    res.end(bytes);
  } catch (e) { errors.push(String(e)); res.writeHead(404); res.end(); }
});
let browser;
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const receipt = await page.evaluate(async ({ skipTiming }) => {
    const THREE = await import('/after/inkwave-public/vendor/three/build/three.module.js');
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
    renderer.setSize(640, 400); renderer.setClearColor(0x101827, 0);
    document.body.appendChild(renderer.domElement);
    const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const camera = new THREE.OrthographicCamera(-2.8, 2.8, 1.75, -1.75, .1, 100);
    const fixtures = {};
    for (const version of ['before', 'after']) {
      const { SpecialVfxKit } = await import('/' + version + '/patches/splatoon3/runtime/special-vfx-kit.mjs');
      const scene = new THREE.Scene(), kit = new SpecialVfxKit(THREE, scene);
      fixtures[version] = { scene, kit };
      camera.position.set(0, 2, -8); camera.lookAt(0, 2, 0); camera.updateMatrixWorld();
      renderer.render(scene, camera); kit.update(0, camera);
    }
    const images = [], cases = [], timings = [];
    const snapshot = kit => JSON.stringify(kit.allPools.map(p => ({ n: p.n, count: p._drawCount,
      instanceCount: p.mesh.geometry.instanceCount, drawRange: p.mesh.geometry.drawRange,
      p: p.p ? Array.from(p.p.slice(0, p.n * p.S)) : undefined,
      recs: p.recs?.map(r => [r.t, r.life, Array.from(r.v)]),
      attributes: Object.fromEntries(Object.entries(p.mesh.geometry.attributes).map(([key, a]) => [key, Array.from(a.array)])),
      index: p.mesh.geometry.index ? Array.from(p.mesh.geometry.index.array) : null })));
    const read = () => { const pixels = new Uint8Array(640 * 400 * 4); gl.readPixels(0, 0, 640, 400, gl.RGBA, gl.UNSIGNED_BYTE, pixels); return pixels; };
    const count = pixels => { let n = 0, mass = 0; for (let i = 3; i < pixels.length; i += 4) { if (pixels[i] > 8) n++; mass += pixels[i]; } return { coveredPixels: n, alphaMass: mass }; };
    const diff = (a, b) => { let channels = 0, maxDelta = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { channels++; maxDelta = Math.max(maxDelta, Math.abs(a[i] - b[i])); } return { channels, maxDelta }; };
    function setup({ pool, style, age = .5, view = 'seam', initialAlpha = 1, fadeIn = .01 }) {
      if (pool === 'inkBands') { camera.position.set(view === 'seam' ? -8 : 8, 2, 0); camera.lookAt(0, 1.5, 0); }
      else if (pool === 'inkBeams') { camera.position.set(0, 2, view === 'seam' ? -8 : 8); camera.lookAt(0, 2, 0); }
      else { camera.position.set(0, 0, 8); camera.lookAt(0, 0, 0); }
      camera.updateMatrixWorld();
      for (const f of Object.values(fixtures)) {
        const k = f.kit; k.clear(); k.time = 1.25;
        if (pool === 'puffs') {
          k.puffs.spawnRaw(0, 0, 0, 0, 0, 0, 1, 1.5, .75, .9, .12, .025, initialAlpha, style, 0, 0, .2, 0, .37, 0, fadeIn, 0);
          k.puffs.p[6] = age;
        } else if (pool === 'inkBeams') k.inkBeams.add(10, [0, 0, 0, .6, 0, 4, 0, .6, .9, .12, .025, .85, style, .3, .37, 1.2]);
        else if (pool === 'inkBands') k.inkBands.add(10, [0, 0, 0, 0, 1.15, 3, 1, 0, .9, .12, .025, .85, style, .3, .37, 1.2]);
        else if (pool === 'inkShells') k.inkShells.add(10, [0, 0, 0, 0, 1.1, 1.1, 1.1, 0, .9, .12, .025, .85, style, .3, .37, 1.2]);
        else if (pool === 'inkDiscs') k.inkDiscs.add(10, [0, 0, 0, 1.4, 0, 0, 1, 0, .9, .12, .025, .85, style, .3, .37, 1.2]);
        k.update(0, camera);
      }
      if (snapshot(fixtures.before.kit) !== snapshot(fixtures.after.kit)) throw Error('Effect state, geometry or upload buffers changed');
    }
    function render(version) {
      const f = fixtures[version]; renderer.render(f.scene, camera);
      return { pixels: read(), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    }
    async function measure(version) {
      if (!timer) return null;
      const q = gl.createQuery(); gl.beginQuery(timer.TIME_ELAPSED_EXT, q);
      for (let i = 0; i < 4; i++) renderer.render(fixtures[version].scene, camera);
      gl.endQuery(timer.TIME_ELAPSED_EXT); gl.flush();
      for (let i = 0; i < 400; i++) {
        if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
          const elapsed = gl.getQueryParameter(q, gl.QUERY_RESULT) / 4e6;
          const disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT); gl.deleteQuery(q);
          return disjoint ? null : elapsed;
        }
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      gl.deleteQuery(q); return null;
    }
    const jobs = [];
    for (let style = 0; style < 6; style++) for (const view of ['seam', 'opposite']) jobs.push({ pool: 'inkBeams', style, view });
    for (let style = 0; style < 5; style++) for (const view of ['seam', 'opposite']) jobs.push({ pool: 'inkBands', style, view });
    for (const style of [0, 1, 2, 3]) for (const age of [.5, .98]) jobs.push({ pool: 'puffs', style, age, identical: true });
    for (const age of [.5, .8, .88, .92, .96, .98, .99]) jobs.push({ pool: 'puffs', style: 4, age, retirementSeries: true, identical: age <= .8 });
    for (const age of [.0001, .001, .005]) jobs.push({ pool: 'puffs', style: 4, age, initialAlpha: 1, fadeIn: .01, identical: true });
    for (const initialAlpha of [.05, .1, .15]) for (const age of [.1, .5, .8]) jobs.push({ pool: 'puffs', style: 4, age, initialAlpha, identical: true });
    for (let style = 0; style < 5; style++) jobs.push({ pool: 'inkShells', style, identical: true });
    for (let style = 0; style < 9; style++) jobs.push({ pool: 'inkDiscs', style, identical: true });
    for (const job of jobs) {
      setup(job);
      const a = render('before'), b = render('after'), delta = diff(a.pixels, b.pixels);
      if (job.identical && delta.channels) throw Error('Unchanged effect pixels differ: ' + JSON.stringify({ ...job, delta }));
      if (a.calls !== b.calls || a.triangles !== b.triangles) throw Error('Draw budget changed');
      const row = { ...job, ...delta, before: { ...count(a.pixels), calls: a.calls, triangles: a.triangles }, after: { ...count(b.pixels), calls: b.calls, triangles: b.triangles } };
      cases.push(row);
      const capture = (job.pool === 'inkBeams' && job.style === 0 && job.view === 'seam') || (job.pool === 'inkBands' && job.style === 0 && job.view === 'seam') || job.retirementSeries;
      if (capture) for (const version of ['before', 'after']) {
        render(version); images.push({ file: `${job.pool}-${job.style}-${job.age ?? job.view}-${version}.png`, data: renderer.domElement.toDataURL('image/png') });
      }
      if (!skipTiming && capture && job.pool !== 'puffs') {
        const samples = { before: [], after: [] };
        for (let i = 0; i < 8; i++) for (const version of (i % 2 ? ['after', 'before'] : ['before', 'after'])) samples[version].push(await measure(version));
        timings.push({ pool: job.pool, style: job.style, ...samples });
      }
    }
    const petals = cases.filter(c => c.retirementSeries);
    if (!petals.some(c => c.after.coveredPixels < c.before.coveredPixels && c.after.coveredPixels > 0)) throw Error('No gradual petal retirement');
    for (let i = 1; i < petals.length; i++) if (petals[i].after.coveredPixels > petals[i - 1].after.coveredPixels) throw Error('Petal grows during retirement');
    for (const version of ['before', 'after']) fixtures[version].kit.dispose();
    return { renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), cases, timings, images, glError: gl.getError() };
  }, { skipTiming: process.env.VFX_SKIP_TIMING === '1' });
  for (const image of receipt.images) fs.writeFileSync(path.join(out, image.file), Buffer.from(image.data.split(',')[1], 'base64'));
  delete receipt.images;
  receipt.browser = browser.version(); receipt.errors = errors;
  receipt.scope = 'Production SpecialVfxKit isolated in Chromium WebGL2/SwiftShader; no whole-game or physical iPad performance claim. Stage assets and gameplay are not loaded or edited.';
  fs.writeFileSync(path.join(out, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ cases: receipt.cases.length, unchangedCases: receipt.cases.filter(c => c.identical).length,
    glError: receipt.glError, errors, timings: receipt.timings, petals: receipt.cases.filter(c => c.retirementSeries), out }, null, 2));
  assert.equal(receipt.glError, 0); assert.deepEqual(errors, []);
} finally { await browser?.close(); server.close(); }
