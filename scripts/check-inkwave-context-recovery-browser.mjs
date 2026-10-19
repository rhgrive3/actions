#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// A separate terminal browser lane. Do not run more gameplay checks on this
// page after intentional context loss; it closes with the reload dialog up.
export async function nativeContextRecoveryProof() {
  const { G } = await import(new URL('src/core/ctx.js', document.baseURI).href);
  const g = G.game, match = G.match, paint = G.paint;
  const check = (ok, message) => { if (!ok) throw Error(message); };
  const receipt = globalThis.__contextRecoveryReceipt = { stages: [], simulatedInput: 'native padMenuPressed Start edge and public menu API', realGPUEvents: true };
  const mark = stage => { receipt.stages.push({ stage, at: performance.now() }); };
  const snapshot = () => {
    let gridHash = 2166136261;
    for (const value of paint.grid) gridHash = Math.imul(gridHash ^ value, 16777619) >>> 0;
    return { time: match.time, gameTime: G.time, ticks: g.s3Clock?.ticks ?? 0, frame: g._frameN ?? 0,
      paused: match.paused, paintVersion: paint.version, counts: [...paint.counts], gridLength: paint.grid.length, gridHash,
      actors: G.actors.map(a => ({ nid: a.nid ?? null, pos: [a.pos.x, a.pos.y, a.pos.z], hp: a.hp, alive: a.alive, respawnTimer: a.respawnTimer })) };
  };
  const pressStart = () => {
    const previous = g.input.pad, hadEdge = g.input.padMenuPressed.has(9);
    // Headless Chromium has no physical controller. Inject only its native
    // connected-pad/Start edge; leave pollPad and the routing logic untouched.
    g.input.pad ||= { buttons: [], axes: [] }; g.input.padMenuPressed.add(9);
    try { g._padMenus(); } finally { g.input.pad = previous; if (!hadEdge) g.input.padMenuPressed.delete(9); }
  };
  const frame = count => { for (let i = 0; i < count; i++) g._frame(1 / 60); };
  check(match?.state === 'playing' && !G.netm, 'Recovery lane requires a real offline playing match');
  g.debug.freeze(); g.debug.freezeBots(); g._skipRender = true;
  // A paintable top-level face can have a fully buried midpoint; choose a
  // genuinely live CPU turf cell instead of assuming the geometric centre is
  // playable. Preserve a real game-owned paint splat and the real GPU atlas.
  let sample = null;
  for (const f of G.level.faces) {
    if (!f.paintable || !f.turf || !f.atlas || f.grid < 0 || f.su <= 3 || f.sv <= 3) continue;
    const cx = (f.nu - 1) / 2, cy = (f.nv - 1) / 2;
    let best = Infinity;
    for (let j = 0; j < f.nv; j++) for (let i = 0; i < f.nu; i++) {
      const k = f.grid + j * f.nu + i;
      if (paint.dead[k] || paint.grid[k]) continue;
      const distance = Math.abs(i - cx) + Math.abs(j - cy);
      if (distance < best) { sample = { face: f, i, j }; best = distance; }
      if (!best) break;
    }
    if (sample) break;
  }
  check(sample, 'No live, unpainted CPU turf cell for GPU context recovery seed');
  const { face, i, j } = sample;
  const center = face.origin.clone()
    .addScaledVector(face.u, (i + 0.5) * face.cu)
    .addScaledVector(face.v, (j + 0.5) * face.cv)
    .addScaledVector(face.n, .005);
  const firstArea = paint.splat(center, 1, 1, { face: face.id, kind: 'shot', seed: .37, instant: true });
  const secondArea = paint.splat(center, 1, 0, { face: face.id, kind: 'shot', seed: .37, instant: true });
  const seededArea = firstArea + secondArea;
  paint.flush(1 / 60); G.renderer.getContext().finish();
  check(seededArea > 0 && paint.grid.some(value => value !== 0), 'Real CPU/GPU paint seed did not claim turf');
  receipt.seed = { face: face.id, area: seededArea, version: paint.version }; mark('paint-seeded');

  g.pause(); check(match.paused && g.menus.current === 'pause', 'Ordinary pause did not open');
  const ordinaryPause = snapshot(); frame(60);
  const ordinaryPaused = snapshot();
  check(ordinaryPaused.time === ordinaryPause.time && ordinaryPaused.gameTime === ordinaryPause.gameTime, 'Ordinary pause advanced simulation');
  pressStart();
  check(!match.paused, 'Ordinary native Start edge did not resume'); frame(60);
  const ordinaryResumed = snapshot();
  check(Math.abs(ordinaryResumed.time - ordinaryPaused.time + 1) < 1e-8 && Math.abs(ordinaryResumed.gameTime - ordinaryPaused.gameTime - 1) < 1e-8, 'Ordinary resume did not advance exactly sixty fixed ticks');
  g.pause(); g.resume(); check(!match.paused, 'Ordinary direct resume did not work');
  receipt.ordinary = { before: ordinaryPause, paused: ordinaryPaused, resumed: ordinaryResumed }; mark('ordinary-pause-resume');

  // Reproduce the confirmed open-pause-menu edge. Context loss is caused by
  // the real extension, not by synthesizing DOM lost/restored events.
  g.pause(); check(match.paused && g.menus.current === 'pause', 'Loss must begin with the pause menu open');
  const gl = G.renderer.getContext(), canvas = G.renderer.domElement, extension = gl.getExtension('WEBGL_lose_context');
  check(extension, 'WEBGL_lose_context is unavailable; native acceptance is not a skip');
  const event = name => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { canvas.removeEventListener(name, receive); reject(Error('Timed out waiting for actual ' + name)); }, 30000);
    function receive(e) { clearTimeout(timer); resolve({ type: e.type, trusted: e.isTrusted, at: performance.now() }); }
    canvas.addEventListener(name, receive, { once: true });
  });
  g.debug.unfreeze();
  const lost = event('webglcontextlost'); extension.loseContext(); receipt.lostEvent = await lost;
  check(gl.isContextLost() && g.R._contextLost, 'Actual WebGL loss did not latch renderer recovery');
  const grid = paint.grid, savedGrid = grid.slice(), counts = paint.counts, overlay = g.R._contextRecoveryOverlay;
  const matchIdentity = G.match, paintIdentity = G.paint;
  check(overlay && document.querySelectorAll('.iw-webgl-recovery').length === 1, 'Expected one native reload dialog');
  receipt.lost = snapshot(); mark('context-lost');
  // A promise resolved by a DOM listener may resume before dispatch finishes.
  // WEBGL_lose_context forbids restoration until the lost event has completed;
  // yield one task, not another microtask, before requesting the real restore.
  await new Promise(resolve => setTimeout(resolve, 0));
  const restored = event('webglcontextrestored'); extension.restoreContext(); receipt.restoredEvent = await restored;
  check(!gl.isContextLost() && g.R._contextLost, 'Restore must recover GL while retaining terminal game latch');
  receipt.restored = snapshot(); mark('context-restored');

  g.debug.unfreeze(); pressStart(); g.resume();
  const startResult = await g.api.startMatch({ mapId: 'tidewater', mode: 'turf' });
  const attractResult = g._startAttract();
  check(startResult === false && attractResult === false, 'A terminal restart entry was accepted');
  frame(60);
  // Exercise the final installed platform driver, not only debug/direct-frame.
  await new Promise((resolve, reject) => {
    let frames = 0; const timer = setTimeout(() => reject(Error('Native RAF observation did not complete')), 10000);
    const next = () => { if (++frames === 120) { clearTimeout(timer); resolve(); } else requestAnimationFrame(next); };
    requestAnimationFrame(next);
  });
  receipt.afterResumeAttempts = snapshot();
  receipt.identities = { match: G.match === matchIdentity, paint: G.paint === paintIdentity, grid: paint.grid === grid,
    counts: paint.counts === counts, overlay: g.R._contextRecoveryOverlay === overlay,
    everyGridByte: grid.length === savedGrid.length && grid.every((value, i) => value === savedGrid[i]) };
  receipt.dialog = { count: document.querySelectorAll('.iw-webgl-recovery').length, role: overlay.getAttribute('role'),
    connected: overlay.isConnected, buttons: overlay.querySelectorAll('button').length, text: overlay.textContent };
  receipt.terminal = { contextLost: g.R._contextLost, glRestored: !gl.isContextLost(), frozen: g.frozen,
    startResult, attractResult, observedRAF: 120, directFrames: 60 };
  check(Object.values(receipt.identities).every(Boolean), 'Terminal recovery replaced CPU ownership or reload UI');
  for (const key of ['time', 'gameTime', 'ticks', 'frame', 'paintVersion', 'gridLength', 'gridHash'])
    check(receipt.afterResumeAttempts[key] === receipt.lost[key], 'Terminal state advanced: ' + key);
  check(JSON.stringify(receipt.afterResumeAttempts.actors) === JSON.stringify(receipt.lost.actors), 'Terminal actors changed');
  check(JSON.stringify(receipt.afterResumeAttempts.counts) === JSON.stringify(receipt.lost.counts), 'Terminal turf totals changed');
  check(match.paused && receipt.dialog.count === 1 && receipt.dialog.connected, 'Terminal pause/dialog did not persist');
  mark('terminal-restart-rejected');
  return receipt;
}

export function validateContextRecoveryReceipt(receipt) {
  assert.deepEqual(receipt.stages.map(x => x.stage), ['paint-seeded', 'ordinary-pause-resume', 'context-lost', 'context-restored', 'terminal-restart-rejected']);
  assert.equal(receipt.realGPUEvents, true);
  assert.equal(receipt.lostEvent.type, 'webglcontextlost'); assert.equal(receipt.restoredEvent.type, 'webglcontextrestored');
  assert.equal(receipt.lostEvent.trusted, true); assert.equal(receipt.restoredEvent.trusted, true);
  assert(receipt.seed.area > 0); assert(receipt.lost.counts.some(x => x > 0));
  assert.deepEqual(Object.keys(receipt.identities).sort(), ['counts', 'everyGridByte', 'grid', 'match', 'overlay', 'paint']);
  assert(Object.values(receipt.identities).every(x => x === true));
  for (const key of ['time', 'gameTime', 'ticks', 'frame', 'paintVersion', 'gridLength', 'gridHash']) assert.equal(receipt.afterResumeAttempts[key], receipt.lost[key], key);
  assert.deepEqual(receipt.afterResumeAttempts.actors, receipt.lost.actors);
  assert.deepEqual(receipt.afterResumeAttempts.counts, receipt.lost.counts);
  assert.equal(receipt.afterResumeAttempts.paused, true); assert.equal(receipt.dialog.count, 1); assert.equal(receipt.dialog.role, 'alertdialog');
  assert.equal(receipt.dialog.connected, true); assert.equal(receipt.dialog.buttons, 1);
  assert.equal(receipt.terminal.contextLost, true); assert.equal(receipt.terminal.glRestored, true);
  assert.equal(receipt.terminal.frozen, false); assert.equal(receipt.terminal.startResult, false); assert.equal(receipt.terminal.attractResult, false);
  assert.equal(receipt.terminal.observedRAF, 120); assert.equal(receipt.terminal.directFrames, 60);
  assert.equal(receipt.ordinary.paused.paused, true); assert.equal(receipt.ordinary.resumed.paused, false);
  assert.equal(receipt.ordinary.paused.gameTime, receipt.ordinary.before.gameTime); assert.equal(receipt.ordinary.paused.time, receipt.ordinary.before.time);
  assert(Math.abs(receipt.ordinary.resumed.gameTime - receipt.ordinary.paused.gameTime - 1) < 1e-8);
  assert(Math.abs(receipt.ordinary.resumed.time - receipt.ordinary.paused.time + 1) < 1e-8);
}

export function validateContextStartupReceipt(receipt) {
  assert.equal(receipt.route, 'native-menu-start');
  assert.equal(receipt.gestures.length, 1);
  assert.deepEqual(receipt.gestures[0], { type: 'click', trusted: true, selector: '.iw-setup [data-id="start"].iw-btn--start' });
  assert.equal(receipt.events.filter(x => x.event === 'native-start-clicked').length, 1);
  assert.equal(receipt.events.find(x => x.event === 'native-start-clicked').attempt, 1);
  assert.equal(receipt.admission.mode, 'match'); assert.equal(receipt.admission.state, 'playing');
  assert.equal(receipt.admission.attract, false); assert.equal(receipt.admission.local, true);
  assert.equal(receipt.admission.sameMatch, true); assert.equal(receipt.admission.audioState, 'running');
  assert.equal(receipt.admission.recordedShooterFire, true);
}

export function recoveryInputPath(key) {
  const namespaces = { 'upstream/': 'inkwave-public/', 'patch/': 'patches/splatoon3/', 'touch-layout/': 'patches/touch-layout/',
    'reliability/': 'patches/reliability/', 'local-quality/': 'patches/local-quality/', 'network-replication/': 'patches/network-replication/',
    'loading-cache/': 'patches/loading-cache/', 'practice-range/': 'patches/practice-range/', 'native-stages/': 'patches/native-stages/', 'build-script/': 'scripts/' };
  const prefix = Object.keys(namespaces).find(p => key.startsWith(p));
  assert(prefix && !key.split('/').includes('..'), 'Unknown/unsafe build input namespace: ' + key);
  return namespaces[prefix] + key.slice(prefix.length);
}

export async function main(siteArg = '_site', outArg = 'reports/context-recovery-browser') {
  const site = path.resolve(siteArg), out = path.resolve(outArg); fs.mkdirSync(out, { recursive: true });
  const build = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json'))), hash = b => crypto.createHash('sha256').update(b).digest('hex');
  assert.equal(hash(JSON.stringify(build.artifacts)), build.contentHash, 'Build content identity mismatch');
  assert.equal(hash(JSON.stringify(build.files)), build.inputHash, 'Build source identity mismatch');
  for (const [file, digest] of Object.entries(build.artifacts)) assert.equal(hash(fs.readFileSync(path.join(site, file))), digest, file);
  const root = fileURLToPath(new URL('../', import.meta.url));
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const tree = new Map(execFileSync('git', ['ls-tree', '-r', '-z', sourceSha], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean).map(row => { const [meta, file] = row.split('\t'); return [file, meta.split(' ')[2]]; }));
  const sourceInputs = Object.entries(build.files).map(([key, digest]) => { const file = recoveryInputPath(key); assert.equal(hash(fs.readFileSync(path.join(root, file))), digest, key); return file; });
  assert.equal(hash(fs.readFileSync(path.join(root, 'scripts/build-inkwave.mjs'))), build.build.script, 'Build pipeline mismatch');
  sourceInputs.push('scripts/build-inkwave.mjs', 'scripts/check-inkwave-context-recovery-browser.mjs',
    'scripts/lib/inkwave-projectile-menu-start.mjs', 'scripts/lib/inkwave-range-menu-entry.mjs');
  const blobs = execFileSync('git', ['hash-object', '--', ...sourceInputs], { cwd: root, encoding: 'utf8' }).trim().split('\n');
  sourceInputs.forEach((file, i) => assert.equal(blobs[i], tree.get(file), 'Build input differs from checkout: ' + file));
  const required = ['src/main.js', 'src/core/renderer.js', 'patches/splatoon3/runtime/clock.mjs', 'patches/splatoon3/runtime/recovery-gate.mjs'];
  for (const file of ['inkwave-public/src/main.js', 'inkwave-public/src/core/renderer.js', 'patches/splatoon3/runtime/clock.mjs', 'patches/splatoon3/runtime/recovery-gate.mjs']) assert(sourceInputs.includes(file), 'Required source input omitted from identity: ' + file);
  const moduleHashes = Object.fromEntries(required.map(file => { const digest = build.artifacts[file]; assert(digest, 'Missing required emitted module: ' + file); return [file, digest]; }));
  const errors = [], consoleMessages = [], requests = [], httpFailures = [], events = [], served = new Set();
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.mp3': 'audio/mpeg' };
  const server = http.createServer((req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname), file = path.resolve(site, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(site + path.sep) || !fs.statSync(file).isFile()) throw Error('Missing file');
      served.add(path.relative(site, file)); res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(file).on('error', error => { errors.push('HTTP stream: ' + error.message); res.destroy(error); }).pipe(res);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser, context, page, startup = null, primary = null, result = null, lastStage = 'verified-build';
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
    await context.tracing.start({ screenshots: false, snapshots: true, sources: false });
    page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message)); page.on('crash', () => events.push('crash')); page.on('close', () => events.push('close'));
    page.on('response', r => { if (r.status() >= 400 && httpFailures.length < 32) httpFailures.push({ url: r.url(), status: r.status() }); });
    page.on('requestfailed', r => { if (requests.length < 32) requests.push({ url: r.url(), error: r.failure()?.errorText }); });
    page.on('console', m => { if (consoleMessages.length < 32) consoleMessages.push({ type: m.type(), text: m.text().slice(0, 1500) }); });
    await page.addInitScript(() => localStorage.setItem('inkwave.settings', JSON.stringify({ quality: 'low', shadows: false, bloom: false, minimap: true })));
    await page.goto('http://127.0.0.1:' + server.address().port + '/?skipTitle', { waitUntil: 'domcontentloaded', timeout: 30000 }); lastStage = 'navigated';
    await page.evaluate(async () => {
      globalThis.RG = (await import(new URL('src/core/ctx.js', document.baseURI))).G;
      globalThis.__contextStartupGestures = [];
      const selector = '.iw-setup [data-id="start"].iw-btn--start';
      document.addEventListener('click', event => {
        if (event.target?.closest?.(selector) && __contextStartupGestures.length < 8)
          __contextStartupGestures.push({ type: event.type, trusted: event.isTrusted, selector });
      }, true);
    });
    // One bounded startup budget. The actual menu handler owns audio unlock,
    // preparation and match admission; no direct startMatch or readiness stub.
    const startupDeadline = Date.now() + 180000;
    const remainingMs = () => { const left = startupDeadline - Date.now(); assert(left > 0, 'Native startup deadline exceeded'); return left; };
    await page.waitForFunction(() => (globalThis.RG?.game?.menus && RG.s3?.installed && RG.mode !== 'boot') || !!document.querySelector('#boot-error')?.textContent, null, { timeout: remainingMs() });
    const bootError = await page.evaluate(() => document.querySelector('#boot-error')?.textContent || ''); assert(!bootError, bootError);
    const identity = await page.evaluate(() => ({ baseURI: document.baseURI, revision: new URL(document.baseURI).pathname.split('/').filter(Boolean).at(-1) }));
    assert.equal(identity.revision, build.build.revision); lastStage = 'booted';
    const { startProjectileThroughMenu } = await import('./lib/inkwave-projectile-menu-start.mjs');
    const { rangeMenuControlReady } = await import('./lib/inkwave-range-menu-entry.mjs');
    startup = { route: 'native-menu-start', events: [] };
    await startProjectileThroughMenu(page, {
      remainingMs, receipt: startup.events,
      waitForPhase: async (predicate, label) => {
        await page.waitForFunction(predicate, null, { timeout: remainingMs() });
        const control = {
          'native main menu readiness': { selector: '.iw-main [data-id="play"]', menu: 'main' },
          'native mode menu': { selector: '.iw-modesel [data-id="mode-turf"]', menu: 'mode' },
          'native setup menu': { selector: '.iw-setup [data-id="map-tidewater"]', menu: 'setup' },
        }[label];
        assert(control, 'Unknown native menu phase: ' + label);
        await page.waitForFunction(rangeMenuControlReady, control, { timeout: remainingMs() });
        lastStage = label;
      },
    });
    lastStage = 'trusted-start-clicked';
    await page.waitForFunction(() => RG.mode === 'match' && RG.game.match === RG.match && RG.match?.state === 'playing' && !RG.match.attract && RG.match.local?.isLocal && RG.match.controller && RG.game.hud?._visible && !document.querySelector('.iw-lineup'), null, { timeout: remainingMs() });
    startup.gestures = await page.evaluate(() => __contextStartupGestures);
    startup.admission = await page.evaluate(() => ({ mode: RG.mode, state: RG.match.state, attract: !!RG.match.attract,
      local: !!RG.match.local?.isLocal, sameMatch: RG.game.match === RG.match, audioState: RG.audio?.ctx?.state,
      recordedShooterFire: RG.audio?._weaponBank?.authorized?.byEvent?.has('shooter:fire') === true }));
    validateContextStartupReceipt(startup); lastStage = 'playing';
    const proof = await page.evaluate(nativeContextRecoveryProof); validateContextRecoveryReceipt(proof);
    assert.equal(await page.locator('.iw-webgl-recovery').isVisible(), true);
    assert.deepEqual(errors, []); assert.deepEqual(requests, []); assert.deepEqual(httpFailures, []); assert.deepEqual(events, []);
    for (const file of required) assert(served.has(file) || served.has('_versions/' + build.build.revision + '/' + file), 'Required emitted module was not served: ' + file);
    result = { ok: true, browser: browser.version(), identity, startup, proof }; lastStage = 'accepted';
  } catch (error) {
    primary = error;
    let partial = null, diagnosticError = null;
    if (page && !page.isClosed() && !events.includes('crash')) try { partial = await page.evaluate(() => ({ proof: globalThis.__contextRecoveryReceipt || null, startupGestures: globalThis.__contextStartupGestures || [] })); } catch (e) { diagnosticError = e.message; }
    result = { ok: false, error: error.stack || String(error), partial, diagnosticError };
  } finally {
    result = { ...result, startup, lastStage, harnessBlobs: Object.fromEntries(sourceInputs.slice(-3).map(file => [file, tree.get(file)])), build: { sourceSha, verifiedSourceInputs: sourceInputs.length, revision: build.build.revision, inputHash: build.inputHash, contentHash: build.contentHash }, moduleHashes, errors, requests, httpFailures, consoleMessages, events: [...events], served: [...served].sort() };
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
    if (context) try { await context.tracing.stop({ path: path.join(out, 'trace.zip') }); } catch (error) { if (!primary) primary = error; }
    if (browser) try { await browser.close(); } catch (error) { if (!primary) primary = error; }
    await new Promise(resolve => server.close(resolve));
    if (primary && result.ok) { result.ok = false; result.cleanupError = primary.stack || String(primary); }
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
  }
  if (primary) throw primary;
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv[2], process.argv[3]).catch(error => { console.error(error); process.exitCode = 1; });
