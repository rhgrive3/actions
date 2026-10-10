const percentile = (arr, pct) => {
  if (!arr.length) return 0;
  const sorted = arr.slice().sort((a,b) => a-b);
  return sorted[Math.min(sorted.length-1, Math.ceil(pct * sorted.length)-1)];
};

export function createFrameTimingProbe({ now = () => performance.now(), env = globalThis, maxSamples = 240, game = null } = {}) {
  if (!Number.isInteger(maxSamples) || maxSamples < 24 || maxSamples > 2000) throw new RangeError('frame buffer limit');
  const delivered = new Float32Array(maxSamples);
  const callbacks = new Float32Array(maxSamples);
  const cpu = new Float32Array(maxSamples);
  let dc = 0, cc = 0, nc = 0, at=0, prev=0, lastText=0, skipped=0;
  let mode = 'other', cap=60, displayHz=0, dynScale=1, perf=null;
  let tracer = null, traceError = null;
  const insert = (arr, count, value) => {
    arr[count % arr.length] = value;
    return count + 1;
  };
  const values = (arr,count) => Array.from(arr.subarray(0,Math.min(arr.length,count)));
  const snapshot = () => {
    const d=values(delivered,dc), r=values(callbacks,cc), c=values(cpu,nc);
    const budget = 1000 / Math.max(1, cap);
    return {
      mode, autoCapHz:cap, detectedRefreshHz:displayHz, dynamicScale:dynScale,
      presented:dc, rafCallbacks:cc, capSkips:skipped,
      frameP50Ms:percentile(d,.5), frameP95Ms:percentile(d,.95), frameP99Ms:percentile(d,.99),
      frameMaxMs:d.length?Math.max(...d):0,
      rafP99Ms:percentile(r,.99), workP95Ms:percentile(c,.95),
      workMaxMs:c.length?Math.max(...c):0,
      framesOverBudget:d.filter(x=>x>budget*1.5).length,
      framesOver50Ms:d.filter(x=>x>=50).length,
      cpuStageAverageMs:perf?.sim??null, renderStageAverageMs:perf?.render??null,
      gpuTimeMs: tracer?.snapshot().latestGPUCommandsMs ?? 'unmeasured', battery:'unmeasured',
      trace: tracer?.snapshot() ?? null,
      traceError,
      // Date/user-agent/IP are deliberately absent; capture stays on device.
    };
  };
  const probe = {
    callback(dt) {
      if (Number.isFinite(dt) && dt > 0 && dt < 1) cc=insert(callbacks,cc,dt*1000);
    },
    skipped() { skipped++; },
    record(stamp, duration, {frameRateHz=60, refreshHz=0, scale=1, phase='other', stages=null}={}) {
      if (!Number.isFinite(stamp) || !Number.isFinite(duration)) return;
      cap=frameRateHz||60;displayHz=refreshHz;dynScale=scale;mode=phase;perf=stages;
      if (prev>0 && stamp>=prev && stamp-prev<1000) dc=insert(delivered,dc,stamp-prev);
      prev=stamp;
      nc=insert(cpu,nc,Math.max(0,duration));
      tracer?.record(stamp,duration,{frameRateHz:cap,phase:mode,scale:dynScale});
      if (stamp-lastText>=1000) {
        lastText=stamp;
        const s=snapshot();
        if (label) label.textContent =
          'INKWAVE frame diagnostic (local only)\n' +
          'Mode '+s.mode+' | '+s.autoCapHz+'Hz cap | panel '+(s.detectedRefreshHz||'?')+'Hz\n' +
          'Frame p95 / p99 / max: '+s.frameP95Ms.toFixed(1)+' / '+s.frameP99Ms.toFixed(1)+' / '+s.frameMaxMs.toFixed(1)+'ms\n' +
          'JS work p95: '+s.workP95Ms.toFixed(1)+'ms | rAF p99: '+s.rafP99Ms.toFixed(1)+'ms\n' +
          'Long frames: '+s.framesOverBudget+'/'+Math.min(dc,maxSamples)+' | scale '+s.dynamicScale.toFixed(2) +
          (s.trace ? '\nGPU render: '+(s.trace.latestGPUCommandsMs?.toFixed(1) ?? '?')+'ms ('+s.trace.gpu+')'+
            ' | long tasks: '+s.trace.longTaskCount+'\nLast hitch: '+(s.trace.recentHitches.at(-1)?.cause || 'none') : '');
      }
    },
    reset() { dc=cc=nc=0; prev=0; skipped=0; lastText=0; tracer?.reset(); },
    snapshot,
    report() { return tracer?.report() || JSON.stringify(snapshot(),null,2); },
    dispose() { tracer?.dispose(); label?.remove?.(); copyButton?.remove?.(); if (env?.__inkwaveRangePerf===probe) delete env.__inkwaveRangePerf; },
  };
  let label=null, copyButton=null;
  const doc=env?.document;
  if (doc?.body && typeof doc.createElement==='function') {
    label=doc.createElement('pre');
    label.id='inkwave-range-frame-diagnostic';
    label.setAttribute('role','status');
    label.style.cssText='position:fixed;left:6px;top:6px;z-index:10000;pointer-events:none;max-width:calc(100vw - 12px);margin:0;padding:6px;border-radius:5px;white-space:pre-wrap;font:11px/1.35 monospace;color:#fff;background:rgba(0,0,0,.75);text-shadow:0 1px 2px #000';
    label.textContent='INKWAVE frame diagnostic: collecting frames...';
    doc.body.appendChild(label);
  }
  if (env) env.__inkwaveRangePerf=probe;
  // This module is loaded only for ?profileRange=1. The large GPU/CPU
  // attribution layer is a further lazy import, never a normal game import.
  probe.ready = game
    ? import('./range-hitch-tracer.mjs').then(({installHitchTracer}) => {
        tracer = installHitchTracer(game,{env,now});
        return tracer;
      }).catch(error => {
        traceError = String(error?.message || error);
        return null;
      })
    : Promise.resolve(null);
  if (game && doc?.body && typeof doc.createElement === 'function') {
    copyButton = doc.createElement('button');
    copyButton.id = 'inkwave-copy-frame-trace';
    copyButton.type = 'button';
    copyButton.textContent = 'Copy frame trace';
    copyButton.style.cssText = 'position:fixed;top:6px;right:6px;z-index:10001;padding:7px 10px;border:1px solid #aaa;border-radius:5px;background:#181818;color:#fff;font:12px sans-serif;cursor:pointer';
    copyButton.addEventListener?.('click', async () => {
      const report = probe.report();
      try {
        if (!env.navigator?.clipboard?.writeText) throw Error('clipboard unavailable');
        await env.navigator.clipboard.writeText(report);
        copyButton.textContent = 'Trace copied';
      } catch {
        // Plain text fallback for WebViews that deny clipboard permission.
        const dump = doc.createElement('textarea');
        dump.value = report;
        dump.style.cssText = 'position:fixed;inset:40px 5px 5px 5px;z-index:10002;width:calc(100vw - 10px);height:70vh';
        doc.body.appendChild(dump);
        dump.focus?.(); dump.select?.();
        copyButton.textContent = 'Select text to copy';
      }
    });
    doc.body.appendChild(copyButton);
  }
  return probe;
}
