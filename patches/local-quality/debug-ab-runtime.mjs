// Optional on-device debug UI. Imported ONLY while user enables Debug profiler.
// Never writes to the network or persists a recording. All samples are bounded.
const round = x => Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null;
const stats = values => {
  const arr = values.filter(Number.isFinite).sort((a,b) => a-b);
  if (!arr.length) return null;
  const at = p => arr[Math.min(arr.length - 1, Math.max(0, Math.ceil(arr.length*p)-1))];
  return {n:arr.length, mean:round(arr.reduce((a,b)=>a+b,0)/arr.length),
    p50:round(at(.5)), p95:round(at(.95)), max:round(arr[arr.length-1])};
};
const TRIAL_MS=6000, WARM_MS=1000, MAX_FRAMES=1000;
export function installDebugAB({ probe, tracer, game, env=globalThis,
  now=()=>performance.now() } = {}) {
  if (!probe || !tracer || typeof tracer.lastFrameMetrics!=='function')
    throw new TypeError('A/B diagnostic requires the opted-in frame tracer');
  const trials={idle:null,fire:null};
  // Voluntary four-window sensitivity probe: idle/fire at 60% and 100% render density.
  // It does NOT estimate GPU milliseconds, and never changes normal gameplay defaults.
  const resolutionTrials={low:{idle:null,fire:null},high:{idle:null,fire:null}};
  const densities={low:0.6,high:1};
  let lockedMode=null, priorScale=null, restoreDynRes=null;
  let active=null, disposed=false, lastUI=0, notice='';
  const G=()=>env?.__G || {};
  const resources=()=>{
    const g=G(), r=game?.R?.renderer || g.renderer, info=r?.info || {};
    return { geometries:info.memory?.geometries ?? null,
      textures:info.memory?.textures ?? null, programs:info.programs?.length ?? null,
      paintAtlasSize:g.paint?.size ?? null, liveProjectiles:g.projectiles?.list?.length ?? null,
      detachedDrops:g.projectiles?.inkFlight?.drops?.length ?? null,
      paintGrowthRecords:g.paint?.growing?.length ?? null };
  };
  const metadata=()=>{
    const g=G(),match=g.match || game?.match,settings=game?.settings || {};
    const renderer=game?.R?.renderer;
    return {stage:g.level?.layout?.id || g.level?.manifest?.id || game?.mapDef?.id || null,
      weapon:match?.local?.weapon?.id || match?.local?.weaponId || null,
      actors:match?.actors?.length || 0, matchMode:match?.mode || null,
      quality:settings.quality ?? null, frameRate:settings.frameRate ?? null,
      shadows:settings.shadows ?? null, bloom:settings.bloom ?? null,
      viewport:[game?.R?._w ?? null,game?.R?._h ?? null],
      pixelRatio:renderer?.getPixelRatio?.() ?? null,
      drawingBuffer:[renderer?.domElement?.width ?? null,renderer?.domElement?.height ?? null]};
  };
  function releaseScale() {
    if (lockedMode===null) return;
    lockedMode=null;
    const previous=priorScale;
    priorScale=null;
    try {
      if (Number.isFinite(previous) && typeof game?.R?.setDynamicScale==='function')
        game.R.setDynamicScale(previous);
    } finally {
      restoreDynRes?.();
      restoreDynRes=null;
    }
  }
  function setResolution(mode='auto') {
    if (disposed || !['auto','low','high'].includes(mode)) return false;
    if (active) finish('resolution-changed');
    if (mode==='auto') {
      releaseScale();
      notice=ja?'自動解像度に戻しました':'Adaptive resolution restored';
      refresh(true);
      return true;
    }
    if (typeof game?.R?.setDynamicScale!=='function' || !Number.isFinite(game.R.dynScale))
      return false;
    if (lockedMode===null) {
      priorScale=game.R.dynScale;
      const original=game._dynRes;
      if (typeof original==='function') {
        const owned=Object.prototype.hasOwnProperty.call(game,'_dynRes');
        const wrapper=function (...args) {
          if (lockedMode!==null) return;
          return original.apply(this,args);
        };
        game._dynRes=wrapper;
        restoreDynRes=()=>{
          if (game._dynRes===wrapper) {
            if (owned) game._dynRes=original;
            else delete game._dynRes;
          }
        };
      }
    }
    lockedMode=mode;
    try { game.R.setDynamicScale(densities[mode]); }
    catch (error) { releaseScale(); throw error; }
    notice=(ja?'解像度固定 ':'Render density locked ')+Math.round(densities[mode]*100)+'%';
    refresh(true);
    return true;
  }
  function finish(reason='complete') {
    if (!active) return;
    const window=active;active=null;window.finishedAt=now();window.reason=reason;window.resourcesAtEnd=resources();
    const valid=(reason==='complete'||reason==='frame-limit') && window.frames.length>0;
    trials[window.kind]=valid ? window : null;
    if (valid && window.resolutionMode)
      resolutionTrials[window.resolutionMode][window.kind]=window;
    notice=(window.kind==='idle'?'待機':'連射')+' '+window.frames.length+' frames ('+reason+')';
    refresh(true);
  }
  function start(kind) {
    if (disposed || !['idle','fire'].includes(kind)) return false;
    if (active) finish('interrupted');
    trials[kind]=null;
    if (lockedMode) resolutionTrials[lockedMode][kind]=null;
    active={kind,startedAt:now(),finishedAt:0,frames:[],meta:metadata(),
      resolutionMode:lockedMode,matchRef:game?.match,resourcesAtStart:resources()};
    notice='';
    refresh(true);
    return true;
  }
  function frame() {
    if (disposed || !active) return;
    if (env?.document?.hidden) { finish('page-hidden'); return; }
    if (active.matchRef && game?.match!==active.matchRef) {
      finish('match-changed'); return;
    }
    const elapsed=now()-active.startedAt;
    if (elapsed>=WARM_MS && elapsed<TRIAL_MS && active.frames.length<MAX_FRAMES) {
      const rec=tracer.lastFrameMetrics();
      if (rec && rec.frameGapMs>0) {
        const perf=game?.perf || {}, heap=env?.performance?.memory?.usedJSHeapSize;
        // Completed frame snapshot. No extra GL query or blocking readback.
        rec.drawCalls=Number.isFinite(perf.calls)?perf.calls:null;
        rec.triangles=Number.isFinite(perf.tris)?perf.tris:null;
        rec.jsHeapMiB=Number.isFinite(heap)?heap/1048576:null;
        active.frames.push(rec);
      }
    }
    if (elapsed>=TRIAL_MS || active.frames.length>=MAX_FRAMES)
      finish(elapsed>=TRIAL_MS?'complete':'frame-limit');
    else refresh();
  }
  function summary(w) {
    if (!w) return null;
    const frames=w.frames;
    const gaps=stats(frames.map(r=>r.frameGapMs));
    const ownerKeys=new Set(),callKeys=new Set();
    for (const row of frames) {
      for (const key of Object.keys(row.cpu||{})) ownerKeys.add(key);
      for (const key of Object.keys(row.calls||{})) callKeys.add(key);
    }
    const ownerMeanMs={}, callsPerFrame={}, ownerP95Ms={};
    for (const key of ownerKeys) {
      const sample=stats(frames.map(row=>row.cpu?.[key]||0));
      ownerMeanMs[key]=sample?.mean ?? 0;
      ownerP95Ms[key]=sample?.p95 ?? 0;
    }
    for (const key of callKeys)
      callsPerFrame[key]=round(frames.reduce((n,r)=>n+(r.calls?.[key]||0),0)/frames.length);
    const scales=frames.map(r=>r.scale).filter(Number.isFinite);
    const gpuScene=stats(frames.map(r=>r.gpuMs));
    const gpuPaint=stats(frames.map(r=>r.gpuPaintMs));
    return {status:frames.length>=20?'ok':'too-few-frames',
      frames:frames.length, meta:w.meta, stopReason:w.reason,
      warmupExcludedMs:WARM_MS,
      frameGapMs:gaps, observedFPS:gaps?.p50>0?round(1000/gaps.p50):null,
      gameFrameWorkMs:stats(frames.map(r=>r.workMs)),
      drawCalls:stats(frames.map(r=>r.drawCalls)),
      triangles:stats(frames.map(r=>r.triangles)),
      jsHeapMiB:stats(frames.map(r=>r.jsHeapMiB)),
      resourcesAtStart:w.resourcesAtStart || null, resourcesAtEnd:w.resourcesAtEnd || null,
      ownerMeanMs,ownerP95Ms,callsPerFrame,
      gpuSceneCommandsMs:gpuScene,gpuPaintCommandsMs:gpuPaint,
      gpuSceneSamples:gpuScene?.n??0,gpuPaintSamples:gpuPaint?.n??0,
      scaleRange:scales.length?[round(Math.min(...scales)),round(Math.max(...scales))]:null};
  }
  function resolutionComparison() {
    // A/B across two FIXED drawing densities, not a hardware-GPU timer.
    const windows={low:{idle:summary(resolutionTrials.low.idle),fire:summary(resolutionTrials.low.fire)},
      high:{idle:summary(resolutionTrials.high.idle),fire:summary(resolutionTrials.high.fire)}};
    const completed=Object.values(windows).flatMap(w=>[w.idle,w.fire]).filter(w=>w?.status==='ok').length;
    if (completed<4)
      return {status:'incomplete',completed,total:4,windows,
        instruction:'Collect idle and continuous fire at both 60% and 100% using the selector.'};
    const cautions=[];
    const origin=windows.low.idle.meta;
    for (const mode of ['low','high']) for (const phase of ['idle','fire']) {
      const w=windows[mode][phase];
      for (const key of ['stage','weapon','actors','matchMode','quality','frameRate','shadows','bloom','viewport'])
        if (JSON.stringify(w.meta[key])!==JSON.stringify(origin[key]))
          cautions.push('Conditions differ: '+mode+'/'+phase+'/'+key);
      if (w.scaleRange && (w.scaleRange[0]!==w.scaleRange[1] ||
          Math.abs(w.scaleRange[0]-densities[mode])>.015))
        cautions.push('Render density changed: '+mode+'/'+phase);
    }
    // Verify physical target scaling, not merely the requested JavaScript slider.
    for (const phase of ['idle','fire']) {
      const a=windows.low[phase].meta.drawingBuffer,b=windows.high[phase].meta.drawingBuffer;
      if (a.every(Number.isFinite) && b.every(Number.isFinite) &&
          !(b[0]>a[0] && b[1]>a[1]))
        cautions.push('Drawing buffer did not grow: '+phase);
    }
    const phases={};
    for (const phase of ['idle','fire']) {
      const low=windows.low[phase],high=windows.high[phase];
      phases[phase]={
        lowFPS:low.observedFPS,highFPS:high.observedFPS,
        highMinusLowFrameGapP50Ms:round(high.frameGapMs.p50-low.frameGapMs.p50),
        highMinusLowFrameGapP95Ms:round(high.frameGapMs.p95-low.frameGapMs.p95),
        highMinusLowGameWorkMeanMs:round(high.gameFrameWorkMs.mean-low.gameFrameWorkMs.mean),
        lowDrawingBuffer:low.meta.drawingBuffer,highDrawingBuffer:high.meta.drawingBuffer
      };
    }
    const diff=phases.fire.highMinusLowFrameGapP50Ms;
    const cpu=phases.fire.highMinusLowGameWorkMeanMs;
    const invalid=cautions.length>0;
    const sensitivity=invalid?'inconclusive':
      diff>=2 && diff>Math.max(1,Math.abs(cpu)*1.5)?'resolution-sensitive':
      Math.abs(diff)<=1?'no-clear-resolution-dependence':'inconclusive';
    return {status:invalid?'conditions-differ':'compared',completed,total:4,
      windows,phases,sensitivity,cautions,
      directlyMeasuredGPU:false,
      limitations:[
        'Resolution sensitivity implicates pixel-dependent rendering/compositing, not verified GPU time.',
        'CPU, browser scheduling, refresh caps, thermal throttling and camera/input differences can confound this experiment.',
        'Keep stage, camera, gunfire, effects, lighting and quality identical across all four windows.'
      ]};
  }
  function comparison() {
    // Read only completed asynchronous WebGL queries; never call gl.finish().
    tracer.pollGpu?.();
    const idle=summary(trials.idle),fire=summary(trials.fire);
    if (!idle || !fire) return {status:'incomplete',active:active?.kind||null,idle,fire,
      resolutionSweep:resolutionComparison()};
    const cautions=[];
    for (const key of ['stage','weapon','actors','matchMode','quality','frameRate','shadows','bloom','viewport'])
      if (JSON.stringify(idle.meta[key])!==JSON.stringify(fire.meta[key]))
        cautions.push('Conditions differ: '+key);
    const a=idle.scaleRange,b=fire.scaleRange;
    if (a && b && (a[0]!==a[1]||b[0]!==b[1]||a[0]!==b[0]))
      cautions.push('Dynamic resolution changed during/between measurements');
    if (idle.status!=='ok'||fire.status!=='ok')
      cautions.push('Insufficient frames');
    if (!idle.gpuSceneCommandsMs || !fire.gpuSceneCommandsMs)
      cautions.push('GPU scene timer is unsupported or has no settled samples');
    if (!idle.gpuPaintCommandsMs || !fire.gpuPaintCommandsMs)
      cautions.push('GPU paint timer is unsupported or has no settled samples');
    const scopes=new Set([...Object.keys(idle.ownerMeanMs),...Object.keys(fire.ownerMeanMs)]);
    const extra=Object.fromEntries([...scopes].map(k=>[
      k,round((fire.ownerMeanMs[k]||0)-(idle.ownerMeanMs[k]||0))
    ]).sort((a,b)=>b[1]-a[1]));
    return {status:cautions.some(x=>x.startsWith('Conditions differ')||x.startsWith('Dynamic resolution'))
      ? 'conditions-differ':'compared',
      idle,fire,resolutionSweep:resolutionComparison(),
      delta:{fps:round(fire.observedFPS-idle.observedFPS),
        medianFrameGapMs:round((fire.frameGapMs?.p50||0)-(idle.frameGapMs?.p50||0)),
        p95FrameGapMs:round((fire.frameGapMs?.p95||0)-(idle.frameGapMs?.p95||0)),
        avgGameFrameWorkMs:round((fire.gameFrameWorkMs?.mean||0)-(idle.gameFrameWorkMs?.mean||0)),
        avgDrawCalls:round((fire.drawCalls?.mean||0)-(idle.drawCalls?.mean||0)),
        avgTriangles:round((fire.triangles?.mean||0)-(idle.triangles?.mean||0)),
        ownerExtraMeanMs:extra},
      cautions, limitations:[
        'Inclusive timings overlap (e.g. paint-stamp is inside simulation or projectiles). Never add them.',
        'Browser JS wall times may include WebGL driver waiting. GPU command times require extension support.',
        'Observed FPS is calculated from requestAnimationFrame start gaps, not photons displayed.',
        'Both 6 s trials exclude the first second for input/settling.',
        'Human-fired A/B is observational, not a deterministic camera/physics replay.'
      ]};
  }
  const doc=env?.document, ja=(doc?.documentElement?.lang||'ja').toLowerCase().startsWith('ja');
  let bar=null,status=null;
  function refresh(force=false) {
    if (!status) return;
    const t=now();
    if (!force && t-lastUI<700) return;
    lastUI=t;
    if (active) {
      status.textContent=(ja?(active.kind==='idle'?'待機':'連射'):'Capturing')+
        ' '+Math.min(6,(t-active.startedAt)/1000).toFixed(1)+'/6s';
    } else if (lockedMode) {
      const sweep=resolutionComparison();
      const pair=resolutionTrials[lockedMode];
      const idle=summary(pair.idle),fire=summary(pair.fire);
      status.textContent=(ja?'解像度':'Density')+' '+Math.round(densities[lockedMode]*100)+
        '% | '+sweep.completed+'/4 | '+(idle?.observedFPS??'?')+
        ' → '+(fire?.observedFPS??'?')+' FPS';
    } else if (trials.idle && trials.fire) {
      const a=summary(trials.idle),b=summary(trials.fire);
      status.textContent=(ja?'待機 ':'Idle ')+(a?.observedFPS??'?')+' → '+
        (ja?'連射 ':'Fire ')+(b?.observedFPS??'?')+' FPS | '+
        round((b?.frameGapMs?.p50||0)-(a?.frameGapMs?.p50||0))+'ms';
    } else status.textContent=notice || (ja?'待機→連射の順に各6秒':'Idle then fire, 6 seconds each');
  }
  // A partial DOM (test hosts, embedded/no-document environments) must not
  // disable the core profiler merely because the optional A/B toolbar cannot
  // mount. Actual browsers expose appendChild on created elements.
  const canMountToolbar = !!(doc?.body && typeof doc.body.appendChild === 'function' &&
    typeof doc.createElement === 'function' &&
    typeof doc.createElement('div').appendChild === 'function');
  if (canMountToolbar) {
    bar=doc.createElement('div');
    bar.id='inkwave-debug-ab-controls';
    bar.style.cssText='position:fixed;top:48px;right:6px;z-index:10001;display:flex;flex-wrap:wrap;gap:5px;max-width:54vw;justify-content:flex-end;pointer-events:auto';
    bar.addEventListener('pointerdown',e=>e.stopPropagation());
    const select=doc.createElement('select');
    select.id='inkwave-debug-density';
    select.setAttribute?.('aria-label',ja?'描画解像度の診断':'Render resolution diagnosis');
    select.style.cssText='font:12px sans-serif;padding:7px;background:#20252a;color:#fff;border:1px solid #bbc1c8;border-radius:5px;touch-action:manipulation';
    for (const [value,label] of [
      ['auto',ja?'標準（自動）':'Normal (auto)'],
      ['low',ja?'診断 60%':'Probe 60%'],
      ['high',ja?'診断 100%':'Probe 100%']]) {
      const option=doc.createElement('option');
      option.value=value;option.textContent=label;select.appendChild(option);
    }
    select.value='auto';
    select.addEventListener('change',()=>{
      if (!setResolution(select.value)) {
        select.value='auto';
        notice=ja?'この環境では固定解像度を使えません':'Fixed render density unavailable';
        refresh(true);
      }
    });
    bar.appendChild(select);
    for (const [kind,label] of [['idle',ja?'① 待機6秒':'① Idle 6s'],
      ['fire',ja?'② 連射6秒':'② Fire 6s']]) {
      const btn=doc.createElement('button');
      btn.type='button';btn.textContent=label;btn.dataset.debugTrial=kind;
      btn.style.cssText='font:12px sans-serif;padding:7px 8px;background:#20252a;border:1px solid #bbc1c8;border-radius:5px;color:#fff;touch-action:manipulation';
      btn.addEventListener('click',e=>{e.stopPropagation();start(kind);});
      bar.appendChild(btn);
    }
    status=doc.createElement('div');
    status.style.cssText='width:100%;box-sizing:border-box;border-radius:4px;background:rgba(0,0,0,.78);color:#fff;font:11px/1.35 sans-serif;text-align:right;padding:4px';
    bar.appendChild(status);doc.body.appendChild(bar);refresh(true);
  }
  return {start,frame,setResolution,resolutionComparison,comparison,dispose(){
    if (disposed) return;
    disposed=true;active=null;
    try { releaseScale(); } catch { /* teardown must never block profiler disposal */ }
    trials.idle=trials.fire=null;
    for (const pair of Object.values(resolutionTrials)) pair.idle=pair.fire=null;
    bar?.remove();bar=null;status=null;
  }};
}
