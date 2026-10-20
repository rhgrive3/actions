#!/usr/bin/env node
// #1642 in a real browser: paint, let it settle, lose and restore the real WebGL context with
// WEBGL_lose_context, then compare the GPU paint atlas with the CPU turf that survived.
// SwiftShader (software WebGL) proves the data path, not a phone GPU's memory-pressure behaviour.
//
//   node scripts/check-inkwave-paint-context-restore.mjs --site _site --evidence-dir <dir> [--baseline]
//
// --baseline expects the OLD behaviour (atlas blank after the restore) and records it instead of failing.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const option = name => process.argv[process.argv.indexOf(name) + 1];
const site = fs.realpathSync(option('--site')), output = path.resolve(option('--evidence-dir'));
const baseline = process.argv.includes('--baseline');
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
const result = { baseline, contentHash: manifest.contentHash, revision: manifest.build.revision, browser: browser.version(),
  measurement: 'real WebGL context loss/restore in software WebGL; not a physical GPU', rows: [] };
try {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('inkwave.settings', JSON.stringify({ quality: 'low', shadows: false, bloom: false, lang: 'en', master: 0, music: 0, frameRate: 60 })));
  await page.goto('http://127.0.0.1:' + server.address().port + '/?range&skipTitle', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__G?.match?.range && __G.match.state === 'playing', null, { timeout: 420000 });
  const row = await page.evaluate(async () => {
    const G = window.__G, P = G.paint, renderer = G.renderer, gl = renderer.getContext(), canvas = renderer.domElement;
    const pixel = new Uint8Array(4);
    // Texel centre of a grid cell inside the atlas, and what the atlas holds there.
    const read = (face, i, j) => {
      const a = face.atlas, x = Math.floor(a.x + a.pad + (i + 0.5) * face.cu * a.ppm), y = Math.floor(a.y + a.pad + (j + 0.5) * face.cv * a.ppm);
      renderer.readRenderTargetPixels(P.rt, x, y, 1, 1, pixel);
      const alpha = pixel[3], team = alpha > 16 ? (pixel[0] / alpha > 0.5 ? 1 : 0) : -1;
      return { alpha, team };
    };
    const cellOf = (face, i, j) => face.grid + j * face.nu + i;
    const ownerAt = (face, i, j) => (i < 0 || j < 0 || i >= face.nu || j >= face.nv) ? 0 : P.grid[cellOf(face, i, j)];
    const nearOwned = (face, i, j, r) => { for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (ownerAt(face, i + di, j + dj)) return true; return false; };
    // Paint two touching patches of different teams on a floor face, then let everything settle and dry.
    const face = P.paintFaces.filter(f => f.turf && !f.wall).sort((a, b) => b.su * b.sv - a.su * a.sv)[0];
    const at = (fu, fv) => face.origin.clone().addScaledVector(face.u, face.su * fu).addScaledVector(face.v, face.sv * fv).addScaledVector(face.n, 0.05);
    P.splat(at(0.35, 0.4), 1.6, 0, { seed: 0.31 });
    P.splat(at(0.5, 0.45), 1.3, 1, { seed: 0.62 });
    for (let k = 0; k < 600; k++) P.flush(1 / 60);
    // Sample sets: owned cells (both teams) and empty cells at least three cells from any ink.
    const owned = [], empty = [];
    for (let j = 0; j < face.nv; j++) for (let i = 0; i < face.nu; i++) {
      if (P.dead[cellOf(face, i, j)]) continue;
      if (ownerAt(face, i, j)) owned.push([i, j, ownerAt(face, i, j) - 1]);
      else if (!nearOwned(face, i, j, 3)) empty.push([i, j]);
    }
    const stride = (list, n) => list.filter((_, index) => index % Math.max(1, Math.floor(list.length / n)) === 0).slice(0, n);
    const ownedSample = stride(owned, 80), emptySample = stride(empty, 80);
    const measure = (ownedList, emptyList) => {
      let ownedInk = 0, ownedTeam = 0, emptyClear = 0;
      for (const [i, j, team] of ownedList) { const r = read(face, i, j); if (r.alpha >= 128) ownedInk++; if (r.team === team) ownedTeam++; }
      for (const [i, j] of emptyList) if (read(face, i, j).alpha < 40) emptyClear++;
      return { owned: ownedList.length, ownedInk, ownedTeam, empty: emptyList.length, emptyClear };
    };
    const before = measure(ownedSample, emptySample);
    const counts = [...P.counts], version = P.version, grid = P.grid.slice(), coverage = P.coverage();
    // Lose the real context, then restore it. The platform's own listeners run on both events.
    const lose = gl.getExtension('WEBGL_lose_context');
    // Bounded waits: a missing event must fail the check, not hang it. restoreContext() is ignored when it is called
    // inside the loss event's own task (the browser has not evaluated preventDefault yet), so yield a task first.
    const once = name => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(name + ' did not arrive')), 30000);
      canvas.addEventListener(name, event => { clearTimeout(timer); resolve(event); }, { once: true });
    });
    const lost = once('webglcontextlost'); lose.loseContext(); await lost;
    const lostWhileLost = gl.isContextLost();
    await new Promise(resolve => setTimeout(resolve, 100));
    const restored = once('webglcontextrestored'); lose.restoreContext(); await restored;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const after = measure(ownedSample, emptySample);
    const authority = { gridUnchanged: P.grid.every((value, index) => value === grid[index]), countsUnchanged: P.counts[0] === counts[0] && P.counts[1] === counts[1],
      versionUnchanged: P.version === version, coverage: JSON.stringify(P.coverage()) === JSON.stringify(coverage) };
    // New ink after the restore must land on the restored atlas, overlapping the old patch.
    const newPatch = at(0.42, 0.42);
    const gridBefore = P.grid.slice();
    P.splat(newPatch, 1.1, 1, { seed: 0.9 });
    for (let k = 0; k < 600; k++) P.flush(1 / 60);
    const fresh = [];
    for (let j = 0; j < face.nv; j++) for (let i = 0; i < face.nu; i++) {
      const k = cellOf(face, i, j);
      if (P.grid[k] === 2 && gridBefore[k] !== 2 && !P.dead[k]) fresh.push([i, j, 1]);
    }
    const freshMeasure = measure(stride(fresh, 60), []);
    const stillOld = measure(ownedSample.filter(([i, j]) => P.grid[cellOf(face, i, j)] === gridBefore[cellOf(face, i, j)]), []);
    return { faceCells: face.nu * face.nv, ownedCells: owned.length, before, lostWhileLost, after, authority, restoreCount: P.gridRestoreCount || 0,
      freshCells: fresh.length, freshMeasure, stillOld, glError: gl.getError(), contextLostNow: gl.isContextLost()
      };
  });
  fs.writeFileSync(path.join(output, 'context-restore-measurement.json'), JSON.stringify(row, null, 2) + '\n');
  await page.screenshot({ path: path.join(output, 'after-restore.png'), timeout: 120000 });
  result.rows.push(row);
  assert.ok(row.ownedCells > 60, 'the fixture owns real turf');
  assert.ok(row.before.ownedInk >= row.before.owned * 0.95 && row.before.ownedTeam >= row.before.owned * 0.95, 'ink is on the atlas before the loss');
  assert.ok(row.before.emptyClear >= row.before.empty * 0.95, 'bare turf is bare on the atlas before the loss');
  assert.equal(row.lostWhileLost, true);
  assert.deepEqual(row.authority, { gridUnchanged: true, countsUnchanged: true, versionUnchanged: true, coverage: true }, 'restoring never changes ownership or score');
  assert.equal(row.contextLostNow, false);
  assert.deepEqual(errors, []);
  if (baseline) {
    // Documented old behaviour: the CPU still owns the turf but the atlas is blank.
    assert.ok(row.after.ownedInk < row.after.owned * 0.2, 'baseline: the atlas lost the ink');
  } else {
    assert.equal(row.restoreCount, 1, 'the atlas was rebuilt exactly once for one restore');
    assert.ok(row.after.ownedInk >= row.after.owned * 0.95, 'owned turf is inked again');
    assert.ok(row.after.ownedTeam >= row.after.owned * 0.95, 'with the right team colour');
    assert.ok(row.after.emptyClear >= row.after.empty * 0.95, 'bare turf stays bare');
    assert.equal(row.glError, 0);
    assert.ok(row.freshCells > 10, 'a later splat claimed new cells');
    assert.ok(row.freshMeasure.ownedInk >= row.freshMeasure.owned * 0.95 && row.freshMeasure.ownedTeam >= row.freshMeasure.owned * 0.95, 'new ink after the restore reaches the atlas');
    assert.ok(row.stillOld.ownedInk >= row.stillOld.owned * 0.95, 'old ink is still there after the new splat');
  }
  result.status = 'passed';
} catch (error) {
  result.status = 'failed'; result.error = String(error?.stack || error);
  throw error;
} finally {
  fs.writeFileSync(path.join(output, 'paint-context-restore.json'), JSON.stringify(result, null, 2) + '\n');
  await browser.close(); server.close();
}
console.log(JSON.stringify({ status: result.status, baseline, rows: result.rows.length }));
