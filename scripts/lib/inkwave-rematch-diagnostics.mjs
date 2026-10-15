// Observation only: keep original operation results/errors and never retry input.
export function createOperationTrace(limit = 128, now = Date.now) {
  const entries = [];
  return {
    entries,
    async run(name, action) {
      const entry = { name, startedAt: new Date(now()).toISOString(), status: 'running' };
      const start = now();
      entries.push(entry);
      if (entries.length > limit) entries.shift();
      try {
        const value = await action();
        entry.status = 'passed';
        return value;
      } catch (error) {
        entry.status = 'failed';
        entry.error = String(error?.message || error).slice(0, 2000);
        throw error;
      } finally { entry.elapsedMs = now() - start; }
    },
  };
}

// A wedged renderer must not prevent the already-recorded original failure
// from being uploaded. Rejections are observed even after the budget expires;
// the caller closes the browser context after these read-only probes finish.
export async function boundedDiagnostic(read, timeoutMs = 10000) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(read).then(value => ({ status: 'captured', value }), error => ({
        status: 'unavailable', error: String(error?.message || error).slice(0, 2000),
      })),
      new Promise(resolve => { timer = setTimeout(() => resolve({ status: 'timed-out', timeoutMs }), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

// Record only snapshots already read by the strict focus poll. No extra browser
// calls, input, rendering, animation changes, or acceptance decisions. Keep the
// first sample and a bounded tail; counts disclose every omitted sample. Browser
// RAF/timeline times and host elapsed times have separate clock origins.
export function createFocusHistory(limit = 32) {
  if (!Number.isInteger(limit) || limit < 2 || limit > 128) throw new RangeError('focus history limit must be 2..128');
  const history = { sampleCount: 0, droppedSamples: 0, frameWins: 0, timeoutWins: 0, samples: [] };
  return {
    history,
    record(snapshot, timing) {
      const ui = snapshot.uiDiagnostics;
      const animations = ui?.ring?.animations ?? [];
      const ring = ui?.ring ? { ...ui.ring, animations: animations.slice(0, 16),
        animationCount: animations.length, droppedAnimations: Math.max(0, animations.length - 16) } : null;
      const sample = { sample: ++history.sampleCount, ...timing,
        ringOn: snapshot.ringOn, ringVisible: snapshot.ringVisible, ringOnFocus: snapshot.ringOnFocus,
        focusConnected: snapshot.focusConnected, focus: ui?.focus?.menuId ?? null,
        menuInputOwner: ui?.menuInputOwner ?? null, ring,
        document: ui?.document ?? null, frameDriver: ui?.frameDriver ?? null };
      if (timing.winner === 'frame') history.frameWins++;
      if (timing.winner === 'timeout') history.timeoutWins++;
      // The snapshot is plain serialized page data; clone to avoid later snapshot
      // reuse changing an earlier observation or creating a history cycle.
      history.samples.push(JSON.parse(JSON.stringify(sample)));
      if (history.samples.length > limit) { history.samples.splice(1, 1); history.droppedSamples++; }
    },
  };
}
