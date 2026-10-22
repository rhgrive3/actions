// Scheduling ownership only. Audio samples, lookahead, pump order and graph are unchanged.
// The existing MusicEngine clock uses a 25 ms tick and a 5 s Worker-URL grace.
export const MUSIC_TICK_MS = 25;
const clocks = new WeakMap();
const WORKER_SOURCE = 'let id=0;onmessage=(e)=>{clearInterval(id);if(e.data>0)id=setInterval(()=>postMessage(0),e.data)}';

export function stopMusicClock(engine) {
  const clock = clocks.get(engine);
  if (!clock) return false;
  clocks.delete(engine); // Invalidate callbacks before any disposer can re-enter.
  clock.stop();
  return true;
}

export function startMusicClock(engine, env = globalThis) {
  if (clocks.has(engine)) return;
  let worker = null, timer = null, url = null, revokeTimer = null;
  const current = () => clocks.get(engine) === clock;
  const revoke = () => {
    if (revokeTimer !== null) { env.clearTimeout(revokeTimer); revokeTimer = null; }
    if (url !== null) { const owned = url; url = null; env.URL.revokeObjectURL(owned); }
  };
  const retireWorker = () => {
    const owned = worker; worker = null;
    if (!owned) return;
    owned.onmessage = owned.onerror = null;
    if (engine.worker === owned) engine.worker = null;
    try { owned.postMessage(0); } catch { /* An errored Worker may reject messages. */ }
    try { owned.terminate(); } catch { /* Detached callbacks cannot schedule audio. */ }
  };
  const tick = () => { if (current()) engine._tick(); };
  const fallback = () => {
    if (!current() || timer !== null) return;
    try { timer = env.setInterval(tick, MUSIC_TICK_MS); engine.timer = timer; }
    catch (error) { stopMusicClock(engine); throw error; }
  };
  const clock = { stop() {
    retireWorker();
    if (timer !== null) {
      const owned = timer; timer = null;
      env.clearInterval(owned);
      if (engine.timer === owned) engine.timer = null;
    }
    revoke();
  } };
  clocks.set(engine, clock);
  if (typeof env.Worker !== 'function') { fallback(); return; }
  try {
    url = env.URL.createObjectURL(new env.Blob([WORKER_SOURCE], { type: 'text/javascript' }));
    const owned = worker = new env.Worker(url);
    engine.worker = owned;
    owned.onmessage = () => { if (worker === owned) tick(); };
    owned.onerror = () => {
      if (!current() || worker !== owned) return;
      retireWorker(); revoke(); fallback();
    };
    owned.postMessage(MUSIC_TICK_MS);
    // Preserve the existing WebKit startup grace, but keep the handle cancellable.
    if (current() && worker === owned) revokeTimer = env.setTimeout(revoke, 5000);
  } catch (error) {
    retireWorker(); revoke(); fallback();
  }
}
