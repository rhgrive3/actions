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
    return {stage:g.level?.layout?.id || g.level?.manifest?.id || game?.mapDef?.id || null,
      weapon:match?.local?.weapon?.id || match?.local?.weaponId || null,
      actors:match?.actors?.length || 0, matchMode:match?.mode || null,
      quality:settings.quality ?? null, frameRate:settings.frameRate ?? null,
      shadows:settings.shadows ?? null, bloom:settings.bloom ?? null,
      viewport:[game?.R?._w ?? null,game?.R?._h ?? null]};
  };
  function finish(reason='complete') {
    if (!active) return;
    const window=active;active=null;window.finishedAt=now();window.reason=reason;window.resourcesAtEnd=resources();
    trials[window.kind]=window.frames.length ? window : null;
    notice=(window.kind==='idle'?'待機':'連射')+' '+window.frames.length+' frames ('+reason+')';
    refresh(true);
  }
  function start(kind) {
    if (disposed || !['idle','fire'].includes(kind)) return false;
    if (active) finish('interrupted');
    trials[kind]=null;
    active={kind,startedAt:now(),finishedAt:0,frames:[],meta:metadata(),resourcesAtStart:resources()};
    notice='';
    refresh(true);
    return true;
  }
  function frame() {
    if (disposed || !active) return;
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
      scaleRange:scales.length?[round(Math.min(...scales)),round(Math.max(...scales))]:null};
  }
  function comparison() {
    // Read only completed asynchronous WebGL queries; never call gl.finish().
    tracer.pollGpu?.();
    const idle=summary(trials.idle),fire=summary(trials.fire);
    if (!idle || !fire) return {status:'incomplete',active:active?.kind||null,idle,fire};
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
      idle,fire,
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
    } else if (trials.idle && trials.fire) {
      const a=summary(trials.idle),b=summary(trials.fire);
      status.textContent=(ja?'待機 ':'Idle ')+(a?.observedFPS??'?')+' → '+
        (ja?'連射 ':'Fire ')+(b?.observedFPS??'?')+' FPS | '+
        round((b?.frameGapMs?.p50||0)-(a?.frameGapMs?.p50||0))+'ms';
    } else status.textContent=notice || (ja?'待機→連射の順に各6秒':'Idle then fire, 6 seconds each');
  }
  if (doc?.body && typeof doc.createElement==='function') {
    bar=doc.createElement('div');
    bar.id='inkwave-debug-ab-controls';
    bar.style.cssText='position:fixed;top:48px;right:6px;z-index:10001;display:flex;flex-wrap:wrap;gap:5px;max-width:54vw;justify-content:flex-end;pointer-events:auto';
    bar.addEventListener('pointerdown',e=>e.stopPropagation());
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
  return {start,frame,comparison,dispose(){
    disposed=true;active=null;trials.idle=trials.fire=null;bar?.remove();bar=null;status=null;
  }};
}
