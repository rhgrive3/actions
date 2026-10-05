import { getPlatformLifecycle } from './platform-lifecycle.mjs';
const INSTALLED = Symbol.for('inkwave.platform.transport.v1');
export function installTransportPlatform(Transport, env = globalThis) {
  const P = Transport.prototype;
  if (Object.hasOwn(P, INSTALLED)) return;
  Object.defineProperty(P, INSTALLED, { value: true });
  const owner = getPlatformLifecycle(env), start = P._startPing, stop = P._stopPing, close = P.close;
  const clearWatch = r => { if (r.watch !== null) env.clearTimeout(r.watch); r.watch = null; };
  function ensure(tr) {
    if (tr._platformTransport) return tr._platformTransport;
    const r = tr._platformTransport = { off: null, watch: null, resumes: 0 };
    r.off = owner.subscribe({
      suspend() { stop.call(tr); clearWatch(r); },
      resume() {
        const ws = tr.ws, epoch = owner.epoch;
        if (ws?.readyState !== 1) return;
        r.resumes++; tr._pingSent = 0; tr._startPing();
        clearWatch(r);
        r.watch = env.setTimeout(() => {
          r.watch = null;
          if (!owner.active || owner.epoch !== epoch || tr.ws !== ws || ws.readyState !== 1) return;
          const age = tr._pingSent ? env.performance.now() - tr._pingSent : 0;
          if (age >= 5500) ws.close(1000, 'Connection did not recover after background');
        }, 6000);
      },
    });
    return r;
  }
  P._startPing = function () {
    ensure(this);
    if (!owner.active) { stop.call(this); return; }
    return start.call(this);
  };
  P.close = function (...args) {
    const r = this._platformTransport;
    if (r) { clearWatch(r); r.off?.(); this._platformTransport = null; }
    return close.apply(this, args);
  };
}
