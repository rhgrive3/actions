import test from 'node:test';
import assert from 'node:assert/strict';
import { World, makeBuild, REV_A, REV_B } from './worker-fixture.mjs';

// The recordings are declared immutable assets fetched on demand. Media elements read them only with
// Range requests, so the worker must (1) serve spans from a complete cached body as 206 responses and
// (2) never store a partial body. These tests use a deterministic 26-byte body.
const MP3 = 'assets/audio/Test_Track.mp3';
const BODY = 'abcdefghijklmnopqrstuvwxyz';
const asset = (revision, path = MP3) => `_versions/${revision}/${path}`;
async function installed(build = makeBuild(REV_A, { 'src/main.js': 'export const v=1;', [MP3]: BODY })) {
  // Production keeps recordings out of the install snapshot (cache-on-request, declared in assets only).
  build.config.precache = build.config.precache.filter(rel => rel !== MP3);
  const world = new World();
  world.serve(build);
  const worker = world.worker(build);
  await worker.install();
  await worker.activate();
  return { world, worker, build };
}
const rangeOf = (value) => ({ headers: { Range: value } });
const text = async (response) => Buffer.from(await response.arrayBuffer()).toString('latin1');
const mp3Puts = (world) => world.puts.filter(put => put.url.endsWith(MP3));

test('first ranged read goes to the network and warms the complete body in the background', async () => {
  const { world, worker } = await installed();
  world.resetStats();
  const result = await worker.request(asset(REV_A), rangeOf('bytes=0-3'));
  assert.equal(result.handled, true, 'ranged declared asset is registered with respondWith');
  assert.ok(result.synchronousWaits >= 1, 'warm-up is registered synchronously in the dispatch');
  assert.equal(result.response.status, 200, 'a cache miss is the browser request passed to the network');
  assert.deepEqual(mp3Puts(world).map(put => put.bytes), [BODY.length], 'only the complete body is stored');
});

test('cached complete body answers byte ranges with 206 slices', async () => {
  const { world, worker } = await installed();
  await worker.request(asset(REV_A), rangeOf('bytes=0-0'));   // warm the complete body
  world.resetStats();
  const cases = [
    ['bytes=2-5', 'cdef', '2-5'],
    ['bytes=20-', 'uvwxyz', '20-25'],
    ['bytes=-3', 'xyz', '23-25'],
    ['bytes=5-999', 'fghijklmnopqrstuvwxyz', '5-25'],
    ['bytes=0-0', 'a', '0-0'],
  ];
  for (const [range, expected, span] of cases) {
    const { response, handled } = await worker.request(asset(REV_A), rangeOf(range));
    assert.equal(handled, true, range);
    assert.equal(response.status, 206, range);
    assert.equal(await text(response), expected, range);
    assert.equal(response.headers.get('Content-Range'), `bytes ${span}/${BODY.length}`, range);
    assert.equal(response.headers.get('Content-Length'), String(expected.length), range);
    assert.equal(response.headers.get('Accept-Ranges'), 'bytes', range);
  }
  assert.equal(world.fetches.filter(f => f.url.endsWith(MP3)).length, 0, 'cache hits never touch the network');
  assert.deepEqual(mp3Puts(world), [], 'slices are never written back to the cache');
});

test('cached recording stays playable offline for ranged reads', async () => {
  const { world, worker } = await installed();
  await worker.request(asset(REV_A), rangeOf('bytes=0-0'));
  world.offline = true;
  const { response } = await worker.request(asset(REV_A), rangeOf('bytes=10-12'));
  assert.equal(response.status, 206);
  assert.equal(await text(response), 'klm');
});

test('unsatisfiable, multiple, malformed and conditional ranges fall through to the network', async () => {
  const { world, worker } = await installed();
  await worker.request(asset(REV_A), rangeOf('bytes=0-0'));
  world.resetStats();
  for (const range of ['bytes=0-1,4-5', 'bytes=26-', 'bytes=-0', 'bytes=abc', 'bytes=-', 'items=0-3']) {
    const { response, handled } = await worker.request(asset(REV_A), rangeOf(range));
    assert.equal(handled, true, range);
    assert.notEqual(response.status, 206, range);
  }
  const conditional = await worker.request(asset(REV_A), { headers: { Range: 'bytes=0-3', 'If-Range': '"stale"' } });
  assert.notEqual(conditional.response.status, 206);
  assert.equal(world.fetches.filter(f => f.url.endsWith(MP3)).length, 7, 'each one reached the browser network path');
});

test('undeclared, retained-revision and query ranged requests never use the recording cache', async () => {
  const { world, worker } = await installed();
  world.resetStats();
  const undeclared = await worker.request(asset(REV_A, 'assets/audio/unknown.mp3'), rangeOf('bytes=0-3'));
  assert.notEqual(undeclared.response.status, 206);
  assert.deepEqual(mp3Puts(world), []);
  const query = await worker.request(`${asset(REV_A)}?x=1`, rangeOf('bytes=0-3'));
  assert.equal(query.handled, false, 'query URLs keep the native cache policy');
  const retained = await worker.request(asset(REV_B), rangeOf('bytes=0-3'));
  assert.equal(retained.handled, true);
  assert.notEqual(retained.response.status, 206, 'a retained revision without its own cache passes through');
});
