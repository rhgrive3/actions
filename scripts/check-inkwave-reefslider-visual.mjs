#!/usr/bin/env node
// Actual built Game/Actor/FX, controlled equipment + full gauge; no retail-parity claim.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
const site = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
const hz = Number(process.argv[4] || 60);
const earlyCancel = process.env.REEFSLIDER_EARLY_CANCEL === '1';
if (![30, 60, 120].includes(hz)) throw Error('Expected 30/60/120 render Hz');
fs.mkdirSync(out, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(JSON.stringify(manifest.artifacts)), manifest.contentHash);
for (const [file, digest] of Object.entries(manifest.artifacts)) assert.equal(hash(fs.readFileSync(path.join(site, file))), digest, file);
const report = { status: 'running', hz, setup: 'Actual Game._frame, normal follow camera; tidewater turf, 8 actors, bots frozen, controlled Reefslider equipment/full gauge, physical Q input; HUD made visible after scripted intro. Separate inspection camera images do not represent the ordinary game view. Seeded gameplay RNG. SwiftShader; not Nintendo comparison or hardware FPS.', errors: [], frames: [] };
report.build = { revision: manifest.build.revision, esbuild: manifest.build.esbuild, optimization: manifest.build.optimization };
report.contentHash = manifest.contentHash;
report.scenario = earlyCancel ? 'fresh fire at simulation frame 64, early brake on open floor' : 'natural timeout/wall contact';
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  try {
    const pathname = new URL(req.url, 'http://local').pathname;
    const file = path.resolve(site, '.' + (pathname === '/' ? '/index.html' : decodeURIComponent(pathname)));
    if (!file.startsWith(site + '/') || !fs.statSync(file).isFile()) throw Error('missing');
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
let browser;
try {
  browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  page.on('pageerror', e => report.errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('inkwave.settings', JSON.stringify({ quality: 'high', shadows: false, bloom: false, minimap: true, musicVolume: 0, audioVolume: 0 }));
    let seed = 7; Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  });
  await page.goto('http://127.0.0.1:' + server.address().port + '/?map=tidewater', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => { globalThis.NG = (await import(new URL('src/core/ctx.js', document.baseURI))).G; });
  await page.waitForFunction(() => NG.game?.menus && NG.mode !== 'boot' || document.getElementById('boot-error')?.textContent, null, { timeout: 240000 });
  console.log('browser booted');
  await page.evaluate(async () => {
    const g = NG.game; g.debug.freeze(); g._skipRender = true; g.menus.wipe.cancel();
    await g.startMatch({ mapId: 'tidewater', mode: 'turf', difficulty: 'normal' }); g.debug.freezeBots();
    for (let i = 0; i < 335; i++) g._frame(1 / 60);
  });
  await page.evaluate(() => NG.input.canvas.requestPointerLock());
  await page.waitForFunction(() => NG.input.locked);
  await page.mouse.down(); await page.evaluate(() => { for (let i = 0; i < 5; i++) NG.game._frame(1 / 60); }); await page.mouse.up();
  await page.evaluate(() => { for (let i = 0; i < 100; i++) NG.game._frame(1 / 60); const a = NG.local; a.weapon = { ...a.weapon, special: 'reefslider', specialCost: 200 }; a.special = 200; NG.game.hud?.setVisible(true); });
  report.environment = await page.evaluate(() => { const gl = NG.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); return { webgl2: gl instanceof WebGL2RenderingContext, renderer: ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL), state: NG.match.state, alive: NG.local.alive, grounded: NG.local.grounded, pos: NG.local.pos.toArray() }; });
  const snap = async (frame, label) => {
    const row = await page.evaluate(async () => {
      const G = NG, g = G.game, a = G.local;
      const { specialVfxDirector } = await import(new URL('patches/splatoon3/runtime/special-vfx.mjs', document.baseURI));
      const d = specialVfxDirector(G.fx), t = d.tracks.get(a), warn = t?.d.warn;
      const began = performance.now(); g.R.render(); G.renderer.getContext().finish();
      return { phase: a._s3AllSpecialState?.phase || null, publicPhase: a.specialActive?.phase || null, alive: a.alive, pos: a.pos.toArray(), velocity: a.vel.toArray(), warning: warn ? { dead: warn.dead, radius: warn.v[3], rotation: warn.v[7], retained: d.kit.discs.recs.includes(warn) } : null, ribbons: ['wakeL', 'wakeR', 'speed'].map(k => ({ key: k, ended: t?.d[k]?.ended ?? null })), stats: d.kit.stats(), calls: G.renderer.info.render.calls, triangles: G.renderer.info.render.triangles, softwareRenderAndDrainMs: performance.now() - began };
    });
    report.frames.push({ simulationFrame: frame, label, ...row });
    await page.screenshot({ path: path.join(out, label + '.png'), timeout: 60000 });
    if (['brake-112', 'recovery-145', 'brake-84', 'recovery-117'].includes(label)) {
      await page.evaluate(() => { const G = NG, a = G.local; globalThis.reefSavedCamera = G.camera.clone(); G.camera.position.copy(a.pos).add({ x: 9, y: 13, z: -10 }); G.camera.lookAt(a.pos.x, a.pos.y, a.pos.z); G.camera.updateMatrixWorld(); G.game.R.render(); });
      await page.screenshot({ path: path.join(out, label + '-inspection.png'), timeout: 60000 });
      await page.evaluate(() => { NG.camera.copy(globalThis.reefSavedCamera); NG.game.R.render(); });
    }
    console.log(label, row.phase, row.warning?.retained ?? false);
    fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(report, null, 2));
  };
  await snap(0, 'ordinary-before');
  // At 120 Hz a render may contain zero fixed ticks. Hold Q for a full native tick.
  const pressQ = async () => {
    await page.keyboard.down('q');
    await page.evaluate(hz => { for (let i = 0; i < Math.max(1, hz / 60); i++) NG.game._frame(1 / hz); }, hz);
    await page.keyboard.up('q');
  };
  await pressQ();
  if (await page.evaluate(() => NG.local.specialActive?.id) !== 'reefslider') throw Error('Physical Q did not activate');
  let current = Math.max(1, hz / 60) * 60 / hz;
  const targets = earlyCancel
    ? [[12, 'startup-12'], [45, 'dash-45'], [64, 'dash-64'], [84, 'brake-84'], [101, 'brake-101'], [104, 'impact-104'], [117, 'recovery-117'], [132, 'ordinary-return-132']]
    : [[12, 'startup-12'], [45, 'dash-45'], [92, 'brake-92'], [112, 'brake-112'], [129, 'brake-129'], [132, 'impact-132'], [145, 'recovery-145'], [160, 'ordinary-return-160']];
  for (const [frame, label] of targets) {
    const count = Math.round((frame - current) * hz / 60);
    await page.evaluate(({ count, hz }) => { for (let i = 0; i < count; i++) NG.game._frame(1 / hz); }, { count, hz }); current += count * 60 / hz; await snap(current, label);
    if (earlyCancel && frame === 64) await page.mouse.down();
    if (earlyCancel && frame === 84) await page.mouse.up();
  }
  report.lifecycle = await page.evaluate(async () => {
    const G = NG, g = G.game, a = G.local;
    const { specialVfxDirector } = await import(new URL('patches/splatoon3/runtime/special-vfx.mjs', document.baseURI));
    const d = specialVfxDirector(G.fx);
    if (a.specialActive || d.tracks.has(a)) throw Error('First activation did not retire');
    // Fresh physical input is driven below; here only refill the test gauge.
    a.special = 200;
    return { firstRetired: true, initialResources: d.kit.stats() };
  });
  await pressQ();
  Object.assign(report.lifecycle, await page.evaluate(async hz => {
    const G = NG, g = G.game, a = G.local;
    const { specialVfxDirector } = await import(new URL('patches/splatoon3/runtime/special-vfx.mjs', document.baseURI));
    const d = specialVfxDirector(G.fx);
    if (a.specialActive?.id !== 'reefslider') throw Error('Reuse input rejected');
    for (let i = 0; i < hz; i++) g._frame(1 / hz);
    const beforeDeath = a._s3AllSpecialState?.phase;
    a.splat(null, 'reefslider visual lifecycle diagnostic');
    g._frame(1 / hz);
    const deathRetired = !d.tracks.has(a), devicesRetired = !a.character.s3SpecialDevices?.();
    for (let i = 0; i < hz; i++) g._frame(1 / hz);
    return { reused: true, beforeDeath, deathRetired, devicesRetired, retainedRibbonsAfterOneSecond: d.kit.ribbons.list.length, finalResources: d.kit.stats() };
  }, hz));
  assert.equal(report.environment.webgl2, true);
  assert.equal(report.lifecycle.deathRetired, true);
  assert.equal(report.lifecycle.devicesRetired, true);
  assert.equal(report.lifecycle.retainedRibbonsAfterOneSecond, 0);
  if (process.env.REEFSLIDER_EXPECT_FIXED === '1') for (const row of report.frames.filter(r => r.phase === 'recovery')) {
    assert.equal(row.warning?.retained, false, 'no arming warning after the native impact');
    assert.ok(row.ribbons.every(r => r.ended === true), 'wake retires at native impact');
  }
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
} catch (e) { report.status = 'failed'; report.error = e.stack; throw e; }
finally { fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(report, null, 2)); await browser?.close(); await new Promise(r => server.close(r)); }
