import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../runtime/startup.mjs', import.meta.url), 'utf8');
const bootstrap = "await import('../../splatoon3/bootstrap.mjs');";
assert.equal(source.split(bootstrap).length, 2);

async function fixture(register, { screen = 'title', idleCallback = true } = {}) {
  const events = new Map(), idle = [], timers = new Map(), observers = [];
  const ui = { dataset: { screen } };
  const elements = {
    'ui-root': {}, 'inkwave-startup-shell': { hidden: false },
    'inkwave-startup-status': {}, 'inkwave-cache-status': {}
  };
  let timerId = 0;
  class MutationObserver {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() {}
  }
  const context = vm.createContext({
    URL, URLSearchParams, WeakSet, Promise, MutationObserver,
    location: { href: 'https://fixture.invalid/actions/?map=cargo', search: '?map=cargo' },
    navigator: { onLine: true, serviceWorker: { register, ready: Promise.resolve({ active: null }) } },
    window: { isSecureContext: true },
    document: { getElementById: id => elements[id], querySelector: () => ui },
    performance: { now: () => 1, mark() {}, getEntriesByName: () => [] },
    addEventListener: (type, callback) => events.set(type, callback),
    ...(idleCallback ? { requestIdleCallback: callback => idle.push(callback) } : {}),
    requestAnimationFrame: callback => queueMicrotask(callback),
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id),
    __importBootstrap: async () => {}, console
  });
  await vm.runInContext(`(async () => {${source.replace(bootstrap, 'await __importBootstrap();')}\n})()`, context);
  context.window.__inkwaveStartup.engineReady({});
  return {
    ui, events, idle, timers, report: context.window.__inkwaveStartup.report,
    async runIdle() { assert.equal(idle.length, 1); await idle.shift()(); },
    async runTimer() {
      assert.equal(timers.size, 1);
      const [id, callback] = timers.entries().next().value; timers.delete(id); await callback();
    },
    menu(screen) { ui.dataset.screen = screen; observers[0].callback(); }
  };
}
const registration = () => ({ active: null, addEventListener() {} });
const tick = () => new Promise(resolve => setImmediate(resolve));

test('a rejected registration can retry on a later online edge without reloading', async () => {
  const calls = [];
  const f = await fixture(async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) throw Error('offline during registration');
    return registration();
  });
  await f.runIdle();
  assert.match(f.report.swError, /offline/);
  f.events.get('online')();
  await f.runIdle();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, 'https://fixture.invalid/actions/sw.js');
  assert.equal(calls[1].options.scope, '/actions/');
  assert.equal(calls[1].options.updateViaCache, 'none');
  f.events.get('online')(); f.menu('main');
  assert.equal(f.idle.length, 0);
});

test('rejected registration is retryable on menu return without an automatic retry loop', async () => {
  let calls = 0;
  const f = await fixture(async () => { calls++; throw Error('storage denied'); });
  await f.runIdle(); await tick();
  assert.equal(calls, 1); assert.equal(f.idle.length, 0); assert.equal(f.timers.size, 0);
  f.menu('match'); f.menu('main');
  await f.runIdle(); await tick();
  assert.equal(calls, 2); assert.equal(f.idle.length, 0); assert.equal(f.timers.size, 0);
});

test('online and menu events cannot duplicate a pending or successful registration', async () => {
  let resolve, calls = 0;
  const f = await fixture(() => { calls++; return new Promise(done => { resolve = done; }); });
  f.events.get('online')(); f.menu('main');
  assert.equal(f.idle.length, 1);
  const running = f.runIdle();
  f.events.get('online')(); f.menu('title');
  assert.equal(calls, 1); assert.equal(f.idle.length, 0);
  resolve(registration()); await running;
  f.events.get('online')(); f.menu('main');
  assert.equal(calls, 1); assert.equal(f.idle.length, 0);
});

test('a reconnect during gameplay waits for menu return before retrying', async () => {
  let calls = 0;
  const f = await fixture(async () => {
    if (++calls === 1) throw Error('offline');
    return registration();
  });
  await f.runIdle(); f.menu('match'); f.events.get('online')();
  assert.equal(calls, 1); assert.equal(f.idle.length, 0);
  f.menu('main'); await f.runIdle();
  assert.equal(calls, 2);
});

test('leaving the menu before idle execution preserves deferred registration', async () => {
  let calls = 0;
  const f = await fixture(async () => { calls++; return registration(); });
  f.menu('match'); await f.runIdle();
  assert.equal(calls, 0);
  f.events.get('online')(); assert.equal(f.idle.length, 0);
  f.menu('main'); await f.runIdle();
  assert.equal(calls, 1);
});

test('timer fallback retries synchronous registration failure on an explicit online edge', async () => {
  let calls = 0;
  const f = await fixture(() => {
    if (++calls === 1) throw Error('registration unavailable');
    return Promise.resolve(registration());
  }, { idleCallback: false });
  await f.runTimer();
  assert.equal(calls, 1); assert.equal(f.timers.size, 0);
  f.events.get('online')(); f.events.get('online')();
  await f.runTimer();
  assert.equal(calls, 2); assert.equal(f.timers.size, 0);
});
