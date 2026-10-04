// Startup-only instrumentation and PWA registration. No gameplay loop changes.
const profile = new URLSearchParams(location.search).has('startupProfile');
const marks = Object.create(null);
const report = { schema: 1, marks, phases: [], longTasks: [], resources: [], errors: [], dropped: 0 };
const observers = [];
const mark = name => {
  if (name in marks) return;
  marks[name] = performance.now();
  try { performance.mark(`inkwave:${name}`); } catch { /* old performance implementation */ }
};
const capture = (list, items, cap) => {
  for (const entry of items) if (list.length < cap) list.push(entry.toJSON ? entry.toJSON() : { startTime: entry.startTime, duration: entry.duration }); else report.dropped++;
};
if (profile) {
  for (const [type, list, cap] of [['longtask', report.longTasks, 512], ['resource', report.resources, 512]]) {
    try { const observer = new PerformanceObserver(entries => capture(list, entries.getEntries(), cap)); observer.observe({ type, buffered: true }); observers.push(observer); } catch { /* Safari does not expose every timing type */ }
  }
}
const stopProfiling = () => { for (const observer of observers) observer.disconnect(); observers.length = 0; };
const shell = document.getElementById('inkwave-startup-shell');
const status = document.getElementById('inkwave-startup-status');
const badge = document.getElementById('inkwave-cache-status');
const offlineText = () => navigator.onLine === false ? 'オフラインです。保存済みデータを確認しています。' : 'ゲームを準備しています…';
if (status) status.textContent = offlineText();
let menuObserver, profileTimeout, registrationPending = false, registered = false, engine = null, startupFailed = false, updateAvailable = false;
const updateText = '更新データを準備しました。すべてのINKWAVE画面を閉じると適用されます。';
const failureText = () => navigator.onLine === false ? '起動に必要なデータが保存されていません。通信が戻ってから開き直してください。' : 'ゲームの読み込みに失敗しました。通信を確認して開き直してください。';
const menuVisible = () => ['title', 'main'].includes(document.querySelector('.iw-ui')?.dataset.screen);
const badgeMessage = message => { if (badge) { badge.textContent = message; badge.hidden = !message || !menuVisible(); } };
let cacheMessage = navigator.onLine === false ? 'オフライン：保存済みデータを使用中' : '';
const updateConnectivity = () => {
  if (status && !shell?.hidden) status.textContent = startupFailed ? failureText() : offlineText();
  cacheMessage = (navigator.onLine === false ? 'オフライン：保存済みデータを使用中。' : '') + (updateAvailable ? updateText : '');
  badgeMessage(cacheMessage);
};
addEventListener('online', updateConnectivity);
addEventListener('offline', updateConnectivity);

async function cacheStatus(worker) {
  if (!worker || typeof MessageChannel !== 'function') return;
  const channel = new MessageChannel();
  const timer = setTimeout(() => { channel.port1.close(); channel.port2.close(); }, 2500);
  channel.port1.onmessage = event => {
    clearTimeout(timer); channel.port1.close(); channel.port2.close();
    if (event.data?.type === 'INKWAVE_CACHE_STATUS') report.cache = event.data;
  };
  try { worker.postMessage({ type: 'INKWAVE_CACHE_STATUS' }, [channel.port2]); }
  catch { clearTimeout(timer); channel.port1.close(); channel.port2.close(); }
}
function deferRegistration() {
  if (registered || registrationPending || !engine || !menuVisible()) return;
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  registrationPending = true;
  const run = async () => {
    registrationPending = false;
    if (!menuVisible() || registered) return; // A quick Play click must not start an install during the transition.
    registered = true;
    try {
      // document.baseURI points into _versions; registration is rooted in the document URL, not that base.
      const root = new URL('./', location.href);
      const registration = await navigator.serviceWorker.register(new URL('sw.js', root), { scope: root.pathname, updateViaCache: 'none' });
      mark('sw-registration');
      const notifyWaiting = () => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          updateAvailable = true;
          updateConnectivity();
        }
      };
      notifyWaiting();
      const watched = new WeakSet();
      const watchInstalling = () => {
        const worker = registration.installing;
        if (!worker || watched.has(worker)) return;
        watched.add(worker);
        const changed = () => { if (worker.state === 'installed') notifyWaiting(); if (worker.state === 'activated') cacheStatus(registration.active); };
        worker.addEventListener('statechange', changed);
        changed();
      };
      registration.addEventListener('updatefound', watchInstalling);
      // updatefound may have occurred before register() resolved.
      watchInstalling();
      await cacheStatus(registration.active);
      navigator.serviceWorker.ready.then(reg => cacheStatus(reg.active)).catch(() => {});
    } catch (error) { report.swError = String(error); /* Storage/install denial must never block online play. */ }
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2500 });
  else setTimeout(run, 1000);
}
function inspectMenu() {
  const ui = document.querySelector('.iw-ui');
  if (!ui) return;
  if (ui.dataset.screen && shell && !shell.hidden) {
    // The old boot-only fade must not cover the newly mounted loading UI for another 600 ms.
    // Match transitions set their own duration in Game._fade and are not changed.
    const fade = document.getElementById('fade');
    if (fade) { fade.style.transition = 'none'; fade.style.opacity = '0'; fade.style.pointerEvents = 'none'; }
    shell.hidden = true; mark('loading-ui-mounted');
  }
  if (menuVisible()) {
    mark('menu-dom');
    requestAnimationFrame(() => { if (menuVisible()) mark('menu-interactive'); });
    deferRegistration();
  }
  badgeMessage(cacheMessage);
}
// Observe only changes that affect startup/menu state. No subtree-wide style/character mutation observer.
menuObserver = new MutationObserver(inspectMenu);
menuObserver.observe(document.getElementById('ui-root') || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-screen'] });
// Once mounted, narrow observation to the menu's own data-screen attribute.
const narrowObserver = () => {
  const ui = document.querySelector('.iw-ui');
  if (ui) { menuObserver.disconnect(); menuObserver.observe(ui, { attributes: true, attributeFilter: ['data-screen'] }); }
};
const initialObserver = new MutationObserver(() => { narrowObserver(); if (document.querySelector('.iw-ui')) initialObserver.disconnect(); });
initialObserver.observe(document.getElementById('ui-root') || document.body, { childList: true });

window.__inkwaveStartup = {
  report, mark,
  measure(name, run) {
    if (!profile) return run();
    const phase = { name, start: performance.now(), end: null, duration: null };
    if (report.phases.length < 256) report.phases.push(phase); else report.dropped++;
    const end = () => { phase.end = performance.now(); phase.duration = phase.end - phase.start; };
    try {
      const value = run();
      if (value && typeof value.then === 'function') return Promise.resolve(value).finally(end);
      end(); return value;
    } catch (error) { end(); throw error; }
  },
  engineReady(game) {
    engine = game; mark('engine-ready');
    report.bootMs = game.bootMs;
    report.bootMarks = game.bootMarks?.map(row => [...row]);
    report.textureLibrary = game.texlib?.stats ? { ...game.texlib.stats } : null;
    inspectMenu(); narrowObserver();
    if (!profile) initialObserver.disconnect();
  },
  battleReady(game) {
    if (!game.match || game.match.attract || window.__G?.mode !== 'match') return;
    mark('first-battle-ready');
    requestAnimationFrame(() => mark('first-battle-frame-proxy'));
    if (profile) { clearTimeout(profileTimeout); setTimeout(stopProfiling, 1000); }
  },
  snapshot() {
    return { ...report, marks: { ...marks }, navigation: performance.getEntriesByType('navigation')[0]?.toJSON?.() || null, paints: performance.getEntriesByType('paint').map(entry => entry.toJSON()), memory: performance.memory ? { usedJSHeapSize: performance.memory.usedJSHeapSize, totalJSHeapSize: performance.memory.totalJSHeapSize } : null };
  }
};
if (profile) profileTimeout = setTimeout(stopProfiling, 120000);
// Tier-0 mark originates in inline HTML; this module may arrive after all other preload responses.
const inlineMark = performance.getEntriesByName('inkwave:shell-script')[0];
if (inlineMark) marks['shell-script'] = inlineMark.startTime;
requestAnimationFrame(() => mark('shell-frame-proxy'));
// Give the existing CSS + system-font shell a paint opportunity before engine execution.
// A bounded fallback prevents a hidden document (paused rAF) from hanging startup.
await new Promise(resolve => {
  let settled = false;
  const done = () => { if (!settled) { settled = true; clearTimeout(timer); resolve(); } };
  const timer = setTimeout(done, 100);
  requestAnimationFrame(() => requestAnimationFrame(done));
});
mark('bootstrap-import-start');
try {
  await import('../../splatoon3/bootstrap.mjs');
  mark('bootstrap-import-end'); // Module evaluation is not engine/battle readiness.
} catch (error) {
  startupFailed = true;
  report.errors.push(String(error));
  if (shell) shell.hidden = false;
  if (status) status.textContent = failureText();
  const retry = document.getElementById('inkwave-startup-retry');
  if (retry) retry.hidden = false;
  console.error('[inkwave] startup', error);
  clearTimeout(profileTimeout); stopProfiling(); menuObserver.disconnect(); initialObserver.disconnect();
}
