// Booting the game page for the ranked browser verifier (#1608).
//
// The verifier used to wait 180 s for a single in-page predicate. When the
// public-URL boot timed out the job log contained only "TimeoutError", which can
// not tell apart (a) the browser being served a build other than the one under
// test (Pages publication/CDN propagation), (b) a failed asset request and
// (c) a genuine boot hang with the correct build. This module keeps the strict
// predicate and the 180 s bound, but a failed boot now
//   * records what the browser actually received (served build identity, failed
//     requests, console errors, boot-state flags),
//   * names the conclusion, and
//   * is retried (bounded, in a fresh browser context) ONLY when the served build
//     provably differs from the tested one. A boot hang with the correct build is
//     never retried or masked.

export const BOOT_TIMEOUT_MS = 180000;
export const STALE_BUILD_ATTEMPTS = 3;
const BOUND = 40;

// Evaluated in the page: the game is playable.
export function gameBootReady() {
  return !!(RG.game?.menus && RG.s3?.installed && RG.mode !== 'boot');
}

// Evaluated in the page: the build identity this browser really loads, bypassing HTTP caches.
export async function readServedBuild() {
  try {
    const response = await fetch(new URL('inkwave-build.json?bootProbe=' + Date.now(), document.baseURI), { cache: 'no-store' });
    if (!response.ok) return { error: 'HTTP ' + response.status };
    const manifest = await response.json();
    return { contentHash: manifest.contentHash ?? null, inputHash: manifest.inputHash ?? null, revision: manifest.build?.revision ?? null };
  } catch (error) { return { error: String(error?.message || error) }; }
}

// Evaluated in the page: how far the boot got.
export function readBootState() {
  const G = globalThis.RG;
  return {
    readyState: document.readyState, visibility: document.visibilityState, hidden: document.hidden,
    hasRG: !!G, mode: G?.mode ?? null, menus: !!G?.game?.menus, game: !!G?.game, s3Installed: !!G?.s3?.installed,
    serviceWorker: navigator.serviceWorker?.controller ? 'controlled' : 'uncontrolled',
    now: performance.now(),
  };
}

export function observeBoot(page) {
  const seen = { console: [], failedRequests: [], badResponses: [], pageErrors: [] };
  const push = (list, item) => { list.push(item); if (list.length > BOUND) list.shift(); };
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) push(seen.console, { type: message.type(), text: String(message.text()).slice(0, 300) }); });
  page.on('requestfailed', request => push(seen.failedRequests, { url: request.url().slice(0, 240), failure: request.failure()?.errorText ?? null }));
  page.on('response', response => { if (response.status() >= 400) push(seen.badResponses, { status: response.status(), url: response.url().slice(0, 240) }); });
  page.on('pageerror', error => push(seen.pageErrors, String(error?.message || error).slice(0, 300)));
  return seen;
}

export function sameBuild(served, expected) {
  return !!served && !served.error && served.contentHash === expected.contentHash &&
    served.inputHash === expected.inputHash && served.revision === expected.revision;
}

// Pure classification so it can be unit tested without a browser.
export function classifyBootFailure({ served, observed, state }) {
  if (!served || served.error) return { kind: 'identity-unavailable', stale: false };
  if (served.stale) return { kind: 'stale-build', stale: true };
  if (observed.badResponses.length || observed.failedRequests.length) return { kind: 'asset-request-failed', stale: false };
  if (observed.pageErrors.length) return { kind: 'page-error', stale: false };
  if (!state?.hasRG) return { kind: 'runtime-never-loaded', stale: false };
  return { kind: 'boot-hang-with-expected-build', stale: false };
}

export async function collectBootDiagnostics(page, observed, expected) {
  const settle = (promise) => promise.catch(error => ({ error: String(error?.message || error) }));
  const state = await settle(page.evaluate(readBootState));
  const servedRaw = expected ? await settle(page.evaluate(readServedBuild)) : null;
  const served = servedRaw && !servedRaw.error ? { ...servedRaw, stale: !sameBuild(servedRaw, expected) } : servedRaw;
  const conclusion = classifyBootFailure({ served: expected ? served : { stale: false }, observed, state });
  return { url: page.url?.() ?? null, expected: expected ?? null, served, state, observed, conclusion };
}

// Waits for the game to be playable. On timeout throws an Error whose message names the conclusion
// and whose `.diagnostics` carries the evidence; `.stale` is true only for a provably different served build.
export async function waitForGameBoot(page, { timeoutMs = BOOT_TIMEOUT_MS, expected = null, observed = null, onFailure = null } = {}) {
  try {
    await page.waitForFunction(gameBootReady, null, { timeout: timeoutMs });
  } catch (cause) {
    const diagnostics = await collectBootDiagnostics(page, observed || { console: [], failedRequests: [], badResponses: [], pageErrors: [] }, expected);
    if (onFailure) await Promise.resolve(onFailure(diagnostics)).catch(() => {});
    const error = new Error('Ranked boot did not complete within ' + timeoutMs + ' ms: ' + diagnostics.conclusion.kind +
      ' (served ' + JSON.stringify(diagnostics.served) + ', state ' + JSON.stringify(diagnostics.state) + ')', { cause });
    error.diagnostics = diagnostics; error.stale = diagnostics.conclusion.stale;
    throw error;
  }
}

// openPage() -> { page, observed, close() }. Retries ONLY provably stale builds, in a fresh context each time.
export async function bootRankedPage(openPage, { expected = null, timeoutMs = BOOT_TIMEOUT_MS, attempts = STALE_BUILD_ATTEMPTS,
  pause = ms => new Promise(resolve => setTimeout(resolve, ms)), pauseMs = 10000, onFailure = null } = {}) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const opened = await openPage();
    try {
      await waitForGameBoot(opened.page, { timeoutMs, expected, observed: opened.observed, onFailure: diagnostics => onFailure?.({ attempt, ...diagnostics }) });
      return opened.page;
    } catch (error) {
      last = error;
      // The final (or non-retryable) page stays open: the caller's failure screenshots and trace need it.
      if (!error.stale || attempt === attempts) throw error;
      await opened.close?.();
      await pause(pauseMs);
    }
  }
  throw last;
}
