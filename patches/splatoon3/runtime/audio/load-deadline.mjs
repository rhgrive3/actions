// Bound external I/O without admitting a late result into the active sample bank.
// decodeAudioData itself cannot be cancelled; a timed-out result is discarded.
export function audioLoadDeadline(operation, milliseconds = 8000, label = 'Recorded audio load timed out') {
  let timer;
  return Promise.race([
    Promise.resolve(operation),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label)), milliseconds); }),
  ]).finally(() => clearTimeout(timer));
}

// A request keeps one deadline through fetch, checksum and decode. Check the
// token after each await even when a custom fetcher ignores AbortSignal.
export function audioLoadScope(milliseconds = 8000, label = 'Recorded audio load timed out') {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const now = () => globalThis.performance?.now?.() ?? Date.now();
  let active = true, error, timer, reject, expires;
  const expired = new Promise((_, fail) => { reject = fail; });
  // A finished shared file can have no remaining waiter when a late platform
  // completion arrives. The operation races below still observe this error.
  expired.catch(() => {});
  const stop = reason => {
    if (!active) return;
    active = false; error = reason; clearTimeout(timer);
    reject(reason);
    try { controller?.abort(); } catch { /* Optional platform cancellation. */ }
  };
  const arm = ms => { clearTimeout(timer); expires = now() + ms; timer = setTimeout(() => stop(new Error(label)), ms); };
  arm(milliseconds);
  return {
    signal: controller?.signal,
    check() { if (active && now() >= expires) stop(new Error(label)); if (!active) throw error; },
    run(operation) {
      this.check();
      // Preserve the existing immediate fetch-start contract of load().
      let result; try { result = operation(); } catch (failure) { result = Promise.reject(failure); }
      return Promise.race([Promise.resolve(result).then(value => { this.check(); return value; }), expired]);
    },
    // Manifest headers and JSON keep their original separate 8-second limits.
    renew(ms = milliseconds) { this.check(); arm(ms); },
    cancel(reason = new Error('Recorded audio load cancelled')) { stop(reason); },
    finish() { if (active) { active = false; error = new Error('Recorded audio load finished'); clearTimeout(timer); } },
  };
}
