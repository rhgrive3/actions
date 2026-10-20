#!/usr/bin/env node
// Deterministic visual/performance capture from the full, normally booted game.
// Projectiles are born through the production Projectiles methods, advance in
// the live stage Physics/FX/Paint systems, and render through the game renderer.
// The captures are intentionally browser evidence, not the isolated geometry
// fixtures used by the numeric weapon tests.
import fs from 'node:fs';
import { captureSourceIdentity } from './lib/inkwave-capture-source-identity.mjs';
import { observeStreamedMusic } from './lib/inkwave-streamed-music-diagnostics.mjs';
import {installAudioTimingObserver} from './lib/inkwave-audio-timing-observer.mjs';
import {audioDiagnosticURL,audioBuildManifestReceipt,sha256 as audioReceiptSha256} from './lib/inkwave-audio-readiness-diagnostics.mjs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { projectileDrawRadius, projectileVisualWidth } from '../patches/splatoon3/runtime/projectile-visuals.mjs';
import { startProjectileThroughMenu } from './lib/inkwave-projectile-menu-start.mjs';
import { atomicIntroFunction, requireAtomicIntro } from './lib/inkwave-projectile-atomic-intro.mjs';
import { completeNativeTurfIntro } from './lib/inkwave-projectile-ci-intro.mjs';
import { installProjectileCaptureRoster } from './lib/inkwave-projectile-ci-roster.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceIdentity = captureSourceIdentity({ cwd: ROOT });
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
const capture = option('--capture', 'all');
const device = option('--device', 'all');
const BOOT_SEED = 0x49574b33;
const MIN_PERFORMANCE_FRAMES = 12;
const PERFORMANCE_TIMEOUT_MS = 120000;
// Full native renderer / actor shader warmup under CI SwiftShader can exceed
// one minute before the offline Turf controller is constructed. This limit
// still requires genuine production bootstrap and the real playing state.
const NATIVE_BOOT_TIMEOUT_MS = 180000;
if (!['low', 'medium', 'high'].includes(quality)) throw new Error('--quality must be low, medium, or high');
if (!['all', 'visuals', 'performance'].includes(capture)) throw new Error('--capture must be all, visuals, or performance');
if (!['all', 'desktop', 'mobile'].includes(device)) throw new Error('--device must be all, desktop, or mobile');
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
const { serveProjectileCaptureFile } = await import('./lib/inkwave-projectile-http-file.mjs');
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
    serveProjectileCaptureFile(req, res, file, mime);
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
    harnessSha256: hash(fs.readFileSync(fileURLToPath(import.meta.url))),
    capture: 'Normal INKWAVE bootstrap then real PLAY/TURF/Tidewater/START menu gestures into full match; production Projectiles fire methods; live stage Physics, Paint and FX update; native Three/WebGL renderer screenshots.',
    stage: 'Tidewater, normal difficulty, turf, fixed 180 s match; local player; deterministic Math.random stream reset for each projectile scenario.',
    phaseFrames: { F0: 0, F5: 5, F10: 10, F15: 15, fall: 36 },
    perspectives: ['shoulder', 'front', 'side'],
    perspectiveModes: { shoulder: 'fixed-gameplay-shoulder', front: 'projectile-follow-physics-bounded-offset', side: 'projectile-follow-physics-bounded-offset' },
    bootSeed: BOOT_SEED,
    actorInkColor: '#ffd21a',
    retailReferenceMatch: 'not performed',
    browser: null,
    quality,
    captureSelection: capture,
    device,
    nativeAndroid: 'not available in this environment; mobile run is Chromium device emulation only',
  },
  screenshots: [],
  visualScenarios: [],
  performance: [],
  performanceFailures: [],
  performanceWarmups: [],
  browserDiagnostics: [],
  comparisonStatus: 'not-run',
  comparisonNote: 'This invocation captures one build only; a before/after comparison requires both baseline and candidate runs.',
  errors: [],
};
const mimeErrors = [];
browser.on('disconnected', () => report.browserDiagnostics.push({ event: 'browser-disconnected', at: new Date().toISOString() }));

async function openGameContext({ mobile = false } = {}) {
  const context = await browser.newContext({
    // Offline touch gameplay intentionally pauses in portrait. Measure the
    // supported landscape orientation without bypassing its production guard.
    viewport: mobile ? { width: 844, height: 390 } : { width: 1280, height: 720 },
    deviceScaleFactor: mobile ? 3 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const streamedMusicReceipt = { mobile };
  (report.streamedMusicDiagnostics ||= []).push(streamedMusicReceipt);
  const streamedMusic = await observeStreamedMusic({ context, page,
    assetURL: new URL(`_versions/${manifest.build.revision}/assets/audio/Jet_Arrow.mp3`, address).href,
    receipt: streamedMusicReceipt });

  try {
  const audioNetwork = [], audioSnapshots = [];
  const audioReceipt = { ...sourceIdentity,
    build: audioBuildManifestReceipt(site), network: audioNetwork, snapshots: audioSnapshots };
  report.audioReadiness ||= [];
  report.audioReadiness.push(audioReceipt);
  const snapshotAudio = async reason => {
    const state = await page.evaluate(() => {
      const a = window.__G?.audio, l = a?._realS3Loader, b = a?._weaponBank?.authorized;
      return { timings: window.__iwAudioTimings ?? null, audioContext: a?.ctx?.state ?? null, currentTime: a?.ctx?.currentTime ?? null,
        userActivation: { active: navigator.userActivation?.isActive ?? null, everActive: navigator.userActivation?.hasBeenActive ?? null },
        loader: l?.stats?.() ?? null, queuedKeys: l?.inFlight ? [...l.inFlight.keys()] : [],
        shooterDeclared: l?.declares?.('shooter','fire') ?? null,
        shooterResident: b?.byEvent?.has('shooter:fire') ?? null,
        authorized: b?.stats?.() ?? null,
        authorizedErrors: b?.errors?.slice(-6).map(e=>({id:e.id,error:String(e.error).slice(0,300)})) ?? [],
        bankDisposed: a?._weaponBank?.disposed ?? null };
    }).catch(error => ({ evaluationError: String(error.message).slice(0,300) }));
    audioSnapshots.push({ reason, observedAt: new Date().toISOString(), state });
  };
  page.on('response', response => {
    if (!response.url().includes('/runtime/audio/') || audioNetwork.length >= 96) return;
    const row = { url: audioDiagnosticURL(response.url()), status: response.status(),
      contentType: response.headers()['content-type'] || null, at: new Date().toISOString() };
    audioNetwork.push(row);
    if (response.url().split('?')[0].endsWith('/real-s3-installed.json'))
      response.body().then(bytes => { row.bytes=bytes.length; row.sha256=audioReceiptSha256(bytes); })
        .catch(error => { row.error=String(error.message).slice(0,300); });
  });
  page.on('requestfinished', request => {
    if (request.url().includes('/runtime/audio/') && audioNetwork.length < 96)
      audioNetwork.push({ url: audioDiagnosticURL(request.url()), event:'finished', timing:request.timing() });
  });
  page.on('requestfailed', request => {
    if (request.url().includes('/runtime/audio/') && audioNetwork.length < 96)
      audioNetwork.push({ url: audioDiagnosticURL(request.url()), failure:request.failure()?.errorText });
  });
  let recordedAudioFailureObserved = false;
  page.on('console', message => {
    if (!recordedAudioFailureObserved && message.type()==='error' && /MP3|録音|音源|音声出力/.test(message.text())) {
      recordedAudioFailureObserved = true;
      void snapshotAudio('recorded-audio-failure');
    }
  });

  page.on('crash', () => report.browserDiagnostics.push({ event: 'page-crash', mobile, at: new Date().toISOString() }));
  page.on('pageerror', e => mimeErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') mimeErrors.push(m.text().slice(0, 1000)); });
  page.on('requestfailed', r => mimeErrors.push(`request failed ${r.url()}: ${r.failure()?.errorText || 'unknown'}`));
  await page.addInitScript(installAudioTimingObserver);
  await page.addInitScript(({ setting, bootSeed }) => {
    localStorage.setItem('inkwave.settings', JSON.stringify({ quality: setting, shadows: setting !== 'low', bloom: setting !== 'low', minimap: false, cameraShake: 0, colorblind: true, difficulty: 'normal', matchLength: 180, lastStage: 'tidewater', lastMode: 'turf', stageTimes: { tidewater: 'day' } }));
    window.__iwBootSeed = bootSeed >>> 0;
    let state = bootSeed >>> 0;
    Math.random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
    window.__iwResetScenarioRandom = seed => {
      let randomState = seed >>> 0, draws = 0;
      const callers = [];
      const random = () => {
        randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5;
        draws++;
        if (callers.length < 12) {
          const stack = new Error('scenario Math.random').stack || '';
          callers.push({ draw: draws, stack: stack.split('\n').slice(2, 8).map(line => line.trim()) });
        }
        return (randomState >>> 0) / 4294967296;
      };
      const recorder = {
        seed: seed >>> 0,
        snapshot: () => ({ seed: seed >>> 0, draws, state: randomState >>> 0, callers: callers.map(entry => ({ draw: entry.draw, stack: [...entry.stack] })) }),
      };
      window.__iwScenarioRandomRecorder = recorder;
      Math.random = random;
      return recorder;
    };
  }, { setting: quality, bootSeed: BOOT_SEED });
  await page.goto(address + '?map=tidewater&difficulty=normal&skipTitle', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const phaseReceipt={mobile,events:[]};
  (report.provenance.nativePhaseTimings ||= []).push(phaseReceipt);
  try {
    // In SwiftShader an intro frame can take over a second to render. Finish
    // only the noninteractive 4.2s native Turf intro through Game._frame while
    // suppressing those cinematic renders. Never fast-forward live gameplay.
    // Playwright's browser-side waitForFunction timer can be starved by a
    // long native SwiftShader render even after the game has reached "playing".
    // Probe the exact same predicate from Node, with the same strict wall-clock
    // budget, without relying on a browser timer/rAF callback.
    // One original admission budget includes boot, menu navigation and START.
    phaseReceipt.startedAtMs=Date.now();
    const deadline = Date.now() + NATIVE_BOOT_TIMEOUT_MS;
    phaseReceipt.deadlineAtMs=deadline;
    const phaseMark=(phase,event)=>{const now=Date.now();phaseReceipt.events.push({phase,event,atMs:now,elapsedMs:now-phaseReceipt.startedAtMs,remainingMs:Math.max(0,deadline-now)});};
    const requireNativePhase = async (predicate, label) => {
      let lastFailure = null;
      while (Date.now() < deadline) {
        let timeoutId;
        try {
          const observed = await Promise.race([
            page.evaluate(predicate),
            new Promise((_, reject) => {
              timeoutId = setTimeout(() => reject(new Error('native phase evaluation budget exceeded')),
                Math.max(1, deadline - Date.now()));
            }),
          ]);
          if (observed && Date.now() <= deadline) return;
        } catch (error) {
          lastFailure = String(error);
          if (page.isClosed()) break;
        } finally { clearTimeout(timeoutId); }
        const remaining = deadline - Date.now();
        if (remaining > 0) await new Promise(resolve => setTimeout(resolve, Math.min(250, remaining)));
      }
      throw new Error(label + ' did not meet the full native match predicate within ' +
        NATIVE_BOOT_TIMEOUT_MS + 'ms' + (lastFailure ? ': ' + lastFailure : ''));
    };
    const menuReceipt={mobile,route:'native-menu-start',coldAutostart:'not exercised; prior failure retained separately',events:[]};
    (report.provenance.menuStarts ||= []).push(menuReceipt);
    phaseMark('menu','begin');
    await startProjectileThroughMenu(page,{waitForPhase:requireNativePhase,remainingMs:()=>deadline-Date.now(),receipt:menuReceipt.events});
    phaseMark('menu','end');
    await snapshotAudio('native-menu-start-clicked');
    const admissionReady = () => {
      const g = window.__inkwave, G = window.__G, m = g?.match;
      return !!(G?.mode === 'match' && m === G.match &&
        (m?.state === 'intro' || m?.state === 'playing') &&
        !m.attract && m.local?.isLocal && m.controller && g.debug &&
        G.projectiles && G.renderer);
    };
    const playingReady = () => {
      const g = window.__inkwave, G = window.__G, m = g?.match;
      return !!(G?.mode === 'match' && m === G.match && m?.state === 'playing' &&
        !m.attract && m.local?.isLocal && m.controller && G.projectiles && G.renderer);
    };
    // Admission and intro share one browser task: no redundant queued hop
    // after admission succeeds. Incomplete admission polls without frame steps.
    phaseMark('admission','begin');
    phaseMark('intro','begin');
    phaseMark('playing','begin');
    const atomicReceipt = await requireAtomicIntro(page,
      atomicIntroFunction(completeNativeTurfIntro,playingReady,admissionReady),deadline,{receipt:phaseReceipt.atomicIntro={}});
    phaseMark('admission','end');
    phaseMark('intro','end');
    phaseMark('playing','end');
    (report.provenance.introTransitions ||= []).push({mobile,...atomicReceipt.intro});
    (report.provenance.atomicPlayingReceipts ||= []).push({mobile,...atomicReceipt.readiness,playingReady:atomicReceipt.playingReady});
  } catch (error) {
    const failedAt=Date.now();phaseReceipt.events.push({phase:'failure',event:'caught',atMs:failedAt,elapsedMs:failedAt-phaseReceipt.startedAtMs,remainingMs:Math.max(0,phaseReceipt.deadlineAtMs-failedAt)});
    phaseReceipt.failureSnapshotRequestedAtMs=Date.now();
    try {
    const observed = await page.evaluate(() => {
      const g = window.__inkwave, G = window.__G, m = g?.match;
      return { observedAtMs:Date.now(),atomicIntro:window.__iwProjectileAtomicIntroReceipt??null,
        mode: G?.mode, state: m?.state, stateT: m?.stateT, attract: m?.attract,
        matchIdentity: m === G?.match, local: m?.local?.isLocal, controller: !!m?.controller, debug: !!g?.debug,
        projectiles: !!G?.projectiles,
        frozen: g?.frozen, paused: m?.paused, visibility: document.visibilityState,
        orientationBlocked: m?.controller?.orientationBlocked,
        bootMarks: g?.bootMarks?.slice(-14),
        bootMs: g?.bootMs, renderer: !!G?.renderer,
        actors: m?.actors?.length, matchedMap: g?.mapDef?.id,
        bootError: document.querySelector('#boot-error')?.textContent };
    }).catch(error => ({ snapshotFailure: error.message }));
    phaseReceipt.failureSnapshotReturnedAtMs=Date.now();
    await snapshotAudio('native-startup-timeout');
    report.browserDiagnostics.push({ event: 'native-startup-timeout', mobile, observed });
    } catch (diagnosticError) {
      report.browserDiagnostics.push({event:'native-startup-diagnostics-failed',mobile,error:String(diagnosticError?.message||diagnosticError).slice(0,500)});
    }
    throw error;
  }
  await page.waitForFunction(() => !document.querySelector('.iw-lineup') && !!window.__inkwave?.hud?._visible, null, { timeout: 30000 }).catch(() => {});
  const placement = await page.evaluate(() => {
    const g = window.__inkwave, G = window.__G;
    g.debug.freeze(); g.debug.freezeBots();
    // Paired screenshots use equal drawing buffers after unequal boot warmup.
    // Live performance windows resume the ordinary dynamic-resolution loop.
    g.R.setDynamicScale(1);
    if (g.match.state !== 'playing' || g.match.attract || !g.match.local?.isLocal) {
      throw new Error('Capture setup requires the completed native local Turf startup');
    }
    g._skipRender = true;
    G.settings.cameraShake = 0;
    g.rig.setMap(false);
    // Stabilize the local model in the genuine match before any capture or
    // live-loop performance window. Native spawnAt/reset ends the opening
    // Squid Spawn owner rather than leaving Actor.update in its aim/flight path.
    const a = g.match.local;
    const pad = G.level.spawnPads[a.team];
    const ground = { hit: false, y: 0, normal: new G.camera.position.constructor(), block: -1, face: -1, center: false, grate: false };
    G.physics.groundProbe(pad.x, pad.y, pad.z, 1.0, 1.0, 0.38, ground, false);
    if (!ground.hit || !ground.center || ground.grate || ground.normal.y < 0.68 || ground.block < 0 || ground.face < 0) {
      throw new Error('Canonical player spawn has no centered walkable native Tidewater floor hit');
    }
    const priorSquidSpawn = a.s3?.squidSpawn ? { phase: a.s3.squidSpawn.phase ?? null, initial: a.s3.squidSpawn.initial ?? null,
      t: a.s3.squidSpawn.t ?? null, duration: a.s3.squidSpawn.duration ?? null,
      from: a.s3.squidSpawn.from ? { ...a.s3.squidSpawn.from } : null,
      to: a.s3.squidSpawn.to ? { ...a.s3.squidSpawn.to } : null } : null;
    const neutralIntent = () => {
      a.intent.move.set(0, 0, 0);
      for (const key of ['fire', 'jump', 'squid', 'sub', 'special']) a.intent[key] = false;
      for (const key of ['fire', 'jump', 'squid', 'sub', 'special']) a._prevIntent[key] = false;
      a._firePressT = a._squidPressT = -1;
      a.fireBuffer = a.jumpBuffer = 0;
    };
    neutralIntent();
    const V = G.camera.position.constructor;
    a.spawnAt(new V(pad.x, ground.y, pad.z), 0);
    neutralIntent();
    if (a.s3?.squidSpawn) throw new Error('Native canonical Actor.spawnAt did not clear opening squidSpawn lifecycle');
    a.pos.set(pad.x, ground.y, pad.z);
    a.form = 'kid'; a.submerged = false; a.alive = true; a.hp = 100; a.ink = 100; a.vel.set(0, 0, 0);
    a.grounded = true; a.groundN.copy(ground.normal); a.climbing = false; a.specialActive = null; a.superJumpState = null;
    a.invuln = 0; a.kidT = 99; a.weaponRunner?.reset?.();
    a.yaw = 0; a.aimYaw = 0; a.aimPitch = 0; a.aimDir.set(0, 0, 1);
    a.aimPoint.copy(a.pos).add(new G.camera.position.constructor(0, 1.05, 24));
    const inkHex = '#' + a.color.getHexString();
    if (inkHex.toLowerCase() !== '#ffd21a') throw new Error(`Expected existing colorblind Yellow team ink #ffd21a, received ${inkHex}`);
    a.character.setVisible(true);
    a.character.root.position.copy(a.pos); a.character.root.rotation.y = 0;
    a.character.root.updateMatrixWorld(true);
    // Match.setup originally places every actor at a deterministic native
    // spawn-deck offset. Re-establish those actual stage placements after
    // variable-duration boot: frozen bots otherwise remain at different
    // post-intro positions and intercept different Roller projectiles.
    // Keep bots alive and collidable. This is only a capture fixture reset,
    // not a gameplay collision exemption.
    for (const actor of g.match.actors) {
      if (actor === a) continue;
      const otherPad = G.level.spawnPads[actor.team];
      if (!otherPad || !Number.isInteger(actor.slot)) throw new Error('Missing canonical bot spawn');
      const angle = actor.slot / 4 * Math.PI * 2 + 0.6;
      const stand = new V(otherPad.x + Math.cos(angle) * 1.2, otherPad.y,
        otherPad.z + Math.sin(angle) * 1.2);
      actor.spawnAt(stand, actor.team === 0 ? 0 : Math.PI);
      actor.invuln = 0;
      if (actor.bot) { actor.bot.aimYaw = actor.yaw; actor.bot.aimPitch = 0; }
      actor.character.root.updateMatrixWorld(true);
    }
    G.scene.updateMatrixWorld(true);
    g._skipRender = false;
    const floorBlock = G.physics.level.blocks[ground.block];
    window.__iwCanonicalLifecycleReset = {
      method: 'native Actor.spawnAt / Actor.reset', priorSquidSpawn,
      squidSpawnAfterReset: a.s3?.squidSpawn ? a.s3.squidSpawn.phase : null,
      neutralIntent: { fire: a.intent.fire, jump: a.intent.jump, squid: a.intent.squid, sub: a.intent.sub,
        special: a.intent.special, move: a.intent.move.toArray() },
      grounded: a.grounded, invulnerability: a.invuln, kidFrames: a.kidT,
    };
    window.__iwCanonicalPlacement = {
      pos: a.pos.toArray(), team: a.team, inkHex, yaw: a.yaw,
      aim: { yaw: a.yaw, aimYaw: a.aimYaw, aimPitch: a.aimPitch, direction: a.aimDir.toArray(), point: a.aimPoint.toArray() },
      floorHit: { hit: ground.hit, center: ground.center, grate: ground.grate, block: ground.block, face: ground.face,
        point: [pad.x, ground.y, pad.z], normal: ground.normal.toArray(), blockTag: floorBlock?.tag ?? null },
      bootSeed: window.__iwBootSeed,
    };
    return window.__iwCanonicalPlacement;
  });
  report.provenance.canonicalPlacement = placement;
  report.provenance.canonicalLifecycleReset = await page.evaluate(() => window.__iwCanonicalLifecycleReset ?? null);
  report.provenance.canonicalRoster = await page.evaluate(installProjectileCaptureRoster);
  const version = await page.evaluate(() => {
    const gl = __G.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { chromium: navigator.userAgent, webgl: gl.getParameter(gl.VERSION), webglRenderer: gl.getParameter(gl.RENDERER),
      unmaskedRenderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null, viewport: [innerWidth, innerHeight], dpr: devicePixelRatio };
  });
  if (!report.provenance.browser) report.provenance.browser = version;
  await streamedMusic.snapshot('native-playing-capture-ready');
  return { context, page, close: streamedMusic.close };
  } catch (error) {
    try { await streamedMusic.close(); }
    catch (cleanupError) {
      report.browserDiagnostics.push({ event: 'streamed-music-cleanup-failed', route: 'open', mobile,
        error: String(cleanupError?.message || cleanupError).slice(0, 1000) });
    }
    throw error;
  }
}

async function setCamera(page, perspective) {
  const sample = await page.evaluate(name => {
    const G = window.__G, a = G.match.local;
    const toVisualState = projectile => ({
      type: projectile.type, age: projectile.age, wid: projectile.wid, size: projectile.size, vis: projectile.vis,
      fidelitySloshDraw: projectile.fidelitySloshDraw ?? null, fidelityDrawRadius: projectile.fidelityDrawRadius ?? null,
      fidelityMode: projectile.fidelityMode ?? null, fidelitySloshIndex: projectile.fidelitySloshIndex ?? null,
      _iwVisualKind: projectile._iwVisualKind ?? null,
      s3Weapon: projectile.s3Weapon ? { sourceActor: projectile.s3Weapon.sourceActor, kind: projectile.s3Weapon.kind } : null,
      catalog: projectile.catalog ? {
        r: { sourceActor: projectile.catalog.r?.sourceActor },
        descriptor: { key: projectile.catalog.descriptor?.key, unit: projectile.catalog.descriptor?.unit,
          index: projectile.catalog.descriptor?.index },
      } : null,
    });
    const heads = G.projectiles.list.filter(projectile => projectile.delay <= 0 && !projectile._s3SloshBirthPending);
    const allLive = G.projectiles.list;
    const focusProjectiles = heads.length ? heads : allLive;
    return {
      actor: a.pos.toArray(), aim: [a.aimDir.x, a.aimDir.y, a.aimDir.z],
      heads: heads.map(projectile => ({ seed: projectile.seed, pos: projectile.pos.toArray(), visual: toVisualState(projectile) })),
      allLive: allLive.map(projectile => ({ seed: projectile.seed, pos: projectile.pos.toArray(), visual: toVisualState(projectile) })),
      focus: focusProjectiles.length ? [0, 1, 2].map(axis =>
        focusProjectiles.reduce((sum, projectile) => sum + projectile.pos.toArray()[axis], 0) / focusProjectiles.length) :
        window.__iwProjectileSurfaceHits?.at(-1)?.pos ?? null,
      fov: G.camera.fov, bootSeed: window.__iwCanonicalPlacement?.bootSeed ?? null,
      actorInkHex: '#' + a.color.getHexString(), canonicalPlacement: window.__iwCanonicalPlacement ?? null,
      currentVisualSetup: window.__iwCurrentVisualSetup ?? null,
      name,
    };
  }, perspective);
  const followsProjectiles = perspective === 'front' || perspective === 'side';
  const chosen = sample.heads.length ? sample.heads : sample.allLive;
  const headBounds = chosen.map(head => ({
    seed: head.seed,
    position: head.pos,
    sourceDrawRadius: projectileDrawRadius({ ...head.visual, seed: head.seed }),
    calibratedHeadRadius: projectileVisualWidth({ ...head.visual, seed: head.seed }),
  }));
  const focus = sample.focus;
  const maximumHeadExtent = focus && headBounds.length ? Math.max(...headBounds.map(head =>
    Math.hypot(head.position[0] - focus[0], head.position[1] - focus[1], head.position[2] - focus[2]) + head.calibratedHeadRadius)) : 0;
  const cameraOffsetDistance = Math.max(7, maximumHeadExtent + 3.5);
  const focusBounds = followsProjectiles && focus ? {
    definition: 'max distance from projectile centroid to any visible head center plus calibrated visual head radius; source radius is recorded separately',
    heads: headBounds, maximumHeadExtent,
    cameraOffsetDistance,
    cameraClearanceLowerBound: cameraOffsetDistance - maximumHeadExtent,
  } : null;
  return page.evaluate(({ name, sample, followsProjectiles, focusBounds }) => {
    const G = window.__G, cam = G.camera, p = sample.actor, focus = sample.focus;
    const fixedTarget = [p[0], p[1] + 1.2, p[2] + 8.0];
    const target = followsProjectiles && focus ? focus : fixedTarget;
    const d = focusBounds?.cameraOffsetDistance ?? 7;
    const offset = name === 'front' ? [0.15, 0.85, d] : name === 'side' ? [-d, 1.1, 0.8] : [0.95, 0.8, -11.3];
    const pose = {
      mode: followsProjectiles ? 'projectile-follow-physics-bounds-outside-fixed-offset' : 'fixed-gameplay-shoulder',
      pos: name === 'shoulder' ? [p[0] + 0.95, p[1] + 2.0, p[2] - 3.3] : target.map((value, i) => value + offset[i]),
      target: name === 'shoulder' ? fixedTarget : target,
    };
    cam.aspect = innerWidth / innerHeight;
    cam.position.set(...pose.pos); cam.lookAt(...pose.target); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    G.scene.updateMatrixWorld(true);
    return { perspective: name, mode: pose.mode, pose, actor: p, aim: sample.aim, fov: cam.fov,
      liveHeadCount: sample.heads.length, projectileFocus: followsProjectiles ? focus : null, focusBounds,
      bootSeed: sample.bootSeed, actorInkHex: sample.actorInkHex, canonicalPlacement: sample.canonicalPlacement,
      currentVisualSetup: sample.currentVisualSetup };
  }, { name: perspective, sample, followsProjectiles, focusBounds });
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
    const gl = G.renderer.getContext();
    const staleGlErrors = [];
    for (let i = 0; i < 32; i++) {
      const error = gl.getError();
      if (error === gl.NO_ERROR) break;
      staleGlErrors.push(error);
    }
    const shadowMap = G.renderer.shadowMap;
    const shadowRefreshRequested = !!shadowMap?.enabled;
    if (shadowRefreshRequested) shadowMap.needsUpdate = true;
    G.renderer.info.reset();
    G.game.R.render();
    const shadowRefresh = {
      enabled: !!shadowMap?.enabled,
      requested: shadowRefreshRequested,
      needsUpdateAfterRender: shadowRefreshRequested ? !!shadowMap.needsUpdate : null,
      consumed: shadowRefreshRequested ? !shadowMap.needsUpdate : null,
    };
    const glErrors = [];
    for (let i = 0; i < 32; i++) {
      const error = gl.getError();
      if (error === gl.NO_ERROR) break;
      glErrors.push(error);
    }
    if (staleGlErrors.length || glErrors.length) {
      throw new Error(`WebGL reported errors around native render (pre=${staleGlErrors.join(',') || 'none'}; post=${glErrors.join(',') || 'none'})`);
    }
    const read = G.projectiles.list.map(p => ({
      type: p.type, age: p.age, delay: p.delay || 0, pos: p.pos.toArray(), vel: p.vel.toArray(),
      mode: p.fidelityMode || (p.s3Vertical ? 'vertical' : p.s3FlickUnit === undefined ? null : 'horizontal'),
      seed: p.seed, unit: p.fidelitySloshUnitIndex ?? p.fidelityRollerUnitIndex ?? null,
    }));
    const visibleHeadProjectiles = G.projectiles.list.filter(p => p.delay <= 0 && !p._s3SloshBirthPending);
    const projectileScreen = visibleHeadProjectiles.map(p => {
      const point = p.pos.clone().project(G.camera);
      return { x: (point.x + 1) * innerWidth / 2, y: (1 - point.y) * innerHeight / 2, z: point.z };
    }).filter(p => Number.isFinite(p.x + p.y + p.z) && p.z >= -1 && p.z <= 1 && p.x >= 0 && p.x <= innerWidth && p.y >= 0 && p.y <= innerHeight);
    const liveHeadCount = visibleHeadProjectiles.length;
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
      roster: window.__iwProjectileRosterSnapshot(),
      projectileScreen,
      visibleCenters: projectileScreen.length,
      projectileCrop,
      liveHeadCount,
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
        staleGlErrors,
        glError: gl.NO_ERROR,
        glErrors,
        shadowRefresh,
      },
      drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
    };
  });
  if ((perspective === 'front' || perspective === 'side') && runtime.liveHeadCount > 0 &&
      (runtime.visibleCenters <= 0 || !runtime.projectileCrop)) {
    throw new Error(`${scenario}/${phase}/${perspective}: projectile-follow camera has ${runtime.liveHeadCount} live heads but no visible projectile center/crop`);
  }
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
    perspective, perspectiveMode: camera.mode, seed, camera, captureConditions: {
      fov: camera.fov, actorInkHex: camera.actorInkHex, bootSeed: camera.bootSeed,
      canonicalFloorHit: camera.canonicalPlacement?.floorHit ?? null,
      actorPosition: camera.actor,
      projectileFocusBounds: camera.focusBounds,
      actorFloorHit: camera.currentVisualSetup?.wall?.floorHit ?? camera.canonicalPlacement?.floorHit ?? null,
      nativeWallRaycast: camera.currentVisualSetup?.wall ? {
        block: camera.currentVisualSetup.wall.block, face: camera.currentVisualSetup.wall.face,
        distance: camera.currentVisualSetup.wall.dist, point: camera.currentVisualSetup.wall.target,
        normal: camera.currentVisualSetup.wall.normal,
      } : null,
    }, runtime, sha256: hash(fs.readFileSync(target)),
  };
  report.screenshots.push(receipt);
  return receipt;
}

const visualSetup = async ({ name, seed, impact = null }) => {
  const G = window.__G, g = window.__inkwave, a = g.match.local;
  const V = G.camera.position.constructor;
  const canonical = window.__iwCanonicalPlacement;
  if (!canonical) throw new Error('Missing canonical native spawn-floor placement');
  window.__iwProjectileSurfaceHits = [];
  window.__iwProjectileImpactAttempts = [];
  window.__iwProjectileCatalogSteps = [];
  if (!window.__iwProjectileImpactRecorderInstalled) {
    const nativeHitSnapshot = hit => hit ? {
      hit: !!hit.hit, block: hit.block, face: hit.face, dist: hit.dist,
      point: hit.point?.toArray?.() ?? null, normal: hit.normal?.toArray?.() ?? null,
    } : null;
    const hitFromSnapshot = snapshot => snapshot ? {
      ...snapshot,
      point: snapshot.point ? new V(...snapshot.point) : null,
      normal: snapshot.normal ? new V(...snapshot.normal) : null,
    } : null;
    const stageFaceFor = (faceId, point) => {
      const face = G.physics?.level?.faces?.[faceId];
      const block = face ? G.physics.level.blocks?.[face.block] : null;
      if (!face || !block || !point) return null;
      const delta = new V(...point).sub(face.origin);
      const planeDistance = delta.dot(face.n), u = delta.dot(face.u), v = delta.dot(face.v);
      return {
        valid: face.id === faceId && block.solid === true && !block.hidden && !block.grate &&
          Math.abs(planeDistance) <= 0.12 && u >= -0.05 && u <= face.su + 0.05 && v >= -0.05 && v <= face.sv + 0.05,
        block: face.block, face: face.id, wall: !!face.wall, paintable: !!face.paintable,
        normal: face.n.toArray(), planeDistance, u, v, spans: [face.su, face.sv],
        blockSolid: !!block.solid, blockHidden: !!block.hidden, blockGrate: !!block.grate,
      };
    };
    const stageFaceAtContact = (point, normal, preferredBlock = null) => {
      if (!point || !normal) return null;
      const pointVector = new V(...point), normalVector = new V(...normal);
      const candidates = [];
      for (const face of G.physics?.level?.faces ?? []) {
        const block = G.physics.level.blocks?.[face.block];
        if (!block) continue;
        const delta = pointVector.clone().sub(face.origin);
        const planeDistance = delta.dot(face.n), u = delta.dot(face.u), v = delta.dot(face.v);
        const alignment = face.n.dot(normalVector);
        const containsPoint = Math.abs(planeDistance) <= 0.01 && u >= -0.05 && u <= face.su + 0.05 && v >= -0.05 && v <= face.sv + 0.05;
        if (!containsPoint || alignment < 0.98 || preferredBlock != null && face.block !== preferredBlock) continue;
        candidates.push({
          valid: face.id >= 0 && block.solid === true && !block.hidden && !block.grate && face.paintable !== false,
          block: face.block, face: face.id, wall: !!face.wall, paintable: !!face.paintable,
          normal: face.n.toArray(), alignment, planeDistance, u, v, spans: [face.su, face.sv],
          blockSolid: !!block.solid, blockHidden: !!block.hidden, blockGrate: !!block.grate,
        });
      }
      return candidates.sort((left, right) => Math.abs(left.planeDistance) - Math.abs(right.planeDistance))[0] ?? null;
    };
    const recordAttempt = (route, p, hit) => {
      const snapshot = nativeHitSnapshot(hit);
      const stageFace = snapshot?.hit ? stageFaceFor(snapshot.face, snapshot.point) : null;
      window.__iwProjectileImpactAttempts.push({
        route, seed: p.seed, type: p.type, weapon: p.wid || p.inkKey || p.inkProfile?.key || null,
        hit: snapshot?.hit ?? false, face: snapshot?.face ?? null, block: snapshot?.block ?? null,
        point: snapshot?.point ?? null, normal: snapshot?.normal ?? null, nativeStageContact: stageFace?.valid === true,
        stageFace,
      });
    };
    const record = (route, p, hit, extra = {}) => {
      if (!hit?.hit || !Number.isInteger(hit.face) || hit.face < 0) return;
      const point = hit.point?.toArray?.() ?? (Array.isArray(hit.point) ? hit.point : p.pos?.toArray?.() ?? null);
      const normal = hit.normal?.toArray?.() ?? (Array.isArray(hit.normal) ? hit.normal : null);
      const stageFace = extra.stageFace ?? stageFaceFor(hit.face, point);
      window.__iwProjectileSurfaceHits.push({
        route, type: p.type, weapon: p.wid || p.inkKey || p.inkProfile?.key || null,
        seed: p.seed, age: p.age, pos: point,
        normal, block: hit.block, face: hit.face, distance: hit.dist,
        nativeStageContact: stageFace?.valid === true, stageFace,
        retired: extra.retired ?? null,
        paintReceipts: extra.paintReceipts ?? [],
        nativePaintReceiptFace: extra.paintReceipts?.find(receipt => receipt.face === hit.face && receipt.stageFace?.valid)?.face ?? null,
        wallDropTransition: extra.wallDropTransition ?? null,
        impactPaintContact: extra.impactPaintContact ?? null,
      });
    };
    const projectiles = G.projectiles;
    const nativeImpact = projectiles._impact;
    projectiles._impact = function (p, hit) {
      const stepContext = window.__iwProjectileStepContext;
      const hitSnapshot = nativeHitSnapshot(hit);
      recordAttempt('Projectiles._impact', p, hit);
      const impactScope = stepContext ? { paintReceipts: [], cpuPaintFaces: [] } : null;
      const priorScope = stepContext?.paintScope;
      if (stepContext) stepContext.paintScope = impactScope;
      try {
        return nativeImpact.call(this, p, hit);
      } finally {
        if (stepContext) {
          stepContext.paintScope = priorScope;
          stepContext.impactHits.push({ route: 'Projectiles._impact', hit: hitSnapshot,
            paintReceipts: impactScope.paintReceipts, cpuPaintFaces: impactScope.cpuPaintFaces });
        } else record('Projectiles._impact', p, hitFromSnapshot(hitSnapshot));
      }
    };
    const inkFlight = projectiles.inkFlight;
    if (inkFlight && typeof inkFlight.impact === 'function') {
      const flightImpact = inkFlight.impact;
      inkFlight.impact = function (p, hit) {
        const stepContext = window.__iwProjectileStepContext;
        const hitSnapshot = nativeHitSnapshot(hit);
        recordAttempt('InkFlightRuntime.impact', p, hit);
        const impactScope = stepContext ? { paintReceipts: [], cpuPaintFaces: [] } : null;
        const priorScope = stepContext?.paintScope;
        if (stepContext) stepContext.paintScope = impactScope;
        try {
          return flightImpact.call(this, p, hit);
        } finally {
          if (stepContext) {
            stepContext.paintScope = priorScope;
            stepContext.impactHits.push({ route: 'InkFlightRuntime.impact', hit: hitSnapshot,
              paintReceipts: impactScope.paintReceipts, cpuPaintFaces: impactScope.cpuPaintFaces });
          } else record('InkFlightRuntime.impact', p, hitFromSnapshot(hitSnapshot));
        }
      };
      if (typeof inkFlight.world === 'function') {
        const flightWorld = inkFlight.world;
        inkFlight.world = function (from, to, radius, hit) {
          const result = flightWorld.call(this, from, to, radius, hit);
          const stepContext = window.__iwProjectileStepContext;
          if (stepContext && result?.hit) {
            const snapshot = nativeHitSnapshot(result);
            snapshot.radius = radius;
            snapshot.from = from.toArray();
            snapshot.to = to.toArray();
            stepContext.flightWorldHits.push(snapshot);
            recordAttempt('InkFlightRuntime.world', stepContext.projectile, result);
          }
          return result;
        };
      }
    }
    const paintSplat = G.paint.splat;
    const nativeRaycast = G.physics?.raycast;
    if (typeof nativeRaycast === 'function') {
      G.physics.raycast = function (...args) {
        const result = nativeRaycast.apply(this, args);
        const stepContext = window.__iwProjectileStepContext;
        if (stepContext && result?.hit) stepContext.nativeRaycasts.push({
          face: result.face, block: result.block, point: result.point?.toArray?.() ?? null,
          normal: result.normal?.toArray?.() ?? null,
        });
        return result;
      };
    }
    if (typeof paintSplat === 'function') {
      G.paint.splat = function (center, radius, team, options = {}) {
        const result = paintSplat.call(this, center, radius, team, options);
        const stepContext = window.__iwProjectileStepContext;
        if (stepContext) {
          const faceId = Number.isInteger(options?.face) ? options.face : -1;
          const point = center?.toArray?.() ?? null;
          const stageFace = stageFaceFor(faceId, point);
          const raycastReceipt = stepContext.nativeRaycasts.findLast(hit => hit.face === faceId && hit.point && point &&
            new V(...hit.point).distanceTo(new V(...point)) <= 0.12) ?? null;
          const receipt = {
            center: point, team, face: faceId >= 0 ? faceId : null, kind: options?.kind ?? null,
            radius: Number.isFinite(radius) ? radius : null,
            result: Number.isFinite(result) ? result : null,
            sourceHint: raycastReceipt ? 'native-raycast-followup-paint' : 'non-raycast-paint',
            matchingNativeRaycast: raycastReceipt,
            stageFace,
          };
          stepContext.paintReceipts.push(receipt);
          if (stepContext.paintScope) stepContext.paintScope.paintReceipts.push(receipt);
        }
        return result;
      };
    }
    if (typeof G.paint._cpuSplat === 'function') {
      const cpuSplat = G.paint._cpuSplat;
      G.paint._cpuSplat = function (face, ...args) {
        const result = cpuSplat.call(this, face, ...args);
        const paintScope = window.__iwProjectileStepContext?.paintScope;
        if (paintScope && Number.isInteger(face?.id)) paintScope.cpuPaintFaces.push(face.id);
        return result;
      };
    }
    const nativeStep = projectiles._step;
    projectiles._step = function (p, dt) {
      const stepContext = { projectile: p, paintReceipts: [], nativeRaycasts: [], impactHits: [], flightWorldHits: [], paintScope: null };
      const priorContext = window.__iwProjectileStepContext;
      const hadWallDrop = !!p.fidelityWallDrop;
      window.__iwProjectileStepContext = stepContext;
      let retired;
      try {
        retired = nativeStep.call(this, p, dt);
      } finally {
        window.__iwProjectileStepContext = priorContext;
      }
      const hit = p.catalog?.hit;
      // The catalog keeps the winning sweptWorldHit candidate in a local
      // `world` variable, so p.catalog.hit is only a reusable scratch buffer
      // and does not expose the chosen candidate. finishContact passes the
      // chosen native face into paint.splat synchronously before this step
      // returns. Treat that face-bearing receipt plus retirement as the
      // production contact state; validate the face against live stage geometry.
      const paintContact = p.catalog && retired ? stepContext.paintReceipts.find(receipt =>
        receipt.stageFace?.valid && receipt.sourceHint === 'non-raycast-paint') : null;
      const contactPoint = paintContact?.center ? new V(...paintContact.center) : null;
      const contactHit = paintContact ? {
        hit: true,
        block: paintContact.stageFace.block,
        face: paintContact.stageFace.face,
        point: contactPoint,
        normal: new V(...paintContact.stageFace.normal),
        dist: contactPoint && p.prev ? p.prev.distanceTo(contactPoint) : null,
      } : null;
      const trace = {
        route: p.catalog ? 'MainWeaponCatalog.P._step' : 'Projectiles._step', type: p.type, weapon: p.wid || p.inkKey || null,
        seed: p.seed, age: p.age, dt, retired: !!retired,
        previous: p.prev?.toArray?.() ?? null, position: p.pos?.toArray?.() ?? null, velocity: p.vel?.toArray?.() ?? null,
        catalogHitScratch: hit ? { hit: !!hit.hit, block: hit.block, face: hit.face, distance: hit.dist,
          point: hit.point?.toArray?.() ?? null, normal: hit.normal?.toArray?.() ?? null } : null,
        nativeContact: contactHit ? { hit: true, source: 'finishContact paint.splat face receipt', block: contactHit.block,
          face: contactHit.face, distance: contactHit.dist, point: contactHit.point.toArray(), normal: contactHit.normal.toArray(),
          stageFace: paintContact.stageFace } : null,
        nativeRaycasts: stepContext.nativeRaycasts,
        flightWorldHits: stepContext.flightWorldHits,
        paintReceipts: stepContext.paintReceipts,
      };
      window.__iwProjectileCatalogSteps.push(trace);
      if (contactHit) record('MainWeaponCatalog.P._step', p, contactHit, { retired: !!retired, paintReceipts: stepContext.paintReceipts,
        stageFace: paintContact.stageFace });
      if (!p.catalog && retired) {
        const nativeContact = stepContext.impactHits.find(event => event.hit?.hit === true && Number.isInteger(event.hit.face) && event.hit.face >= 0);
        if (nativeContact) {
          const hitState = { ...nativeContact.hit,
            point: nativeContact.hit.point ? new V(...nativeContact.hit.point) : null,
            normal: nativeContact.hit.normal ? new V(...nativeContact.hit.normal) : null };
          const expectedPaintCenter = hitState.point?.clone().addScaledVector(hitState.normal, 0.14) ?? null;
          const impactPaintContact = expectedPaintCenter ? nativeContact.paintReceipts.map(receipt => ({
            ...receipt,
            distanceFromSourceImpactCenter: receipt.center ? new V(...receipt.center).distanceTo(expectedPaintCenter) : Infinity,
            cpuFace: nativeContact.cpuPaintFaces.find(face => face === hitState.face) ?? null,
          })).find(receipt => receipt.distanceFromSourceImpactCenter <= 0.02 &&
            nativeContact.cpuPaintFaces.includes(hitState.face)) ?? null : null;
          if (impactPaintContact) impactPaintContact.valid = true;
          record(nativeContact.route, p, hitState, { retired: true, paintReceipts: nativeContact.paintReceipts,
            stageFace: stageFaceFor(hitState.face, nativeContact.hit.point), impactPaintContact });
        }
      }
      const chosenFlightWorldHit = stepContext.flightWorldHits.find(hit => hit.hit && Number.isInteger(hit.face) && hit.face >= 0);
      const wallDropTransition = !hadWallDrop && !!p.fidelityWallDrop && chosenFlightWorldHit ? (() => {
        const stageFace = stageFaceAtContact(chosenFlightWorldHit.point, chosenFlightWorldHit.normal, chosenFlightWorldHit.block);
        const expectedPosition = new V(...chosenFlightWorldHit.point).addScaledVector(new V(...chosenFlightWorldHit.normal), 0.025);
        const positionError = p.pos.distanceTo(expectedPosition);
        const previousError = p.prev.distanceTo(expectedPosition);
        return {
          valid: stageFace?.valid === true && Math.abs(chosenFlightWorldHit.normal[1]) < 0.45 &&
            p.fidelityWallDrop.frame === 0 && !p.fidelityWallDrop.done && positionError <= 0.003 && previousError <= 0.003,
          source: 'InkFlightRuntime.world exact chosen Hit paired with first fidelityWallDrop admission',
          hit: chosenFlightWorldHit, stageFace, wallDropFrame: p.fidelityWallDrop.frame, wallDropDone: p.fidelityWallDrop.done,
          projectileOffsetFromHit: p.pos.clone().sub(new V(...chosenFlightWorldHit.point)).toArray(),
          expectedOffset: new V(...chosenFlightWorldHit.normal).multiplyScalar(0.025).toArray(), positionError, previousError,
        };
      })() : null;
      if (wallDropTransition?.valid) {
        const hitState = { ...chosenFlightWorldHit,
          point: new V(...chosenFlightWorldHit.point), normal: new V(...chosenFlightWorldHit.normal) };
        record('InkFlightRuntime.world', p, hitState, { retired: !!retired, stageFace: wallDropTransition.stageFace,
          wallDropTransition });
      }
      return retired;
    };
    window.__iwProjectileImpactRecorderInstalled = true;
  }
  const setupRng = window.__iwResetScenarioRandom(seed);
  G.time = 0; g.time = 0; g.rig.time = 0;
  G.projectiles.clear();
  // Independent captures must not inherit optional fields from earlier pooled rounds.
  // Keep normal native pooling throughout each scenario; discard only cleared records here.
  G.projectiles.pool.length = 0;
  G.fx.clear(); G.paint.clear();
  if (g.screenfx?.clear) g.screenfx.clear();
  window.__iwResetProjectileRoster();
  const weapon = impact === 'wall' ? 'shooter' :
    name === 'shooter' ? 'shooter' : name.startsWith('roller') ? 'roller' : 'slosher';
async function resetCaptureCharacter(actor) {
  const old = actor.character, parent = old.root.parent;
  const fresh = new old.constructor({ color: actor.color, weapon: actor.weaponId,
    style: old.style, name: actor.name, isLocal: actor.isLocal });
  fresh.actor = actor;
  fresh.onEvent = old.onEvent;
  try {
    // Character's normal loader also owns late source-motion initialization.
    // Do not let that initialization race the first physical capture.
    await fresh._sourceMotionLoader;
    if (fresh.sourceMotion?.status !== 'ready')
      throw new Error('Fresh native Character source motion failed readiness');
    fresh.root.position.copy(old.root.position);
    fresh.root.quaternion.copy(old.root.quaternion);
    fresh.setVisible(old.visible);
  } catch (error) { fresh.dispose(); throw error; }
  // Commit only after successful initialization; disposal failures must never
  // dispose the replacement now owned by the gameplay Actor.
  actor.character = fresh;
  if (parent) parent.add(fresh.root);
  old.dispose();
  fresh.root.updateMatrixWorld(true);
  return fresh;
}

  if (!g.frozen) throw new Error('Native loop must remain frozen during reset');
  const oldCharacter = a.character;
  await resetCaptureCharacter(a);
  if (!g.frozen) throw new Error('Native loop unfroze during async reset');
  window.__iwCharacterResetReceipt = { oldDisposed: oldCharacter._sourceMotionDisposed === true, oldDetached: oldCharacter.root.parent === null, actorOwned: a.character.actor === a, sceneOwned: a.character.root.parent === G.scene, constructorPreserved: a.character.constructor === oldCharacter.constructor, stylePreserved: JSON.stringify(a.character.style) === JSON.stringify(oldCharacter.style), sourceMotionStatus: a.character.sourceMotion.status };
  if (Object.entries(window.__iwCharacterResetReceipt).some(([key, value]) => key !== 'sourceMotionStatus' && value !== true)) throw new Error('Native Character ownership/disposal failed');
  a.setWeapon(weapon);
  const lifecycleBeforeReset = a.s3?.squidSpawn ? {
    phase: a.s3.squidSpawn.phase ?? null, initial: a.s3.squidSpawn.initial ?? null,
    t: a.s3.squidSpawn.t ?? null, duration: a.s3.squidSpawn.duration ?? null,
    from: a.s3.squidSpawn.from ? { ...a.s3.squidSpawn.from } : null,
    to: a.s3.squidSpawn.to ? { ...a.s3.squidSpawn.to } : null,
  } : null;
  const normalizeIntent = () => {
    a.intent.move.set(0, 0, 0);
    for (const key of ['fire', 'jump', 'squid', 'sub', 'special']) a.intent[key] = false;
    for (const key of ['fire', 'jump', 'squid', 'sub', 'special']) a._prevIntent[key] = false;
    a._firePressT = a._squidPressT = -1;
    a.fireBuffer = a.jumpBuffer = 0;
  };
  const resetAtNativeFloor = (position, yaw, groundNormal) => {
    normalizeIntent();
    // Actor.spawnAt runs Actor.reset, which clears the genuine startup Squid
    // Spawn/aim/flight owner and weapon clocks. The renderer freezes the live
    // match for deterministic captures, so complete that native lifecycle at
    // the selected real floor point before injecting test controls.
    a.spawnAt(new V(...position), yaw);
    normalizeIntent();
    window.__iwResetProjectileGear(a);
    a.form = 'kid'; a.submerged = false; a.alive = true; a.hp = 100; a.ink = 100; a.vel.set(0, 0, 0);
    a.grounded = true; a.groundN.set(...groundNormal); a.climbing = false; a.specialActive = null; a.superJumpState = null;
    a.invuln = 0; a.fireBuffer = a.jumpBuffer = 0; a.kidT = 99;
    a.weaponRunner?.reset?.();
    a.character.setVisible(true); a.character.root.position.copy(a.pos); a.character.root.rotation.y = yaw;
    a._finishFrame(0);
    a.character.root.updateMatrixWorld(true); G.scene.updateMatrixWorld(true);
    if (a.s3?.squidSpawn) throw new Error('Native Actor.spawnAt did not clear the startup squidSpawn lifecycle');
  };
  resetAtNativeFloor(canonical.pos, 0, canonical.floorHit.normal);
  a.yaw = 0; a.aimYaw = 0; a.aimPitch = 0;
  a.aimDir.set(0, 0, 1); a.aimPoint.copy(a.pos).add(new V(0, 1.05, 24));
  a.character.root.rotation.y = 0; a.character.root.updateMatrixWorld(true);
  G.scene.updateMatrixWorld(true);
  let wall = null;
  if (impact === 'wall') {
    const level = G.physics.level;
    const rayHit = { hit: false, point: new V(), normal: new V(), dist: 0, block: -1, face: -1, u: 0, v: 0 };
    const candidates = [];
    for (const face of level.faces) {
      const block = level.blocks[face.block];
      if (!face.wall || !block?.solid || block.hidden || block.grate || Math.abs(face.n.y) >= 0.3) continue;
      let facePoint = face.origin.clone().addScaledVector(face.u, face.su * 0.5).addScaledVector(face.v, face.sv * 0.5);
      const vertical = Math.abs(face.u.y) > Math.abs(face.v.y)
        ? { axis: face.u, span: face.su }
        : { axis: face.v, span: face.sv };
      if (Math.abs(vertical.axis.y) < 0.5) continue;
      const normal = face.n.clone().setY(0).normalize();
      if (normal.lengthSq() < 0.9) continue;
      for (const standoff of [1.8, 2.4, 3.2, 4.4, 5.8]) {
        // Put a legal player position outside this existing face, then ground it with the live stage raycast.
        const horizontal = facePoint.clone().addScaledVector(normal, standoff);
        const ground = { hit: false, y: 0, normal: new V(0, 1, 0), block: -1, face: -1, center: false, grate: false };
        G.physics.groundProbe(horizontal.x, canonical.pos[1], horizontal.z, 8, 20, 0.32, ground, false);
        if (!ground.hit || !ground.center || ground.grate || ground.normal.y < 0.68 || ground.block < 0 || ground.face < 0) continue;
        const muzzleY = ground.y + 1.05;
        const yDelta = Math.max(-vertical.span * 0.5 + 0.08, Math.min(vertical.span * 0.5 - 0.08,
          (muzzleY - facePoint.y) / vertical.axis.y));
        const target = facePoint.clone().addScaledVector(vertical.axis, yDelta);
        const actorPos = new V(horizontal.x, ground.y, horizontal.z);
        const desired = target.clone().sub(actorPos).setY(target.y - (ground.y + 1.05));
        const yaw = Math.atan2(desired.x, desired.z);
        a.pos.copy(actorPos); a.vel.set(0, 0, 0); a.grounded = true; a.groundN.copy(ground.normal);
        a.yaw = yaw; a.aimYaw = yaw; a.character.root.position.copy(a.pos); a.character.root.rotation.y = yaw;
        a.character.root.updateMatrixWorld(true); G.scene.updateMatrixWorld(true);
        const muzzle = G.projectiles._muzzle(a, new V());
        const dir = target.clone().sub(muzzle);
        const distance = dir.length();
        if (distance < 1.4 || distance > 24) continue;
        dir.multiplyScalar(1 / distance);
        const actualYaw = Math.atan2(dir.x, dir.z);
        a.yaw = actualYaw; a.aimYaw = actualYaw; a.aimPitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
        a.aimDir.copy(dir); a.aimPoint.copy(target);
        a.character.root.rotation.y = actualYaw; a.character.root.updateMatrixWorld(true); G.scene.updateMatrixWorld(true);
        G.projectiles._muzzle(a, muzzle);
        const verifiedDir = target.clone().sub(muzzle);
        const verifiedDistance = verifiedDir.length();
        if (verifiedDistance < 1.4 || verifiedDistance > 24) continue;
        verifiedDir.multiplyScalar(1 / verifiedDistance);
        const probe = G.physics.raycast(muzzle, verifiedDir, verifiedDistance + 0.25, rayHit, true);
        if (!probe.hit || probe.block !== face.block || probe.face !== face.id || probe.normal.dot(face.n) < 0.95) continue;
        candidates.push({
          score: actorPos.distanceTo(new V(...canonical.pos)), actorPos: actorPos.toArray(),
          floorHit: { hit: ground.hit, center: ground.center, grate: ground.grate, block: ground.block, face: ground.face,
            point: [horizontal.x, ground.y, horizontal.z], normal: ground.normal.toArray() },
          target: probe.point.toArray(), normal: probe.normal.toArray(), block: probe.block, face: probe.face,
          dist: probe.dist, dir: verifiedDir.toArray(), muzzle: muzzle.toArray(), yaw: actualYaw,
          stageFace: { block: face.block, face: face.id, normal: face.n.toArray(), wall: face.wall, hidden: block.hidden, grate: block.grate },
        });
      }
    }
    candidates.sort((left, right) => left.score - right.score || left.dist - right.dist || left.face - right.face);
    wall = candidates[0] ?? null;
    if (!wall) throw new Error('No actual exposed Tidewater wall face had a clear native ray from a legal native floor position');
    resetAtNativeFloor(wall.actorPos, wall.yaw, wall.floorHit.normal);
    a.yaw = wall.yaw; a.aimYaw = wall.yaw;
    a.aimPitch = Math.atan2(wall.dir[1], Math.hypot(wall.dir[0], wall.dir[2]));
    a.aimDir.set(...wall.dir); a.aimPoint.set(...wall.target);
    a.character.root.position.copy(a.pos); a.character.root.rotation.y = a.yaw;
    a.character.root.updateMatrixWorld(true); G.scene.updateMatrixWorld(true);
    const muzzle = G.projectiles._muzzle(a, new V());
    const toTarget = new V(...wall.target).sub(muzzle), muzzleToTarget = toTarget.length();
    if (muzzleToTarget <= 0) throw new Error('Native post-spawn muzzle collapsed onto the wall target');
    toTarget.multiplyScalar(1 / muzzleToTarget);
    const actualHit = { hit: false, point: new V(), normal: new V(), dist: 0, block: -1, face: -1 };
    G.physics.raycast(muzzle, toTarget, muzzleToTarget + 0.25, actualHit, true);
    if (!actualHit.hit || actualHit.block !== wall.block || actualHit.face !== wall.face) {
      throw new Error(`Native Actor.spawnAt muzzle no longer raycasts to selected live wall face ${wall.face}/${wall.block}`);
    }
    wall.postSpawnMuzzle = muzzle.toArray();
    wall.postSpawnRay = { hit: actualHit.hit, block: actualHit.block, face: actualHit.face,
      point: actualHit.point.toArray(), normal: actualHit.normal.toArray(), dist: actualHit.dist };
  }
  const lifecycleReset = { method: 'native Actor.spawnAt / Actor.reset', priorSquidSpawn: lifecycleBeforeReset,
    squidSpawnAfterReset: a.s3?.squidSpawn ? a.s3.squidSpawn.phase : null,
    neutralIntent: { fire: a.intent.fire, jump: a.intent.jump, squid: a.intent.squid, sub: a.intent.sub,
      special: a.intent.special, move: a.intent.move.toArray() },
    grounded: a.grounded, invulnerability: a.invuln, kidFrames: a.kidT };
  const setup = { weapon, actor: a.pos.toArray(), wall, impact, seed, bootSeed: canonical.bootSeed,
    aim: { yaw: a.yaw, aimYaw: a.aimYaw, aimPitch: a.aimPitch,
      direction: a.aimDir.toArray(), point: a.aimPoint.toArray() },
    inkHex: '#' + a.color.getHexString(), canonicalPlacement: canonical,
    roster: window.__iwProjectileRosterSnapshot() };
  // Keep RNG diagnostics separate from physical setup and camera receipts.
  window.__iwCurrentVisualSetupRng = setupRng.snapshot();
  window.__iwCurrentVisualSetupLifecycle = lifecycleReset;
  window.__iwCurrentVisualSetup = setup;
  return { setup, lifecycleReset };
};

async function runVisuals(page) {
  await runContactScenarios(page);
  for (const scenario of [
    { name: 'shooter', seed: 0x1a2b3c4d, method: 'shooter', checkpoints: [0, 5, 10, 15, 36] },
    { name: 'roller-horizontal', seed: 0x576597, method: 'roller-horizontal', checkpoints: [0, 5, 10, 15, 36] },
    { name: 'roller-vertical', seed: 0x576598, method: 'roller-vertical', checkpoints: [0, 5, 10, 15, 36] },
    { name: 'slosher9', seed: 0x1a2b3c4e, method: 'slosher9', checkpoints: [0, 5, 10, 15, 36] },
  ]) {
    const setupResult = await page.evaluate(visualSetup, { name: scenario.name, seed: scenario.seed });
    const { setup, lifecycleReset } = setupResult;
    const birthResult = await page.evaluate(({ method, seed }) => {
      const G = window.__G, a = G.match.local;
      const betweenSetupAndFire = window.__iwScenarioRandomRecorder?.snapshot?.() ?? null;
      const fireRng = window.__iwResetScenarioRandom(seed);
      const beforeNativeFire = fireRng.snapshot();
      if (method === 'shooter') G.projectiles.fireShooter(a, a.weapon, 0);
      else if (method === 'roller-horizontal') { a.weaponRunner.s3FlickVertical = false; G.projectiles.fireFlick(a, a.weapon); }
      else if (method === 'roller-vertical') { a.weaponRunner.s3FlickVertical = true; G.projectiles.fireFlick(a, a.weapon); }
      else G.projectiles.fireSlosh(a, a.weapon);
      G.projectiles._draw();
      const projectiles = G.projectiles.list.map(p => ({ type: p.type, age: p.age, delay: p.delay || 0, pos: p.pos.toArray(), vel: p.vel.toArray(), seed: p.seed,
        route: p.catalog ? 'MainWeaponCatalog.P._step' : p.inkProfile ? 'InkFlightRuntime' : 'legacy-projectile-step',
        mode: p.fidelityMode || (p.s3Vertical ? 'vertical' : p.s3FlickUnit === undefined ? null : 'horizontal'),
        sloshUnit: p.fidelitySloshIndex ?? p.fidelitySloshPacketIndex ?? null, rollerUnit: p.fidelityRollerUnitIndex ?? null }));
      return { projectiles, rng: { afterVisualSetup: window.__iwCurrentVisualSetupRng ?? null,
        betweenSetupAndFire, beforeNativeFire, afterNativeFire: fireRng.snapshot() } };
    }, { method: scenario.method, seed: scenario.seed });
    const born = birthResult.projectiles;
    if (!born.length) throw new Error(`${scenario.name}: production fire method created no projectile`);
    if (scenario.name === 'slosher9' && born.length !== 9) throw new Error(`Slosher source volley expected 9 units, received ${born.length}`);
    const record = { name: scenario.name, seed: scenario.seed, setup, lifecycleReset, births: born,
      rng: birthResult.rng, captures: [], impacts: [] };
    let frame = 0;
    for (const targetFrame of scenario.checkpoints) {
      while (frame < targetFrame) {
        const update = await page.evaluate(() => {
          const G = window.__G, g = window.__inkwave, dt = 1 / 60;
          G.time += dt; g.time += dt;
          const before = G.projectiles.list.map(p => p.seed);
          const surfaceHitStart = window.__iwProjectileSurfaceHits.length;
          G.projectiles.update(dt); G.fx.update(dt, G.camera); g.fxHooks?.update?.(dt); G.paint.flush(dt);
          const after = new Set(G.projectiles.list.map(p => p.seed));
          return { beforeCount: before.length, afterCount: G.projectiles.list.length, retired: before.filter(seed => !after.has(seed)).length,
            surfaceHits: window.__iwProjectileSurfaceHits.slice(surfaceHitStart),
            live: G.projectiles.list.map(p => ({ seed: p.seed, age: p.age, pos: p.pos.toArray(), type: p.type, delay: p.delay || 0 })) };
        });
        frame++;
        if (update.surfaceHits.length) record.impacts.push({ frame, surfaceHits: update.surfaceHits, liveCount: update.afterCount });
      }
      const phase = targetFrame === 0 ? 'F0' : targetFrame === 5 ? 'F5' : targetFrame === 10 ? 'F10' : targetFrame === 15 ? 'F15' : 'fall';
      const views = [0, 5, 15].includes(targetFrame) ? ['shoulder', 'front', 'side'] : ['shoulder'];
      for (const perspective of views) record.captures.push(await renderAndCapture(page, scenario.name, phase, perspective, scenario.seed));
    }
    record.endState = await page.evaluate(() => ({ projectiles: __G.projectiles.list.length, paintQuads: __G.paint.quads, fx: __G.fx.stats?.() ?? null }));
    report.visualScenarios.push(record);
  }
}

async function runContactScenarios(page) {
  // The wall and floor receipts use native collision queries and real stage
  // surfaces. A normal controller-fired legacy shooter enters the retained
  // WallDrop phase from the exact InkFlightRuntime.world hit; Slosher9 globs
  // follow their sourced parabola into the live floor.
  for (const scenario of [
    { name: 'wall-shooter', seed: 0x7a11, method: 'controller-shooter', impact: 'wall', maxFrames: 120 },
    { name: 'floor-slosher9', seed: 0x7a12, method: 'slosher9', impact: 'floor', maxFrames: 150 },
  ]) {
    const setupResult = await page.evaluate(visualSetup, { name: scenario.name, seed: scenario.seed, impact: scenario.impact });
    const { setup, lifecycleReset } = setupResult;
    if (scenario.impact === 'wall' && !setup.wall) throw new Error('Could not find a native Tidewater wall for the wall impact receipt');
    const birthResult = await page.evaluate(({ method, seed, expectedWall }) => {
      const G = window.__G, a = G.match.local;
      let controllerFramesHeld = null, controllerProbe = null;
      const betweenSetupAndFire = window.__iwScenarioRandomRecorder?.snapshot?.() ?? null;
      const fireRng = window.__iwResetScenarioRandom(seed);
      const beforeNativeFire = fireRng.snapshot();
      if (method === 'controller-shooter') {
        const prior = G.projectiles.list.length, dt = 1 / 60;
        const V = G.camera.position.constructor;
        const spawnStateBefore = a.s3?.squidSpawn ? { ...a.s3.squidSpawn } : null;
        if (spawnStateBefore) throw new Error('Controller shooter setup retained squidSpawn before native Actor.update fire');
        const actorBefore = a.pos.toArray(), rootBefore = a.character.root.position.toArray();
        const muzzleBefore = G.projectiles._muzzle(a, new V()).clone();
        const expectedPoint = new V(...expectedWall.target), expectedNormal = new V(...expectedWall.normal);
        const muzzleSideDistance = muzzleBefore.clone().sub(expectedPoint).dot(expectedNormal);
        const priorSeeds = new Set(G.projectiles.list.map(p => p.seed));
        a.intent.fire = true;
        for (let i = 0; i < 120 && G.projectiles.list.length === prior; i++) {
          controllerFramesHeld = i + 1;
          G.time += dt; window.__inkwave.time += dt; a.update(dt);
        }
        a.intent.fire = false;
        if (G.projectiles.list.length === prior) throw new Error('Controller fire cadence produced no shooter projectile');
        const p = G.projectiles.list.find(candidate => !priorSeeds.has(candidate.seed));
        if (!p) throw new Error('Controller fire cadence increased projectile count without a distinguishable birth seed');
        const start = p.start?.toArray?.() ?? p.pos.toArray();
        const actualBirthMuzzle = new V(...start);
        const actorAtBirth = a.pos.toArray(), rootAtBirth = a.character.root.position.toArray();
        const velocity = p.vel.toArray();
        const startSideDistance = actualBirthMuzzle.clone().sub(expectedPoint).dot(expectedNormal);
        const velocityTowardFace = new V(...velocity).dot(expectedNormal);
        const muzzleStartError = actualBirthMuzzle.distanceTo(muzzleBefore);
        const actorTravel = new V(...actorAtBirth).distanceTo(new V(...actorBefore));
        const rootTravel = new V(...rootAtBirth).distanceTo(new V(...rootBefore));
        controllerProbe = {
          source: 'normal Actor.update intent.fire path after native Actor.spawnAt reset',
          heldFrames: controllerFramesHeld, lifecycleAtBirth: a.s3?.squidSpawn ? { phase: a.s3.squidSpawn.phase ?? null } : null,
          actorBefore, rootBefore, preFireMuzzle: muzzleBefore.toArray(), selectedWall: {
            block: expectedWall.block, face: expectedWall.face, point: expectedWall.target, normal: expectedWall.normal,
            postSpawnRay: expectedWall.postSpawnRay,
          },
          actorAtBirth, rootAtBirth, birthStart: start, birthPosition: p.pos.toArray(), velocity,
          muzzleSideDistance, startSideDistance, velocityTowardFace, muzzleStartError, actorTravel, rootTravel,
          sourceProfile: p.inkProfile?.key ?? null,
        };
        if (controllerProbe.lifecycleAtBirth) throw new Error('Native actor lifecycle intercepted controller fire after setup reset');
        if (!(muzzleSideDistance > 0.25 && startSideDistance > 0.25 && velocityTowardFace < -5)) {
          throw new Error('Actual controller shooter birth is not on the actor side of, and travelling into, the selected native wall');
        }
        if (muzzleStartError > 0.4 || actorTravel > 0.03 || rootTravel > 0.03) {
          throw new Error('Actor or muzzle moved between native wall setup and controller projectile birth');
        }
      } else G.projectiles.fireSlosh(a, a.weapon);
      G.projectiles._draw();
      const births = G.projectiles.list.map(p => ({ seed: p.seed, type: p.type, pos: p.pos.toArray(), velocity: p.vel.toArray(),
        route: p.catalog ? 'MainWeaponCatalog.P._step' : p.inkProfile ? 'InkFlightRuntime.stepHead' : 'legacy-projectile-step',
        sourceActor: p.catalog?.r?.sourceActor ?? p.s3Weapon?.sourceActor ?? p.inkKey ?? null,
        controllerInput: method === 'controller-shooter' ? 'Actor.update intent.fire=true' : null,
        controllerFramesHeld }));
      return { births, controllerProbe, rng: { afterVisualSetup: window.__iwCurrentVisualSetupRng ?? null,
        betweenSetupAndFire, beforeNativeFire, afterNativeFire: fireRng.snapshot() } };
    }, { method: scenario.method, seed: scenario.seed, expectedWall: setup.wall });
    const born = birthResult.births;
    if (!born.length) throw new Error(scenario.name + ': projectile birth failed');
    await renderAndCapture(page, scenario.name, 'F0', 'shoulder', scenario.seed);
    let impactFrame = null, impactState = null, impactEvidence = null, captureFrame = 0;
    const flightHistory = [];
    for (let frame = 1; frame <= scenario.maxFrames; frame++) {
      const row = await page.evaluate(() => {
        const G = window.__G, g = window.__inkwave, dt = 1 / 60;
        G.time += dt; g.time += dt;
        const before = G.projectiles.list.map(p => ({ seed: p.seed, pos: p.pos.toArray() }));
        const surfaceHitStart = window.__iwProjectileSurfaceHits.length;
        const attemptsStart = window.__iwProjectileImpactAttempts.length;
        const catalogStepStart = window.__iwProjectileCatalogSteps.length;
        G.projectiles.update(dt); G.fx.update(dt, G.camera); g.fxHooks?.update?.(dt); G.paint.flush(dt);
        const after = new Set(G.projectiles.list.map(p => p.seed));
        return { before, afterCount: G.projectiles.list.length, retired: before.filter(p => !after.has(p.seed)), paintQuads: G.paint.quads,
          attempts: window.__iwProjectileImpactAttempts.slice(attemptsStart),
          heads: G.projectiles.list.map(p => ({ type: p.type, ghost: !!p.ghost, age: p.age, phase: p.inkPhase ?? null,
            headFrame: p.inkFrame ?? null, pos: p.pos.toArray(), vel: p.vel.toArray(),
            wallDrop: p.fidelityWallDrop ? { frame: p.fidelityWallDrop.frame, done: p.fidelityWallDrop.done } : null })),
          headImpacts: G.projectiles.inkFlight?.stats?.headImpacts ?? null,
          surfaceHits: window.__iwProjectileSurfaceHits.slice(surfaceHitStart),
          catalogSteps: window.__iwProjectileCatalogSteps.slice(catalogStepStart),
          paintCoverage: G.paint.coverage?.() ?? null, fx: G.fx.stats?.() ?? null };
      });
      captureFrame = frame;
      flightHistory.push({ frame, heads: row.heads, retired: row.retired, attempts: row.attempts,
        headImpacts: row.headImpacts, surfaceHits: row.surfaceHits });
      if (flightHistory.length > 12) flightHistory.shift();
      const expectedContact = scenario.impact === 'wall'
        ? row.surfaceHits.find(hit => hit.route === 'InkFlightRuntime.world' &&
          hit.wallDropTransition?.valid === true && hit.nativeStageContact === true &&
          hit.stageFace?.wall === true && hit.normal && Math.abs(hit.normal[1]) < 0.45 &&
          hit.block === setup.wall?.block && hit.face === setup.wall?.face &&
          hit.normal.reduce((sum, value, i) => sum + value * setup.wall.normal[i], 0) > 0.9)
        : row.surfaceHits.find(hit => hit.route === 'Projectiles._impact' && hit.retired === true && hit.nativeStageContact === true &&
          hit.stageFace && hit.normal && hit.normal[1] > 0.68 && hit.impactPaintContact?.valid === true &&
          hit.impactPaintContact.cpuFace === hit.face);
      if (expectedContact) { impactFrame = frame; impactState = row; impactEvidence = expectedContact; }
      if (impactFrame != null && frame >= impactFrame + 8) break;
      // One controller-fired native projectile is used for the wall receipt.
      // If it retires before an admitted face hit, later frames cannot recover it.
      if (scenario.impact === 'wall' && !row.afterCount && impactFrame == null) break;
    }
    if (impactFrame == null) throw new Error(scenario.name + ': no native stage-surface collision with an in-range face/normal and matching production transition; diagnostics ' +
      JSON.stringify({ wall: setup.wall, births: born, flightHistory }));
    const capture = await renderAndCapture(page, scenario.name, `${scenario.impact}-contact-F${impactFrame}-capture-F${captureFrame}`, scenario.impact === 'wall' ? 'side' : 'shoulder', scenario.seed);
    report.visualScenarios.push({ name: scenario.name, seed: scenario.seed, setup, lifecycleReset, births: born, rng: birthResult.rng,
      controllerProbe: birthResult.controllerProbe, impactFrame, captureFrame,
      elapsedSinceImpactFrames: captureFrame - impactFrame, impactState, impactEvidence, capture,
      evidence: scenario.impact === 'wall'
        ? 'The actor controller fired the legacy shooter; InkFlightRuntime.world returned the chosen valid live-stage Hit, and the same step entered the retained fidelityWallDrop phase at hit.point + hit.normal × 0.025.'
        : 'Projectiles._impact received a validated native floor Hit; its scoped impact paint matched the source .14-normal offset and CPU PaintSystem recorded the same live face.' });
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
  const { context, page, close } = await openGameContext({ mobile });
  let performanceFailed = false;
  try {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const gcEvents = [];
  let gcTraceStarted = false, gcTraceFailure = null, resolveTraceComplete;
  const traceComplete = new Promise(resolve => { resolveTraceComplete = resolve; });
  const onTraceData = data => {
    for (const event of data.value || []) {
      if ((event.name === 'MinorGC' || event.name === 'MajorGC') && event.ph === 'X' && Number.isFinite(event.dur)) {
        gcEvents.push({ name: event.name, durationMs: event.dur / 1000 });
      }
    }
  };
  const onTraceComplete = event => resolveTraceComplete(event);
  cdp.on('Tracing.dataCollected', onTraceData);
  cdp.on('Tracing.tracingComplete', onTraceComplete);
  await page.evaluate(({ minFrames, timeoutMs, durationMs }) => {
    const G = window.__G, g = window.__inkwave, P = G.projectiles, R = g.R;
    g.debug.freezeBots(); G.settings.cameraShake = 0;
    const warmup = { nativeFrames: 0, frameSamples: 0, projectileUpdates: 0, nonemptyProjectileUpdates: 0,
      fireCalls: 0, renderSamples: 0, renderCalls: [], triangles: [], raf: [], maxProjectiles: 0,
      firstFrame: null, frameStates: [], blurEvents: 0, focusEvents: 0, visibilityChanges: [] };
    window.__inkwavePerf = { active: false, warming: false, raf: [], frames: [], loopTimestamps: [], projectileMs: [], renderMs: [], calls: [], triangles: [],
      visualGeometryMs: [], visualBodies: [], visualVertices: [], visualOwnerCounts: [], nonemptyVisualRenders: 0,
      projectileUpdates: 0, nonemptyProjectileUpdates: 0, fireCalls: 0, maxProjectiles: 0, gpuQueries: [], timer: null };
    const perf = window.__inkwavePerf;
    perf.warmup = warmup;
    window.addEventListener('blur', () => { if (perf.warming) warmup.blurEvents++; });
    window.addEventListener('focus', () => { if (perf.warming) warmup.focusEvents++; });
    document.addEventListener('visibilitychange', () => {
      if (perf.warming) warmup.visibilityChanges.push({ state: document.visibilityState, at: performance.now() });
    });
    const gl = G.renderer.getContext();
    const ext2 = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const ext1 = !ext2 && gl.getExtension('EXT_disjoint_timer_query');
    perf.timer = ext2 ? { kind: 'webgl2', ext: ext2 } : ext1 ? { kind: 'webgl1', ext: ext1 } : null;
    const raf = t => { if (!perf.active) return; perf.raf.push(t); requestAnimationFrame(raf); };
    const warmupRaf = t => { if (!perf.warming) return; warmup.raf.push(t); requestAnimationFrame(warmupRaf); };
    window.__inkwavePerfWarmupStart = () => {
      perf.warming = true;
      warmup.startedAt = performance.now();
      warmup.start = { frozen: !!g.frozen, visibilityState: document.visibilityState, hasFocus: document.hasFocus(), inputMouseLeft: G.input.mouse.left };
      g.debug.fire(true);
      warmup.inputAfterDebugFire = G.input.mouse.left;
      warmup.start.inputAfterDebugFire = warmup.inputAfterDebugFire;
      requestAnimationFrame(warmupRaf);
      g.debug.unfreeze();
    };
    let finishWindow;
    window.__inkwavePerfDone = new Promise(resolve => { finishWindow = resolve; });
    const stopWindow = (status, reason = null) => {
      if (!perf.active) return;
      perf.endedAt = performance.now(); perf.windowStatus = status; perf.windowFailure = reason;
      perf.active = false; perf.warming = false;
      clearTimeout(perf.deadline);
      g.debug.fire(false); g.debug.freeze();
      finishWindow({ status, reason });
    };
    window.__inkwavePerfStart = () => {
      perf.warming = false; perf.active = true; perf.startedAt = performance.now();
      perf.startGameTime = G.time;
      perf.deadline = setTimeout(() => stopWindow('failed', 'Insufficient live firing/render samples before deadline'), timeoutMs);
      requestAnimationFrame(raf);
    };
    const oldFrame = g._frame;
    g._frame = function (dt) {
      if (!perf.active) {
        if (!perf.warming) return oldFrame.call(this, dt);
        const firstFrame = warmup.nativeFrames === 0;
        warmup.nativeFrames++;
        if (firstFrame) warmup.firstFrame = {
          inputMouseLeftBefore: G.input.mouse.left,
          actorIntentFireBefore: !!G.match.local?.intent.fire,
          visibilityState: document.visibilityState,
          hasFocus: document.hasFocus(),
          at: performance.now(),
        };
        try { return oldFrame.call(this, dt); }
        finally {
          warmup.frameSamples++;
          if (warmup.frameStates.length < 32) {
            const a = G.match.local, r = a?.weaponRunner;
            warmup.frameStates.push({ at: performance.now(), dt, time: G.time, matchState: G.match.state,
              ink: a?.ink, alive: a?.alive, squidSpawn: a?.s3?.squidSpawn?.phase ?? null,
              intentFire: a?.intent.fire, form: a?.form, cooldown: r?.cooldown,
              shooterCancelMain: r?.s3ShooterCancelMain, fireCalls: warmup.fireCalls });
          }
          if (firstFrame) {
            warmup.firstFrame.inputMouseLeftAfter = G.input.mouse.left;
            warmup.firstFrame.actorIntentFireAfter = !!G.match.local?.intent.fire;
          }
        }
      }
      const t = performance.now(); perf.loopTimestamps.push(t);
      try { return oldFrame.call(this, dt); } finally {
        perf.frames.push(performance.now() - t);
        if (performance.now() - perf.startedAt >= durationMs && perf.frames.length >= minFrames &&
            perf.renderMs.length >= minFrames && perf.raf.length >= minFrames) stopWindow('passed');
      }
    };
    const oldUpdate = P.update;
    P.update = function (dt) {
      if (!perf.active) {
        if (!perf.warming) return oldUpdate.call(this, dt);
        warmup.projectileUpdates++;
        try { return oldUpdate.call(this, dt); }
        finally {
          if (this.list.length) warmup.nonemptyProjectileUpdates++;
          warmup.maxProjectiles = Math.max(warmup.maxProjectiles, this.list.length);
        }
      }
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
        else if (perf.warming) warmup.fireCalls++;
        return oldFire.apply(this, args);
      };
    }
    if (typeof P.syncVisuals === 'function') {
      const oldSyncVisuals = P.syncVisuals;
      P.syncVisuals = function (...args) {
        if (!perf.active) return oldSyncVisuals.apply(this, args);
        const t = performance.now();
        try { return oldSyncVisuals.apply(this, args); }
        finally { perf.visualGeometryMs.push(performance.now() - t); }
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
          const visuals = P.projectileVisuals;
          const history = visuals?.mesh?.visible ? visuals.bodies : 0;
          // Current S3 projectile silhouettes and installed VTF volumes are
          // legitimate GPU presentation owners. A present history renderer
          // often intentionally owns zero heads while those meshes draw them.
          const shape = P.s3ShapeCounts || {};
          const s3 = ['body','slashH','slashV','shell','core','sparkles','sheets','drills']
            .reduce((sum, key) => sum + (Number.isFinite(shape[key]) && shape[key] > 0 ? shape[key] : 0), 0);
          const volume = G.fx?.inkVolumes?.isInkVolumes ? Math.max(0, G.fx.inkVolumes.metrics?.active ?? 0) : 0;
          const legacy = Math.max(0, P.blobs?.count ?? 0);
          const bodies = history + s3 + volume + legacy;
          perf.visualOwnerCounts.push({ history, s3, volume, legacy });
          perf.visualBodies.push(bodies);
          perf.visualVertices.push(visuals?.stats.vertexCount ?? null);
          if (bodies > 0) perf.nonemptyVisualRenders++;
        } else if (perf.warming) {
          warmup.renderSamples++; warmup.renderCalls.push(G.renderer.info.render.calls); warmup.triangles.push(G.renderer.info.render.triangles);
        }
      }
    };
  }, { minFrames: MIN_PERFORMANCE_FRAMES, timeoutMs: PERFORMANCE_TIMEOUT_MS, durationMs });
  const warmupTimeoutMs = 60000;
  const warmupHostStart = Date.now();
  await page.bringToFront();
  await page.evaluate(() => window.__inkwavePerfWarmupStart());
  let warmupWaitFailure = null;
  try {
    await page.waitForFunction(() => {
      const G = window.__G, warmup = window.__inkwavePerf?.warmup;
      return !!warmup && warmup.nativeFrames >= 3 && warmup.frameSamples >= 3 &&
        warmup.raf.length >= 3 && warmup.renderSamples >= 3 && warmup.fireCalls > 0 &&
        warmup.nonemptyProjectileUpdates > 0 && G.input.mouse.left === true && G.match.local?.intent.fire === true;
    }, null, { timeout: warmupTimeoutMs, polling: 100 });
  } catch (error) {
    warmupWaitFailure = error.message;
  }
  let warmupObserved = null;
  let warmupSnapshotFailure = null;
  try {
    warmupObserved = await page.evaluate(() => {
      const G = window.__G, g = window.__inkwave, perf = window.__inkwavePerf, w = perf.warmup;
      return {
        start: w.start,
        end: { frozen: !!g.frozen, visibilityState: document.visibilityState, hasFocus: document.hasFocus(),
          inputMouseLeft: G.input.mouse.left, actorIntentFire: !!G.match.local?.intent.fire,
          gameState: G.match.state, paused: G.match.paused,
          actor: { weapon: G.match.local.weaponId, alive: G.match.local.alive, ink: G.match.local.ink,
            pos: G.match.local.pos.toArray(), form: G.match.local.form, squidSpawn: G.match.local.s3?.squidSpawn?.phase ?? null,
            runnerCooldown: G.match.local.weaponRunner.cooldown } },
        elapsedMs: w.startedAt == null ? null : performance.now() - w.startedAt,
        nativeFrames: w.nativeFrames, frameSamples: w.frameSamples, projectileUpdates: w.projectileUpdates,
        nonemptyProjectileUpdates: w.nonemptyProjectileUpdates, fireCalls: w.fireCalls,
        renderSamples: w.renderSamples, renderCalls: w.renderCalls.at(-1) ?? null,
        triangles: w.triangles.at(-1) ?? null, rafSamples: w.raf.length, maxProjectiles: w.maxProjectiles,
        firstFrame: w.firstFrame, blurEvents: w.blurEvents, focusEvents: w.focusEvents,
        frameStates: w.frameStates,
        visibilityChanges: w.visibilityChanges,
      };
    });
  } catch (error) {
    warmupSnapshotFailure = error.message;
  }
  const warmupReceipt = {
    status: !warmupWaitFailure && !warmupSnapshotFailure && warmupObserved ? 'passed' : 'failed',
    admitted: !warmupWaitFailure && !warmupSnapshotFailure && !!warmupObserved &&
      warmupObserved.nativeFrames >= 3 && warmupObserved.frameSamples >= 3 && warmupObserved.rafSamples >= 3 &&
      warmupObserved.renderSamples >= 3 && warmupObserved.fireCalls > 0 && warmupObserved.nonemptyProjectileUpdates > 0 &&
      warmupObserved.end?.inputMouseLeft === true && warmupObserved.end?.actorIntentFire === true,
    timeoutMs: warmupTimeoutMs,
    elapsedHostMs: Date.now() - warmupHostStart,
    required: { nativeFrames: 3, frameSamples: 3, rAFSamples: 3, renderSamples: 3, fireCalls: 1,
      nonemptyProjectileUpdates: 1, inputMouseLeftAtAdmission: true, actorIntentFireAtAdmission: true },
    observed: warmupObserved,
    waitFailure: warmupWaitFailure,
    snapshotFailure: warmupSnapshotFailure,
  };
  report.performanceWarmups.push({ scenario: mobile ? 'mobile-emulated-long-fire' : 'desktop-long-fire', ...warmupReceipt });
  if (!warmupReceipt.admitted) {
    await page.evaluate(() => { __inkwave.debug.fire(false); __inkwavePerf.warming = false; __inkwave.debug.freeze(); }).catch(() => {});
    throw new Error(`${mobile ? 'mobile' : 'desktop'} native live-loop warmup did not admit the performance window: ${JSON.stringify(warmupReceipt)}`);
  }
  const cdpBefore = await cdp.send('Performance.getMetrics');
  try {
    await cdp.send('Tracing.start', { categories: 'v8,devtools.timeline', transferMode: 'ReportEvents' });
    gcTraceStarted = true;
  } catch (error) {
    gcTraceFailure = `Tracing.start failed: ${error.message}`;
  }
  await page.evaluate(() => { window.__inkwavePerfStart(); });
  const windowResult = await page.evaluate(() => window.__inkwavePerfDone);
  if (gcTraceStarted) {
    let timeoutId;
    try {
      await cdp.send('Tracing.end');
      const completion = await Promise.race([
        traceComplete,
        new Promise(resolve => { timeoutId = setTimeout(() => resolve(null), 15000); }),
      ]);
      if (!completion) gcTraceFailure = 'Tracing.tracingComplete was not received within 15 seconds';
    } catch (error) {
      gcTraceFailure = `Tracing.end failed: ${error.message}`;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  cdp.off('Tracing.dataCollected', onTraceData);
  cdp.off('Tracing.tracingComplete', onTraceComplete);
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
      windowStatus: perf.windowStatus,
      windowFailure: perf.windowFailure,
      startedAt: perf.startedAt, endedAt: perf.endedAt,
      elapsedMs: perf.endedAt - perf.startedAt,
      simulatedSeconds: G.time - perf.startGameTime,
      rAF: frames,
      nativeLoopTimestamps: perf.loopTimestamps,
      frameCpuMs: perf.frames,
      projectileCpuMs: perf.projectileMs,
      renderCpuMs: perf.renderMs,
      visualGeometryCpuMs: perf.visualGeometryMs,
      visualBodies: perf.visualBodies,
      visualVertices: perf.visualVertices,
      visualOwnerCounts: perf.visualOwnerCounts,
      nonemptyVisualRenders: perf.nonemptyVisualRenders,
      visualBackend: G.projectiles.projectileVisuals ? 'source-aware-history' : 'legacy-native',
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
  const selectedMetrics = ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'JSHeapUsedSize', 'Nodes', 'Documents'];
  const cdpAbsolute = {
    before: Object.fromEntries(selectedMetrics.filter(key => Number.isFinite(a[key])).map(key => [key, a[key]])),
    after: Object.fromEntries(selectedMetrics.filter(key => Number.isFinite(b[key])).map(key => [key, b[key]])),
  };
  for (const key of selectedMetrics) {
    if (Number.isFinite(a[key]) && Number.isFinite(b[key])) delta[key] = b[key] - a[key];
  }
  const rAF = summary(measured.rAF), cpu = summary(measured.frameCpuMs), proj = summary(measured.projectileCpuMs), render = summary(measured.renderCpuMs);
  const gpu = measured.gpuDisjoint ? null : summary(measured.gpuRenderMs);
  const loopIntervals = measured.nativeLoopTimestamps.slice(1).map((t, i) => t - measured.nativeLoopTimestamps[i]);
  const loopFrameMs = summary(loopIntervals);
  const fps = loopFrameMs?.p50 > 0 ? 1000 / loopFrameMs.p50 : null;
  if (windowResult.status !== 'passed' || measured.nativeLoopTimestamps.length < MIN_PERFORMANCE_FRAMES ||
      measured.frameCpuMs.length < MIN_PERFORMANCE_FRAMES || measured.renderCpuMs.length < MIN_PERFORMANCE_FRAMES ||
      !measured.projectileUpdates || !measured.nonemptyProjectileUpdates || !measured.fireCalls || !measured.maxProjectiles ||
      !measured.nonemptyVisualRenders || !rAF?.n || !fps) {
    report.performanceFailures.push({ scenario: mobile ? 'mobile-emulated-long-fire' : 'desktop-long-fire', measured });
    throw new Error(`${mobile ? 'mobile' : 'desktop'} performance window did not measure live native match firing/rendering: ${JSON.stringify({
      nativeFrames: measured.nativeLoopTimestamps.length, frameSamples: measured.frameCpuMs.length, renderSamples: measured.renderCpuMs.length,
      projectileUpdates: measured.projectileUpdates, nonemptyProjectileUpdates: measured.nonemptyProjectileUpdates,
      fireCalls: measured.fireCalls, maxProjectiles: measured.maxProjectiles, rAF: rAF?.n ?? 0,
      nonemptyVisualRenders: measured.nonemptyVisualRenders,
    })}`);
  }
  const gcSummary = gcTraceStarted && !gcTraceFailure ? (() => {
    const minor = gcEvents.filter(event => event.name === 'MinorGC');
    const major = gcEvents.filter(event => event.name === 'MajorGC');
    const totalGcDurationMs = gcEvents.reduce((total, event) => total + event.durationMs, 0);
    const kindSummary = rows => {
      const ms = rows.reduce((total, event) => total + event.durationMs, 0);
      return { count: rows.length, durationMs: ms, durationSec: ms / 1000 };
    };
    return {
      supported: true,
      source: 'CDP Tracing events named MinorGC and MajorGC; categories v8,devtools.timeline',
      windowDurationMs: measured.elapsedMs,
      count: gcEvents.length,
      durationMs: totalGcDurationMs,
      durationSec: totalGcDurationMs / 1000,
      minor: kindSummary(minor),
      major: kindSummary(major),
      eventNames: [...new Set(gcEvents.map(event => event.name))],
    };
  })() : {
    supported: false,
    reason: gcTraceFailure || 'CDP tracing unavailable',
    count: null,
    durationMs: null,
    durationSec: null,
    minor: null,
    major: null,
  };
  const record = {
    scenario: mobile ? 'mobile-emulated-long-fire' : 'desktop-long-fire',
    requestedDurationMs: durationMs, durationMs: measured.elapsedMs,
    minimumFrames: MIN_PERFORMANCE_FRAMES, timeoutMs: PERFORMANCE_TIMEOUT_MS,
    simulatedSeconds: measured.simulatedSeconds,
    viewport: measured.browser.viewport, deviceScaleFactor: measured.browser.dpr,
    browser: await page.evaluate(() => navigator.userAgent), fps, nativeLoopFrameMs: loopFrameMs, rAFms: rAF, frameCpuMs: cpu, projectileCpuMs: proj, renderCpuMs: render,
    warmup: warmupReceipt,
    renderCalls: summary(measured.renderCalls), triangles: summary(measured.triangles),
    visualGeometryCpuMs: summary(measured.visualGeometryCpuMs),
    renderedVisualBodies: summary(measured.visualBodies),
    visualOwnerCounts: measured.visualOwnerCounts,
    renderedVisualVertices: measured.visualBackend === 'source-aware-history' ? summary(measured.visualVertices) : null,
    visualBackend: measured.visualBackend, nonemptyVisualRenders: measured.nonemptyVisualRenders,
    nativeFrames: measured.nativeLoopTimestamps.length,
    projectileUpdates: measured.projectileUpdates,
    nonemptyProjectileUpdates: measured.nonemptyProjectileUpdates,
    fireCalls: measured.fireCalls,
    renderSamples: measured.renderCpuMs.length,
    rafSamples: measured.rAF.length,
    gpuRenderMs: gpu, gpuTimer: measured.gpuTimer, gpuDisjoint: measured.gpuDisjoint,
    renderer: measured.renderer, maxProjectiles: measured.maxProjectiles, gameplay: measured.game,
    cdpAbsolute,
    cdpDeltas: delta,
    garbageCollection: gcSummary,
    notes: ['Long-firing window uses the normal live match loop and debug fire input; slow software rendering extends the requested duration to collect at least 12 frames, bounded at 120 seconds.', 'GPU time is EXT_disjoint_timer_query when exposed; unavailable/disjoint is reported as such.', 'V8/devtools.timeline GC tracing brackets the firing window and adds instrumentation overhead to both builds.', 'Chromium mobile emulation is landscape and is not native Android.'],
  };
  return record;
  } catch (error) {
    performanceFailed = true;
    throw error;
  } finally {
    try { await close(); }
    catch (cleanupError) {
      if (!performanceFailed) throw cleanupError;
      report.browserDiagnostics.push({ event: 'streamed-music-cleanup-failed', route: 'performance', mobile,
        error: String(cleanupError?.message || cleanupError).slice(0, 1000) });
    }
  }
}

try {
  if (capture !== 'performance') {
    const visual = await openGameContext();
    let visualFailed = false;
    try { await runVisuals(visual.page); }
    catch (error) { visualFailed = true; throw error; }
    finally {
      try { await visual.close(); }
      catch (cleanupError) {
        if (!visualFailed) throw cleanupError;
        report.browserDiagnostics.push({ event: 'streamed-music-cleanup-failed', route: 'visual',
          error: String(cleanupError?.message || cleanupError).slice(0, 1000) });
      }
    }
  }
  if (capture !== 'visuals') {
    if (device !== 'mobile') report.performance.push(await runFiringPerformance({ mobile: false }));
    if (device !== 'desktop') report.performance.push(await runFiringPerformance({ mobile: true }));
  }
  report.errors.push(...mimeErrors);
  report.status = report.errors.length ? 'failed' : 'passed';
} catch (error) {
  report.status = 'failed'; report.error = error.stack || String(error); report.errors.push(...mimeErrors);
} finally {
  try { await browser.close(); }
  catch (cleanupError) {
    report.browserDiagnostics.push({ event: 'browser-cleanup-failed',
      error: String(cleanupError?.message || cleanupError).slice(0, 1000) });
    if (report.status !== 'failed') {
      report.status = 'failed';
      report.error = String(cleanupError?.stack || cleanupError).slice(0, 4000);
    }
  }
  const serverClosed = new Promise(resolve => server.close(resolve));
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
    error: report.error, errors: report.errors,
    browserDiagnostics: report.browserDiagnostics,
    pageErrors: mimeErrors.slice(-20),
    bootTimeoutMs: NATIVE_BOOT_TIMEOUT_MS,
    output: outfile, browserTrace: tracePath,
  }));
  await serverClosed;
}
if (report.status !== 'passed') process.exitCode = 1;
