// Optional ?profileRange=1 attribution. Not imported by ordinary gameplay.
// No gl.finish/readPixels, no blocking GPU queries, no uploaded telemetry.
// GPU timing measures sampled WebGL scene/compositor commands, NOT display presentation.
export function createGpuRenderTimer(renderer, { every = 8, maxPending = 3 } = {}) {
  let gl = null, ext = null, enabled = false, active = null, count = 0;
  const pending = [];
  let status = 'unsupported';
  try {
    if (renderer?.capabilities?.isWebGL2 === true) {
      gl = renderer.getContext();
      ext = gl?.getExtension?.('EXT_disjoint_timer_query_webgl2');
      enabled = !!(ext && typeof gl.createQuery === 'function'
        && typeof gl.beginQuery === 'function' && typeof gl.getQueryParameter === 'function');
    }
    if (enabled) status = 'sampling';
  } catch { enabled = false; status = 'unsupported'; }
  const discard = (item) => { try { gl.deleteQuery(item.query); } catch {} };
  return {
    get status() { return status; },
    begin(id) {
      if (!enabled || active || ++count % every !== 0 || pending.length >= maxPending) return false;
      let query = null;
      try {
        query = gl.createQuery();
        if (!query) return false;
        gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
        active = { id, query };
        return true;
      } catch {
        if (query) discard({ query });
        status = 'error';
        enabled = false;
        return false;
      }
    },
    end() {
      if (!active) return;
      const item = active;
      active = null;
      try {
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        pending.push(item);
      } catch {
        discard(item);
        enabled = false;
        status = 'error';
      }
    },
    poll() {
      if (!enabled || !pending.length) return [];
      const results = [];
      try {
        // GPU disjoint means timing values cannot be trusted.
        if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
          for (const p of pending) discard(p);
          pending.length = 0;
          status = 'disjoint';
          return results;
        }
        // Results are read ONLY after QUERY_RESULT_AVAILABLE. No wait on GPU.
        while (pending.length) {
          const p = pending[0];
          if (!gl.getQueryParameter(p.query, gl.QUERY_RESULT_AVAILABLE)) break;
          pending.shift();
          const nanos = gl.getQueryParameter(p.query, gl.QUERY_RESULT);
          discard(p);
          if (Number.isFinite(nanos) && nanos >= 0) {
            results.push({ id: p.id, ms: nanos / 1e6 });
            status = 'sampling';
          }
        }
      } catch {
        for (const p of pending) discard(p);
        pending.length = 0;
        enabled = false;
        status = 'error';
      }
      return results;
    },
    dispose() {
      if (active) { try { gl?.endQuery(ext.TIME_ELAPSED_EXT); } catch {} discard(active); active = null; }
      for (const p of pending) discard(p);
      pending.length = 0;
      enabled = false;
    },
  };
}

const round = n => Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
const utf8Bytes = text => new TextEncoder().encode(text).byteLength;
const installedTracers = new WeakMap();
// Compatibility labels refer to one measured call, not nested instrumentation.
const nativeScopeAliases = Object.freeze({
  'physics-ray': 'world-ray',
  'paint-splat': 'paint-stamp',
});

export function installHitchTracer(game, {
  env = globalThis, now = () => performance.now(), maxFrames = 360, gpuEvery = 8,
} = {}) {
  if (!game || typeof game._frame !== 'function') throw new TypeError('Game._frame required');
  if (!Number.isInteger(maxFrames) || maxFrames < 30 || maxFrames > 2000) throw new RangeError('invalid frame capacity');
  if (installedTracers.has(game)) return installedTracers.get(game);
  const current = [], hitches = [], recentTasks = [];
  // Explicit, opt-in capture is separate from the small rolling HUD sample.
  // Store immutable record-time snapshots so delayed GPU/long-task delivery
  // cannot silently grow the byte budget after admission.
  let capture = null;
  const finishCapture = reason => {
    if (capture?.status === 'recording') {
      capture.status = 'stopped';
      capture.reason = reason;
      capture.elapsedMs = round(Math.max(0, now() - capture.startedAt));
    }
  };
  const captureJSON = () => {
    if (capture?.status === 'recording' && now() - capture.startedAt >= capture.durationMs)
      finishCapture('duration-limit');
    return capture ? JSON.stringify({
      schema: 'inkwave-bounded-frame-capture-v1',
      status: capture.status, reason: capture.reason,
      durationLimitMs: capture.durationMs, elapsedMs: capture.elapsedMs,
      frameLimit: capture.frameLimit, byteLimit: capture.byteLimit,
      recordedFrames: capture.rows.length, observedFrames: capture.observedFrames,
      sampling: 'every recorded Game._frame; capped rAF callbacks excluded; no resampling',
      timing: 'CPU snapshots at record time; only asynchronous GPU timer results can settle later, never forced or fabricated',
      byteScope: 'UTF-8 bytes of this compact capture object; excludes outer rolling report',
      frames: capture.rows,
    }) : null;
  };
  const originalFrame = game._frame;
  const originalFrameDescriptor = Object.getOwnPropertyDescriptor(game, '_frame');
  let active = null, last = null, previousStamp = 0, nextId = 0, disposed = false;
  let longTasks = 0, longTaskSupported = false, observer = null;
  let gpuTimer = null, paintGpuTimer = null; const pendingEvents = [];
  const stageState = new Map();

  const getWorld = () => env?.__G || {};
  const stageOwners = () => {
    const G = getWorld();
    const owners = [
      ['simulation', game.match, 'update'],
      ['projectiles', G.projectiles, 'update'],
      ['paint', G.paint, 'flush'],
      ['environment', G.env, 'update'],
      ['fx', G.fx, 'update'],
      ['camera', game.rig, 'update'],
      ['render', game.R, 'render'],
      ['showcase', game.showcase, 'render'],
      ['hud', game, '_updateHud'],
    ];
    // Opt-in live Shooter/paint diagnosis, including the normal Practice Range.
    // Inclusive nested scopes are NOT additive. Count very hot block queries
    // without per-call clocks to avoid adding profiler overhead to every ray.
    owners.push(
      ['shooter-fire', G.projectiles, 'fireShooter'],
      ['shooter-hud-preview', G.projectiles, 'muzzleBlockFeedback'],
      ['shooter-impact-preview', G.projectiles, 's3ShooterImpact'],
      ['projectile-step', G.projectiles, '_step'],
      ['ink-head-step', G.projectiles?.inkFlight, 'stepHead'],
      ['ink-detached-drops', G.projectiles?.inkFlight, 'updateDrops'],
      ['paint-stamp', G.paint, 'splat'],
      ['paint-cpu-grid', G.paint, '_cpuSplat'],
      ['paint-atlas-submit', G.paint, '_drawQuads'],
      ['paint-simulation', G.paint, 'advanceSimulation'],
      ['world-ray', G.physics, 'raycast'],
      ['world-segment', G.physics, 'segment'],
      ['block-query', G.level, 'queryBlocks'],
      ['fx-droplets', G.fx, '_updateDrops'],
      ['fx-muzzle', G.fx, 'muzzle'],
      ['audio-voice', G.audio, 'play']
    );
    // Deep attribution runs ONLY in the existing opt-in ?profileRange=1.
    // Inclusive nested timings deliberately overlap: a bot/character call
    // is part of simulation, a ground ray is part of physics, etc.
    if (G.level?.native) {
      const w = G.level.triangleWorld, physics = G.physics, nav = G.nav;
      owners.push(
        ['source-ray', w, 'ray'], ['source-box', w, 'queryBox'],
        ['source-sweep', w, 'sweepSphere'],
        ['source-capsule-distance', w, '_capsuleDistance'],
        ['native-contact', physics, '_nativeContacts'],
        ['body-collision', physics, 'collideBody'],
        ['ground-ring', physics, 'groundProbe'],
        ['route-search', nav, 'path'],
        ['paint-region', G.paint, 'regionStats']
      );
      const actors = G.match?.actors || [];
      for (let i = 0; i < actors.length; i++) {
        const a = actors[i];
        owners.push(['actor-'+i, a, 'update'], ['brain-'+i, a.bot, 'update'],
          ['character-'+i, a.character, 'update']);
      }
    }
    return owners;
  };
  const note = (event, data) => {
    const item = { event, atMs: active ? round(now() - active.start) : null, ...(data || {}) };
    if (active) active.events.push(item);
    else pendingEvents.push(item);
  };
  const restoreBinding = prior => {
    // Other extensions may retain a wrapper in their own closure. Retired
    // wrappers must become transparent even when they cannot be unlinked.
    prior.enabled = false;
    if (prior.owner?.[prior.method] !== prior.wrapper) return;
    // An extension can freeze an object after instrumentation. A disabled
    // retained wrapper is still transparent; failure to unlink it must not
    // abort cleanup of all the other owners, timers and observer.
    try {
      if (prior.descriptor) Object.defineProperty(prior.owner, prior.method, prior.descriptor);
      else delete prior.owner[prior.method];
    } catch {}
  };
  const rebind = () => {
    const owners = stageOwners();
    // World swaps replace stage/actor owners. Do not retain old native actor
    // objects (and their complete Character graphs) just because the debug
    // recorder stays open across several matches.
    const next = new Map(owners.map(entry => [entry[0], entry]));
    // Restore every stale slot before installing any replacement. Otherwise
    // actor reordering can capture another slot's still-installed wrapper.
    for (const [name, prior] of stageState) {
      if (name === 'dynamicScale') continue;
      const entry = next.get(name);
      if (entry && entry[1] === prior.owner && entry[2] === prior.method &&
          prior.owner?.[prior.method] === prior.wrapper) continue;
      restoreBinding(prior);
      stageState.delete(name);
    }
    for (const [name, owner, method] of owners) {
      if (!owner || typeof owner[method] !== 'function' || stageState.has(name)) continue;
      const original = owner[method];
      const binding = { owner, method, original, enabled: true,
        descriptor: Object.getOwnPropertyDescriptor(owner, method) };
      const wrapper = function (...args) {
        if (!binding.enabled || disposed) return original.apply(this, args);
        const rec = active;
        if (!rec) return original.apply(this, args);
        const countOnly = name === 'source-capsule-distance' || name === 'block-query';
        const t = rec && !countOnly ? now() : 0;
        let gpuStarted = false, timer = null;
        if (rec && (name === 'render' || name === 'paint')) {
          if (name === 'render') {
            if (!gpuTimer) gpuTimer = createGpuRenderTimer(game.R?.renderer, { every: gpuEvery });
            timer = gpuTimer;
          } else {
            if (!paintGpuTimer) paintGpuTimer = createGpuRenderTimer(game.R?.renderer, { every: gpuEvery });
            timer = paintGpuTimer;
          }
          gpuStarted = timer.begin(rec.id);
        }
        try {
          return original.apply(this, args);
        } finally {
          if (gpuStarted) timer.end();
          if (rec) {
            rec.calls[name] = (rec.calls[name] || 0) + 1;
            if (!countOnly) rec.cpu[name] = (rec.cpu[name] || 0) + Math.max(0, now() - t);
          }
        }
      };
      owner[method] = wrapper;
      binding.wrapper = wrapper;
      stageState.set(name, binding);
    }
    const owner = game.R, method = 'setDynamicScale', name = 'dynamicScale';
    const prior = stageState.get(name);
    if (prior && (owner !== prior.owner || owner?.[method] !== prior.wrapper)) {
      restoreBinding(prior);
      stageState.delete(name);
    }
    if (owner && typeof owner[method] === 'function' && !stageState.has(name)) {
      const original = owner[method];
      const binding = { owner, method, original, enabled: true,
        descriptor: Object.getOwnPropertyDescriptor(owner, method) };
      const wrapper = function (scale) {
        if (!binding.enabled || disposed) return original.apply(this, arguments);
        const old = this.dynScale;
        const t = now();
        try { return original.apply(this, arguments); }
        finally {
          if (old !== this.dynScale) {
            note('render-target-resize', { from: round(old), to: round(this.dynScale),
              cpuMs: round(now() - t) });
          }
        }
      };
      owner[method] = wrapper;
      binding.wrapper = wrapper;
      stageState.set(name, binding);
    }
  };

  // PerformanceObserver entries can be delivered one or more frames late.
  try {
    const Observer = env?.PerformanceObserver;
    if (Observer && (!Observer.supportedEntryTypes ||
      Observer.supportedEntryTypes.includes('longtask'))) {
      observer = new Observer((list) => {
        for (const item of list.getEntries()) {
          longTasks++;
          recentTasks.push({ at: item.startTime, ms: item.duration });
          if (recentTasks.length > 60) recentTasks.shift();
          // Browser longtask observations are asynchronous; attach them to
          // already-recorded frames too, not only the next callback.
          for (const rec of current) {
            if (item.startTime < rec.start - 2 || item.startTime > rec.end + 2) continue;
            rec.longTaskMs = Math.max(rec.longTaskMs || 0, item.duration);
            rec.cause = classify(rec);
          }
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
      longTaskSupported = true;
    }
  } catch { observer?.disconnect?.(); observer = null; }

  const wrappedFrame = function (...args) {
    if (disposed) return originalFrame.apply(this, args);
    rebind();
    const rec = { id: ++nextId, start: now(), cpu: Object.create(null), calls: Object.create(null), events: pendingEvents.splice(0), gpuMs: null, gpuPaintMs: null };
    // Read the existing ray/sphere-sweep counters in O(1), without graphics sync.
    // Box queries and capsule-distance work are separate opt-in method counters
    // installed above; the capsule wrapper counts calls without per-call timing.
    const sourceWorld = getWorld().level?.triangleWorld;
    const beforeTicks = game.s3Clock?.ticks || 0;
    const beforeQueued = game.s3Clock?.accumulator || 0;
    const beforeQueries = sourceWorld?.queryCount || 0;
    const beforeTriangles = sourceWorld?.triangleTests || 0;
    active = rec;
    try { return originalFrame.apply(this, args); }
    finally {
      rec.end = now();
      rec.fixedClock = { elapsedSeconds: Number.isFinite(args[0]) ? args[0] : null,
        ticks: Math.max(0, (game.s3Clock?.ticks || 0) - beforeTicks),
        queuedBeforeSeconds: beforeQueued, queuedAfterSeconds: game.s3Clock?.accumulator || 0 }; 
      if (sourceWorld) {
        rec.sourceBVH = {
          queries: Math.max(0, sourceWorld.queryCount-beforeQueries),
          triangleTests: Math.max(0, sourceWorld.triangleTests-beforeTriangles),
        };
      }
      // Copy compatibility labels once per frame, never once per ray/stamp.
      // Counts and inclusive durations intentionally reference the same work.
      rec.scopeAliases = getWorld().level?.native ? nativeScopeAliases : null;
      if (rec.scopeAliases) {
        for (const [alias, canonical] of Object.entries(rec.scopeAliases)) {
          if (canonical in rec.calls) rec.calls[alias] = rec.calls[canonical];
          if (canonical in rec.cpu) rec.cpu[alias] = rec.cpu[canonical];
        }
      }
      active = null;
      last = rec;
    }
  };
  game._frame = wrappedFrame;

  const classify = rec => {
    const budget = 1000 / Math.max(1, rec.targetHz || 60);
    const worst = Object.entries(rec.cpu).sort((a,b)=>b[1]-a[1])[0];
    if (rec.workMs > budget * 0.85) {
      return worst ? 'CPU / '+worst[0] : 'CPU / unclassified';
    }
    if (rec.gpuPaintMs !== null && rec.gpuPaintMs > budget * 0.85) return 'GPU paint atlas (sampled)';
    if (rec.gpuMs !== null && rec.gpuMs > budget * 0.85) return 'GPU scene/compositor (sampled)';
    if (rec.longTaskMs >= 50) return 'browser main-thread long task';
    if (rec.frameGapMs > Math.max(34, budget * 1.6)) return 'GPU / compositor / scheduling (undetermined)';
    return 'within budget';
  };
  const attachGpu = () => {
    for (const [timer, field] of [[gpuTimer,'gpuMs'],[paintGpuTimer,'gpuPaintMs']]) {
      for (const result of timer?.poll?.() || []) {
        const rec = current.find(f=>f.id===result.id) || hitches.find(f=>f.id===result.id);
        // A bounded capture retains its own serialized CPU snapshot, including
        // frames already evicted from the HUD ring. GPU timestamps arrive later.
        const captured = capture?.rowById?.get(result.id);
        if (captured) captured[field==='gpuMs'?'gpuCommandsMs':'gpuPaintCommandsMs']=round(result.ms);
        if (rec) {
          rec[field] = round(result.ms);
          rec.cause = classify(rec);
        }
      }
    }
  };
  const frameReport = (stamp, ms, data = {}) => {
    if (disposed) return;
    // Register the current frame before polling completed GPU samples.
    // A fast query can already be available in this very first record call.
    if (!last) return;
    const rec = last;
    last = null;
    rec.stamp = stamp; rec.workMs = round(ms); rec.targetHz = data.frameRateHz || 60;
    rec.frameGapMs = previousStamp ? round(stamp - previousStamp) : null;
    previousStamp = stamp;
    rec.scale = round(data.scale ?? game.R?.dynScale ?? 1);
    rec.mode = data.phase || 'unknown';
    rec.longTaskMs = 0;
    for (const task of recentTasks) {
      if (task.at >= rec.start - 2 && task.at <= rec.end + 2)
        rec.longTaskMs = Math.max(rec.longTaskMs, task.ms);
    }
    rec.cause = classify(rec);
    current.push(rec);
    if (current.length > maxFrames) current.shift();
    const budget = 1000 / rec.targetHz;
    if ((rec.frameGapMs != null && rec.frameGapMs > Math.max(34,budget*1.6)) ||
        rec.workMs > Math.max(24,budget*1.3) || rec.events.length) {
      hitches.push(rec);
      if (hitches.length > 40) hitches.shift();
    }
    attachGpu();
    if (capture?.status === 'recording') {
      const elapsed = Math.max(0, now() - capture.startedAt);
      capture.elapsedMs = round(elapsed);
      // Half-open capture window: the frame completing at/after the deadline
      // ends the capture and is not attributed to the preceding 30 seconds.
      if (elapsed >= capture.durationMs) finishCapture('duration-limit');
      else {
        capture.observedFrames++;
        const row = {elapsedMs:capture.elapsedMs,
          stageId:getWorld().level?.manifest?.id ?? getWorld().level?.layout?.id ?? null,
          ...serialize(rec)};
        // Reserve at least 4 KiB for metadata and 48 UTF-8 bytes per frame
        // for two pending GPU numbers replacing null; never exceed byteLimit.
        const size = utf8Bytes(JSON.stringify(row)) + (capture.rows.length ? 1 : 0) + 48;
        if (capture.rowBytes + size > capture.byteLimit - 4096) finishCapture('byte-limit');
        else {
          capture.rows.push(row);
          capture.rowById.set(rec.id,row);
          capture.rowBytes += size;
          if (capture.rows.length >= capture.frameLimit) finishCapture('frame-limit');
        }
      }
    }
  };
  const serialize = (rec) => ({
    id:rec.id, mode:rec.mode, gapMs:round(rec.frameGapMs),
    workMs:round(rec.workMs), targetHz:rec.targetHz, scale:rec.scale,
    gpuCommandsMs:rec.gpuMs, gpuPaintCommandsMs:rec.gpuPaintMs, longTaskMs:round(rec.longTaskMs),
    stages:Object.fromEntries(Object.entries(rec.cpu).map(([k,v])=>[k,round(v)])),
    sourceBVH: rec.sourceBVH || null,
    sourceBVHCounterCoverage: rec.sourceBVH ? 'ray and sphere-sweep only; box/capsule work is in methodCalls' : null,
    methodCalls: { ...rec.calls },
    scopeAliases: rec.scopeAliases || null,
    fixedClock: rec.fixedClock || null,
    // Exclude inclusive parent groups so the user can see which native
    // method family dominates without mistaking nested totals for a sum.
    topNativeScopes: rec.sourceBVH
      ? Object.entries(rec.cpu).filter(([k])=>!['simulation','render','paint','projectiles'].includes(k) && !rec.scopeAliases?.[k])
          .sort((a,b)=>b[1]-a[1]).slice(0,5)
          .map(([name,ms])=>({name,ms:round(ms)}))
      : [],
    events:rec.events, cause:rec.cause,
  });
  const result = {
    // Access the exact latest recorded frame without scanning or sorting the
    // rolling history on every sample. Used by the on-device A/B comparator.
    lastFrameMetrics() { return current.length ? current[current.length - 1] : null; },
    pollGpu() { attachGpu(); },
    startCapture({ durationMs = 30000, frameLimit = 4000, byteLimit = 4 * 1024 * 1024 } = {}) {
      if (disposed) throw new Error('tracer has been disposed');
      if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 30000)
        throw new RangeError('capture duration must be within 30 seconds');
      if (!Number.isInteger(frameLimit) || frameLimit < 1 || frameLimit > 4000)
        throw new RangeError('capture frame limit must be within 4000');
      if (!Number.isInteger(byteLimit) || byteLimit < 8192 || byteLimit > 4 * 1024 * 1024)
        throw new RangeError('capture byte limit must be 8192..4194304');
      capture = { startedAt: now(), durationMs, frameLimit, byteLimit,
        elapsedMs: 0, status: 'recording', reason: null, observedFrames: 0,
        rows: [], rowById:new Map(), rowBytes: 0 };
    },
    stopCapture() { finishCapture('manual'); },
    captureReport() { attachGpu(); return captureJSON(); },
    snapshot() {
      // Completed, nonblocking GPU queries are available to reporting even if
      // no new RAF arrived after the final capture frame.
      attachGpu();
      const sample=current.slice(-240);
      const percent=(key,p)=>{
        const v=sample.map(x=>x[key]).filter(Number.isFinite).sort((a,b)=>a-b);
        return v.length?round(v[Math.min(v.length-1,Math.ceil(v.length*p)-1)]):null;
      };
      return {
        gpu:gpuTimer?.status || 'unavailable',
        gpuPaint:paintGpuTimer?.status || 'unavailable',
        gpuSamples:sample.filter(f=>f.gpuMs!==null).length,
        gpuPaintSamples:sample.filter(f=>f.gpuPaintMs!==null).length,
        latestGPUPaintMs:[...sample].reverse().find(f=>f.gpuPaintMs!==null)?.gpuPaintMs??null,
        gpuP95Ms:percent('gpuMs',.95),
        gpuMaxMs:sample.some(r=>Number.isFinite(r.gpuMs))
          ? Math.max(...sample.filter(r=>Number.isFinite(r.gpuMs)).map(r=>r.gpuMs)) : null,
        latestGPUCommandsMs: [...sample].reverse().find(f=>f.gpuMs!==null)?.gpuMs??null,
        longTaskObserver:longTaskSupported?'available':'unsupported',
        longTaskCount:longTasks,
        capturedFrames:sample.length, hitchCount:hitches.length,
        recentHitches:hitches.slice(-12).map(serialize),
        latest:sample.length?serialize(sample.at(-1)):null,
      };
    },
    report() {
      const s=this.snapshot();
      const summary = JSON.stringify({ schema:'inkwave-frame-trace-v1',
        source:'local debug capture, no upload',
        gpuCaveat:'sampled GPU paint atlas and scene/compositor commands; not presentation or swap delay',
        ...s },null,2);
      const full = captureJSON();
      return full ? summary.slice(0, -2) + ',\n  "capture": ' + full + '\n}' : summary;
    },
    reset() {
      current.length=0; hitches.length=0; recentTasks.length=0; pendingEvents.length=0;
      capture = null;
      gpuTimer?.dispose?.();paintGpuTimer?.dispose?.();
      gpuTimer=null;paintGpuTimer=null;
      previousStamp=0;longTasks=0;last=null;
    },
    record:frameReport,
    dispose() {
      if (disposed) return;
      finishCapture('disposed');
      disposed=true;
      restoreBinding({ owner: game, method: '_frame', wrapper: wrappedFrame,
        original: originalFrame, descriptor: originalFrameDescriptor });
      for(const item of stageState.values()) restoreBinding(item);
      if (installedTracers.get(game) === result) installedTracers.delete(game);
      stageState.clear();
      observer?.disconnect?.();
      gpuTimer?.dispose?.();
      paintGpuTimer?.dispose?.();
    },
  };
  installedTracers.set(game, result);
  return result;
}
