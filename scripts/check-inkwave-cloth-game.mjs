#!/usr/bin/env node
// Real index/bootstrap/main scene. Compare original/fixed cloth on the SAME frozen
// game state; this avoids attributing different AI/physics histories to shaders.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { adaptClothDerivativeFlow } from '../patches/local-quality/cloth-derivative-adapter.mjs';

const [siteArg, outArg, stage = 'tidewater'] = process.argv.slice(2);
const site = path.resolve(siteArg), out = path.resolve(outArg);
if (!['tidewater', 'scorch'].includes(stage)) throw Error('Expected a reviewed stage');
fs.mkdirSync(out, { recursive: true });
const sha = b => createHash('sha256').update(b).digest('hex');
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
const raw = fs.readFileSync(new URL('../inkwave-public/src/game/character-mats.js', import.meta.url), 'utf8');
const fixed = adaptClothDerivativeFlow('src/game/character-mats.js', raw);
function endBlock(text, start) {
  let end = text.indexOf('{', start) + 1, depth = 1;
  for (; end < text.length && depth; end++) {
    if (text[end] === '{') depth++;
    else if (text[end] === '}') depth--;
  }
  if (depth) throw Error('Unbalanced shader fixture');
  return end;
}
const plans = ['// chest emblem', '// front: fly J-stitch'].map((marker, i) => {
  const start = raw.indexOf('if (p.z > 0.0) {', raw.indexOf(marker));
  let end = endBlock(raw, start);
  if (i) end = endBlock(raw, raw.indexOf('else', end));
  const changedStart = fixed.indexOf('{', fixed.indexOf(marker));
  const changedEnd = endBlock(fixed, changedStart);
  const original = raw.slice(start, end), corrected = fixed.slice(changedStart, changedEnd);
  return { original, corrected, originalHash: sha(original), correctedHash: sha(corrected) };
});
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const receipts = new Set();
const server = http.createServer((req, res) => {
  try {
    const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname.slice(1)) || 'index.html';
    const file = path.resolve(site, rel);
    if (!file.startsWith(site + '/')) throw Error('Invalid path');
    const bytes = fs.readFileSync(file);
    if (rel !== 'inkwave-build.json' && manifest.artifacts[rel] !== sha(bytes)) throw Error('Unverified artifact: ' + rel);
    receipts.add(rel);
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
    res.end(bytes);
  } catch (e) { res.writeHead(404); res.end(String(e)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const errors = [], report = { stage, contentHash: manifest.contentHash, status: 'running', errors,
  blockHashes: plans.map(({ originalHash, correctedHash }) => ({ originalHash, correctedHash })),
  limitation: 'SwiftShader completion timing, not iPad or hardware GPU FPS. Original shader has undefined derivative output; original/fixed full-pixel equality is not required.' };
const save = () => fs.writeFileSync(path.join(out, 'game.json'), JSON.stringify(report, null, 2));
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 480 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.addInitScript(() => {
    let seed = 20261012;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    localStorage.setItem('inkwave.settings', JSON.stringify({ quality: 'high', shadows: true, bloom: true, frameRate: 60, musicVolume: 0 }));
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/?map=${stage}&autopilot`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => { window.CG = (await import(new URL('src/core/ctx.js', document.baseURI))).G; });
  await page.waitForFunction(() => {
    const g = CG.game; if (g) g.frozen = true;
    return (g?.debug && CG.s3?.installed && CG.mode !== 'boot') || document.getElementById('boot-error')?.textContent;
  }, null, { timeout: 900000 });
  const bootError = await page.locator('#boot-error').textContent();
  if (bootError) throw Error(bootError);
  report.setup = await page.evaluate(async stage => {
    const G = CG, g = G.game;
    g.debug.freeze(); g.menus.wipe.cancel();
    await g.startMatch({ mapId: stage, mode: 'turf', difficulty: 'normal', duration: 180 });
    g.debug.freeze(); g.R.setDynamicScale(1); g._skipRender = false;
    await Promise.all(G.actors.map(async a => { await a.character._sourceMotionLoader; await a.character.sourceMotion.ready; }));
    const gl = G.renderer.getContext(), done = new Uint8Array(4);
    // Keep the real game path (AI, collision, paint, Character and post rendering).
    // Drain each frame to avoid measuring an arbitrarily growing software GPU queue.
    for (let frame = 0; frame < 330; frame++) { g._frame(1 / 60); gl.readPixels(320, 240, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, done); }
    if (gl.getError() || gl.isContextLost()) throw Error('Invalid game warm-up');
    if (G.actors.length !== 8 || G.actors.some(a => a.character.sourceMotion.status !== 'ready')) throw Error('Missing native actors/source motion');
    if (G.mode !== 'match' || g.match.state !== 'playing' || G.level.layout?.id !== stage) throw Error('Requested native match is not playing');
    return { mode: G.mode, map: G.level.layout?.id, nativeStage: !!G.level.native, actors: G.actors.length, alive: G.actors.filter(a => a.alive).length,
      bots: G.actors.filter(a => a.bot).length, nonLocalBots: G.actors.filter(a => a.isBot).length, patterns: G.actors.map(a => a.character.u.uPattern.value),
      sourceVariants: G.actors.map(a => a.character.sourceMotion.variant), quality: g.R.q, touch: !!g.mobile.touch,
      state: g.match.state, gameTime: G.time, viewport: [gl.drawingBufferWidth, gl.drawingBufferHeight] };
  }, stage);
  save();
  const measured = await page.evaluate(async plans => {
    const G = CG, g = G.game, renderer = G.renderer, gl = renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const materials = new Set();
    for (const a of G.actors) a.character.root.traverse(o => { if (o.name.startsWith('kid:cloth:')) materials.add(o.material); });
    const originals = [...materials].map(m => ({ m, compile: m.onBeforeCompile, key: m.customProgramCacheKey }));
    const snapshot = () => G.actors.map(a => { const nodes = []; a.character.root.traverse(o => nodes.push([o.name, o.visible, ...o.matrixWorld.elements])); return { nodes, p: a.pos.toArray(), hp: a.hp, ink: a.ink, alive: a.alive }; });
    const runs = [], frozenTime = G.time;
    const pixelHash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
    try {
      for (const [ordinal, mode] of ['original', 'fixed', 'fixed', 'original'].entries()) {
        let applied = 0;
        for (const { m, compile, key } of originals) {
          m.onBeforeCompile = function (shader, r) {
            compile.call(this, shader, r);
            for (const plan of plans) {
              if (shader.fragmentShader.split(plan.corrected).length !== 2) throw Error('Product shader fixture mismatch');
              if (mode === 'original') shader.fragmentShader = shader.fragmentShader.replace(plan.corrected, plan.original);
            }
            applied++;
          };
          m.customProgramCacheKey = () => key.call(m) + '|game-cloth-' + ordinal + '-' + mode;
          m.needsUpdate = true;
        }
        const sync = new Uint8Array(4);
        for (let warm = 0; warm < 6; warm++) { g.R.render(); gl.readPixels(320, 240, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, sync); }
        if (!applied) throw Error('No visible product cloth shader compiled');
        const state = snapshot(), frames = [], bytes = [], pngs = [], queries = [];
        for (let frame = 0; frame < 8; frame++) {
          renderer.info.reset();
          const query = ext ? gl.createQuery() : null;
          if (query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
          const start = performance.now(); g.R.render(); const submitted = performance.now();
          if (query) gl.endQuery(ext.TIME_ELAPSED_EXT);
          gl.readPixels(320, 240, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, sync);
          if (gl.getError() || gl.isContextLost() || sync[3] !== 255) throw Error('Invalid completed game output');
          const all = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
          gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, all);
          const completed = performance.now();
          if (gl.getError()) throw Error('Full game readback failed');
          pngs.push(renderer.domElement.toDataURL('image/png').split(',')[1]); bytes.push(all); queries.push(query);
          frames.push({ frame, submitMs: submitted - start, completeMs: completed - start, readbackMs: completed - submitted, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
        }
        // PNGs are already captured synchronously, before hashing yields control.
        for (let i = 0; i < frames.length; i++) {
          frames[i].pixelHash = await pixelHash(bytes[i]);
          const query = queries[i];
          frames[i].gpuMs = query && gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) && !gl.getParameter(ext.GPU_DISJOINT_EXT)
            ? gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6 : null;
          if (query) gl.deleteQuery(query);
        }
        if (G.time !== frozenTime) throw Error('Game advanced while frozen');
        const colors = new Set(); for (let i = 0; i < bytes[7].length; i += 4) colors.add(bytes[7][i] + 256 * bytes[7][i + 1] + 65536 * bytes[7][i + 2]);
        if (colors.size < 32) throw Error('Empty game output');
        runs.push({ ordinal, mode, applied, state, frames, pngs, colors: colors.size });
      }
    } finally { for (const { m, compile, key } of originals) { m.onBeforeCompile = compile; m.customProgramCacheKey = key; m.needsUpdate = true; } }
    return { runs, timerQueryAvailable: !!ext, scene: { background: G.scene.background?.getHex?.(), environment: !!G.scene.environment } };
  }, plans);
  for (const run of measured.runs) {
    run.pngs.forEach((png, i) => fs.writeFileSync(path.join(out, `${run.ordinal}-${run.mode}-${i}.png`), Buffer.from(png, 'base64')));
    delete run.pngs;
  }
  Object.assign(report, measured, { receipts: [...receipts] });
  const canonical = JSON.stringify(measured.runs[0].state);
  report.sameState = measured.runs.every(r => JSON.stringify(r.state) === canonical);
  report.sameDraws = measured.runs.every(r => r.frames.every(f => f.calls === measured.runs[0].frames[0].calls && f.triangles === measured.runs[0].frames[0].triangles));
  const fixedRuns = measured.runs.filter(r => r.mode === 'fixed');
  report.fixedStable = fixedRuns.every(r => r.frames.every((f, i) => f.pixelHash === fixedRuns[0].frames[i % 2].pixelHash));
  report.status = report.sameState && report.sameDraws && report.fixedStable && !errors.length ? 'pass' : 'fail';
  save();
  console.log(JSON.stringify({ stage, status: report.status, setup: report.setup, sameState: report.sameState, sameDraws: report.sameDraws, fixedStable: report.fixedStable, timerQueryAvailable: report.timerQueryAvailable, errors }));
  if (report.status !== 'pass') process.exitCode = 1;
} catch (error) { report.status = 'error'; report.error = error.stack; save(); throw error; }
finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
