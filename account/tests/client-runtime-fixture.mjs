// Node integration fixture: real HTTP, real client source and Node's broadcast
// implementation. This is not a browser cookie jar, Web Locks or DOM emulator.
import fs from 'node:fs';
import vm from 'node:vm';
import { BroadcastChannel } from 'node:worker_threads';

export const until = async (condition, ms = 3000) => {
  const end = Date.now() + ms;
  while (!condition()) {
    if (Date.now() >= end) throw new Error('Integration condition timed out');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
};
export function sharedLockFixture() {
  const queues = new Map();
  return { request(name, { signal }, run) {
    const previous = queues.get(name) || Promise.resolve();
    const operation = previous.catch(() => {}).then(() => {
      if (signal.aborted) throw signal.reason;
      return run();
    });
    queues.set(name, operation);
    const clean = () => { if (queues.get(name) === operation) queues.delete(name); };
    operation.then(clean, clean);
    return new Promise((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
      if (signal.aborted) abort();
    });
  } };
}
export function runtimeClient(origin, { jar = { cookie: '' }, locks = sharedLockFixture(), broadcast = true } = {}) {
  const windowEvents = new EventTarget(), documentEvents = new EventTarget(), names = [];
  const document = Object.assign(documentEvents, { visibilityState: 'visible' });
  const transport = async (url, options) => {
    const headers = new Headers(options.headers);
    headers.set('Origin', origin);
    if (jar.cookie) headers.set('Cookie', jar.cookie);
    const response = await fetch(url, { ...options, headers });
    const cookie = response.headers.get('Set-Cookie');
    if (cookie) jar.cookie = /(?:^|;)\s*Max-Age=0(?:;|$)/i.test(cookie) ? '' : cookie.split(';')[0];
    return response;
  };
  const context = vm.createContext({ console, URL, DOMException, AbortController, Date, setTimeout, clearTimeout,
    document, navigator: { onLine: true, ...(locks ? { locks } : {}) },
    BroadcastChannel: broadcast ? BroadcastChannel : undefined,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
    removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
    game: { setProfileName(name) { names.push(name); } }, fetch: transport,
  });
  const source = name => fs.readFileSync(new URL('../client/src/' + name, import.meta.url), 'utf8');
  vm.runInContext(source('api.js').replace('import.meta.env.VITE_ACCOUNT_API', JSON.stringify(origin + '/api/account')).replace(/^export /gm, ''), context);
  vm.runInContext(source('store.js').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.subject={api,request,account};', context);
  return { ...context.subject, jar, names, windowEvents, document, close() {
    context.subject.account._unwatch?.();
    context.subject.account._refreshController?.abort();
  } };
}
