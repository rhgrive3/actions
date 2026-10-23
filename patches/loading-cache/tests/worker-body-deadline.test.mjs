import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import http from 'node:http';
import { World, makeBuild, REV_A, REV_B } from './worker-fixture.mjs';

const prefix = 'inkwave-startup-v2:/actions/:';
const asset = revision => `_versions/${revision}/src/main.js`;

// fetch resolves at headers, while the returned body remains pending until
// its fetch signal aborts. This models the browser fetch/body abort contract.
function stallBody(world, path) {
  const original = world.fetch, controllers = new Set(), attempts = [];
  let enabled = true, aborted = 0;
  world.fetch = async (request, options) => {
    if (!enabled || world.url(request) !== world.url(path)) return original(request, options);
    attempts.push({ url: world.url(request), cache: request.cache });
    let controller;
    const body = new ReadableStream({ start(value) { controller = value; controllers.add(value); } });
    options.signal.addEventListener('abort', () => {
      aborted++;
      if (controllers.delete(controller)) controller.error(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
    return new Response(body, { status: 200 });
  };
  return {
    attempts,
    get aborted() { return aborted; },
    resume() { enabled = false; },
    cleanup() { for (const controller of controllers) controller.error(new Error('fixture cleanup')); controllers.clear(); }
  };
}

async function rejectsBeforeGuard(promise) {
  // The fixture maps the production 30-second timeout to 30ms. The guard is
  // only for failing-before evidence; cleanup closes every stalled stream.
  const outcome = await Promise.race([
    promise.then(() => ({ success: true }), error => ({ error })),
    delay(250).then(() => ({ guard: true }))
  ]);
  assert.equal(outcome.guard, undefined, 'response body must settle within the existing fetch deadline');
  assert.equal(outcome.success, undefined, 'a stalled body cannot be committed');
  assert.equal(outcome.error?.name, 'AbortError');
}

test('install HTML deadline covers a body stalled after response headers', async t => {
  const world = new World(), build = makeBuild();
  world.serve(build);
  const stalled = stallBody(world, 'index.html'); t.after(() => stalled.cleanup());
  const worker = world.worker(build);
  await rejectsBeforeGuard(worker.install());
  assert.equal(stalled.aborted, 1);
  assert.equal(stalled.attempts.length, 1, 'HTML integrity failure is not a new retry policy');
  assert.equal(world.maps.has(prefix + REV_A), false);
  assert.equal(world.puts.length, 0);
});

test('stalled precache body rolls back candidate and preserves the active offline snapshot', async t => {
  const world = new World(), original = makeBuild(); world.serve(original);
  const active = world.worker(original); await active.install(); await active.activate();
  const next = makeBuild(REV_B, { 'src/main.js': 'export const v=2;' }); world.serve(next);
  const stalled = stallBody(world, asset(REV_B)); t.after(() => stalled.cleanup());
  const candidate = world.worker(next);
  await rejectsBeforeGuard(candidate.install());
  assert.equal(stalled.aborted, 2, 'one original attempt and one existing reload retry');
  assert.equal(stalled.attempts.length, 2);
  assert.equal(stalled.attempts[1].cache, 'reload');
  assert.equal(new Set(stalled.attempts.map(row => row.url)).size, 1, 'retry must use the exact revision URL');
  assert.equal(world.maps.has(prefix + REV_B), false);
  assert.equal(world.maps.has(prefix + REV_A), true);
  world.offline = true;
  assert.equal(await (await active.request('./', { mode: 'navigate' })).response.text(), original.index.toString());
});

test('stalled runtime miss releases the shared flight and a later healthy request can recover', async t => {
  const world = new World(), build = makeBuild(); world.serve(build);
  const installed = world.worker(build); await installed.install(); await installed.activate();
  world.maps.get(prefix + REV_A).delete(world.url(asset(REV_A)));
  const stalled = stallBody(world, asset(REV_A)); t.after(() => stalled.cleanup());
  const worker = world.worker(build);
  const requests = [worker.request(asset(REV_A)), worker.request(asset(REV_A))];
  await Promise.all(requests.map(rejectsBeforeGuard));
  assert.equal(stalled.attempts.length, 2, 'concurrent consumers share the attempt and reload retry');
  assert.equal(stalled.aborted, 2);
  assert.equal(world.maps.get(prefix + REV_A).has(world.url(asset(REV_A))), false);
  stalled.resume();
  const recovered = await worker.request(asset(REV_A));
  assert.equal(await recovered.response.text(), build.bodies['src/main.js']);
  world.offline = true;
  assert.equal(await (await worker.request(asset(REV_A))).response.text(), build.bodies['src/main.js']);
});

test('healthy streamed bodies complete and clear their timers before offline reuse', async () => {
  const world = new World(), build = makeBuild(); world.serve(build);
  const original = world.fetch;
  let aborted = 0;
  world.fetch = async (request, options) => {
    const response = await original(request, options);
    const bytes = new Uint8Array(await response.arrayBuffer());
    let controller, finished = false;
    const body = new ReadableStream({ start(value) {
      controller = value;
      value.enqueue(bytes.subarray(0, 1));
      setTimeout(() => { finished = true; value.enqueue(bytes.subarray(1)); value.close(); }, 5);
    } });
    options.signal.addEventListener('abort', () => {
      aborted++;
      if (!finished) controller.error(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
    return new Response(body, { status: response.status });
  };
  const worker = world.worker(build); await worker.install(); await worker.activate();
  await delay(70);
  assert.equal(aborted, 0, 'completed verification must clear the timeout');
  assert.equal((await worker.status()).offlineReady, true);
  world.offline = true;
  assert.equal(await (await worker.request('./', { mode: 'navigate' })).response.text(), build.index.toString());
  assert.equal(await (await worker.request(asset(REV_A))).response.text(), build.bodies['src/main.js']);
});

test('a failure before response headers keeps its original error and does not add a retry', async () => {
  const world = new World(), build = makeBuild(); world.serve(build);
  const original = world.fetch, failure = new TypeError('connection failed before headers');
  let attempts = 0;
  world.fetch = async (request, options) => {
    if (world.url(request) !== world.url(asset(REV_A))) return original(request, options);
    attempts++;
    throw failure;
  };
  const worker = world.worker(build);
  await assert.rejects(worker.install(), error => error === failure);
  assert.equal(attempts, 1);
  assert.equal(world.maps.has(prefix + REV_A), false);
});

test('native fetch aborts an actual HTTP body stalled after flushed headers', async t => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.flushHeaders();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const world = new World(), build = makeBuild();
  let signal;
  world.fetch = (request, options) => {
    signal = options.signal;
    return fetch(origin + new URL(request.url).pathname, { signal });
  };
  const worker = world.worker(build);
  await rejectsBeforeGuard(worker.install());
  assert.equal(signal.aborted, true);
  assert.equal(world.maps.has(prefix + REV_A), false);
});
