import test from 'node:test';
import assert from 'node:assert/strict';
import { World, makeBuild } from './worker-fixture.mjs';

function stallNavigation(world, t) {
  const original = world.fetch;
  const readers = new Set();
  let aborted = 0;
  world.fetch = async (request, options) => {
    if (world.url(request) !== world.url('./')) return original(request, options);
    let bodyController;
    const body = new ReadableStream({ start(controller) { bodyController = controller; readers.add(controller); } });
    options.signal.addEventListener('abort', () => {
      aborted++;
      if (readers.delete(bodyController)) bodyController.error(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
    return new Response(body, { headers: { 'Content-Type': 'text/html' } });
  };
  t.after(() => { for (const controller of readers) controller.error(new Error('fixture cleanup')); readers.clear(); });
  return { get aborted() { return aborted; } };
}

async function readBeforeGuard(worker) {
  let timer;
  try {
    const result = await Promise.race([
      worker.request('./', { mode: 'navigate' }).then(async ({ response }) => ({ response, text: await response.text() })),
      new Promise(resolve => { timer = setTimeout(() => resolve({ stalled: true }), 250); }),
    ]);
    assert.equal(result.stalled, undefined, 'navigation must settle after its existing four-second deadline (30ms in fixture)');
    return result;
  } finally { clearTimeout(timer); }
}

test('navigation falls back to complete offline HTML when headers arrive but body stalls', async t => {
  const world = new World(), build = makeBuild(); world.serve(build);
  const original = world.worker(build); await original.install(); await original.activate();
  const stalled = stallNavigation(world, t), worker = world.worker(build);
  const result = await readBeforeGuard(worker);
  assert.equal(result.response.status, 200);
  assert.equal(result.text, build.index.toString());
  assert.equal(stalled.aborted, 1);
});

test('a stalled navigation without a saved snapshot shows the recovery document', async t => {
  const world = new World(), build = makeBuild(); world.serve(build);
  const stalled = stallNavigation(world, t);
  const result = await readBeforeGuard(world.worker(build));
  assert.equal(result.response.status, 503);
  assert.match(result.text, /オフライン/);
  assert.equal(stalled.aborted, 1);
});

test('oversize navigation HTML is abandoned without replacing the saved snapshot', async () => {
  const world = new World(), build = makeBuild(); world.serve(build);
  const worker = world.worker(build); await worker.install(); await worker.activate();
  world.route('./', 'x'.repeat(1024 * 1024 + 1), 200, { 'Content-Type': 'text/html' });
  const writes = world.puts.length;
  const result = await readBeforeGuard(worker);
  assert.equal(result.text, build.index.toString());
  assert.equal(world.puts.length, writes);
});

test('healthy navigation preserves latest HTML and headers without a cache rewrite', async () => {
  const world = new World(), build = makeBuild(); world.serve(build);
  const worker = world.worker(build); await worker.install(); await worker.activate();
  world.route('./', '<!doctype html><title>new deployment</title>', 200, { 'Content-Type': 'text/html', 'X-Revision': 'next' });
  world.resetStats();
  const result = await readBeforeGuard(worker);
  assert.equal(result.text, '<!doctype html><title>new deployment</title>');
  assert.equal(result.response.headers.get('X-Revision'), 'next');
  assert.equal(result.response.url, world.url('./'));
  assert.equal(world.fetches.length, 1);
  assert.equal(world.puts.length, 0);
});
