/* INKWAVE loading-cache worker. Build replaces the single configuration marker.
 * Immutable revision requests are cache-first, never stale-while-revalidate.
 * Mutable navigations stay network-first. Updates wait for old clients to close;
 * no skipWaiting, automatic reload, or cross-revision response substitution.
 */
const BUILD = /*__INKWAVE_CACHE_BUILD__*/ null;
const SCOPE = new URL(self.registration.scope);
const PREFIX = `inkwave-startup-v2:${SCOPE.pathname}:`;
const META = PREFIX + 'state';
const SNAPSHOT = revision => PREFIX + revision;
const STATE_URL = new URL('__inkwave_cache_state__', SCOPE).href;
const COMPLETE_URL = new URL('__inkwave_cache_complete__', SCOPE).href;
const INDEX_URL = new URL('index.html', SCOPE).href;
const CURRENT = SNAPSHOT(BUILD.revision);
const REVISION_PREFIX = new URL(`_versions/${BUILD.revision}/`, SCOPE).href;
const NAVIGATION_TIMEOUT_MS = 4000;
const MAX_HTML_BYTES = 512 * 1024;
const MAX_REVISION_BYTES = 12 * 1024 * 1024;
const flights = new Map();
const jsonResponse = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
const safeRevision = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

async function state(strict = false) {
  try { return await (await (await caches.open(META)).match(STATE_URL))?.json() || {}; }
  catch (error) { if (strict) throw error; return {}; }
}
async function complete(revision) {
  if (!safeRevision(revision)) return null;
  try {
    if (!(await caches.keys()).includes(SNAPSHOT(revision))) return null;
    const cache = await caches.open(SNAPSHOT(revision));
    const marker = await (await cache.match(COMPLETE_URL))?.json();
    if (marker?.revision !== revision || marker.declaredBytes > MAX_REVISION_BYTES) return null;
    // CacheStorage may be cleared or partially damaged; a marker alone is not a readiness guarantee.
    const present = new Set((await cache.keys()).map(request => request.url));
    const required = marker.precache;
    return Array.isArray(required) && present.has(INDEX_URL) && required.every(url => present.has(url)) ? cache : null;
  } catch { return null; }
}
async function prune(keep) {
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== META && !keep.has(key))
    .map(key => caches.delete(key)));
}
async function verify(response, expected) {
  if (!response || response.status !== 200 || response.type === 'opaque' || response.redirected) {
    throw new Error('Uncacheable response');
  }
  // Clone before exposing the response. Never clone a response whose body the page already consumed.
  const bytes = await response.clone().arrayBuffer();
  if (bytes.byteLength !== expected.bytes || await digest(bytes) !== expected.sha256) {
    throw new Error('Revision asset integrity mismatch');
  }
  return response;
}
async function timedFetch(request, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try { return await fetch(request, { signal: controller.signal }); }
  finally { clearTimeout(timer); }
}
async function populate(cache, rel, reusable, reusableRevision) {
  const url = new URL(rel, REVISION_PREFIX).href;
  const existing = await cache.match(url);
  if (existing) { await verify(existing, BUILD.assets[rel]); return; }
  if (reusable && reusableRevision) {
    const oldURL = new URL(`_versions/${reusableRevision}/${rel}`, SCOPE).href;
    const old = await reusable.match(oldURL);
    let valid = false;
    if (old) { try { await verify(old, BUILD.assets[rel]); valid = true; } catch { /* changed bytes: fetch the new version */ } }
    if (valid) { await cache.put(url, old); return; }
  }
  // HTTP cache can satisfy this without a transfer. Only immutable, exact revision URLs use force-cache.
  const response = await timedFetch(new Request(url, { cache: 'force-cache', credentials: 'same-origin' }), 30000);
  await verify(response, BUILD.assets[rel]);
  await cache.put(url, response);
}
async function installSnapshot() {
  if (BUILD.declaredBytes > MAX_REVISION_BYTES || BUILD.index.bytes > MAX_HTML_BYTES) throw new Error('Cache budget exceeded');
  const previous = await state(true);
  const active = safeRevision(previous.activeRevision) ? previous.activeRevision : null;
  if (!active) {
    // Missing metadata must not turn a valid active offline snapshot into garbage.
    // Only a fetch-handling (therefore active) worker may repair this metadata.
    for (const name of await caches.keys()) {
      if (name.startsWith(PREFIX) && name !== CURRENT && name !== META && await complete(name.slice(PREFIX.length))) {
        throw new Error('Cache state missing; active worker repairs it on navigation');
      }
    }
  }
  // At most two revisions, even if many deploys happen while an old tab stays open.
  // A failed candidate never removes the active offline snapshot.
  await prune(new Set([CURRENT, ...(active ? [SNAPSHOT(active)] : [])]));
  const cache = await caches.open(CURRENT);
  const reusable = active && active !== BUILD.revision ? await complete(active) : null;
  try {
    const html = await timedFetch(new Request(INDEX_URL, { cache: 'no-cache', credentials: 'same-origin' }), 30000);
    await verify(html, BUILD.index);
    // Store the verified body now; retaining an unread response across a long
    // precache queue is unnecessary. Without COMPLETE_URL this is not a usable
    // offline snapshot, and failure still deletes the candidate transaction.
    await cache.put(INDEX_URL, html);
    const pending = [...BUILD.precache];
    let failed = false;
    const copy = async () => {
      try { while (pending.length && !failed) await populate(cache, pending.shift(), reusable, active); }
      catch (error) { failed = true; throw error; }
    };
    const results = await Promise.allSettled([copy(), copy()]);
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    // Commit marker is last: interrupted install is not an offline-ready snapshot.
    await cache.put(COMPLETE_URL, jsonResponse({ revision: BUILD.revision, declaredBytes: BUILD.declaredBytes, installedAt: Date.now(), precache: BUILD.precache.map(rel => new URL(rel, REVISION_PREFIX).href) }));
  } catch (error) {
    if (active !== BUILD.revision) await caches.delete(CURRENT).catch(() => {});
    throw error;
  }
}
self.addEventListener('install', event => event.waitUntil(installSnapshot()));

self.addEventListener('activate', event => event.waitUntil((async () => {
  const previous = await state();
  const old = previous.activeRevision === BUILD.revision ? previous.previousRevision : previous.activeRevision;
  const previousRevision = safeRevision(old) && old !== BUILD.revision ? old : null;
  const meta = await caches.open(META);
  await meta.put(STATE_URL, jsonResponse({ activeRevision: BUILD.revision, previousRevision }));
  await prune(new Set([CURRENT, ...(previousRevision ? [SNAPSHOT(previousRevision)] : [])]));
  // The old worker used one unscoped cache. Remove only this app's entries, never a neighbor's caches.
  if ((await caches.keys()).includes('inkwave-shell-v1')) {
    const legacy = await caches.open('inkwave-shell-v1');
    for (const request of await legacy.keys()) {
      const url = new URL(request.url);
      if (url.origin === SCOPE.origin && url.pathname.startsWith(SCOPE.pathname)) await legacy.delete(request);
    }
    if (!(await legacy.keys()).length) await caches.delete('inkwave-shell-v1');
  }
  await self.clients.claim();
})()));

async function offlineIndex() {
  // Prefer the version of this active worker, not an unactivated newer candidate.
  const cache = await complete(BUILD.revision);
  const current = cache && await cache.match(INDEX_URL);
  if (current) return current;
  const previous = (await state()).previousRevision;
  const old = await complete(previous);
  return old ? await old.match(INDEX_URL) : null;
}
function recoveryDocument() {
  return new Response(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>INKWAVE — オフライン</title><style>body{margin:0;min-height:100vh;display:grid;place-content:center;background:#101018;color:#fff;font:16px system-ui;padding:24px}p{max-width:36em;line-height:1.7}a{color:#b6f477}</style><h1>INKWAVE</h1><p>オフラインです。保存済みデータが見つからないか、ブラウザにより削除されています。通信が戻ってから、このページを開き直してください。</p><a href="${SCOPE.pathname}">もう一度開く</a></html>`, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
async function repairActiveState() {
  try {
    const current = await state();
    if (safeRevision(current.activeRevision) || !await complete(BUILD.revision)) return;
    const meta = await caches.open(META);
    await meta.put(STATE_URL, jsonResponse({ activeRevision: BUILD.revision, previousRevision: null }));
  } catch { /* unavailable storage cannot block navigation */ }
}
async function navigation(request) {
  try {
    const response = await timedFetch(new Request(request, { cache: 'no-cache' }), NAVIGATION_TIMEOUT_MS);
    if (response.status >= 500) return await offlineIndex() || response;
    // A snapshot's HTML was verified and committed by install. No per-navigation re-copy;
    // new network HTML is never stored in an older, incomplete dependency snapshot.
    return response;
  } catch { return await offlineIndex() || recoveryDocument(); }
}
async function currentAsset(request, rel) {
  let cache;
  try {
    cache = await caches.open(CURRENT);
    const hit = await cache.match(request);
    if (hit) return hit; // The common warm path: no fetch, clone-to-storage, digest, or revalidation.
  } catch { return fetch(request); }
  let task = flights.get(request.url);
  if (!task) {
    task = (async () => {
      const response = await fetch(request);
      if (!response.ok) return response;
      await verify(response, BUILD.assets[rel]);
      try { await cache.put(request, response.clone()); } catch { /* quota: online play must still work */ }
      return response;
    })();
    flights.set(request.url, task);
    task.then(() => flights.delete(request.url), () => flights.delete(request.url));
  }
  return (await task).clone();
}
async function retainedAsset(request, revision) {
  // Existing old documents may need their predecessor's tree. Never substitute the current revision.
  const names = await caches.keys().catch(() => []);
  if (names.includes(SNAPSHOT(revision))) {
    try { const hit = await (await caches.open(SNAPSHOT(revision))).match(request); if (hit) return hit; } catch { /* eviction */ }
  }
  return fetch(request); // Unknown future revisions belong to their own worker; do not create unbounded caches.
}
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== SCOPE.origin) return;
  let work;
  if (request.mode === 'navigate') {
    // The app uses query-parameter routes, not arbitrary deep SPA paths.
    if (![SCOPE.pathname, new URL(INDEX_URL).pathname].includes(url.pathname)) return;
    event.waitUntil(repairActiveState());
    work = navigation(request);
  } else {
    if (url.search || request.headers.has('range')) return; // No query-key cache growth or partial-body poisoning.
    const prefix = new URL('_versions/', SCOPE).pathname;
    if (!url.pathname.startsWith(prefix)) return; // Mutable root assets stay in the native HTTP cache.
    const match = /^([a-f0-9]{64})\/(.+)$/.exec(url.pathname.slice(prefix.length));
    if (!match) return;
    const [, revision, rel] = match;
    if (revision === BUILD.revision) {
      if (!Object.prototype.hasOwnProperty.call(BUILD.assets, rel)) return;
      work = currentAsset(request, rel);
    } else work = retainedAsset(request, revision);
  }
  // Both registrations happen synchronously in the dispatch, before any cache/network await.
  event.respondWith(work);
  event.waitUntil(work.then(() => undefined, () => undefined));
});
self.addEventListener('message', event => {
  if (event.data?.type !== 'INKWAVE_CACHE_STATUS') return;
  event.waitUntil((async () => {
    const ready = !!await complete(BUILD.revision);
    event.ports?.[0]?.postMessage({ type: 'INKWAVE_CACHE_STATUS', revision: BUILD.revision, offlineReady: ready });
  })());
});
