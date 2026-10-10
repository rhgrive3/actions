// Browser-refresh-aware frame pacing and opt-in hitch diagnostics.
// No gameplay frame, device/network data or input is sent off-device.
// Detect only stable *actual rAF* periods; never infer display refresh from
// dropped callbacks or the (already capped) simulation delta.
export const REFRESH_HZ = Object.freeze([60, 75, 90, 100, 120, 144, 165]);

export function detectStableDisplayHz(periods) {
  if (!periods || periods.length < 32) return 0;
  let best = 0, count = 0, bestDistance = Infinity;
  for (const hz of REFRESH_HZ) {
    const expected = 1 / hz;
    let hits = 0, distance = 0;
    for (const dt of periods) {
      if (!Number.isFinite(dt)) continue;
      const error = Math.abs(dt - expected) / expected;
      if (error <= .13) { hits++; distance += error; }
    }
    // Adjacent high-refresh windows may overlap at a generous 13% jitter
    // threshold (144 vs 165 Hz). Break same-hit ties by actual period error.
    if (hits > count || (hits === count && hits > 0 && distance < bestDistance)) {
      count = hits; best = hz; bestDistance = distance;
    }
  }
  return count >= Math.ceil(periods.length * .78) ? best : 0;
}

// A browser cannot present 60 equally spaced frames on a fixed 90Hz panel.
// Touch Auto conserves battery by using an even divisor (45Hz on 90Hz,
// 48Hz on 144Hz). The explicit '60' and 'display' options are unchanged.
// No interpolation or artificial frames are introduced into the simulation.
export function evenTouchAutoHz(displayHz) {
  if (displayHz >= 86 && displayHz <= 104) return displayHz / 2;
  if (displayHz >= 138 && displayHz <= 150) return displayHz / 3;
  if (displayHz >= 160 && displayHz <= 168) return displayHz / 3;
  return 60;
}

export function createRefreshProbe() {
  const ring = new Float64Array(48);
  let count = 0, next = 0, candidate = 0, votes = 0, selected = 0;
  const reset = () => { count = 0; next = 0; candidate = 0; votes = 0; selected = 0; };
  return {
    sample(dt) {
      if (selected) return selected;
      if (!Number.isFinite(dt) || dt < 1 / 190 || dt > 1 / 43) return 0;
      ring[next] = dt;
      next = (next + 1) % ring.length;
      count++;
      if (count < ring.length || count % 24 !== 0) return 0;
      const proposed = detectStableDisplayHz(ring);
      if (!proposed) { candidate = 0; votes = 0; return 0; }
      if (proposed === candidate) votes++;
      else { candidate = proposed; votes = 1; }
      if (votes >= 2) selected = proposed;
      return selected;
    },
    reset,
    get rate() { return selected; },
  };
}

const percentile = (arr, pct) => {
  if (!arr.length) return 0;
  const sorted = arr.slice().sort((a,b) => a-b);
  return sorted[Math.min(sorted.length-1, Math.ceil(pct * sorted.length)-1)];
};

export function createFrameTimingProbe({ now = () => performance.now(), env = globalThis, maxSamples = 240 } = {}) {
  if (!Number.isInteger(maxSamples) || maxSamples < 24 || maxSamples > 2000) throw new RangeError('frame buffer limit');
  const delivered = new Float32Array(maxSamples);
  const callbacks = new Float32Array(maxSamples);
  const cpu = new Float32Array(maxSamples);
  let dc = 0, cc = 0, nc = 0, at=0, prev=0, lastText=0, skipped=0;
  let mode = 'other', cap=60, displayHz=0, dynScale=1, perf=null;
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
      gpuTimeMs:'unmeasured', battery:'unmeasured',
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
      if (stamp-lastText>=1000) {
        lastText=stamp;
        const s=snapshot();
        if (label) label.textContent =
          'INKWAVE frame diagnostic (local only)\n' +
          'Mode '+s.mode+' | '+s.autoCapHz+'Hz cap | panel '+(s.detectedRefreshHz||'?')+'Hz\n' +
          'Frame p95 / p99 / max: '+s.frameP95Ms.toFixed(1)+' / '+s.frameP99Ms.toFixed(1)+' / '+s.frameMaxMs.toFixed(1)+'ms\n' +
          'JS work p95: '+s.workP95Ms.toFixed(1)+'ms | rAF p99: '+s.rafP99Ms.toFixed(1)+'ms\n' +
          'Long frames: '+s.framesOverBudget+'/'+Math.min(dc,maxSamples)+' | scale '+s.dynamicScale.toFixed(2);
      }
    },
    reset() { dc=cc=nc=0; prev=0; skipped=0; lastText=0; },
    snapshot,
  };
  let label=null;
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
  return probe;
}
