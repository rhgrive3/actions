import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import http from 'node:http';
import crypto from 'node:crypto';
import { request } from 'playwright';
import { drainFlowRoutes } from '../check-inkwave-flow-render.mjs';

const source = fs.readFileSync(new URL('../check-inkwave-flow-render.mjs', import.meta.url), 'utf8');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const routeSource = source.slice(source.indexOf('    await page.route(address'), source.indexOf('    await page.goto(address'));
const finalStart = source.lastIndexOf('  } finally {\n') + '  } finally {\n'.length;
const footer = source.slice(finalStart, source.indexOf('\n}\nif (process.argv[1]', finalStart))
  .replace('\n  }\n  // Route and browser errors', '\n  // Route and browser errors');
assert.ok(routeSource && footer.includes('const receipt ='), 'exercise the actual route callback and final receipt path');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function finalize({ page, browser, errors = [], loaded = new Map(), failure, timeoutMs = 10000, code = footer }) {
  const process = { argv: ['node', 'flow-route-test'] }, publications = [];
  const receipt = await vm.runInNewContext('(async()=>{let failure=initialFailure, routeDrain={status:"not-started"};' + code + ';return receipt;})()', {
    page, browser, server: null, errors, loaded, recordError: error => errors.push(error), initialFailure: failure, result: { summary: { scenarios: 11 } }, identity: null,
    process, Date, Error, drainFlowRoutes: page => drainFlowRoutes(page, timeoutMs),
    path: { join: (...parts) => parts.join('/') }, output: '/evidence',
    publish: value => publications.push(JSON.parse(JSON.stringify(value))), console: { log() {} },
  });
  assert.equal(publications.length, 1);
  assert.equal(publications[0].status, receipt.status);
  return { receipt, exitCode: process.exitCode ?? 0 };
}
async function actualResponseRig(t, { badHash = false, abortError = false } = {}) {
  const bytes = Buffer.from('actual Playwright response bytes');
  const server = http.createServer((_req, res) => res.end(bytes));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = 'http://127.0.0.1:' + server.address().port;
  const api = await request.newContext();
  t.after(async () => { await api.dispose(); await new Promise(resolve => server.close(resolve)); });
  const response = await api.get(address + '/late.mjs'), body = response.body.bind(response), held = deferred();
  response.body = async () => { await held.promise; return body(); };
  const errors = [], loaded = new Map(), order = []; let handler, pending, aborted = false, fulfilled = false;
  const page = {
    route: async (_pattern, fn) => { handler = fn; },
    unrouteAll: async options => { assert.equal(options.behavior, 'wait'); order.push('drain'); held.resolve(); await pending; order.push('drained'); },
  };
  await vm.runInNewContext('(async()=>{' + routeSource + '})()', {
    page, address, URL, manifest: { artifacts: { 'late.mjs': badHash ? hash('wrong') : hash(bytes) } },
    loaded, hash, recordError: error => errors.push(error),
  });
  pending = handler({ fetch: async () => response,
    fulfill: async ({ body: actual }) => { assert.equal(Buffer.compare(actual, bytes), 0); fulfilled = true; order.push('fulfill'); },
    abort: async () => { aborted = true; order.push('abort'); if (abortError) throw Error('abort owner closed'); },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(errors.length, 0, 'the earlier render-time error check sees no failure');
  const browser = { close: async () => { order.push('close'); await api.dispose(); held.resolve(); await pending; } };
  return { page, browser, errors, loaded, order, response, held, pending, state: () => ({ aborted, fulfilled }) };
}

test('baseline control: closing before route completion can publish passed with a real disposed APIResponse', async t => {
  const h = await actualResponseRig(t);
  const noDrain = footer.replace('routeDrain = await drainFlowRoutes(page);', 'routeDrain = { status: "baseline-no-drain" };');
  const baseline = noDrain.replace("  if (errors.length) failure ||= Error('Flow browser/shader errors: ' + errors.join('; '));", '');
  const out = await finalize({ ...h, code: baseline });
  assert.equal(out.receipt.status, 'passed'); assert.equal(out.exitCode, 0);
  assert.match(out.receipt.errors[0], /apiResponse.body: Response has been disposed/);
  assert.deepEqual(h.state(), { aborted: true, fulfilled: false });
});

test('the actual late response is byte-verified and fulfilled before its owner closes', async t => {
  const h = await actualResponseRig(t), out = await finalize(h);
  assert.equal(out.receipt.status, 'passed'); assert.equal(out.exitCode, 0);
  assert.equal(out.receipt.errors.length, 0); assert.equal(out.receipt.routeDrain.status, 'drained');
  assert.equal(out.receipt.loaded.length, 1); assert.equal(out.receipt.loaded[0].path, 'late.mjs');
  assert.deepEqual(h.order, ['drain', 'fulfill', 'drained', 'close']);
  assert.deepEqual(h.state(), { aborted: false, fulfilled: true });
});

test('a real response disposed before draining remains an explicit failed receipt and nonzero exit', async t => {
  const h = await actualResponseRig(t); await h.response.dispose();
  const out = await finalize(h);
  assert.equal(out.receipt.status, 'failed'); assert.equal(out.exitCode, 1);
  assert.match(out.receipt.message, /Response has been disposed/);
  assert.match(out.receipt.errors[0], /Response has been disposed/);
});

test('removing only the route drain cannot hide its disposed-response failure behind a green status', async t => {
  const h = await actualResponseRig(t);
  const code = footer.replace('routeDrain = await drainFlowRoutes(page);', 'routeDrain = { status: "negative-no-drain" };');
  const out = await finalize({ ...h, code });
  assert.equal(out.receipt.status, 'failed'); assert.equal(out.exitCode, 1);
  assert.match(out.receipt.errors[0], /Response has been disposed/);
});

test('late immutable-byte failure and an abort failure both remain visible', async t => {
  const h = await actualResponseRig(t, { badHash: true, abortError: true }), out = await finalize(h);
  assert.equal(out.receipt.status, 'failed'); assert.equal(out.exitCode, 1);
  assert.deepEqual([...out.receipt.errors], ['Flow loaded artifact mismatch: late.mjs', 'Flow route abort: abort owner closed']);
  assert.equal(h.loaded.size, 0); assert.deepEqual(h.state(), { aborted: true, fulfilled: false });
});

test('console errors arriving during browser closure determine final status and a stable receipt', async () => {
  const errors = [], out = await finalize({ errors, page: { unrouteAll: async () => {} },
    browser: { close: async () => { errors.push('late shader failure'); } } });
  assert.equal(out.receipt.status, 'failed'); assert.equal(out.exitCode, 1);
  assert.match(out.receipt.message, /late shader failure/);
  errors.push('after receipt');
  assert.deepEqual([...out.receipt.errors], ['late shader failure'], 'receipt owns its final observed error list');
});

test('a hung route drain has a finite budget, closes its owner and leaves a failed receipt', async () => {
  const held = deferred(); let closed = false;
  const out = await finalize({ page: { unrouteAll: () => held.promise }, timeoutMs: 5,
    browser: { close: async () => { closed = true; } } });
  assert.equal(closed, true); assert.equal(out.receipt.status, 'failed'); assert.equal(out.exitCode, 1);
  assert.equal(out.receipt.routeDrain.status, 'failed'); assert.match(out.receipt.message, /drain timed out after 5ms/);
  held.reject(Error('late drain rejection'));
  await new Promise(resolve => setImmediate(resolve));
});

test('drain errors preserve an earlier render failure and still close the browser', async () => {
  let closed = false;
  const out = await finalize({ failure: Error('original pixel regression'),
    page: { unrouteAll: async () => { throw Error('drain broke'); } },
    browser: { close: async () => { closed = true; throw Error('close broke'); } } });
  assert.equal(closed, true); assert.equal(out.receipt.status, 'failed'); assert.equal(out.exitCode, 1);
  assert.equal(out.receipt.message, 'original pixel regression'); assert.equal(out.receipt.routeDrain.message, 'drain broke');
  assert.deepEqual([...out.receipt.errors], ['Flow browser close: close broke']);
});

test('pre-launch failure leaves a failed receipt without requiring a page or browser', async () => {
  const out = await finalize({ failure: Error('invalid build') });
  assert.equal(out.receipt.status, 'failed'); assert.equal(out.exitCode, 1);
  assert.equal(out.receipt.routeDrain.status, 'not-started');
});
