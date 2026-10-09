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
