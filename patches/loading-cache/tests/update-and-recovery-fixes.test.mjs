import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { World, makeBuild, REV_A } from './worker-fixture.mjs';

const prefix = 'inkwave-startup-v2:/actions/:';
const asset = (revision, path = 'src/main.js') => `_versions/${revision}/${path}`;
const get = async (w, path, opts) => (await w.request(path, opts)).response;
const recoverySource = fs.readFileSync(new URL('../recovery.js', import.meta.url), 'utf8');
const startupSource = fs.readFileSync(new URL('../runtime/startup.mjs', import.meta.url), 'utf8');

test('INKWAVE_SKIP_WAITING message triggers skipWaiting while install never does', async () => {
  const world = new World();
  const build = makeBuild();
  world.serve(build);
  const worker = world.worker(build);
  await worker.install();
  assert.equal(worker.counts.skipWaiting, 0);
  await worker.message({ type: 'INKWAVE_SKIP_WAITING' });
  assert.equal(worker.counts.skipWaiting, 1);
});

test('populate deletes a corrupted existing entry and refetches verified bytes instead of aborting install', async () => {
  const world = new World();
  const build = makeBuild();
  world.serve(build);
  const cache = await world.caches.open(prefix + REV_A);
  await cache.put(world.url(asset(REV_A)), new Response('corrupted bytes'));
  const worker = world.worker(build);
  await worker.install();
  await worker.activate();
  assert.equal(await (await cache.match(world.url(asset(REV_A)))).text(), 'export const v=1;');
  assert.equal((await worker.status()).offlineReady, true);
});

test('boot recovery also repairs corrupted non-JS precache entries (e.g. JSON)', async () => {
  const world = new World();
  const build = makeBuild();
  world.serve(build);
  const worker = world.worker(build);
  await worker.install();
  await worker.activate();
  const jsonUrl = world.url(asset(REV_A, 'profile.json'));
  world.maps.get(prefix + REV_A).get(jsonUrl).body = Buffer.from('corrupt json');
  world.route('./?__iw_recover=1', 'fresh index', 200, { 'Content-Type': 'text/html' });
  const res = await get(worker, './?__iw_recover=1', { mode: 'navigate' });
  assert.equal(await res.text(), 'fresh index');
  assert.equal(world.maps.get(prefix + REV_A).has(jsonUrl), false);
});

test('manual retry after automatic recovery clears only scoped startup caches and unregisters SW', async () => {
  let replaced = null;
  let unregistered = 0;
  let skipWaitingSent = 0;
  const deletedCaches = [];
  const listeners = new Map();
  const retryEl = { hidden: true, href: '', addEventListener(t, fn) { listeners.set(t, fn); } };
  const statusEl = { textContent: '' };
  const shellEl = { hidden: false, style: {} };
  const sandbox = {
    URL,
    Date,
    Promise,
    setTimeout,
    clearTimeout,
    window: { isSecureContext: true },
    location: { href: 'https://example.test/inkwave/?__iw_recover=1', replace(u) { replaced = u; } },
    history: { state: null, replaceState() {} },
    navigator: {
      onLine: true,
      serviceWorker: {
        register: async () => ({
          update: async () => {},
          waiting: { postMessage(msg) { if (msg?.type === 'INKWAVE_SKIP_WAITING') skipWaitingSent++; } },
          unregister: async () => { unregistered++; return true; },
        }),
      },
    },
    caches: {
      keys: async () => ['inkwave-startup-v2:/inkwave/:rev1', 'inkwave-startup-v2:/inkwave/:state', 'other-app-cache'],
      delete: async k => { deletedCaches.push(k); return true; },
    },
    document: {
      baseURI: 'https://example.test/inkwave/',
      getElementById: id => ({ 'inkwave-startup-retry': retryEl, 'inkwave-startup-status': statusEl, 'inkwave-startup-shell': shellEl })[id] || null,
    },
    sessionStorage: { getItem: () => null, setItem() {} },
    addEventListener() {},
    removeEventListener() {},
  };
  vm.runInNewContext(recoverySource, sandbox);
  listeners.get('click')({ preventDefault() {} });
  await new Promise(r => setTimeout(r, 30));
  assert.equal(skipWaitingSent, 1);
  assert.equal(unregistered, 1);
  assert.deepEqual(deletedCaches, ['inkwave-startup-v2:/inkwave/:rev1', 'inkwave-startup-v2:/inkwave/:state']);
  assert.ok(replaced && replaced.includes('__iw_recover='));
});

test('startup update badge sends INKWAVE_SKIP_WAITING and reloads on controllerchange', async () => {
  let skipWaitingCalls = 0;
  let reloadCalls = 0;
  let updateCalls = 0;
  const swListeners = new Map();
  const docListeners = new Map();
  let buttonClick = null;
  const badgeEl = {
    hidden: true,
    textContent: '',
    classList: { toggle() {}, remove() {} },
    appendChild(child) { buttonClick = child._onClick; },
  };
  const uiEl = { dataset: { screen: 'title' } };
  const waitingWorker = { postMessage(msg) { if (msg?.type === 'INKWAVE_SKIP_WAITING') skipWaitingCalls++; } };
  const registration = {
    waiting: waitingWorker,
    installing: null,
    active: { postMessage() {} },
    addEventListener() {},
    update: async () => { updateCalls++; },
  };
  const body = startupSource.replace(
    "await import('../../splatoon3/bootstrap.mjs');",
    "/* stubbed bootstrap */"
  );
  const sandbox = {
    URL,
    URLSearchParams,
    Date,
    WeakMap,
    WeakSet,
    Promise,
    MessageChannel,
    setTimeout: fn => { queueMicrotask(fn); return 1; },
    clearTimeout() {},
    requestAnimationFrame: fn => fn(),
    requestIdleCallback: fn => fn(),
    performance: { now: () => 1, mark() {}, getEntriesByName: () => [], getEntriesByType: () => [] },
    console,
    MutationObserver: class { observe() {} disconnect() {} },
    window: { isSecureContext: true },
    location: { href: 'https://example.test/inkwave/', search: '', reload() { reloadCalls++; } },
    navigator: {
      onLine: true,
      serviceWorker: {
        controller: { postMessage() {} },
        ready: Promise.resolve(registration),
        register: async () => registration,
        addEventListener(t, fn) { swListeners.set(t, fn); },
      },
    },
    document: {
      visibilityState: 'visible',
      body: {},
      getElementById: id => id === 'inkwave-cache-status' ? badgeEl : null,
      querySelector: sel => sel === '.iw-ui' ? uiEl : null,
      createElement: () => ({ addEventListener(t, fn) { if (t === 'click') this._onClick = fn; } }),
      addEventListener(t, fn) { docListeners.set(t, fn); },
    },
    addEventListener() {},
  };
  await vm.runInNewContext(`(async () => {\n${body}\n})()`, sandbox);
  sandbox.window.__inkwaveStartup.engineReady({ bootMs: 10 });
  await new Promise(r => setImmediate(r));
  assert.equal(typeof buttonClick, 'function', 'update apply button should be mounted');
  buttonClick();
  assert.equal(skipWaitingCalls, 1);
  assert.equal(reloadCalls, 0);
  swListeners.get('controllerchange')();
  assert.equal(reloadCalls, 1);
  assert.equal(typeof docListeners.get('visibilitychange'), 'function');
  assert.equal(updateCalls, 0);
});
