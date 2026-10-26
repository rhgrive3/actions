import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sourceRoot = process.env.INKWAVE_ACCOUNT_CLIENT_SOURCE_ROOT || new URL('../client/src/', import.meta.url);
const source = name => fs.readFileSync(new URL(name, typeof sourceRoot === 'string' ? new URL(`file://${sourceRoot.replace(/\/$/, '')}/`) : sourceRoot), 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const plain = value => JSON.parse(JSON.stringify(value));

function apiFixture(fetch) {
  const timers = new Map(); let nextTimer = 0;
  const context = vm.createContext({ fetch, AbortController, console, navigator: { onLine: true },
    setTimeout(fn) { timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout(id) { timers.delete(id); } });
  vm.runInContext(source('api.js').replace('import.meta.env.VITE_ACCOUNT_API', "''").replace(/^export /gm, '') + '\nglobalThis.subject = { request, AccountError };', context);
  return { ...context.subject, timers, context };
}

test('account deadline covers a JSON body that stalls after successful headers', async () => {
  const body = deferred(); let signal;
  const f = apiFixture(async (_url, options) => {
    signal = options.signal;
    signal.addEventListener('abort', () => body.reject(new DOMException('aborted', 'AbortError')), { once: true });
    return { status: 200, ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: () => body.promise };
  });
  const pending = f.request('GET', '/session'); pending.catch(() => {});
  try {
    await settle();
    assert.equal(f.timers.size, 1, 'deadline must stay armed while response body is pending');
    [...f.timers.values()][0]();
    await assert.rejects(pending, e => e instanceof f.AccountError && e.code === 'timeout');
    assert.equal(signal.aborted, true);
    assert.equal(f.timers.size, 0);
  } finally { body.reject(new Error('test cleanup')); }
});

test('account body transport failures are reported as network errors', async () => {
  const f = apiFixture(async () => ({ status: 200, ok: true, headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => { throw new TypeError('connection reset while reading'); } }));
  await assert.rejects(f.request('GET', '/session'), e => e instanceof f.AccountError && e.code === 'network');
  assert.equal(f.timers.size, 0);
});

test('account API preserves successful data, 204 and structured errors', async () => {
  let response = new Response(JSON.stringify({ user: { id: 'u1' } }), { headers: { 'content-type': 'application/json' } });
  const f = apiFixture(async () => response);
  assert.deepEqual(plain(await f.request('GET', '/session')), { user: { id: 'u1' } });
  response = new Response(null, { status: 204 });
  assert.equal(await f.request('POST', '/logout', {}), null);
  response = new Response(JSON.stringify({ error: { code: 'rate_limited', field: 'loginId' } }), { status: 429,
    headers: { 'content-type': 'application/json', 'retry-after': '20' } });
  await assert.rejects(f.request('POST', '/login', {}), e => e instanceof f.AccountError && e.code === 'rate_limited' && e.status === 429 && e.field === 'loginId' && e.retryAfter === 20);
  assert.equal(f.timers.size, 0);
});

test('invalid JSON and missing API remain distinguishable from transport errors', async () => {
  let response = new Response('{broken', { headers: { 'content-type': 'application/json' } });
  const f = apiFixture(async () => response);
  await assert.rejects(f.request('GET', '/session'), e => e.code === 'unknown' && e.status === 200);
  response = new Response('static host', { status: 404 });
  await assert.rejects(f.request('GET', '/session'), e => e.code === 'unavailable' && e.status === 404);
  assert.equal(f.timers.size, 0);
});

function storeFixture() {
  const requests = [], names = [], listeners = [];
  class AccountError extends Error { constructor(code) { super(code); this.code = code; } }
  const context = vm.createContext({ console, Date, AbortController, AccountError,
    api: { session() { const d = deferred(); requests.push(d); return d.promise; }, config: async () => ({ registrationOpen: true }) },
    game: { setProfileName(name) { names.push(name); } },
    localStorage: { getItem: () => null, setItem() {} },
    addEventListener(type, fn) { listeners.push([type, fn]); }, document: { addEventListener(type, fn) { listeners.push([type, fn]); } },
  });
  vm.runInContext(source('store.js').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.subject = account;', context);
  return { account: context.subject, requests, names, AccountError, context };
}

test('a delayed refresh cannot restore a user after explicit sign-out', async () => {
  const f = storeFixture(); f.account.signedIn({ id: 'u1', displayName: 'old' });
  const pending = f.account.refresh(); await settle();
  f.account.signedOut();
  f.requests[0].resolve({ user: { id: 'u1', displayName: 'old' } }); await pending;
  assert.equal(f.account.status, 'guest'); assert.equal(f.account.user, null);
  assert.deepEqual(f.names, ['old']);
});

test('a delayed guest refresh cannot undo a successful sign-in', async () => {
  const f = storeFixture(), pending = f.account.refresh(); await settle();
  f.account.signedIn({ id: 'u2', displayName: 'new' });
  f.requests[0].resolve({ user: null }); await pending;
  assert.equal(f.account.status, 'user'); assert.equal(f.account.user.id, 'u2');
  assert.deepEqual(f.names, ['new']);
});

test('an obsolete failure cannot overwrite a new account or clear its pending refresh', async () => {
  const f = storeFixture(), old = f.account.refresh(); await settle();
  f.account.signedIn({ id: 'u2', displayName: 'new' });
  const fresh = f.account.refresh(); await settle();
  assert.equal(f.requests.length, 2, 'successful sign-in starts a fresh session observation');
  f.requests[0].reject(new f.AccountError('unavailable')); await old;
  assert.equal(f.account.status, 'user'); assert.equal(f.account.user.id, 'u2');
  assert.equal(f.account.refresh(), fresh, 'old completion must not erase the new single flight');
  f.requests[1].resolve({ user: { id: 'u2', displayName: 'confirmed' } }); await fresh;
  assert.equal(f.account.user.displayName, 'confirmed'); assert.equal(f.account._pending, null);
});

test('concurrent refreshes share a request and transient errors retain last known identity', async () => {
  const f = storeFixture(); f.account.signedIn({ id: 'u1', displayName: 'known' });
  const first = f.account.refresh(), second = f.account.refresh();
  assert.equal(first, second); await settle(); assert.equal(f.requests.length, 1);
  f.requests[0].reject(new f.AccountError('network')); await first;
  assert.equal(f.account.status, 'user'); assert.equal(f.account.user.id, 'u1');
  assert.equal(f.account._pending, null); assert.ok(f.account.checkedAt > 0);
});

function entryFixture() {
  const loading = deferred(), mounts = [], classes = new Set(), errors = [];
  const chip = { classList: { add: key => classes.add(key), remove: key => classes.delete(key),
    toggle(key, on) { if (on) classes.add(key); else classes.delete(key); } } };
  const context = vm.createContext({ console: { error(...args) { errors.push(args); } }, Promise,
    window: { zevantAccount: {} }, document: { querySelectorAll: () => [chip] },
    game: { sfx(name) { errors.push(name); } }, loadPanelModule: () => loading.promise });
  const code = source('entry.js').replace(/^import .*;\r?\n/gm, '').replace("import('./panel.js')", 'loadPanelModule()');
  vm.runInContext(code + '\nglobalThis.subject = { open, close: () => { if (typeof close === "function") close(); else openPanel?.close(); } };', context);
  const module = { mountPanel(options) { const panel = { options, close() { this.closed = true; options.onClose(); } }; mounts.push(panel); return panel; } };
  return { ...context.subject, loading, module, mounts, classes, errors };
}

test('rapid account dialog opens mount exactly one dialog and return its owner', async () => {
  const f = entryFixture(), first = f.open('login'), second = f.open('login');
  assert.equal(f.classes.has('is-busy'), true);
  f.loading.resolve(f.module);
  const [a, b] = await Promise.all([first, second]);
  assert.equal(f.mounts.length, 1); assert.equal(a, b); assert.equal(f.classes.has('is-busy'), false);
  f.close(); assert.equal(a.closed, true);
});

test('closing while the dialog chunk loads prevents a late invisible-owner modal', async () => {
  const f = entryFixture(), pending = f.open('login');
  f.close(); f.loading.resolve(f.module);
  assert.equal(await pending, null); assert.equal(f.mounts.length, 0); assert.equal(f.classes.has('is-busy'), false);
  const panel = await f.open('register');
  assert.equal(f.mounts.length, 1); assert.equal(panel.options.view, 'register');
  f.close(); assert.equal(panel.closed, true);
});

test('canceled dialog load cannot clear busy state or ownership of a newer open', async () => {
  const f = entryFixture(), old = f.open('login');
  f.close(); const fresh = f.open('register');
  f.loading.resolve(f.module);
  assert.equal(await old, null); const panel = await fresh;
  assert.equal(f.mounts.length, 1); assert.equal(panel.options.view, 'register');
  assert.equal(await f.open('account'), panel);
  f.close();
});
