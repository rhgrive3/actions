#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// Diagnostic-only; suitable for page.addInitScript serialization. No promise
// reactions are added: native fetch/read promises retain rejection observability.
export function installAudioRequestTrace(){
  const env=globalThis;if(env.__audioRequestTrace)return;
  const trace=env.__audioRequestTrace=[],signals=new WeakMap(),responses=new WeakMap(),streams=new WeakMap(),readers=new WeakMap(),byURL=new Map();
  const identities=new WeakMap();let nextIdentity=0;
  const identity=value=>value && (typeof value==='object'||typeof value==='function') ? (identities.get(value) || (identities.set(value,++nextIdentity),nextIdentity)) : null;
  env.__contextAudioOwnerSnapshot=()=>{
    const audio=env.RG?.audio,bank=audio?._weaponBank,pack=bank?.authorized,loader=audio?._realS3Loader,context=audio?.ctx;
    const cues=['shooter','combat:critical','combat:damage','combat:ink_focus_normal','combat:ink_focus_strong','combat:splat'];
    const loaded=pack?.loaded instanceof Map?[...pack.loaded.values()]:[];
    return {at:Date.now(),mono:env.performance?.now?.()??null,engine:identity(audio),context:identity(context),contextState:context?.state??null,
      bank:identity(bank),bankContext:identity(bank?.ctx),bankDisposed:bank?.disposed??null,loader:identity(loader),loaderBank:identity(loader?.bank),
      pack:identity(pack),generation:pack?.generation??null,pending:pack?.pending??null,loaderStatus:loader?.status??null,
      queuedKeys:loader?.inFlight instanceof Map?[...loader.inFlight.keys()].slice(0,128):[],loaderErrors:Array.isArray(loader?.errors)?loader.errors.slice(-16):[],
      packErrors:Array.isArray(pack?.errors)?pack.errors.slice(-16):[],
      cues:cues.map(id=>({id,declared:loader?.declares?.(id,'fire')??null,variants:loaded.filter(row=>row.id===id&&row.event==='fire').map(row=>({variant:row.variant,file:row.file,sha256:row.sha256??null}))}))};
  };
  const now=()=>({wall:Date.now(),mono:env.performance?.now?.()??null});
  const note=(event,row,extra={})=>{try{if(trace.length<512)trace.push({...now(),event,url:row?.url??null,id:row?.id??null,...extra});}catch{}};
  const errorInfo=e=>{try{return {name:String(e?.name??''),message:String(e?.message??e??'').slice(0,250)};}catch{return {name:'',message:'unavailable'};}};
  let serial=0;const nativeFetch=env.fetch;
  if(typeof nativeFetch==='function')env.fetch=function(input,options){
    const url=typeof input==='string'?input:(typeof env.URL==='function' && input instanceof env.URL ? input.href : ''),observe=/\/runtime\/audio\/s3-real\/[^/?#]+\.mp3(?:[?#]|$)/i.test(url);
    if(!observe||trace.length>=512)return Reflect.apply(nativeFetch,this,arguments);
    const row={url,id:++serial};let signal=null;
    try { const descriptor=options && Object.getOwnPropertyDescriptor(options,'signal'); if(descriptor && Object.hasOwn(descriptor,'value'))signal=descriptor.value; } catch {}
    note('fetch-start',row,{signal:!!signal});
    try { let candidates=byURL.get(url);if(!candidates)byURL.set(url,candidates=[]);candidates.push(row);
      if(signal){let set=signals.get(signal);if(!set){set=[];signals.set(signal,set);signal.addEventListener('abort',()=>{for(const item of set)note('signal-abort',item,{reason:errorInfo(signal.reason)});},{once:true});}set.push(row);}
    } catch { /* Observation must not alter fetch. */ }
    try{return Reflect.apply(nativeFetch,this,arguments);}catch(e){note('fetch-throw',row,{error:errorInfo(e)});throw e;}
  };
  // Match a browser Response to its URL without observing or replacing the
  // fetch promise. Concurrent identical URLs remain explicitly ambiguous.
  const responseProto=env.Response?.prototype,bodyDescriptor=responseProto&&Object.getOwnPropertyDescriptor(responseProto,'body');
  if(bodyDescriptor?.configurable&&typeof bodyDescriptor.get==='function')Object.defineProperty(responseProto,'body',{...bodyDescriptor,get(){
    const body=Reflect.apply(bodyDescriptor.get,this,[]);
    try{let row=responses.get(this);if(!row){const url=this.url,candidates=byURL.get(url);if(candidates?.length){row=candidates.length===1?candidates[0]:{url,id:null};if(candidates.length===1)byURL.delete(url);responses.set(this,row);note('body',row,{ambiguous:row.id===null});}}if(row&&body)streams.set(body,row);}catch{}
    return body;
  }});
  const ac=env.AbortController?.prototype,nativeAbort=ac?.abort;
  if(nativeAbort)ac.abort=function(...args){for(const row of signals.get(this.signal)||[])note('controller-abort',row,{stack:String(new Error().stack)});return Reflect.apply(nativeAbort,this,args);};
  const sp=env.ReadableStream?.prototype,nativeGetReader=sp?.getReader,nativeStreamCancel=sp?.cancel;
  if(nativeGetReader)sp.getReader=function(...args){const reader=Reflect.apply(nativeGetReader,this,args),row=streams.get(this);if(row){readers.set(reader,row);note('get-reader',row);}return reader;};
  if(nativeStreamCancel)sp.cancel=function(...args){const row=streams.get(this);if(row){row.cancelled=true;note('stream-cancel',row,{reason:errorInfo(args[0]),stack:String(new Error().stack)});}return Reflect.apply(nativeStreamCancel,this,args);};
  const rp=env.ReadableStreamDefaultReader?.prototype,nativeRead=rp?.read,nativeCancel=rp?.cancel,nativeRelease=rp?.releaseLock;
  if(nativeRead)rp.read=function(...args){const row=readers.get(this);if(row){row.readCalls=(row.readCalls||0)+1;note('read-call',row);}try{return Reflect.apply(nativeRead,this,args);}catch(e){if(row)note('read-throw',row,{error:errorInfo(e)});throw e;}};
  if(nativeCancel)rp.cancel=function(...args){const row=readers.get(this);if(row){row.cancelled=true;note('reader-cancel',row,{reason:errorInfo(args[0]),stack:String(new Error().stack)});}return Reflect.apply(nativeCancel,this,args);};
  if(nativeRelease)rp.releaseLock=function(...args){const row=readers.get(this),stack=row?String(new Error().stack):'';const result=Reflect.apply(nativeRelease,this,args);if(row)note('reader-release',row,{stack,encodedBodyCompleted:stack.includes('encoded-response.mjs')&&!!row.readCalls&&!row.cancelled});return result;};
}

// Every phase emitted by the shared menu helper has an explicit native control
// admission. Unknown phases fail closed rather than skipping the input guard.
export function contextMenuControlForPhase(label) {
  const phases = {
    'native main menu readiness': { selector: '.iw-main [data-id="play"]', menu: 'main' },
    'native mode menu': { selector: '.iw-modesel [data-id="mode-turf"]', menu: 'mode' },
    'native turf pointer readiness': { selector: '.iw-modesel [data-id="mode-turf"]', menu: 'mode' },
    'native setup menu': { selector: '.iw-setup [data-id="map-tidewater"]', menu: 'setup' },
  };
  assert(Object.hasOwn(phases,label), 'Unknown native menu phase: ' + label);
  return phases[label];
}

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

  // Observe all native startup audio network activity before deliberately
  // destroying the WebGL context. Keep normal failure reporting fail-closed.
  const audioIdle = globalThis.__awaitContextRecoveryAudioIdle;
  check(typeof audioIdle === 'function', 'Missing audio network settlement guard');
  await audioIdle();
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
  // Persist progress before awaiting: a rejected observation must still leave
  // evidence, without treating incomplete callbacks as terminal acceptance.
  const observation = receipt.rafObservation = { callbacks: 0, timestamps: [], startedAt: performance.now(), elapsed: 0, status: 'pending' };
  const observationState = () => {
    let platform = null, platformError = null;
    try { platform = g.platform?.snapshot?.() ?? null; } catch (error) { platformError = String(error); }
    return { at: performance.now(), hidden: document.hidden, visibilityState: document.visibilityState,
      hasFocus: document.hasFocus(), platform, platformError };
  };
  observation.before = observationState();
  const captureAfterAttempts = () => {
    receipt.afterResumeAttempts = snapshot();
    receipt.identities = { match: G.match === matchIdentity, paint: G.paint === paintIdentity, grid: paint.grid === grid,
      counts: paint.counts === counts, overlay: g.R._contextRecoveryOverlay === overlay,
      everyGridByte: grid.length === savedGrid.length && grid.every((value, i) => value === savedGrid[i]) };
    receipt.dialog = { count: document.querySelectorAll('.iw-webgl-recovery').length, role: overlay.getAttribute('role'),
      connected: overlay.isConnected, buttons: overlay.querySelectorAll('button').length, text: overlay.textContent };
    receipt.terminal = { contextLost: g.R._contextLost, glRestored: !gl.isContextLost(), frozen: g.frozen,
      startResult, attractResult, observedRAF: receipt.rafObservation.callbacks, directFrames: 60 };
  };
  try {
    await new Promise((resolve, reject) => {
      let pendingRAF = null;
      const timer = setTimeout(() => {
        if (pendingRAF !== null) cancelAnimationFrame(pendingRAF);
        pendingRAF = null;
        observation.status = 'timed-out';
        reject(Error('Native RAF observation did not complete'));
      // The same 120 real callbacks take ~22 s at the 5.5 fps observed on
      // heavily loaded CI SwiftShader. Keep every frame/state assertion while
      // allowing scheduling latency; a missing RAF still fails boundedly.
      }, 45000);
      const next = timestamp => {
        pendingRAF = null;
        observation.timestamps.push(timestamp);
        observation.callbacks++;
        observation.elapsed = performance.now() - observation.startedAt;
        if (observation.callbacks === 120) {
          clearTimeout(timer); observation.status = 'complete'; resolve();
        } else pendingRAF = requestAnimationFrame(next);
      };
      pendingRAF = requestAnimationFrame(next);
    });
  } finally {
    observation.elapsed = performance.now() - observation.startedAt;
    observation.after = observationState();
    // Diagnostic collection must not replace the original timeout rejection.
    try { captureAfterAttempts(); } catch (error) {
      receipt.postAttemptDiagnosticError = String(error);
      if (observation.status === 'complete') throw error;
    }
  }
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
  const tree = new Map(execFileSync('git', ['ls-tree', '-r', '-z', sourceSha], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).split('\0').filter(Boolean).map(row => { const [meta, file] = row.split('\t'); return [file, meta.split(' ')[2]]; }));
  const sourceInputs = Object.entries(build.files).map(([key, digest]) => { const file = recoveryInputPath(key); assert.equal(hash(fs.readFileSync(path.join(root, file))), digest, key); return file; });
  assert.equal(hash(fs.readFileSync(path.join(root, 'scripts/build-inkwave.mjs'))), build.build.script, 'Build pipeline mismatch');
  sourceInputs.push('scripts/build-inkwave.mjs', 'scripts/check-inkwave-context-recovery-browser.mjs',
    'scripts/lib/inkwave-projectile-menu-start.mjs', 'scripts/lib/inkwave-range-menu-entry.mjs');
  const blobs = execFileSync('git', ['hash-object', '--', ...sourceInputs], { cwd: root, encoding: 'utf8' }).trim().split('\n');
  sourceInputs.forEach((file, i) => assert.equal(blobs[i], tree.get(file), 'Build input differs from checkout: ' + file));
  const required = ['src/main.js', 'src/core/renderer.js', 'patches/splatoon3/runtime/clock.mjs', 'patches/splatoon3/runtime/recovery-gate.mjs'];
  for (const file of ['inkwave-public/src/main.js', 'inkwave-public/src/core/renderer.js', 'patches/splatoon3/runtime/clock.mjs', 'patches/splatoon3/runtime/recovery-gate.mjs']) assert(sourceInputs.includes(file), 'Required source input omitted from identity: ' + file);
  const moduleHashes = Object.fromEntries(required.map(file => { const digest = build.artifacts[file]; assert(digest, 'Missing required emitted module: ' + file); return [file, digest]; }));
  const errors = [], consoleMessages = [], requests = [], httpFailures = [], events = [], served = new Set(), audioNetwork = [];
  // Preserve strict zero-failure acceptance while classifying request cancellations.
  const requestDiagnostics = [], failedRequestURLs = new Set();
  let requestPhase = 'startup';
  const recordRequestDiagnostic = (event, request) => {
    if (requestDiagnostics.length >= 64) return;
    let timing = null, timingError = null;
    try { timing = request.timing(); } catch (error) { timingError = String(error); }
    requestDiagnostics.push({ event, phase: requestPhase, at: new Date().toISOString(),
      url: request.url(), resourceType: request.resourceType(), timing, timingError,
      failure: request.failure()?.errorText ?? null });
  };
  let preLossAudio = null;
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.mp3': 'audio/mpeg' };
  const server = http.createServer((req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname), file = path.resolve(site, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(site + path.sep) || !fs.statSync(file).isFile()) throw Error('Missing file');
      // Chromium can report a streamed no-store response aborted after EOF: https://github.com/microsoft/playwright/issues/42742
      const cacheControl = path.extname(file) === '.html' ? 'no-store' : 'no-cache, max-age=0, must-revalidate';
      served.add(path.relative(site, file)); res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': cacheControl });
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
    const pendingAudio = new Set();
    const audioRequest = r => /\.(?:mp3|ogg|wav)(?:[?#]|$)/i.test(r.url());
    page.on('request', r => { if (audioRequest(r)) pendingAudio.add(r); });
    page.on('request', r => { if (audioRequest(r) && audioNetwork.length < 512) audioNetwork.push({event:'start',url:r.url(),at:Date.now()}); });
    page.on('requestfinished', r => pendingAudio.delete(r));
    page.on('requestfinished', r => { if (audioRequest(r) && audioNetwork.length < 512) audioNetwork.push({event:'finished',url:r.url(),at:Date.now(),timing:r.timing()}); });
    await page.exposeFunction('__awaitContextRecoveryAudioIdle', async () => {
      // Wait only for a stable quiet period, never suppress a failed request.
      const deadline = Date.now() + 30000;
      let quietSince = null;
      for (;;) {
        const now = Date.now();
        if (pendingAudio.size === 0) {
          quietSince ??= now;
          if (now - quietSince >= 750) break;
        } else quietSince = null;
        assert(now < deadline, 'Native startup audio fetch did not settle');
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      try { preLossAudio = await page.evaluate(() => globalThis.__contextAudioOwnerSnapshot?.() ?? null); }
      catch (error) { preLossAudio = { diagnosticError:String(error?.message || error) }; }
      assert.deepEqual(requests, [], 'Audio startup produced failed network requests');
      assert.deepEqual(httpFailures, [], 'Audio startup returned HTTP errors');
    });
    page.on('pageerror', e => errors.push(e.message)); page.on('crash', () => events.push('crash')); page.on('close', () => events.push('close'));
    page.on('response', r => { if (r.status() >= 400 && httpFailures.length < 32) httpFailures.push({ url: r.url(), status: r.status() }); });
    page.on('response', r => { if (audioRequest(r.request()) && audioNetwork.length < 512) audioNetwork.push({event:'headers',url:r.url(),at:Date.now(),status:r.status()}); });
    page.on('requestfailed', r => { pendingAudio.delete(r); if (requests.length < 32) requests.push({ url: r.url(), error: r.failure()?.errorText }); });
    page.on('requestfailed', r => { if (audioRequest(r) && audioNetwork.length < 512) audioNetwork.push({event:'failed',url:r.url(),error:r.failure()?.errorText,at:Date.now(),timing:r.timing()}); });
    page.on('requestfailed', r => {
      if (failedRequestURLs.size < 32) failedRequestURLs.add(r.url());
      recordRequestDiagnostic('failed', r);
    });
    page.on('requestfinished', r => {
      if (failedRequestURLs.has(r.url())) recordRequestDiagnostic('same-url-finished-after-failure', r);
    });
    page.on('console', m => { if (consoleMessages.length < 32) consoleMessages.push({ type: m.type(), text: m.text().slice(0, 1500) }); });
    // Diagnostic only. Observe the actual owner that calls AbortController,
    // without delaying, replacing or suppressing any native audio/network call.
    await page.addInitScript(() => {
      const original = AbortController.prototype.abort;
      globalThis.__inkwaveAudioAbortTrace = [];
      AbortController.prototype.abort = function(...args) {
        const stack = new Error('AbortController source').stack || '';
        if (stack.includes('load-deadline.mjs') || stack.includes('authorized-samples.mjs')) {
          const trace = globalThis.__inkwaveAudioAbortTrace;
          if (trace.length < 80) trace.push({ at: performance.now(), reason: String(args[0]?.message || args[0] || ''), stack: stack.slice(0, 2400) });
        }
        return Reflect.apply(original, this, args);
      };
    });
    await page.addInitScript(installAudioRequestTrace);
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
        const control = contextMenuControlForPhase(label);
        await page.waitForFunction(rangeMenuControlReady, control, { timeout: remainingMs() });
        lastStage = label;
      },
    });
    lastStage = 'trusted-start-clicked';
    await page.waitForFunction(() => RG.mode === 'match' && RG.game.match === RG.match && RG.match?.state === 'playing' && !RG.match.attract && RG.match.local?.isLocal && RG.match.controller && RG.game.hud?._visible && !document.querySelector('.iw-lineup'), null, { timeout: remainingMs() });
    startup.gestures = await page.evaluate(() => __contextStartupGestures);
    startup.admission = await page.evaluate(() => ({ mode: RG.mode, state: RG.match.state, attract: !!RG.match.attract,
      local: !!RG.match.local?.isLocal, sameMatch: RG.game.match === RG.match, audioState: RG.audio?.ctx?.state,
      recordedShooterFire: RG.audio?._weaponBank?.authorized?.byEvent?.has('shooter:fire') === true,
      audioOwner:(()=>{try{return globalThis.__contextAudioOwnerSnapshot?.() ?? null;}catch(error){return {diagnosticError:String(error?.message || error)};}})() }));
    validateContextStartupReceipt(startup); lastStage = 'playing';
    requestPhase = 'context-proof';
    const proof = await page.evaluate(nativeContextRecoveryProof); validateContextRecoveryReceipt(proof);
    requestPhase = 'post-context-proof';
    assert.equal(await page.locator('.iw-webgl-recovery').isVisible(), true);
    assert.deepEqual(errors, []); assert.deepEqual(requests, []); assert.deepEqual(httpFailures, []); assert.deepEqual(events, []);
    for (const file of required) assert(served.has(file) || served.has('_versions/' + build.build.revision + '/' + file), 'Required emitted module was not served: ' + file);
    result = { ok: true, browser: browser.version(), identity, startup, proof }; lastStage = 'accepted';
  } catch (error) {
    primary = error;
    let partial = null, diagnosticError = null;
    if (page && !page.isClosed() && !events.includes('crash')) try { partial = await page.evaluate(() => ({ proof: globalThis.__contextRecoveryReceipt || null, startupGestures: globalThis.__contextStartupGestures || [] })); } catch (e) { diagnosticError = e.message; }
    result = { ok: false, error: error.stack || String(error), partial, diagnosticError };
    if (page && !page.isClosed() && !events.includes('crash')) try {
      result.audioCancellation = await page.evaluate(() => ({
        aborts: (globalThis.__inkwaveAudioAbortTrace || []).slice(-80),
        authorized: globalThis.RG?.audio?._weaponBank?.authorized?.stats?.() ?? null,
        realS3: globalThis.RG?.audio?._realS3Loader?.stats?.() ?? null,
      }));
      console.error('Context recovery audio cancellation provenance:', JSON.stringify(result.audioCancellation));
    } catch (diagnosticFailure) {
      result.audioCancellationError = String(diagnosticFailure?.message || diagnosticFailure);
    }
  } finally {
    let audioTrace = null, audioOwnerFinal = null;
    if (page && !page.isClosed() && !events.includes('crash')) try { ({audioTrace,audioOwnerFinal} = await page.evaluate(() => ({audioTrace:globalThis.__audioRequestTrace ?? null,audioOwnerFinal:globalThis.__contextAudioOwnerSnapshot?.() ?? null}))); } catch {}
    result = { ...result, audioNetwork, audioTrace, audioOwnerFinal, preLossAudio, startup, lastStage, harnessBlobs: Object.fromEntries(sourceInputs.slice(-3).map(file => [file, tree.get(file)])), build: { sourceSha, verifiedSourceInputs: sourceInputs.length, revision: build.build.revision, inputHash: build.inputHash, contentHash: build.contentHash }, moduleHashes, errors, requests, requestDiagnostics, httpFailures, consoleMessages, events: [...events], served: [...served].sort() };
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
