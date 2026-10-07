import test from 'node:test';
import assert from 'node:assert/strict';
import { transformSync } from 'esbuild';
import { parse } from '../../patches/loading-cache/vendor/acorn.mjs';
import { compactLoadingWorkerTemplate } from '../lib/inkwave-worker-compaction.mjs';
import { World, makeBuild, template } from '../../patches/loading-cache/tests/worker-fixture.mjs';

const marker = '__INKWAVE_CACHE_CONFIG_VALUE__';
const unstamped = template.replace('/*__INKWAVE_CACHE_BUILD__*/ null', marker);
function stamp(config) {
  const code = compactLoadingWorkerTemplate(unstamped, transformSync);
  assert.equal(code.split(marker).length, 2, 'one complete config insertion');
  return code.replace(marker, JSON.stringify(config));
}
function configLiteral(code) {
  const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'script' });
  const declaration = ast.body.find(n => n.type === 'VariableDeclaration' && n.declarations[0].id.name === 'BUILD');
  return JSON.parse(code.slice(declaration.declarations[0].init.start, declaration.declarations[0].init.end));
}

test('complete integration-sized manifest fits the unchanged worker ceiling after local identifier compaction', () => {
  const { config } = makeBuild();
  for (let i = 0; JSON.stringify(config).length < 57000; i++) {
    const key = `patches/runtime/complete-${i}.mjs`;
    config.assets[key] = { bytes: i + 1, sha256: 'c'.repeat(64) };
    config.precache.push(key);
  }
  const before = transformSync(unstamped, { loader: 'js', minifyWhitespace: true,
    minifyIdentifiers: false, minifySyntax: false, legalComments: 'inline' }).code.replace(marker, JSON.stringify(config));
  assert(Buffer.byteLength(before) > 64 * 1024, 'prior generated worker exceeds the unchanged ceiling');
  const after = stamp(config);
  assert(Buffer.byteLength(after) <= 64 * 1024, 'complete manifest remains within the same ceiling');
  assert.deepEqual(configLiteral(after), config, 'all assets, hashes, index and precache identities remain literal');
});

test('compacted real worker retains revision install, offline replay and integrity rejection', async () => {
  const build = makeBuild(), world = new World();
  world.serve(build);
  const worker = world.worker(build, stamp(build.config));
  await worker.install(); await worker.activate();
  world.offline = true;
  const result = await worker.request(`_versions/${build.config.revision}/src/main.js`);
  assert.equal(await result.response.text(), build.bodies['src/main.js']);
  assert.equal(worker.counts.skipWaiting, 0);
  assert.deepEqual(configLiteral(stamp(build.config)), build.config);
  const corrupt = new World(); corrupt.serve(build);
  corrupt.route(`_versions/${build.config.revision}/src/main.js`, 'tampered');
  await assert.rejects(corrupt.worker(build, stamp(build.config)).install());
});
