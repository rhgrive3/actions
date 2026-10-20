// #1608: a public-URL ranked boot that never completes must say why, and only a provably
// stale served build may be retried. A hang with the correct build is never retried or masked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bootRankedPage, classifyBootFailure, collectBootDiagnostics, gameBootReady, readBootState, readServedBuild, sameBuild, waitForGameBoot, BOOT_TIMEOUT_MS } from '../lib/inkwave-ranked-boot.mjs';

const expected = { contentHash: 'content-A', inputHash: 'input-A', revision: 'rev-A' };
const matching = { ...expected };
const stale = { contentHash: 'content-OLD', inputHash: 'input-OLD', revision: 'rev-OLD' };
const emptyObserved = () => ({ console: [], failedRequests: [], badResponses: [], pageErrors: [] });

// The in-page functions are looked up by name, exactly like a browser evaluates them.
function fakePage({ boots = false, served = matching, state = { hasRG: true, mode: 'boot', menus: false, s3Installed: false } } = {}) {
  const calls = { waits: [], evaluated: [] };
  return {
    calls,
    url: () => 'https://rhgrive3.github.io/actions/?relay=ws%3A%2F%2F127.0.0.1%3A1',
    async waitForFunction(fn, arg, options) {
      calls.waits.push({ fn: fn.name, timeout: options.timeout });
      if (!boots) throw Object.assign(new Error(`Timeout ${options.timeout}ms exceeded.`), { name: 'TimeoutError' });
    },
    async evaluate(fn) {
      calls.evaluated.push(fn.name);
      if (fn.name === 'readServedBuild') { if (served instanceof Error) throw served; return served; }
      if (fn.name === 'readBootState') return state;
      throw new Error('unexpected page function ' + fn.name);
    },
  };
}

test('a successful boot uses the strict 180 s predicate and never probes identity', async () => {
  const page = fakePage({ boots: true });
  await waitForGameBoot(page, { expected });
  assert.deepEqual(page.calls.waits, [{ fn: 'gameBootReady', timeout: BOOT_TIMEOUT_MS }]);
  assert.equal(BOOT_TIMEOUT_MS, 180000);
  assert.deepEqual(page.calls.evaluated, []);
});

test('a hang with the expected build is reported with evidence and is never retried', async () => {
  const pages = [], failures = [], pauses = [];
  const openPage = async () => { const page = fakePage({ served: matching }); pages.push(page); return { page, observed: emptyObserved() }; };
  await assert.rejects(
    bootRankedPage(openPage, { expected, pause: async ms => pauses.push(ms), onFailure: d => failures.push(d) }),
    error => {
      assert.match(error.message, /did not complete within 180000 ms: boot-hang-with-expected-build/);
      assert.equal(error.stale, false);
      assert.equal(error.diagnostics.served.stale, false);
      assert.equal(error.diagnostics.state.hasRG, true);
      assert.ok(error.cause instanceof Error && error.cause.name === 'TimeoutError', 'the original timeout stays the cause');
      return true;
    });
  assert.equal(pages.length, 1, 'no retry that would mask a genuine boot hang');
  assert.deepEqual(pauses, []);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].attempt, 1);
});

test('a provably stale served build is retried a bounded number of times in fresh contexts, then fails by name', async () => {
  const pages = [], closed = [], pauses = [];
  const openPage = async () => {
    const page = fakePage({ served: stale }), id = pages.push(page);
    return { page, observed: emptyObserved(), close: async () => closed.push(id) };
  };
  await assert.rejects(bootRankedPage(openPage, { expected, pause: async ms => pauses.push(ms) }), error => {
    assert.match(error.message, /stale-build/);
    assert.equal(error.stale, true);
    assert.equal(error.diagnostics.served.contentHash, 'content-OLD');
    return true;
  });
  assert.equal(pages.length, 3, 'bounded at three attempts');
  assert.deepEqual(closed, [1, 2], 'each failed attempt is closed before the next fresh context; the last stays for evidence');
  assert.deepEqual(pauses, [10000, 10000]);
});

test('a stale build that is replaced by the tested one boots on the retry', async () => {
  let n = 0;
  const openPage = async () => {
    n++;
    return { page: fakePage(n === 1 ? { served: stale } : { boots: true }), observed: emptyObserved(), close: async () => {} };
  };
  const page = await bootRankedPage(openPage, { expected, pause: async () => {} });
  assert.equal(n, 2);
  assert.ok(page);
});

test('asset failures, page errors, a missing runtime and an unreadable identity are named and not retried', async () => {
  const cases = [
    ['asset-request-failed', { ...emptyObserved(), badResponses: [{ status: 404, url: 'https://rhgrive3.github.io/actions/src/x.js' }] }, { hasRG: true }, matching],
    ['asset-request-failed', { ...emptyObserved(), failedRequests: [{ url: 'u', failure: 'net::ERR_ABORTED' }] }, { hasRG: true }, matching],
    ['page-error', { ...emptyObserved(), pageErrors: ['TypeError: boom'] }, { hasRG: true }, matching],
    ['runtime-never-loaded', emptyObserved(), { hasRG: false }, matching],
    ['identity-unavailable', emptyObserved(), { hasRG: true }, { error: 'HTTP 503' }],
  ];
  for (const [kind, observed, state, served] of cases) {
    let opened = 0;
    await assert.rejects(bootRankedPage(async () => { opened++; return { page: fakePage({ state, served }), observed }; },
      { expected, pause: async () => assert.fail('must not retry ' + kind) }), error => { assert.match(error.message, new RegExp(kind)); assert.equal(error.stale, false); return true; });
    assert.equal(opened, 1, kind);
  }
});

test('an identity probe that throws is reported, not retried', async () => {
  const page = fakePage({ served: new Error('page closed') });
  const diagnostics = await collectBootDiagnostics(page, emptyObserved(), expected);
  assert.equal(diagnostics.conclusion.kind, 'identity-unavailable');
  assert.equal(diagnostics.conclusion.stale, false);
});

test('local (non-public) boots skip the identity probe and still get a diagnosis', async () => {
  const page = fakePage({ served: stale });
  await assert.rejects(waitForGameBoot(page, { expected: null, observed: emptyObserved() }), /boot-hang-with-expected-build/);
  assert.ok(!page.calls.evaluated.includes('readServedBuild'));
});

test('build identity comparison requires all three identifiers', () => {
  assert.equal(sameBuild(matching, expected), true);
  for (const key of ['contentHash', 'inputHash', 'revision']) assert.equal(sameBuild({ ...matching, [key]: 'other' }, expected), false, key);
  assert.equal(sameBuild({ error: 'x' }, expected), false);
  assert.equal(sameBuild(null, expected), false);
  assert.equal(classifyBootFailure({ served: { stale: true }, observed: emptyObserved(), state: { hasRG: true } }).kind, 'stale-build');
});

// The page functions run in a browser; make sure they only need the globals a page provides.
test('the in-page probes run against stubbed page globals', async () => {
  const saved = Object.fromEntries(['RG', 'document', 'navigator', 'performance', 'fetch'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const set = (key, value) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  try {
    set('RG', { game: { menus: {} }, s3: { installed: true }, mode: 'menu' });
    set('document', { readyState: 'complete', visibilityState: 'visible', hidden: false, baseURI: 'https://rhgrive3.github.io/actions/' });
    set('navigator', { serviceWorker: { controller: {} } });
    set('performance', { now: () => 1234 });
    assert.equal(gameBootReady(), true);
    globalThis.RG.mode = 'boot';
    assert.equal(gameBootReady(), false, 'still booting');
    assert.deepEqual(readBootState(), { readyState: 'complete', visibility: 'visible', hidden: false, hasRG: true, mode: 'boot', menus: true, game: true, s3Installed: true, serviceWorker: 'controlled', now: 1234 });
    let requested;
    set('fetch', async (url, options) => { requested = { url: String(url), options }; return { ok: true, json: async () => ({ contentHash: 'c', inputHash: 'i', build: { revision: 'r' } }) }; });
    assert.deepEqual(await readServedBuild(), { contentHash: 'c', inputHash: 'i', revision: 'r' });
    assert.match(requested.url, /^https:\/\/rhgrive3\.github\.io\/actions\/inkwave-build\.json\?bootProbe=\d+$/);
    assert.equal(requested.options.cache, 'no-store');
    set('fetch', async () => ({ ok: false, status: 502 }));
    assert.deepEqual(await readServedBuild(), { error: 'HTTP 502' });
    set('fetch', async () => { throw new Error('offline'); });
    assert.deepEqual(await readServedBuild(), { error: 'offline' });
  } finally {
    for (const [key, descriptor] of Object.entries(saved)) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
  }
});

test('the verifier boots through the diagnostic helper and keeps the public identity gate and bounds', () => {
  const runner = readFileSync(new URL('../check-inkwave-ranked-browser.mjs', import.meta.url), 'utf8');
  assert.match(runner, /import \{bootRankedPage,observeBoot\} from '\.\/lib\/inkwave-ranked-boot\.mjs';/);
  assert.match(runner, /return bootRankedPage\(openBootPage,\{expected:expectedBuild,/);
  assert.doesNotMatch(runner, /waitForFunction\(\(\)=>RG\.game\?\.menus&&RG\.s3\?\.installed&&RG\.mode!=='boot',null,\{timeout:180000\}\)/, 'no bare opaque 180 s wait remains');
  assert.match(runner, /const expectedBuild=publicUrl\?\{contentHash:build\.contentHash,inputHash:build\.inputHash,revision:build\.build\.revision\}:null;/);
  assert.match(runner, /attempt<30/);
  assert.match(runner, /bootDiagnostics:e\?\.diagnostics\?\[e\.diagnostics\]:bootDiagnostics/);
});
