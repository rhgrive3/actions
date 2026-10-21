import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../recovery.js', import.meta.url), 'utf8');
function fixture({ query = '?map=tidewater#play', offline = false, denied = false, recent = false, sw } = {}) {
  const listeners = new Map(), navigations = [], storage = new Map();
  const elements = Object.fromEntries(['inkwave-startup-shell', 'inkwave-startup-retry', 'inkwave-startup-status', 'boot-error']
    .map(id => [id, { hidden: true, style: {}, addEventListener(type, fn) { this[type] = fn; } }]));
  const location = { href: 'https://fixture.invalid/actions/' + query, replace(url) { navigations.push(url); } };
  const navigator = { onLine: !offline, ...(sw ? { serviceWorker: sw } : {}) };
  const sessionStorage = {
    getItem(key) { if (denied) throw Error('SecurityError'); return storage.get(key) || null; },
    setItem(key, value) { if (denied) throw Error('SecurityError'); storage.set(key, value); }
  };
  if (recent) storage.set('inkwave-startup-recovery:/actions/', String(Date.now()));
  const history = { state: { keep: 1 }, replaceState(state, _, url) { this.saved = { state, url }; } };
  const context = vm.createContext({ URL, Date, Promise, location, navigator, sessionStorage, history, setTimeout,
    window: { isSecureContext: true },
    document: { baseURI: 'https://fixture.invalid/actions/_versions/old/', getElementById: id => elements[id] },
    addEventListener(type, fn) { listeners.set(type, fn); }, removeEventListener(type) { listeners.delete(type); }
  });
  vm.runInContext(source, context);
  return { api: context.window.__inkwaveRecovery, elements, listeners, navigations, history, storage,
    entryError() { listeners.get('error')({ target: { tagName: 'SCRIPT', type: 'module', src: 'https://fixture.invalid/actions/_versions/old/patches/loading-cache/runtime/startup.mjs' } }); } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('missing entry module recovers without any startup module, preserving routes and storage', async () => {
  const f = fixture(); f.entryError(); await tick();
  assert.equal(f.navigations.length, 1);
  const url = new URL(f.navigations[0]);
  assert.equal(url.pathname, '/actions/'); assert.equal(url.searchParams.get('map'), 'tidewater');
  assert(url.searchParams.has('__iw_recover')); assert.equal(url.hash, '#play');
  assert.equal(f.elements['inkwave-startup-shell'].hidden, false);
  assert.equal(f.elements['inkwave-startup-retry'].hidden, false);
});
test('storage denial and repeated errors cannot create a navigation loop', async () => {
  const f = fixture({ denied: true }); f.entryError(); f.entryError(); await tick();
  assert.equal(f.navigations.length, 1);
  const retry = fixture({ denied: true, query: '?map=cargo&__iw_recover=1' });
  retry.entryError(); await tick(); assert.equal(retry.navigations.length, 0);
  let prevented = false;
  retry.elements['inkwave-startup-retry'].click({ preventDefault() { prevented = true; } });
  await tick(); assert(prevented); assert.equal(retry.navigations.length, 1);
});
test('offline failure keeps retry available without deleting caches or reloading', async () => {
  const f = fixture({ offline: true }); f.entryError(); await tick();
  assert.equal(f.navigations.length, 0); assert.equal(f.elements['inkwave-startup-retry'].hidden, false);
  assert.match(f.elements['inkwave-startup-status'].textContent, /通信が戻って/);
});
test('Firefox, Safari and Chromium module failures retry; application exceptions do not', async () => {
  for (const error of ['TypeError: Failed to fetch dynamically imported module: old.js',
    'TypeError: error loading dynamically imported module', 'TypeError: Importing a module script failed.']) {
    const f = fixture(); f.api.fail(error); await tick(); assert.equal(f.navigations.length, 1, error);
  }
  const f = fixture(); f.api.fail(new Error('undefined property')); await tick();
  assert.equal(f.navigations.length, 0); assert.equal(f.elements['inkwave-startup-retry'].hidden, false);
});
test('worker update is attempted before failed-game navigation even when menu never mounted', async () => {
  const calls = [];
  const f = fixture({ sw: { async register(url, options) {
    calls.push({ url: String(url), options }); return { async update() { calls.push('update'); } };
  } } });
  f.entryError(); await tick(); assert.equal(f.navigations.length, 1);
  assert.equal(calls[0].url, 'https://fixture.invalid/actions/sw.js');
  assert.equal(calls[0].options.scope, '/actions/'); assert.equal(calls[0].options.updateViaCache, 'none');
  assert.equal(calls[1], 'update');
});
test('registration rejection does not strand startup recovery', async () => {
  const f = fixture({ sw: { register() { return Promise.reject(Error('storage denied')); } } });
  f.entryError(); await tick(); assert.equal(f.navigations.length, 1);
});
test('recent recovery is bounded across pages and successful boot cleans the internal parameter', async () => {
  const recent = fixture({ recent: true }); recent.entryError(); await tick(); assert.equal(recent.navigations.length, 0);
  const f = fixture({ query: '?skipTitle&__iw_recover=1#play' }); f.api.ready();
  assert.equal(f.history.saved.url, 'https://fixture.invalid/actions/?skipTitle=#play');
  assert.equal(f.listeners.size, 0); f.api.fail('Failed to fetch'); await tick();
  assert.equal(f.navigations.length, 0);
});
test('modulepreload and unrelated resource errors do not restart a healthy startup', async () => {
  const f = fixture();
  f.listeners.get('error')({ target: { tagName: 'LINK', rel: 'modulepreload' } });
  f.listeners.get('error')({ target: { tagName: 'IMG' } });
  await tick(); assert.equal(f.navigations.length, 0);
});
