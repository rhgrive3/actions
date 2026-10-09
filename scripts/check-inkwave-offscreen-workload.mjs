#!/usr/bin/env node
// Focused live-browser workload check for #845. Runs an ordinary offline Turf
// match, renders with the actual game renderer while the camera points away for
// 10 seconds, then returns the camera to one bot and checks its first draw hook.
// Timing is local headless-browser JS instrumentation, not device/FPS evidence.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : (process.argv[i + 1] || (() => { throw Error('Missing ' + name); })());
};
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const site = path.resolve(arg('--site'));
const evidence = path.resolve(arg('--evidence-dir'));
const profile = path.resolve(arg('--profile-dir'));
const playwrightModule = arg('--playwright-module', 'playwright');
const controlSeconds = Math.max(1, Number(arg('--control-seconds', '10')) || 10);
const budgetSeconds = Math.max(1, Number(arg('--budget-seconds', '10')) || 10);
const physical = (name) => fs.existsSync(name) ? fs.realpathSync(name) : path.join(physical(path.dirname(name)), path.basename(name));
const evidenceReal = physical(evidence), profileReal = physical(profile);
if (!evidenceReal.startsWith('/mnt/workspace/.dev-state/agent-work/evidence/')) throw Error('Evidence must stay under persistent agent-work/evidence');
for (const p of [evidenceReal, profileReal]) {
  if (['/tmp', '/var/tmp', '/dev/shm'].some(root => p === root || p.startsWith(root + '/'))) throw Error('Temporary storage is not allowed: ' + p);
  fs.mkdirSync(p, { recursive: true });
}
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json'), 'utf8'));
if (hash(JSON.stringify(manifest.artifacts)) !== manifest.contentHash) throw Error('Build manifest content hash mismatch');
for (const [file, digest] of Object.entries(manifest.artifacts)) {
  if (hash(fs.readFileSync(path.join(site, file))) !== digest) throw Error('Built artifact hash mismatch: ' + file);
}
const pw = await import(playwrightModule === 'playwright' ? 'playwright' : pathToFileURL(path.resolve(playwrightModule)).href);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(site, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(site + path.sep) || !fs.statSync(file).isFile()) throw Error('not a file');
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = 'http://127.0.0.1:' + server.address().port + '/';
let context, page;
const result = {
  schema: 1,
  issue: 845,
  status: 'running',
  buildContentHash: manifest.contentHash,
  browser: null,
  match: null,
  exposure: { cameraAwaySeconds: controlSeconds + budgetSeconds, phases: {} },
  reentry: null,
  errors: { page: [], request: [], console: [] },
  limits: ['headless Chromium timing is a local JS-side measurement', 'no FPS, mobile-device, power, or Switch parity claim'],
};
const writeResult = () => {
  const out = path.join(evidenceReal, 'offscreen-workload.json');
  const part = path.join(evidenceReal, 'offscreen-workload.json.part');
  fs.writeFileSync(part, JSON.stringify(result, null, 2) + '\n');
  fs.renameSync(part, out);
};

try {
  context = await pw.chromium.launchPersistentContext(profileReal, {
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  page = await context.newPage();
  page.on('pageerror', e => result.errors.page.push(e.message));
  page.on('requestfailed', r => result.errors.request.push({ url: r.url(), error: r.failure()?.errorText }));
  page.on('console', m => { if (m.type() === 'error') result.errors.console.push(m.text().slice(0, 1000)); });
  await page.addInitScript(() => localStorage.setItem('inkwave.settings', JSON.stringify({ quality: 'low', shadows: false, bloom: false, minimap: false })));
  await page.goto(address, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(async () => { globalThis.s3ProbeG = (await import(new URL('src/core/ctx.js', document.baseURI).href)).G; });
  await page.waitForFunction(() => (!!globalThis.s3ProbeG?.game?.menus && globalThis.s3ProbeG.s3?.installed && globalThis.s3ProbeG.mode !== 'boot') || !!document.getElementById('boot-error')?.textContent, null, { timeout: 180000 });
  if (await page.locator('#boot-error').textContent()) throw Error('Game boot error');

  result.browser = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    renderer: s3ProbeG.renderer?.info?.render ? 'three.js WebGLRenderer' : null,
    webgl: document.querySelector('canvas')?.getContext('webgl2') ? 'webgl2' : document.querySelector('canvas')?.getContext('webgl') ? 'webgl' : 'not detected',
  }));
  result.match = await page.evaluate(async () => {
    const g = globalThis.s3ProbeG;
    await g.game.startMatch({ mapId: 'tidewater', difficulty: 'easy', duration: 180, mode: 'turf' });
    const transition = { stateAfterStart: g.match?.state, method: 'native Match.setState for the benchmark setup' };
    // SwiftShader can render the 4.2-second intro much slower than wall time.
    // Move only the test setup state through Match's native transition API;
    // all measured actor updates, frustum submission and re-entry are live.
    g.match.setState('playing');
    transition.stateAfterStep = g.match?.state;
    return { state: g.match?.state, mode: g.match?.mode, actors: g.match?.actors?.length, map: g.game.mapDef?.id, transition };
  });
  if (result.match.state !== 'playing' || result.match.actors < 4) throw Error('Native match update did not reach live play');

  const setup = await page.evaluate(() => {
    const G = globalThis.s3ProbeG, game = G.game, rig = game.rig;
    const actors = G.match.actors.filter(a => !a.isLocal && a.isBot);
    if (actors.length < 3) throw Error('Expected offline bot actors; found ' + actors.length);
    const probe = { phase: 'idle', camera: 'visible', forceFresh: false, actors, target: null, stats: { control: {}, budget: {} }, currentGround: null, renderCameraUpdates: 0 };
    const ids = new Map(actors.map((a, i) => [a.character, `${i}:${a.name || 'bot'}`]));
    const blank = () => ({ update: { calls: 0, ms: 0 }, buildPose: { calls: 0, ms: 0 }, applyPose: { calls: 0, ms: 0 }, ground: { calls: 0, ms: 0, raycasts: 0 }, hair: { calls: 0, ms: 0 }, materials: { calls: 0, ms: 0 } });
    for (const a of actors) for (const phase of ['control', 'budget']) probe.stats[phase][ids.get(a.character)] = blank();
    const bucket = (ch, phase = probe.phase) => probe.stats[phase]?.[ids.get(ch)] || null;
    const instrument = (ch, key, slot) => {
      const fn = ch[key]; if (typeof fn !== 'function') return;
      ch[key] = function (...args) {
        const m = bucket(this)?.[slot];
        if (!m) return fn.apply(this, args);
        m.calls++;
        const start = performance.now();
        try { return fn.apply(this, args); } finally { m.ms += performance.now() - start; }
      };
    };
    const oldRaycast = G.physics.raycast;
    G.physics.raycast = function (...args) {
      const m = probe.currentGround && bucket(probe.currentGround)?.ground;
      if (m) m.raycasts++;
      return oldRaycast.apply(this, args);
    };
    for (const a of actors) {
      const ch = a.character;
      instrument(ch, 'update', 'update');
      instrument(ch, '_buildPose', 'buildPose');
      instrument(ch, '_applyPose', 'applyPose');
      instrument(ch, '_updateHair', 'hair');
      instrument(ch, '_updateMaterials', 'materials');
      const ground = ch._ground;
      ch._ground = function (...args) {
        const m = bucket(this)?.ground;
        if (!m) return ground.apply(this, args);
        m.calls++;
        const prior = probe.currentGround;
        probe.currentGround = this;
        const start = performance.now();
        try { return ground.apply(this, args); } finally { m.ms += performance.now() - start; probe.currentGround = prior; }
      };
    }
    const cam = rig.gameCam;
    const displayCam = game.R?.camera || G.camera;
    const rawRigUpdate = rig.update;
    rig.update = function (...args) {
      const value = rawRigUpdate.apply(this, args);
      if (probe.camera === 'away') {
        cam.position.set(0, 10000, 0);
        cam.lookAt(0, 10000, -100);
      } else if (probe.camera === 'target' && probe.target) {
        const p = probe.target.character.root.position;
        cam.position.set(p.x, p.y + 7, p.z);
        cam.lookAt(p.x, p.y + 0.9, p.z);
      }
      cam.updateMatrixWorld(true);
      for (const target of new Set([displayCam, G.camera])) {
        if (target && target !== cam) {
          target.position.copy(cam.position); target.quaternion.copy(cam.quaternion);
          target.updateMatrixWorld(true);
        }
      }
      return value;
    };
    const rawDisplayRender = game.R?.render;
    if (typeof rawDisplayRender === 'function') {
      game.R.render = function (...args) {
        if (probe.camera === 'target' && probe.target) {
          const p = probe.target.character.root.position, camera = this.camera || G.camera;
          camera.position.set(p.x, p.y + 7, p.z);
          camera.lookAt(p.x, p.y + 0.9, p.z);
          camera.updateMatrixWorld(true);
          if (G.camera && G.camera !== camera) {
            G.camera.position.copy(camera.position); G.camera.quaternion.copy(camera.quaternion); G.camera.updateMatrixWorld(true);
          }
          rig.gameCam.position.copy(camera.position); rig.gameCam.quaternion.copy(camera.quaternion); rig.gameCam.updateMatrixWorld(true);
          probe.renderCameraUpdates++;
        }
        return rawDisplayRender.apply(this, args);
      };
    }
    const keepFresh = () => {
      if (probe.forceFresh) {
        const frame = G.renderer.info.render.frame;
        for (const a of actors) a.character._camFrame = frame;
        requestAnimationFrame(keepFresh);
      }
    };
    probe.startKeepFresh = () => { probe.forceFresh = true; requestAnimationFrame(keepFresh); };
    probe.copyPhase = phase => structuredClone(probe.stats[phase]);
    probe.actorRows = () => actors.map(a => ({
      name: a.name, form: a.form, alive: a.alive, position: a.pos.toArray(), cameraFrame: a.character._camFrame,
      budgetTicks: a.character._oobBudgetTicks, skippedFootQueries: a.character._oobRaycastsSkipped,
      skippedDecorativePose: a.character._oobPoseDecorativeSkips, skippedHair: a.character._oobHairSkips,
      skippedMaterials: a.character._oobMaterialSkips, catchUps: a.character._oobCatchUps,
    }));
    probe.frame = () => G.renderer.info.render.frame;
    probe.scene = () => ({ mode: G.mode, state: G.match?.state, rendererFrame: G.renderer.info.render.frame, projectiles: G.projectiles?.list?.length || 0 });
    globalThis.__offscreen845 = probe;
    return { bots: actors.length, frames: G.renderer.info.render.frame, rows: probe.actorRows(), scene: probe.scene() };
  });
  result.match = { ...result.match, ...setup };

  await page.evaluate(() => {
    const p = globalThis.__offscreen845;
    p.camera = 'away'; p.phase = 'control'; p.startKeepFresh();
  });
  const controlStart = await page.evaluate(() => ({ frame: __offscreen845.frame(), rows: __offscreen845.actorRows(), scene: __offscreen845.scene() }));
  await page.waitForTimeout(controlSeconds * 1000);
  const controlEnd = await page.evaluate(() => {
    const p = __offscreen845; p.forceFresh = false;
    return { frame: p.frame(), rows: p.actorRows(), scene: p.scene(), stats: p.copyPhase('control') };
  });
  result.exposure.phases.control = { seconds: controlSeconds, start: controlStart, end: controlEnd };

  await page.evaluate(() => { __offscreen845.phase = 'budget'; });
  const budgetStart = await page.evaluate(() => ({ frame: __offscreen845.frame(), rows: __offscreen845.actorRows(), scene: __offscreen845.scene() }));
  await page.waitForTimeout(budgetSeconds * 1000);
  const budgetEnd = await page.evaluate(() => ({ frame: __offscreen845.frame(), rows: __offscreen845.actorRows(), scene: __offscreen845.scene(), stats: __offscreen845.copyPhase('budget') }));
  result.exposure.phases.budget = { seconds: budgetSeconds, start: budgetStart, end: budgetEnd };

  const reentryStart = await page.evaluate(() => {
    const p = __offscreen845;
    const actor = p.actors.find(a => a.alive && a.form === 'kid' && a.character.form === 'kid'
      && a.character.kidScale > 0.001 && a.character._oobWasBudgeted);
    if (!actor) throw Error('No live kid-form bot available for first-visible return test');
    // Hold simulation only across the first return frame so this selected bot
    // cannot enter squid form before its mesh render hook runs.
    globalThis.s3ProbeG.match.paused = true;
    p.target = actor; p.camera = 'target'; p.phase = 'reentry';
    return { name: actor.name, catchUps: actor.character._oobCatchUps, cameraFrame: actor.character._camFrame, rendererFrame: p.frame() };
  });
  try {
    await page.waitForFunction(start => {
      const p = globalThis.__offscreen845, actor = p.actors.find(a => a.name === start.name);
      return !!actor && actor.character._camFrame > start.cameraFrame;
    }, reentryStart, { timeout: 10000 });
  } catch (error) {
    result.reentry = { start: reentryStart, diagnostic: await page.evaluate(async start => {
      const p = __offscreen845, G = s3ProbeG, actor = p.actors.find(a => a.name === start.name), ch = actor.character;
      const { Vector3 } = await import('three');
      const displayCam = G.game?.R?.camera || G.camera;
      const look = ch.root.position.clone(); look.y += 0.9; look.project(displayCam);
      const forward = displayCam.getWorldDirection(new Vector3()).toArray();
      const meshes = Object.values(ch.lodSets || {}).flatMap(s => s?.list || []).map(m => ({
        visible: m.visible, frustumCulled: m.frustumCulled, position: m.getWorldPosition(new Vector3()).toArray(),
        chained: !!m.__oob845Chained, hasHook: typeof m.onBeforeRender === 'function',
      }));
      return { frame: p.frame(), target: actor.pos.toArray(), rootVisible: ch.root.visible, projectedAimPoint: look.toArray(),
        cameraPosition: displayCam.position.toArray(), cameraForward: forward, gameCamPosition: G.rig.gameCam.position.toArray(),
        probeCamera: p.camera, renderCameraUpdates: p.renderCameraUpdates, targetName: p.target?.name || null,
        budgeted: ch._oobWasBudgeted, cameraFrame: ch._camFrame, meshes };
    }, reentryStart), failure: String(error?.message || error) };
    throw error;
  }
  const reentryEnd = await page.evaluate(async start => {
    const p = __offscreen845, actor = p.actors.find(a => a.name === start.name), ch = actor.character;
    const { Vector3 } = await import('three');
    const displayCam = s3ProbeG.game.R?.camera || s3ProbeG.camera;
    const look = ch.root.position.clone(); look.y += 0.9; look.project(displayCam);
    return {
      name: actor.name, form: actor.form, visibleCameraFrame: p.frame(), recordedCameraFrame: ch._camFrame,
      catchUps: ch._oobCatchUps, newCatchUp: ch._oobCatchUps > start.catchUps,
      feetValid: ch.feetValid, stillBudgeted: ch._oobWasBudgeted,
      muzzle: ch.getMuzzle(new Vector3()).toArray(), position: actor.pos.toArray(),
      rootVisible: ch.root.visible, projectedAimPoint: look.toArray(), cameraPosition: displayCam.position.toArray(),
      probeCamera: p.camera, renderCameraUpdates: p.renderCameraUpdates,
      rendererFrame: p.frame(), scene: p.scene(),
    };
  }, reentryStart);
  result.reentry = { start: reentryStart, end: reentryEnd };
  result.pairedCpu = await page.evaluate(async loops => {
    const p = __offscreen845, G = s3ProbeG, exemplar = p.target;
    const sample = (label) => {
      const a = new exemplar.constructor({
        team: exemplar.team, name: '845-paired-cpu-control', weapon: 'shooter',
        isLocal: false, isBot: true, style: exemplar.character.style,
        CharacterClass: exemplar.character.constructor,
      });
      a.pos.copy(exemplar.pos); a.yaw = exemplar.yaw; a.aimYaw = exemplar.aimYaw; a.aimPitch = exemplar.aimPitch;
      a.vel.set(0, 0, 0); a.grounded = true; G.scene.add(a.character.root);
      return a;
    };
    const control = sample('control'), budget = sample('budget');
    const blank = () => ({ calls: 0, ms: 0 });
    const stats = {
      control: { update: blank(), buildPose: blank(), applyPose: blank(), ground: blank(), hair: blank(), materials: blank(), raycasts: 0 },
      budget: { update: blank(), buildPose: blank(), applyPose: blank(), ground: blank(), hair: blank(), materials: blank(), raycasts: 0 },
    };
    let active = null;
    const raycast = G.physics.raycast;
    G.physics.raycast = function (...args) {
      if (active) stats[active].raycasts++;
      return raycast.apply(this, args);
    };
    const instrument = (actor, label) => {
      const ch = actor.character;
      for (const key of ['update', '_buildPose', '_applyPose', '_ground', '_updateHair', '_updateMaterials']) {
        const slot = { update: 'update', _buildPose: 'buildPose', _applyPose: 'applyPose', _ground: 'ground',
          _updateHair: 'hair', _updateMaterials: 'materials' }[key];
        const native = ch[key];
        ch[key] = function (...args) {
          const metric = stats[label][slot], start = performance.now();
          metric.calls++;
          try { return native.apply(this, args); } finally { metric.ms += performance.now() - start; }
        };
      }
    };
    instrument(control, 'control'); instrument(budget, 'budget');
    const startFrame = G.renderer.info.render.frame;
    try {
      for (let i = 0; i < 30; i++) {
        const frame = startFrame + i + 1;
        G.renderer.info.render.frame = frame;
        control.character._camFrame = budget.character._camFrame = frame;
        control._finishFrame(1 / 60); budget._finishFrame(1 / 60);
      }
      for (let i = 0; i < loops; i++) {
        const frame = startFrame + 31 + i;
        G.renderer.info.render.frame = frame;
        control.character._camFrame = frame;
        budget.character._camFrame = frame - 31;
        active = 'control'; control._finishFrame(1 / 60);
        active = 'budget'; budget._finishFrame(1 / 60);
      }
      const avg = (x) => x.ms / Math.max(1, x.calls);
      return {
        loops,
        control: stats.control,
        budget: stats.budget,
        controlUpdateMsPerCall: avg(stats.control.update),
        budgetUpdateMsPerCall: avg(stats.budget.update),
        updateMsPerCallReduction: 1 - avg(stats.budget.update) / avg(stats.control.update),
        controlGroundRaycastsPerGroundCall: stats.control.raycasts / Math.max(1, stats.control.ground.calls),
        budgetGroundRaycastsPerGroundCall: stats.budget.raycasts / Math.max(1, stats.budget.ground.calls),
        budgetedTicks: budget.character._oobBudgetTicks,
        skippedGroundRays: budget.character._oobRaycastsSkipped,
        skippedDecorativePose: budget.character._oobPoseDecorativeSkips,
        skippedHair: budget.character._oobHairSkips,
        skippedMaterials: budget.character._oobMaterialSkips,
      };
    } finally {
      active = null; G.physics.raycast = raycast; G.renderer.info.render.frame = startFrame;
      G.scene.remove(control.character.root, budget.character.root);
      control.weaponRunner.reset(); budget.weaponRunner.reset();
      control.character.dispose(); budget.character.dispose();
    }
  }, 240);
  const frameStalls = budgetStart.rows.map((r, i) => ({ name: r.name, cameraFrameStart: r.cameraFrame, cameraFrameEnd: budgetEnd.rows[i]?.cameraFrame, advancedWhileAway: budgetEnd.rows[i]?.cameraFrame !== r.cameraFrame }));
  const budgetRows = budgetEnd.rows;
  if (!frameStalls.some(row => !row.advancedWhileAway)) throw Error('Renderer camera-away did not leave any bot actually unsubmitted');
  const total = phase => {
    const rows = Object.values(phase.stats);
    const out = {};
    for (const name of ['update', 'buildPose', 'applyPose', 'ground', 'hair', 'materials']) {
      out[name] = { calls: rows.reduce((n, r) => n + r[name].calls, 0), ms: rows.reduce((n, r) => n + r[name].ms, 0) };
      if (name === 'ground') out[name].raycasts = rows.reduce((n, r) => n + r[name].raycasts, 0);
    }
    return out;
  };
  const baseline = total(controlEnd), budgeted = total(budgetEnd);
  result.measurement = {
    control: baseline, budget: budgeted,
    controlUpdateMsPerCall: baseline.update.ms / Math.max(1, baseline.update.calls),
    budgetUpdateMsPerCall: budgeted.update.ms / Math.max(1, budgeted.update.calls),
    updateMsPerCallReduction: 1 - budgeted.update.ms / Math.max(1, budgeted.update.calls) / (baseline.update.ms / Math.max(1, baseline.update.calls)),
    controlMaterialMsPerCall: baseline.materials.ms / Math.max(1, baseline.materials.calls),
    budgetMaterialMsPerCall: budgeted.materials.ms / Math.max(1, budgeted.materials.calls),
    materialMsPerCallReduction: 1 - budgeted.materials.ms / Math.max(1, budgeted.materials.calls) / (baseline.materials.ms / Math.max(1, baseline.materials.calls)),
    controlGroundRaycastsPerGroundCall: baseline.ground.raycasts / Math.max(1, baseline.ground.calls),
    budgetGroundRaycastsPerGroundCall: budgeted.ground.raycasts / Math.max(1, budgeted.ground.calls),
    cameraFrames: frameStalls,
    eligibleBudgetedBots: budgetRows.filter(r => r.budgetTicks > 0).length,
    summedBudgetTicks: budgetRows.reduce((n, r) => n + r.budgetTicks, 0),
    skippedFootQueries: budgetRows.reduce((n, r) => n + r.skippedFootQueries, 0),
    skippedDecorativePose: budgetRows.reduce((n, r) => n + r.skippedDecorativePose, 0),
    skippedHair: budgetRows.reduce((n, r) => n + r.skippedHair, 0),
    skippedMaterials: budgetRows.reduce((n, r) => n + r.skippedMaterials, 0),
  };
  if (!reentryEnd.newCatchUp || reentryEnd.stillBudgeted || !Number.isFinite(reentryEnd.recordedCameraFrame)) throw Error('First-visible render did not consume the pending pose catch-up');
  if (result.measurement.eligibleBudgetedBots < 1 || result.measurement.skippedFootQueries < 1 || result.measurement.skippedHair < 1 || result.measurement.skippedDecorativePose < 1 || result.measurement.skippedMaterials < 1) throw Error('Camera-away exposure did not exercise the #845 budget');
  result.status = 'passed';
  writeResult();
  console.log(JSON.stringify({ status: result.status, result: path.join(evidenceReal, 'offscreen-workload.json'), measurement: result.measurement, reentry: result.reentry.end }, null, 2));
} catch (error) {
  result.status = 'failed'; result.failure = String(error?.stack || error);
  writeResult();
  throw error;
} finally {
  await context?.close();
  await new Promise(resolve => server.close(resolve));
}
