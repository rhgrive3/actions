// One boot owns one worker and one transferable result. The texture keeps its
// CPU source for lazy upload/context restoration; there is no page-wide cache.
export function prewarmWaveTexture({ workerFactory, signal, timeout = 5000 } = {}) {
  return new Promise(resolve => {
    if (signal?.aborted) { resolve(null); return; }
    let worker, timer, done = false;
    const finish = value => {
      if (done) return;
      done = true; clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      globalThis.removeEventListener?.('pagehide', cancel);
      if (worker) { worker.onmessage = worker.onerror = worker.onmessageerror = null; worker.terminate(); }
      resolve(value);
    };
    const cancel = () => finish(null);
    try {
      worker = workerFactory ? workerFactory() : new Worker(new URL('./wave-worker.js', import.meta.url), { type: 'module', name: 'inkwave-wave' });
      worker.onmessage = ({ data }) => {
        if (data?.size !== 256 || data.seed !== 11 || !(data.buffer instanceof ArrayBuffer) || data.buffer.byteLength !== 256 * 256 * 4) { finish(null); return; }
        finish(new Uint8Array(data.buffer));
      };
      worker.onerror = event => { event.preventDefault?.(); cancel(); };
      worker.onmessageerror = cancel;
      signal?.addEventListener('abort', cancel, { once: true });
      globalThis.addEventListener?.('pagehide', cancel, { once: true });
      if (signal?.aborted) { finish(null); return; }
      timer = setTimeout(cancel, timeout);
      worker.postMessage({ size: 256, seed: 11 });
    } catch { finish(null); }
  });
}
