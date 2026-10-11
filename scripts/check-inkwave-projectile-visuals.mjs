#!/usr/bin/env node
// Deterministic visual/performance capture from the full, normally booted game.
// Projectiles are born through the production Projectiles methods, advance in
// the live stage Physics/FX/Paint systems, and render through the game renderer.
// The captures are intentionally browser evidence, not the isolated geometry
// fixtures used by the numeric weapon tests.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const option = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const site = path.resolve(option('--site', path.join(ROOT, '../baseline-site')));
const evidence = path.resolve(option('--evidence-dir', path.join(ROOT, '../projectile-evidence/before')));
const profile = path.resolve(option('--profile-dir', path.join(ROOT, '../projectile-evidence/chromium-profile')));
const mode = option('--mode', 'baseline');
const durationMs = Number(option('--fire-ms', '6000'));
const quality = option('--quality', 'high');
if (!['low', 'medium', 'high'].includes(quality)) throw new Error('--quality must be low, medium, or high');
if (!fs.existsSync(path.join(site, 'index.html'))) throw new Error('Built site missing index.html: ' + site);
if (!Number.isFinite(durationMs) || durationMs < 1000 || durationMs > 30000) throw new Error('--fire-ms must be between 1000 and 30000');
fs.mkdirSync(evidence, { recursive: true });
fs.mkdirSync(profile, { recursive: true });

const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json'), 'utf8'));
if (hash(JSON.stringify(manifest.artifacts)) !== manifest.contentHash) throw new Error('Build artifact manifest identity mismatch');
for (const [file, expected] of Object.entries(manifest.artifacts)) {
  const built = path.join(site, file);
  if (!fs.existsSync(built) || hash(fs.readFileSync(built)) !== expected) throw new Error('Built artifact checksum mismatch: ' + file);
}
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream',
};
const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = path.resolve(site, rel);
    if (file !== site && !file.startsWith(site + path.sep)) throw new Error('Path outside build');
    if (!fs.statSync(file).isFile()) throw new Error('Not a file');
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = `http://127.0.0.1:${server.address().port}/`;
const { chromium } = createRequire(import.meta.url)('playwright');
const browserArgs = ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-features=LocalNetworkAccessChecks'];
const persistentContext = await chromium.launchPersistentContext(profile, {
  headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
  args: browserArgs,
  viewport: { width: 1280, height: 720 },
  serviceWorkers: 'block',
});
const browser = persistentContext.browser();
const report = {
  schema: 1,
  mode,
  site,
  build: { revision: manifest.build?.revision, contentHash: manifest.contentHash, inputHash: manifest.inputHash },
  provenance: {
    capture: 'Normal INKWAVE bootstrap/autostart into Tidewater full match; production Projectiles fire methods; live stage Physics, Paint and FX update; native Three/WebGL renderer screenshots.',
    stage: 'Tidewater, easy, turf, fixed 180 s match; local player; deterministic Math.random stream reset for each projectile scenario.',
    phaseFrames: { F0: 0, F5: 5, F10: 10, F15: 15, fall: 36 },
    perspectives: ['shoulder', 'front', 'side'],
    browser: null,
    quality,
    nativeAndroid: 'not available in this environment; mobile run is Chromium device emulation only',
  },
  screenshots: [],
  visualScenarios: [],
  performance: [],
  browserDiagnostics: [],
  comparisonStatus: 'not-run',
  comparisonNote: 'This invocation captures one build only; an before/after comparison requires both baseline and candidate runs.',
  errors: [],
};
const mimeErrors = [];
browser.on('disconnected', () => report.browserDiagnostics.push({ event: 'browser-disconnected', at: new Date().toISOString() }));

async function openGameContext({ mobile = false } = {}) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 720 },
    deviceScaleFactor: mobile ? 3 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('crash', () => report.browserDiagnostics.push({ event: 'page-crash', mobile, at: new Date().toISOString() }));
  page.on('pageerror', e => mimeErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') mimeErrors.push(m.text().slice(0, 1000)); });
  page.on('requestfailed', r => mimeErrors.push(`request failed ${r.url()}: ${r.failure()?.errorText || 'unknown'}`));
  await page.addInitScript(setting => {
    localStorage.setItem('inkwave.settings', JSON.stringify({ quality: setting, shadows: setting !== 'low', bloom: setting !== 'low', minimap: false, cameraShake: 0 }));
  }, quality);
  await page.goto(address + '?map=tidewater&autostart=180&skipTitle', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__inkwave?.match?.state === 'playing' && window.__G?.projectiles && window.__G?.renderer, null, { timeout: 180000 });
  await page.waitForFunction(() => !document.querySelector('.iw-lineup') && !!window.__inkwave?.hud?._visible, null, { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => {
    const g = window.__inkwave, G = window.__G;
    g.debug.freeze(); g.debug.freezeBots();
    g._skipRender = true;
    G.settings.cameraShake = 0;
    g.rig.setMap(false);
    // Stabilize the local model in the genuine match before any capture.
    const a = g.match.local;
    a.form = 'kid'; a.submerged = false; a.alive = true; a.vel.set(0, 0, 0);
    a.character.setVisible(true);
    a.character.root.position.copy(a.pos); a.character.root.rotation.y = 0;
    a.character.root.updateMatrixWorld(true);
    G.scene.updateMatrixWorld(true);
    g._skipRender = false;
  });
  const version = await page.evaluate(() => {
    const gl = __G.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { chromium: navigator.userAgent, webgl: gl.getParameter(gl.VERSION), webglRenderer: gl.getParameter(gl.RENDERER),
      unmaskedRenderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null, viewport: [innerWidth, innerHeight], dpr: devicePixelRatio };
  });
  if (!report.provenance.browser) report.provenance.browser = version;
  return { context, page };
}

const PERSPECTIVES = {
  shoulder: (p, aim) => ({ pos: [p[0] + 0.95, p[1] + 2.0, p[2] - 3.3], target: [p[0], p[1] + 1.2, p[2] + 8.0] }),
  front: (p, aim) => ({ pos: [p[0] + 0.15, p[1] + 2.0, p[2] + 7.2], target: [p[0], p[1] + 1.15, p[2] + 2.3] }),
  side: (p, aim) => ({ pos: [p[0] - 5.5, p[1] + 2.4, p[2] + 5.4], target: [p[0], p[1] + 1.3, p[2] + 4.6] }),
};

async function setCamera(page, perspective) {
  return page.evaluate(name => {
    const G = window.__G, a = G.match.local, cam = G.camera;
    const p = a.pos.toArray();
    const aim = [a.aimDir.x, a.aimDir.y, a.aimDir.z];
    const pose = {
      shoulder: { pos: [p[0] + 0.95, p[1] + 2.0, p[2] - 3.3], target: [p[0], p[1] + 1.2, p[2] + 8.0] },
      front: { pos: [p[0] + 0.15, p[1] + 2.0, p[2] + 7.2], target: [p[0], p[1] + 1.15, p[2] + 2.3] },
      side: { pos: [p[0] - 5.5, p[1] + 2.4, p[2] + 5.4], target: [p[0], p[1] + 1.3, p[2] + 4.6] },
    }[name];
    cam.aspect = innerWidth / innerHeight;
    cam.position.set(...pose.pos); cam.lookAt(...pose.target); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    G.scene.updateMatrixWorld(true);
    return { perspective: name, pose, actor: p, aim };
  }, perspective);
}

async function renderAndCapture(page, scenario, phase, perspective, seed) {
  const camera = await setCamera(page, perspective);
  const runtime = await page.evaluate(() => {
    const G = window.__G;
    G.paint.flush(1 / 60);
    const hasVisualSync = typeof G.projectiles.syncVisuals === 'function';
    if (hasVisualSync) G.projectiles.syncVisuals(1);
    const visuals = G.projectiles.projectileVisuals;
    const visualOutput = visuals ? {
      bodies: visuals.bodies ?? null,
      vertexCount: visuals.stats?.vertexCount ?? null,
      drawCalls: visuals.stats?.drawCalls ?? null,
      meshVisible: visuals.mesh?.visible ?? null,
      linkedRollerPairs: visuals.stats?.linkedRollerPairs ?? null,
    } : null;
    const eligibleVisualProjectiles = visuals ? G.projectiles.list.filter(p => p.delay <= 0 && !p._s3SloshBirthPending && p._iwVisualKind && p._iwVisualKind !== 'legacy').length : null;
    const activeVisualProjectiles = visuals ? G.projectiles.list.filter(p => p.delay <= 0 && !p._s3SloshBirthPending && visuals.handles(p)).length : null;
    if (hasVisualSync && eligibleVisualProjectiles > 0 && visuals &&
        (activeVisualProjectiles !== eligibleVisualProjectiles || !(visualOutput.vertexCount > 0 && visualOutput.meshVisible))) {
      throw new Error('Source-aware projectile renderer synced but produced no visible candidate body');
    }
    G.game.R.render();
    const gl = G.renderer.getContext();
    const read = G.projectiles.list.map(p => ({
      type: p.type, age: p.age, delay: p.delay || 0, pos: p.pos.toArray(), vel: p.vel.toArray(),
      mode: p.fidelityMode || (p.s3Vertical ? 'vertical' : p.s3FlickUnit === undefined ? null : 'horizontal'),
      seed: p.seed, unit: p.fidelitySloshUnitIndex ?? p.fidelityRollerUnitIndex ?? null,
    }));
    const projectileScreen = G.projectiles.list.map(p => {
      const point = p.pos.clone().project(G.camera);
      return { x: (point.x + 1) * innerWidth / 2, y: (1 - point.y) * innerHeight / 2, z: point.z };
    }).filter(p => Number.isFinite(p.x + p.y + p.z) && p.z >= -1 && p.z <= 1 && p.x >= 0 && p.x <= innerWidth && p.y >= 0 && p.y <= innerHeight);
    let projectileCrop = null;
    if (projectileScreen.length) {
      const pad = 112;
      const x0 = Math.max(0, Math.min(...projectileScreen.map(p => p.x)) - pad);
      const y0 = Math.max(0, Math.min(...projectileScreen.map(p => p.y)) - pad);
      const x1 = Math.min(innerWidth, Math.max(...projectileScreen.map(p => p.x)) + pad);
      const y1 = Math.min(innerHeight, Math.max(...projectileScreen.map(p => p.y)) + pad);
      if (x1 > x0 && y1 > y0) projectileCrop = { x: Math.floor(x0), y: Math.floor(y0), width: Math.ceil(x1 - x0), height: Math.ceil(y1 - y0) };
    }
    return {
      projectiles: read,
      projectileScreen,
      projectileCrop,
      liveProjectileCount: G.projectiles.list.length,
      visualSyncCalled: hasVisualSync,
      eligibleVisualProjectiles,
      activeVisualProjectiles,
      visualOutput,
      paint: { quads: G.paint.quads, coverage: G.paint.coverage?.() ?? null },
      fx: G.fx.stats?.() ?? null,
      render: {
        calls: G.renderer.info.render.calls,
        triangles: G.renderer.info.render.triangles,
        geometries: G.renderer.info.memory.geometries,
        textures: G.renderer.info.memory.textures,
        programs: G.renderer.info.programs?.length ?? null,
        glError: gl.getError(),
      },
      drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
    };
  });
  const name = `${scenario}__${phase}__${perspective}.png`;
  const target = path.join(evidence, name);
  await page.screenshot({ path: target, animations: 'disabled', timeout: 90000 });
  let cropFile = null, cropSha256 = null;
  if (runtime.projectileCrop) {
    cropFile = name.replace(/\.png$/, '__projectile-crop.png');
    const cropTarget = path.join(evidence, cropFile);
    await page.screenshot({ path: cropTarget, clip: runtime.projectileCrop, animations: 'disabled', timeout: 90000 });
    cropSha256 = hash(fs.readFileSync(cropTarget));
  }
  const receipt = {
    file: name, cropFile, cropSha256, scenario, phase, frame: phase === 'F0' ? 0 : phase === 'F5' ? 5 : phase === 'F10' ? 10 : phase === 'F15' ? 15 : null,
    perspective, seed, camera, runtime, sha256: hash(fs.readFileSync(target)),
  };
  report.screenshots.push(receipt);
  return receipt;
}

const visualSetup = ({ name, seed, impact = null }) => {
  const G = window.__G, g = window.__inkwave, a = g.match.local;
  let state = seed >>> 0;
  const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
  Math.random = random;
  G.time = 0; g.time = 0; g.rig.time = 0;
  G.projectiles.clear(); G.fx.clear(); G.paint.clear();
  if (g.screenfx?.clear) g.screenfx.clear();
  const weapon = name === 'shooter' || name.startsWith('wall-') ? 'shooter' : name.startsWith('roller') ? 'roller' : 'slosher';
  a.setWeapon(weapon);
  a.form = 'kid'; a.submerged = false; a.alive = true; a.hp = 100; a.ink = 100; a.vel.set(0, 0, 0);
  a.grounded = true; a.climbing = false; a.specialActive = null; a.superJumpState = null;
  a.yaw = 0; a.aimYaw = 0; a.aimPitch = 0;
  a.aimDir.set(0, 0, 1); a.aimPoint.copy(a.pos).add(new (G.camera.position.constructor)(0, 1.05, 24));
  a.character.setVisible(true); a.character.root.position.copy(a.pos); a.character.root.rotation.y = 0; a.character.root.updateMatrixWorld(true);
  G.scene.updateMatrixWorld(true);
  const origin = a.pos.clone().add(new (G.camera.position.constructor)(0, 1.25, 0));
  let wall = null;
  if (impact === 'wall') {
    const dirs = Array.from({ length: 32 }, (_, i) => {
      const ang = (i / 32) * Math.PI * 2;
      return new (G.camera.position.constructor)(Math.sin(ang), 0, Math.cos(ang));
    });
    const hit = { hit: false, point: new (G.camera.position.constructor)(), normal: new (G.camera.position.constructor)(), dist: 0, block: -1, face: -1, u: 0, v: 0 };
    for (const dir of dirs) {
      const probe = G.physics.raycast(origin, dir, 38, hit, true);
      if (probe.hit && probe.dist >= 2.2 && probe.dist < 18 && probe.normal.y < 0.45 && (!wall || probe.dist < wall.dist)) {
        wall = { dist: probe.dist, point: probe.point.toArray(), normal: probe.normal.toArray(), block: probe.block, face: probe.face, dir: dir.toArray() };
      }
    }
    if (wall) {
      const d = new (G.camera.position.constructor)(...wall.dir);
      a.aimYaw = Math.atan2(d.x, d.z); a.yaw = a.aimYaw;
      a.aimPitch = 0; a.aimDir.copy(d); a.aimPoint.set(...wall.point);
      a.character.root.rotation.y = a.yaw; a.character.root.updateMatrixWorld(true);
    }
  }
  return { weapon, actor: a.pos.toArray(), wall, impact, seed };
};

async function runVisuals(page) {
  for (const scenario of [
    { name: 'shooter', seed: 0x1a2b3c4d, method: 'shooter', checkpoints: [0, 5, 10, 15, 36] },
    { name: 'roller-horizontal', seed: 0x576597, method: 'roller-horizontal', checkpoints: [0, 5, 10, 15, 36] },
    { name: 'roller-vertical', seed: 0x576598, method: 'roller-vertical', checkpoints: [0, 5, 10, 15, 36] },
    { name: 'slosher9', seed: 0x1a2b3c4e, method: 'slosher9', checkpoints: [0, 5, 10, 15, 36] },
  ]) {
    const setup = await page.evaluate(visualSetup, { name: scenario.name, seed: scenario.seed });
    const born = await page.evaluate(({ method }) => {
      const G = window.__G, a = G.match.local;
      if (method === 'shooter') G.projectiles.fireShooter(a, a.weapon, 0);
      else if (method === 'roller-horizontal') { a.weaponRunner.s3FlickVertical = false; G.projectiles.fireFlick(a, a.weapon); }
      else if (method === 'roller-vertical') { a.weaponRunner.s3FlickVertical = true; G.projectiles.fireFlick(a, a.weapon); }
      else G.projectiles.fireSlosh(a, a.weapon);
      G.projectiles._draw();
      return G.projectiles.list.map(p => ({ type: p.type, age: p.age, delay: p.delay || 0, pos: p.pos.toArray(), vel: p.vel.toArray(), seed: p.seed,
        mode: p.fidelityMode || (p.s3Vertical ? 'vertical' : p.s3FlickUnit === undefined ? null : 'horizontal'),
        sloshUnit: p.fidelitySloshIndex ?? p.fidelitySloshPacketIndex ?? null, rollerUnit: p.fidelityRollerUnitIndex ?? null }));
    }, { method: scenario.method });
    if (!born.length) throw new Error(`${scenario.name}: production fire method created no projectile`);
    if (scenario.name === 'slosher9' && born.length !== 9) throw new Error(`Slosher source volley expected 9 units, received ${born.length}`);
    const record = { name: scenario.name, seed: scenario.seed, setup, births: born, captures: [], impacts: [] };
    let frame = 0;
    for (const targetFrame of scenario.checkpoints) {
      while (frame < targetFrame) {
        const update = await page.evaluate(() => {
          const G = window.__G, g = window.__inkwave, dt = 1 / 60;
          G.time += dt; g.time += dt;
          const before = G.projectiles.list.map(p => p.seed);
          G.projectiles.update(dt); G.fx.update(dt, G.camera); g.fxHooks?.update?.(dt); G.paint.flush(dt);
          const after = new Set(G.projectiles.list.map(p => p.seed));
          return { beforeCount: before.length, afterCount: G.projectiles.list.length, retired: before.filter(seed => !after.has(seed)).length,
            live: G.projectiles.list.map(p => ({ seed: p.seed, age: p.age, pos: p.pos.toArray(), type: p.type, delay: p.delay || 0 })) };
        });
        frame++;
        if (update.retired) record.impacts.push({ frame, retired: update.retired, liveCount: update.afterCount });
      }
      const phase = targetFrame === 0 ? 'F0' : targetFrame === 5 ? 'F5' : targetFrame === 10 ? 'F10' : targetFrame === 15 ? 'F15' : 'fall';
      const views = [0, 5, 15].includes(targetFrame) ? ['shoulder', 'front', 'side'] : ['shoulder'];
      for (const perspective of views) record.captures.push(await renderAndCapture(page, scenario.name, phase, perspective, scenario.seed));
    }
    record.endState = await page.evaluate(() => ({ projectiles: __G.projectiles.list.length, paintQuads: __G.paint.quads, fx: __G.fx.stats?.() ?? null }));
    report.visualScenarios.push(record);
  }

  // The wall and floor receipts use native collision queries and real stage
  // surfaces. A production shooter round is directed into a live map wall;
  // Slosher9 globs follow their sourced parabola into the live floor.
  for (const scenario of [
    { name: 'wall-shooter', seed: 0x7a11, method: 'shooter', impact: 'wall', maxFrames: 120 },
    { name: 'floor-slosher9', seed: 0x7a12, method: 'slosher9', impact: 'floor', maxFrames: 150 },
  ]) {
    const setup = await page.evaluate(visualSetup, { name: scenario.name, seed: scenario.seed, impact: scenario.impact });
    if (scenario.impact === 'wall' && !setup.wall) throw new Error('Could not find a native Tidewater wall for the wall impact receipt');
    const born = await page.evaluate(({ method }) => {
      const G = window.__G, a = G.match.local;
      if (method === 'shooter') G.projectiles.fireShooter(a, a.weapon, 0);
      else G.projectiles.fireSlosh(a, a.weapon);
      G.projectiles._draw(); return G.projectiles.list.length;
    }, { method: scenario.method });
    if (!born) throw new Error(scenario.name + ': projectile birth failed');
    await renderAndCapture(page, scenario.name, 'F0', 'shoulder', scenario.seed);
    let impactFrame = null, impactState = null;
    for (let frame = 1; frame <= scenario.maxFrames; frame++) {
      const row = await page.evaluate(() => {
        const G = window.__G, g = window.__inkwave, dt = 1 / 60;
        G.time += dt; g.time += dt;
        const before = G.projectiles.list.map(p => ({ seed: p.seed, pos: p.pos.toArray() }));
        G.projectiles.update(dt); G.fx.update(dt, G.camera); g.fxHooks?.update?.(dt); G.paint.flush(dt);
        const after = new Set(G.projectiles.list.map(p => p.seed));
        return { before, afterCount: G.projectiles.list.length, retired: before.filter(p => !after.has(p.seed)), paintQuads: G.paint.quads,
          paintCoverage: G.paint.coverage?.() ?? null, fx: G.fx.stats?.() ?? null };
      });
      if (row.retired.length) { impactFrame = frame; impactState = row; }
      if (impactFrame != null && frame >= impactFrame + 8) break;
    }
    if (impactFrame == null) throw new Error(scenario.name + ': native projectile did not contact a surface within budget');
    const capture = await renderAndCapture(page, scenario.name, `${scenario.impact}-impact-F${impactFrame}`, scenario.impact === 'wall' ? 'side' : 'shoulder', scenario.seed);
    report.visualScenarios.push({ name: scenario.name, seed: scenario.seed, setup, births: born, impactFrame, impactState, capture,
      evidence: scenario.impact === 'wall' ? 'native raycast wall/block and collision retirement' : 'native floor collision and Slosher9 sourced fall' });
  }
}

function summary(values) {
  if (!values.length) return null;
  const a = [...values].sort((x, y) => x - y);
  const at = q => a[Math.min(a.length - 1, Math.floor((a.length - 1) * q))];
  const mean = a.reduce((s, n) => s + n, 0) / a.length;
  return { n: a.length, min: a[0], p50: at(.5), p95: at(.95), max: a.at(-1), mean };
}

async function runFiringPerformance({ mobile = false } = {}) {
  const { context, page } = await openGameContext({ mobile });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const before = await cdp.send('Performance.getMetrics');
  await page.evaluate(() => {
    const G = window.__G, g = window.__inkwave, P = G.projectiles, R = g.R;
    g.debug.freezeBots(); G.settings.cameraShake = 0;
    window.__inkwavePerf = { active: false, raf: [], frames: [], loopTimestamps: [], projectileMs: [], renderMs: [], calls: [], triangles: [],
      projectileUpdates: 0, nonemptyProjectileUpdates: 0, fireCalls: 0, maxProjectiles: 0, gpuQueries: [], timer: null };
    const perf = window.__inkwavePerf;
    const gl = G.renderer.getContext();
    const ext2 = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const ext1 = !ext2 && gl.getExtension('EXT_disjoint_timer_query');
    perf.timer = ext2 ? { kind: 'webgl2', ext: ext2 } : ext1 ? { kind: 'webgl1', ext: ext1 } : null;
    const raf = t => { if (!perf.active) return; perf.raf.push(t); requestAnimationFrame(raf); };
    window.__inkwavePerfStart = () => { perf.active = true; requestAnimationFrame(raf); };
    const oldFrame = g._frame;
    g._frame = function (dt) {
      if (!perf.active) return oldFrame.call(this, dt);
      const t = performance.now(); perf.loopTimestamps.push(t);
      try { return oldFrame.call(this, dt); } finally { perf.frames.push(performance.now() - t); }
    };
    const oldUpdate = P.update;
    P.update = function (dt) {
      if (!perf.active) return oldUpdate.call(this, dt);
      const t = performance.now(); perf.projectileUpdates++;
      try { return oldUpdate.call(this, dt); } finally {
        perf.projectileMs.push(performance.now() - t);
        if (this.list.length) perf.nonemptyProjectileUpdates++;
        perf.maxProjectiles = Math.max(perf.maxProjectiles, this.list.length);
      }
    };
    for (const method of ['fireShooter', 'fireFlick', 'fireSlosh']) {
      if (typeof P[method] !== 'function') continue;
      const oldFire = P[method];
      P[method] = function (...args) {
        if (perf.active) perf.fireCalls++;
        return oldFire.apply(this, args);
      };
    }
    const oldRender = R.render;
    R.render = function (...args) {
      const gl = G.renderer.getContext(), timer = perf.timer;
      let query = null, started = false;
      if (perf.active && timer) {
        try {
          query = timer.kind === 'webgl2' ? gl.createQuery() : timer.ext.createQueryEXT();
          if (timer.kind === 'webgl2') gl.beginQuery(timer.ext.TIME_ELAPSED_EXT, query);
          else timer.ext.beginQueryEXT(timer.ext.TIME_ELAPSED_EXT, query);
          started = true;
        } catch { query = null; }
      }
      const t = performance.now();
      try { return oldRender.apply(this, args); }
      finally {
        if (started) {
          try { if (timer.kind === 'webgl2') gl.endQuery(timer.ext.TIME_ELAPSED_EXT); else timer.ext.endQueryEXT(timer.ext.TIME_ELAPSED_EXT); perf.gpuQueries.push(query); } catch {}
        }
        if (perf.active) {
          perf.renderMs.push(performance.now() - t); perf.calls.push(G.renderer.info.render.calls); perf.triangles.push(G.renderer.info.render.triangles);
        }
      }
    };
  });
  const cdpBefore = await cdp.send('Performance.getMetrics');
  await page.evaluate(() => { __inkwave.debug.unfreeze(); window.__inkwavePerfStart(); __inkwave.debug.fire(true); });
  await page.waitForTimeout(durationMs);
  await page.evaluate(() => { __inkwave.debug.fire(false); __inkwavePerf.active = false; __inkwave.debug.freeze(); });
  const cdpAfter = await cdp.send('Performance.getMetrics');
  const measured = await page.evaluate(() => {
    const G = window.__G, perf = window.__inkwavePerf, gl = G.renderer.getContext(), timer = perf.timer;
    const frames = perf.raf.slice(1).map((t, i) => t - perf.raf[i]);
    const gpu = [];
    if (timer) for (const q of perf.gpuQueries) {
      try {
        const available = timer.kind === 'webgl2' ? gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) : timer.ext.getQueryObjectEXT(q, timer.ext.QUERY_RESULT_AVAILABLE_EXT);
        if (!available) continue;
        const ns = timer.kind === 'webgl2' ? gl.getQueryParameter(q, gl.QUERY_RESULT) : timer.ext.getQueryObjectEXT(q, timer.ext.QUERY_RESULT_EXT);
        gpu.push(ns / 1e6);
      } catch {}
    }
    const disjoint = timer ? !!gl.getParameter(timer.ext.GPU_DISJOINT_EXT) : null;
    return {
      rAF: frames,
      nativeLoopTimestamps: perf.loopTimestamps,
      frameCpuMs: perf.frames,
      projectileCpuMs: perf.projectileMs,
      renderCpuMs: perf.renderMs,
      renderCalls: perf.calls,
      triangles: perf.triangles,
      gpuRenderMs: gpu,
      gpuTimer: timer ? timer.kind : 'unavailable',
      gpuDisjoint: disjoint,
      maxProjectiles: perf.maxProjectiles,
      projectileUpdates: perf.projectileUpdates,
      nonemptyProjectileUpdates: perf.nonemptyProjectileUpdates,
      fireCalls: perf.fireCalls,
      renderer: { calls: G.renderer.info.render.calls, triangles: G.renderer.info.render.triangles,
        geometries: G.renderer.info.memory.geometries, textures: G.renderer.info.memory.textures, programs: G.renderer.info.programs?.length ?? null,
        drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], renderer: G.renderer.getContext().getParameter(gl.RENDERER) },
      game: { state: G.match.state, actors: G.match.actors.length, coverage: G.paint.coverage?.() ?? null,
        projectiles: G.projectiles.list.length, paused: G.match.paused },
      browser: { viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, mobile: G.mobile?.isMobile ?? matchMedia('(pointer:coarse)').matches },
    };
  });
  const metricMap = rows => Object.fromEntries(rows.metrics.map(x => [x.name, x.value]));
  const a = metricMap(cdpBefore), b = metricMap(cdpAfter), delta = {};
  for (const key of ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'JSHeapUsedSize', 'Nodes', 'Documents']) {
    if (Number.isFinite(a[key]) && Number.isFinite(b[key])) delta[key] = b[key] - a[key];
  }
  const rAF = summary(measured.rAF), cpu = summary(measured.frameCpuMs), proj = summary(measured.projectileCpuMs), render = summary(measured.renderCpuMs), gpu = summary(measured.gpuRenderMs);
  const loopIntervals = measured.nativeLoopTimestamps.slice(1).map((t, i) => t - measured.nativeLoopTimestamps[i]);
  const loopFrameMs = summary(loopIntervals);
  const fps = loopFrameMs?.p50 > 0 ? 1000 / loopFrameMs.p50 : null;
  if (!measured.nativeLoopTimestamps.length || !measured.frameCpuMs.length || !measured.renderCpuMs.length ||
      !measured.projectileUpdates || !measured.nonemptyProjectileUpdates || !measured.fireCalls || !measured.maxProjectiles || !rAF?.n || !fps) {
    throw new Error(`${mobile ? 'mobile' : 'desktop'} performance window did not measure live native match firing/rendering: ${JSON.stringify({
      nativeFrames: measured.nativeLoopTimestamps.length, frameSamples: measured.frameCpuMs.length, renderSamples: measured.renderCpuMs.length,
      projectileUpdates: measured.projectileUpdates, nonemptyProjectileUpdates: measured.nonemptyProjectileUpdates,
      fireCalls: measured.fireCalls, maxProjectiles: measured.maxProjectiles, rAF: rAF?.n ?? 0,
    })}`);
  }
  const record = {
    scenario: mobile ? 'mobile-emulated-long-fire' : 'desktop-long-fire', durationMs,
    browser: await page.evaluate(() => navigator.userAgent), fps, nativeLoopFrameMs: loopFrameMs, rAFms: rAF, frameCpuMs: cpu, projectileCpuMs: proj, renderCpuMs: render,
    gpuRenderMs: gpu, gpuTimer: measured.gpuTimer, gpuDisjoint: measured.gpuDisjoint,
    renderer: measured.renderer, maxProjectiles: measured.maxProjectiles, gameplay: measured.game,
    cdpDeltas: delta,
    notes: ['Long-firing window uses the normal live match loop and debug fire input.', 'GPU time is EXT_disjoint_timer_query when exposed; unavailable/disjoint is reported as such.', 'Chromium mobile emulation is not native Android.'],
  };
  await context.close();
  return record;
}

try {
  const visual = await openGameContext();
  try { await runVisuals(visual.page); } finally { await visual.context.close(); }
  report.performance.push(await runFiringPerformance({ mobile: false }));
  report.performance.push(await runFiringPerformance({ mobile: true }));
  report.errors.push(...mimeErrors);
  report.status = report.errors.length ? 'failed' : 'passed';
} catch (error) {
  report.status = 'failed'; report.error = error.stack || String(error); report.errors.push(...mimeErrors);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  const tracePath = path.join(evidence, 'chromium-browser-stderr.log');
  const browserLogBlock = report.error?.split('Browser logs:\n')[1]?.split(/\n\s+at (?:openGameContext|file:\/\/)/)[0];
  fs.writeFileSync(tracePath, browserLogBlock
    ? `Captured from Playwright browser diagnostics; it is the browser log block attached to the failed page operation.\n${browserLogBlock}\n`
    : 'No browser stderr block was reported for this invocation. See projectile-visuals-result.json for page errors and event diagnostics.\n');
  report.browserTrace = tracePath;
  const outfile = path.join(evidence, 'projectile-visuals-result.json');
  fs.writeFileSync(outfile, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({
    status: report.status, comparisonStatus: report.comparisonStatus, mode, build: report.build, screenshots: report.screenshots.length,
    visualScenarios: report.visualScenarios.map(s => ({ name: s.name, births: Array.isArray(s.births) ? s.births.length : s.births?.length, impactFrame: s.impactFrame ?? null })),
    performance: report.performance.map(p => ({ scenario: p.scenario, fps: p.fps, frameCpuMs: p.frameCpuMs, gpuRenderMs: p.gpuRenderMs, calls: p.renderer.calls, geometries: p.renderer.geometries, textures: p.renderer.textures })),
    error: report.error, errors: report.errors, output: outfile, browserTrace: tracePath,
  }));
}
if (report.status !== 'passed') process.exitCode = 1;
