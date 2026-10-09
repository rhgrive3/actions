import test from 'node:test';
import assert from 'node:assert/strict';
import { World, makeBuild, REV_A, REV_B } from './worker-fixture.mjs';

// Exercise the installed worker, not the artifact-reader normalization helper.
test('named previous descriptors and compact current assets retain integrity across revision changes', async () => {
  const world = new World(), old = makeBuild(REV_A);
  old.config.assets = Object.fromEntries(Object.entries(old.config.assets)
    .map(([file, [bytes, sha256]]) => [file, { bytes, sha256 }]));
  world.serve(old); const first = world.worker(old);
  await first.install(); await first.activate();
  const current = makeBuild(REV_B); world.serve(current);
  const next = world.worker(current); await next.install(); await next.activate();
  assert.equal((await next.status()).offlineReady, true);
  world.offline = true;
  const response = await next.request('./', { mode: 'navigate' });
  assert.equal(await response.response.text(), current.index.toString());
});

test('malformed compact tuples cannot publish a complete snapshot', async () => {
  for (const corrupt of [value => [...value, 0], value => [String(value[0]), value[1]],
      value => [-1, value[1]], value => [value[0], 'bad']]) {
    const world = new World(), build = makeBuild();
    build.config.assets['src/main.js'] = corrupt(build.config.assets['src/main.js']);
    world.serve(build); const worker = world.worker(build);
    await assert.rejects(worker.install(), /integrity/);
    assert.equal((await worker.status()).offlineReady, false);
    assert(!world.puts.some(p => p.url.endsWith('__inkwave_cache_complete__')));
  }
});

test('invalid named navigation metadata cannot replace a valid offline revision', async () => {
  for (const corrupt of [index => ({ ...index, bytes: String(index.bytes) }),
      index => ({ ...index, sha256: 'b'.repeat(64) }), index => ({ ...index, bytes: -1 })]) {
    const world = new World(), old = makeBuild(REV_A);
    world.serve(old); const first = world.worker(old); await first.install(); await first.activate();
    const candidate = makeBuild(REV_B); candidate.config.index = corrupt(candidate.config.index);
    world.serve(candidate); await assert.rejects(world.worker(candidate).install(), /integrity/);
    world.offline = true;
    const response = await first.request('./', { mode: 'navigate' });
    assert.equal(await response.response.text(), old.index.toString());
  }
});
