import test from 'node:test';
import assert from 'node:assert/strict';
import { World, makeBuild } from './worker-fixture.mjs';

async function navigationStream(t, status, chunks = [], { cached = true } = {}) {
  const world = new World(), build = makeBuild(); world.serve(build);
  if (cached) { const installed = world.worker(build); await installed.install(); await installed.activate(); }
  const original = world.fetch, state = { aborted: 0, cancelled: 0, live: false };
  let controller;
  world.fetch = async (request, options) => {
    if (world.url(request) !== world.url('./')) return original(request, options);
    const body = new ReadableStream({
      start(value) { controller = value; state.live = true; },
      pull(value) { if (chunks.length) value.enqueue(chunks.shift()); },
      cancel() { state.cancelled++; state.live = false; },
    });
    options.signal.addEventListener('abort', () => {
      state.aborted++;
      if (state.live) { state.live = false; controller.error(new DOMException('Aborted', 'AbortError')); }
    }, { once: true });
    return new Response(body, { status, headers: { 'Content-Type': 'text/html' } });
  };
  t.after(() => { if (state.live) { state.live = false; controller.error(Error('fixture cleanup')); } });
  const worker = world.worker(build);
  let timer;
  try {
    const result = await Promise.race([
      worker.request('./', { mode: 'navigate' }).then(async ({ response }) => ({ status: response.status, text: await response.text() })),
      new Promise(resolve => { timer = setTimeout(() => resolve({ stalled: true }), 250); }),
    ]);
    assert.equal(result.stalled, undefined, 'a navigation body must remain bounded after headers, including HTTP errors');
    return { result, state, build };
  } finally { clearTimeout(timer); }
}

for (const status of [200, 404]) test('streaming oversize navigation abandons both branches: HTTP ' + status, async t => {
  const { result, state, build } = await navigationStream(t, status, [new Uint8Array(600000), new Uint8Array(600000)]);
  assert.equal(result.status, 200); assert.equal(result.text, build.index.toString());
  assert.equal(state.aborted, 1, 'the unread original cannot leave the transfer running');
  assert.equal(state.live, false);
});

test('HTTP 404 navigation with stalled body also reaches the offline deadline', async t => {
  const { result, state, build } = await navigationStream(t, 404);
  assert.equal(result.status, 200); assert.equal(result.text, build.index.toString());
  assert.equal(state.aborted, 1);
});

test('HTTP 500 with cached HTML cancels its stalled body before the deadline', async t => {
  const { result, state, build } = await navigationStream(t, 500);
  assert.equal(result.status, 200); assert.equal(result.text, build.index.toString());
  assert.equal(state.cancelled, 1, 'discard the unused body immediately');
  assert.equal(state.aborted, 0, 'do not wait for the navigation timeout');
  assert.equal(state.live, false);
});

test('HTTP 500 without cached HTML still bounds a stalled body', async t => {
  const { result, state } = await navigationStream(t, 500, [], { cached: false });
  assert.equal(result.status, 503); assert.match(result.text, /オフライン/);
  assert.equal(state.aborted, 1); assert.equal(state.live, false);
});

test('complete HTTP 404 keeps its status, body, headers and response URL', async () => {
  const world = new World(), build = makeBuild(); world.serve(build);
  const worker = world.worker(build); await worker.install(); await worker.activate();
  world.route('./', '<!doctype html><title>Missing page</title>', 404, { 'Content-Type': 'text/html', 'X-Reason': 'missing' });
  world.resetStats();
  const { response } = await worker.request('./', { mode: 'navigate' });
  assert.equal(response.status, 404); assert.equal(response.headers.get('X-Reason'), 'missing');
  assert.equal(response.url, world.url('./'));
  assert.equal(await response.text(), '<!doctype html><title>Missing page</title>');
  assert.equal(world.puts.length, 0);
});
