// Inlined into the HTML shell: this must work even when the entry module 404s.
(() => {
  const root = new URL('./', location.href);
  const retry = document.getElementById('inkwave-startup-retry');
  const status = document.getElementById('inkwave-startup-status');
  const shell = document.getElementById('inkwave-startup-shell');
  const parameter = '__iw_recover';
  const guard = 'inkwave-startup-recovery:' + root.pathname;
  let ready = false, recovering = false;
  const moduleFailure = error => /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Failed to load module script|Unable to preload CSS|Loading (?:chunk|CSS chunk) .* failed|Load failed|Failed to fetch/i.test(String(error));
  const showFailure = () => {
    shell.hidden = false;
    status.textContent = navigator.onLine === false
      ? '起動に必要なデータが保存されていません。通信が戻ってから再試行してください。'
      : 'ゲームを読み込めませんでした。最新データで再試行してください。';
    retry.hidden = false;
    // Game.boot can fail after mounting its own UI. Keep recovery controls above it.
    shell.style.zIndex = '100';
    const bootError = document.getElementById('boot-error');
    if (bootError) bootError.style.display = 'none';
  };
  async function recover(manual = false) {
    if (recovering || ready) return;
    showFailure();
    if (navigator.onLine === false) return;
    const url = new URL(location.href);
    if (!manual) {
      // The URL guard still prevents a loop when sessionStorage is unavailable.
      if (url.searchParams.has(parameter)) return;
      try { if (Date.now() - Number(sessionStorage.getItem(guard)) < 60000) return; } catch {}
    }
    recovering = true;
    try { sessionStorage.setItem(guard, String(Date.now())); } catch {}
    status.textContent = '最新のゲームデータを確認しています…';
    // Registration used to depend on reaching the menu, so a broken boot could
    // never update its worker. Do this only on failure, with a bounded wait.
    if ('serviceWorker' in navigator && window.isSecureContext) {
      await Promise.race([
        navigator.serviceWorker.register(new URL('sw.js', root), {
          scope: root.pathname, updateViaCache: 'none'
        }).then(registration => registration.update()).catch(() => {}),
        new Promise(resolve => setTimeout(resolve, 1500))
      ]);
    }
    // A new document discards the browser's failed ESM module map. Preserve game
    // routes and the fragment; never append queries to individual module URLs.
    url.searchParams.set(parameter, String(Date.now()));
    location.replace(url.href);
  }
  const fail = (error, entryFailed = false) => {
    if (ready) return;
    showFailure();
    if (entryFailed || moduleFailure(error)) void recover();
  };
  const onError = event => {
    const target = event.target;
    if (target?.tagName === 'SCRIPT' && target.type === 'module' &&
        target.src === new URL('./patches/loading-cache/runtime/startup.mjs', document.baseURI).href) fail(event.message, true);
  };
  const onRejection = event => { if (moduleFailure(event.reason)) fail(event.reason); };
  addEventListener('error', onError, true);
  addEventListener('unhandledrejection', onRejection);
  retry.href = location.href;
  retry.addEventListener('click', event => { event.preventDefault(); void recover(true); });
  window.__inkwaveRecovery = {
    fail,
    ready() {
      ready = true;
      removeEventListener('error', onError, true);
      removeEventListener('unhandledrejection', onRejection);
      const url = new URL(location.href);
      if (url.searchParams.has(parameter)) {
        url.searchParams.delete(parameter);
        history.replaceState(history.state, '', url.href);
      }
    }
  };
})();
