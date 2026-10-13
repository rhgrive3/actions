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

// Summarize snapshots already read by the strict focus poll. No extra browser
// evaluation, frame request, style mutation or animation seek is introduced.
export function createFocusHistory(limit = 32) {
  const history = { sampleCount: 0, samples: [] };
  return {
    history,
    record(snapshot, elapsedMs, frameWait) {
      const ui = snapshot.uiDiagnostics;
      history.sampleCount++;
      history.samples.push({ elapsedMs, frameWait,
        ringOn: snapshot.ringOn, ringVisible: snapshot.ringVisible, ringOnFocus: snapshot.ringOnFocus,
        focusConnected: snapshot.focusConnected, focus: ui?.focus?.menuId ?? null,
        menuInputOwner: ui?.menuInputOwner ?? null, ring: ui?.ring ?? null,
        document: ui?.document ?? null, frameDriver: ui?.frameDriver ?? null,
        compositorState: ui?.compositorState ?? null,
      });
      if (history.samples.length > limit) history.samples.shift();
    },
  };
}

// The caller has already recorded the failed assertion. Persist it before any
// screenshot readback, which may itself advance browser compositing. A later
// visible ring is evidence about recovery only and cannot replace that failure.
export async function captureRecordedFocusFailure(diagnostic, { persist, screenshot, snapshot, timeoutMs = 10000 }) {
  persist();
  diagnostic.screenshot = await boundedDiagnostic(screenshot, timeoutMs);
  diagnostic.afterReadback = await boundedDiagnostic(snapshot, timeoutMs);
  persist();
}
