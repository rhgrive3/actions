#!/usr/bin/env node
// #1165 in a real browser: the Roller band the GPU draws and the band the CPU grid owns must agree.
// Stamps `kind: 'roll'` splats for several seeds (pi/60 is the issue's witness), stroke directions and
// sub-cell offsets on a real floor face, lets them settle, then reads the atlas back at every grid cell
// centre around each stamp and compares it with the CPU ownership.
//
//   node scripts/check-inkwave-roller-band-gpu-cpu.mjs --site _site --evidence-dir <dir>
//
// A cell whose GPU/CPU states differ but that touches a cell with the other state is an edge cell and is
// counted as antialiasing tolerance (the GPU edge is a ~3 texel profile; the CPU grid is 0.25 m cells).
// A "hard" mismatch has no such neighbour and fails the check. Software WebGL, not a phone GPU.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const option = name => process.argv[process.argv.indexOf(name) + 1];
const site = fs.realpathSync(option('--site')), output = path.resolve(option('--evidence-dir'));
fs.mkdirSync(output, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(JSON.stringify(manifest.artifacts)), manifest.contentHash);
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const file = fs.realpathSync(path.join(site, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(site + '/')) throw Error('outside site');
    const key = path.relative(site, file), bytes = fs.readFileSync(file);
    if (key !== 'inkwave-build.json' && hash(bytes) !== manifest.artifacts[key]) throw Error('artifact mismatch');
    response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }); response.end(bytes);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const result = { contentHash: manifest.contentHash, revision: manifest.build.revision, browser: browser.version(),
  measurement: 'real WebGL atlas readback in software WebGL; not a physical GPU', cases: [] };
try {
  const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('inkwave.settings', JSON.stringify({ quality: 'low', shadows: false, bloom: false, lang: 'en', master: 0, music: 0, frameRate: 60 })));
  await page.goto('http://127.0.0.1:' + server.address().port + '/?range&skipTitle', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__G?.match?.range && __G.match.state === 'playing', null, { timeout: 420000 });
  const measured = await page.evaluate(async () => {
    const G = window.__G, P = G.paint, renderer = G.renderer, THREE = G.THREE || null, pixel = new Uint8Array(4);
    const face = P.paintFaces.filter(f => f.turf && !f.wall).sort((a, b) => b.su * b.sv - a.su * a.sv)[0];
    const V3 = P.paintFaces[0].origin.constructor;
    const gpu = (i, j) => {
      const a = face.atlas;
      renderer.readRenderTargetPixels(P.rt, Math.floor(a.x + a.pad + (i + 0.5) * face.cu * a.ppm), Math.floor(a.y + a.pad + (j + 0.5) * face.cv * a.ppm), 1, 1, pixel);
      return pixel[3] >= 128;
    };
    const idx = (i, j) => face.grid + j * face.nu + i;
    const seeds = [Math.PI / 60, 0.13, 0.5, 0.77, 0.93], dirs = [[1, 0], [0, 1], [0.7071, 0.7071], [-0.6, 0.8]];
    const radius = 0.62, offsets = [0, 0.37, 0.71];
    const cases = [];
    let n = 0;
    // One stamp per (seed, direction, offset) on its own 3 m cell of the face, so nothing overlaps.
    const slots = [];
    for (const seed of seeds) for (const dir of dirs) for (const off of offsets) slots.push({ seed, dir, off });
    const cols = Math.floor(face.su / 3), rows = Math.floor(face.sv / 3);
    const placed = [];
    for (const slot of slots) {
      if (n >= cols * rows) break;
      const cu = (n % cols) * 3 + 1.5 + slot.off * face.cu, cv = Math.floor(n / cols) * 3 + 1.5 + slot.off * face.cv * 0.6;
      n++;
      const center = face.origin.clone().addScaledVector(face.u, cu).addScaledVector(face.v, cv).addScaledVector(face.n, 0.05);
      const stretch = face.u.clone().multiplyScalar(slot.dir[0]).addScaledVector(face.v, slot.dir[1]).normalize();
      P.splat(center, radius, 0, { kind: 'roll', stretch, seed: slot.seed, stretchAmt: 1 });
      placed.push({ ...slot, cu, cv });
    }
    for (let k = 0; k < 900; k++) P.flush(1 / 60);
    for (const stamp of placed) {
      const i0 = Math.max(0, Math.floor((stamp.cu - 1.2) / face.cu)), i1 = Math.min(face.nu - 1, Math.floor((stamp.cu + 1.2) / face.cu));
      const j0 = Math.max(0, Math.floor((stamp.cv - 1.2) / face.cv)), j1 = Math.min(face.nv - 1, Math.floor((stamp.cv + 1.2) / face.cv));
      const cpu = (i, j) => (i < 0 || j < 0 || i >= face.nu || j >= face.nv) ? 0 : P.grid[idx(i, j)] === 1;
      let owned = 0, both = 0, edge = 0, hard = 0, gpuOnly = 0, cpuOnly = 0;
      const hardCells = [];
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const c = cpu(i, j), g = gpu(i, j);
        if (c) owned++;
        if (c && g) both++;
        if (c === g) continue;
        if (g) gpuOnly++; else cpuOnly++;
        let touches = false;
        for (let dj = -1; dj <= 1 && !touches; dj++) for (let di = -1; di <= 1 && !touches; di++) {
          if (!di && !dj) continue;
          const ii = i + di, jj = j + dj;
          if (ii < i0 || ii > i1 || jj < j0 || jj > j1) continue;
          if (cpu(ii, jj) === g) touches = true;           // a neighbour already has the state the GPU shows
        }
        if (touches) edge++; else { hard++; if (hardCells.length < 4) hardCells.push([i - i0, j - j0, c, g]); }
      }
      cases.push({ seed: stamp.seed, dir: stamp.dir, cells: (i1 - i0 + 1) * (j1 - j0 + 1), owned, both, edge, hard, gpuOnly, cpuOnly, hardCells });
    }
    return { faceCells: face.nu * face.nv, stamps: cases.length, cases };
  });
  fs.writeFileSync(path.join(output, 'roller-band-measurement.json'), JSON.stringify(measured, null, 2) + '\n');
  result.cases = measured.cases;
  const totals = measured.cases.reduce((t, c) => ({ owned: t.owned + c.owned, both: t.both + c.both, edge: t.edge + c.edge, hard: t.hard + c.hard, gpuOnly: t.gpuOnly + c.gpuOnly, cpuOnly: t.cpuOnly + c.cpuOnly }), { owned: 0, both: 0, edge: 0, hard: 0, gpuOnly: 0, cpuOnly: 0 });
  result.totals = totals; result.stamps = measured.stamps;
  assert.ok(measured.stamps >= 40, 'enough stamps to cover seeds, directions and offsets');
  assert.ok(totals.owned > 400, 'the stamps own real turf');
  assert.equal(totals.hard, 0, 'no cell disagrees with CPU ownership unless it touches the edge');
  assert.ok(totals.both >= totals.owned * 0.9, 'at least 90 % of owned cells show GPU ink');
  assert.ok(totals.edge <= totals.owned * 0.15, 'edge disagreement stays within the antialiasing tolerance');
  // The original defect was a systematic bias, not noise: the CPU band was narrower than the GPU band (a 0.03 r inset and no
  // width wobble), so edge cells showed GPU ink the CPU did not own. Measured on this deterministic set in software WebGL:
  // fixed band 13 GPU-only / 13 CPU-only, original CPU band 42 GPU-only / 3 CPU-only. Edge noise is symmetric; a bias is not.
  assert.ok(totals.gpuOnly - totals.cpuOnly <= totals.owned * 0.025, 'GPU-only edge cells do not outnumber CPU-only ones (CPU band not narrower than the GPU band)');
  assert.deepEqual(errors, []);
  result.status = 'passed';
} catch (error) {
  result.status = 'failed'; result.error = String(error?.stack || error); throw error;
} finally {
  fs.writeFileSync(path.join(output, 'roller-band-gpu-cpu.json'), JSON.stringify(result, null, 2) + '\n');
  await browser.close(); server.close();
}
console.log(JSON.stringify({ status: result.status, stamps: result.stamps, totals: result.totals }));
