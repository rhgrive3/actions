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

const sections = [
  ['simulation', g => g.match, 'update'],
  ['projectiles', g => g?.R && g?._gameContext?.projectiles, 'update'],
  ['paint', g => g?._gameContext?.paint, 'flush'],
  ['environment', g => g?._gameContext?.env, 'update'],
  ['fx', g => g?._gameContext?.fx, 'update'],
  ['camera', g => g.rig, 'update'],
  ['render', g => g.R, 'render'],
  ['showcase', g => g.showcase, 'render'],
  ['hud', g => g, '_updateHud'],
];
const round = n => Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;

export function installHitchTracer(game, {
  env = globalThis, now = () => performance.now(), maxFrames = 360, gpuEvery = 8,
} = {}) {
  if (!game || typeof game._frame !== 'function') throw new TypeError('Game._frame required');
  if (!Number.isInteger(maxFrames) || maxFrames < 30 || maxFrames > 2000) throw new RangeError('invalid frame capacity');
  const current = [], hitches = [], saved = new Map(), recentTasks = [];
  const originalFrame = game._frame;
  let active = null, last = null, previousStamp = 0, nextId = 0, disposed = false;
  let longTasks = 0, longTaskSupported = false, observer = null;
  let ctx = null, gpuTimer = null;
  const stageState = new Map();

  const getWorld = () => {
    // Use the production Game's own module G handle exposed by the boot audit.
    // Synthetic node/browser tests can supply __G; avoid importing application
    // state and shipping an extra eager dependency in the diagnostics bundle.
    const g = env?.__G;
    ctx = g || ctx || {};
    game._gameContext = ctx;
    return ctx;
  };
  const stageOwners = () => {
    const G = getWorld();
    return [
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
  };
  const note = (event, data) => {
    if (active) active.events.push({ event, atMs: round(now() - active.start), ...(data || {}) });
  };
  const rebind = () => {
    for (const [name, owner, method] of stageOwners()) {
      const prior = stageState.get(name);
      if (prior && (prior.owner !== owner || owner?.[method] !== prior.wrapper)) {
        if (prior.owner?.[prior.method] === prior.wrapper) prior.owner[prior.method] = prior.original;
        stageState.delete(name);
      }
      if (!owner || typeof owner[method] !== 'function' || stageState.has(name)) continue;
      const original = owner[method];
      const wrapper = function (...args) {
        const rec = active;
        const t = rec ? now() : 0;
        let gpuStarted = false;
        if (rec && name === 'render') {
          if (!gpuTimer) gpuTimer = createGpuRenderTimer(game.R?.renderer, { every: gpuEvery });
          gpuStarted = gpuTimer.begin(rec.id);
        }
        try {
          return original.apply(this, args);
        } finally {
          if (gpuStarted) gpuTimer.end();
          if (rec) {
            rec.cpu[name] = (rec.cpu[name] || 0) + Math.max(0, now() - t);
          }
        }
      };
      owner[method] = wrapper;
      stageState.set(name, { owner, method, wrapper, original });
    }
    const owner = game.R, method = 'setDynamicScale', name = 'dynamicScale';
    const prior = stageState.get(name);
    if (prior && (owner !== prior.owner || owner?.[method] !== prior.wrapper)) {
      if (prior.owner?.[method] === prior.wrapper) prior.owner[method] = prior.original;
      stageState.delete(name);
    }
    if (owner && typeof owner[method] === 'function' && !stageState.has(name)) {
      const original = owner[method];
      const wrapper = function (scale) {
        const old = this.dynScale;
        const t = active ? now() : 0;
        try { return original.apply(this, arguments); }
        finally {
          if (active && old !== this.dynScale) {
            note('render-target-resize', { from: round(old), to: round(this.dynScale),
              cpuMs: round(now() - t) });
          }
        }
      };
      owner[method] = wrapper;
      stageState.set(name, {owner,method,wrapper,original});
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
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
      longTaskSupported = true;
    }
  } catch { observer?.disconnect?.(); observer = null; }

  const wrappedFrame = function (...args) {
    if (disposed) return originalFrame.apply(this, args);
    rebind();
    const rec = { id: ++nextId, start: now(), cpu: Object.create(null), events: [], gpuMs: null };
    active = rec;
    try { return originalFrame.apply(this, args); }
    finally {
      rec.end = now();
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
    if (rec.gpuMs !== null && rec.gpuMs > budget * 0.85) return 'GPU commands (sampled)';
    if (rec.longTaskMs >= 50) return 'browser main-thread long task';
    if (rec.frameGapMs > Math.max(34, budget * 1.6)) return 'GPU / compositor / scheduling (undetermined)';
    return 'within budget';
  };
  const attachGpu = () => {
    for (const result of gpuTimer?.poll?.() || []) {
      const rec = current.find(f=>f.id===result.id) || hitches.find(f=>f.id===result.id);
      if (rec) {
        rec.gpuMs = round(result.ms);
        rec.cause = classify(rec);
      }
    }
  };
  const frameReport = (stamp, ms, data = {}) => {
    if (disposed) return;
    attachGpu();
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
  };
  const serialize = (rec) => ({
    id:rec.id, mode:rec.mode, gapMs:round(rec.frameGapMs),
    workMs:round(rec.workMs), targetHz:rec.targetHz, scale:rec.scale,
    gpuCommandsMs:rec.gpuMs, longTaskMs:round(rec.longTaskMs),
    stages:Object.fromEntries(Object.entries(rec.cpu).map(([k,v])=>[k,round(v)])),
    events:rec.events, cause:rec.cause,
  });
  const result = {
    snapshot() {
      const sample=current.slice(-240);
      const percent=(key,p)=>{
        const v=sample.map(x=>x[key]).filter(Number.isFinite).sort((a,b)=>a-b);
        return v.length?round(v[Math.min(v.length-1,Math.ceil(v.length*p)-1)]):null;
      };
      return {
        gpu:gpuTimer?.status || 'unavailable',
        gpuSamples:sample.filter(f=>f.gpuMs!==null).length,
        gpuP95Ms:percent('gpuMs',.95), gpuMaxMs:sample.length
          ? Math.max(0,...sample.map(r=>r.gpuMs??0)) : null,
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
      return JSON.stringify({ schema:'inkwave-frame-trace-v1',
        source:'local debug capture, no upload',
        gpuCaveat:'sampled WebGL render commands; not presentation or swap delay',
        ...s },null,2);
    },
    reset() {
      current.length=0; hitches.length=0; recentTasks.length=0;
      previousStamp=0;longTasks=0;last=null;
    },
    record:frameReport,
    dispose() {
      if (disposed) return;
      disposed=true;
      if (game._frame===wrappedFrame) game._frame=originalFrame;
      for(const item of stageState.values()) {
        if(item.owner?.[item.method]===item.wrapper) item.owner[item.method]=item.original;
      }
      stageState.clear();
      observer?.disconnect?.();
      gpuTimer?.dispose?.();
    },
  };
  return result;
}
