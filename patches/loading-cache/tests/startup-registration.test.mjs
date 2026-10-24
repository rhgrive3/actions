import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const source = fs.readFileSync(process.env.INKWAVE_BUILT_SITE
  ? path.join(process.env.INKWAVE_BUILT_SITE, 'patches/loading-cache/runtime/startup.mjs')
  : new URL('../runtime/startup.mjs', import.meta.url), 'utf8');
const bootstraps = source.match(/await import\((['"])\.\.\/\.\.\/splatoon3\/bootstrap\.mjs\1\)/g);
assert.equal(bootstraps?.length, 1, 'one actual bootstrap import in source or emitted runtime');
const [bootstrap] = bootstraps;
assert.equal(source.split(bootstrap).length, 2);

async function fixture(register, { screen = 'title', idleCallback = true, globals = {}, serviceWorker = {} } = {}) {
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
    navigator: { onLine: true, serviceWorker: { register, ready: Promise.resolve({ active: null }), ...serviceWorker } },
    window: { isSecureContext: true },
    document: { getElementById: id => elements[id], querySelector: () => ui },
    performance: { now: () => 1, mark() {}, getEntriesByName: () => [] },
    addEventListener: (type, callback) => events.set(type, callback),
    ...(idleCallback ? { requestIdleCallback: callback => idle.push(callback) } : {}),
    requestAnimationFrame: callback => queueMicrotask(callback),
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id),
    __importBootstrap: async () => {}, console, ...globals
  });
  await vm.runInContext(`(async () => {${source.replace(bootstrap, 'await __importBootstrap()')}\nglobalThis.__cacheProbe = cacheStatus;\n})()`, context);
  context.window.__inkwaveStartup.engineReady({});
  return {
    ui, events, idle, timers, context, report: context.window.__inkwaveStartup.report,
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

function channels(){
 const list=[];
 class MessageChannel {constructor(){this.port1={closed:false,close(){this.closed=true;}};this.port2={closed:false,close(){this.closed=true;}};list.push(this);}}
 return{MessageChannel,list,reply(index,offlineReady=true){list[index].port1.onmessage({data:{type:'INKWAVE_CACHE_STATUS',offlineReady}});}};
}
test('warm register and ready share one scan, while later calls recheck storage',async()=>{
 const c=channels(),worker={postMessage(){}};
 const f=await fixture(async()=>({active:worker,addEventListener(){}}),{globals:{MessageChannel:c.MessageChannel},serviceWorker:{ready:Promise.resolve({active:worker})}});
 const run=f.runIdle();await tick();assert.equal(c.list.length,1);c.reply(0);await run;await tick();assert.equal(c.list.length,1);
 const a=f.context.__cacheProbe(worker),b=f.context.__cacheProbe(worker);assert.equal(a,b);assert.equal(c.list.length,2);c.reply(1,false);await a;assert.equal(f.report.cache.offlineReady,false);
 assert.ok(c.list.every(x=>x.port1.closed&&x.port2.closed));
});
test('activation refreshes an in-flight pre-activation probe; timeout permits recovery',async()=>{
 const c=channels(),worker={postMessage(){}};
 const f=await fixture(async()=>registration(),{globals:{MessageChannel:c.MessageChannel}});
 const first=f.context.__cacheProbe(worker);f.context.__cacheProbe(worker,true);assert.equal(c.list.length,1);
 c.reply(0,false);await first;assert.equal(c.list.length,2,'queued activation gets a new storage check');c.reply(1,true);assert.equal(f.report.cache.offlineReady,true);
 const pending=f.context.__cacheProbe(worker);const [id,timeout]=[...f.timers].at(-1);f.timers.delete(id);timeout();assert.equal(await pending,null);
 const recovered=f.context.__cacheProbe(worker);c.reply(c.list.length-1,true);await recovered;assert.equal(f.report.cache.offlineReady,true);
});
test('new worker identity wins over a late old-worker reply',async()=>{
 const c=channels(),old={postMessage(){}},next={postMessage(){}};
 const f=await fixture(async()=>registration(),{globals:{MessageChannel:c.MessageChannel}});
 const a=f.context.__cacheProbe(old),b=f.context.__cacheProbe(next);c.reply(1,true);await b;c.reply(0,false);await a;assert.equal(f.report.cache.offlineReady,true);
});
