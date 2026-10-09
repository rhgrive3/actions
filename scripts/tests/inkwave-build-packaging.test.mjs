import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parse } from '../../patches/loading-cache/vendor/acorn.mjs';
import { BUILD_ONLY_PATCH_MODULES } from '../lib/inkwave-build-only-modules.mjs';
import { World } from '../../patches/loading-cache/tests/worker-fixture.mjs';

const root = new URL('../../', import.meta.url);
const composer = 'patches/local-quality/composer-target-adapter.mjs';
const composerFormat = 'patches/local-quality/composer-format-adapter.mjs';
const runtimeHelpers = [
  'patches/splatoon3/issue-196-adapter.mjs',
  'patches/splatoon3/issue-284-adapter.mjs',
  'patches/splatoon3/runtime/issue-415-adapter.mjs',
  'patches/local-quality/first-touch-adapter.mjs',
  'patches/local-quality/issue-472-adapter.mjs',
];

test('excluded modules have audited build-only exports; mixed runtime adapters remain shipped', () => {
  assert(BUILD_ONLY_PATCH_MODULES.size > 0);
  for (const file of BUILD_ONLY_PATCH_MODULES) {
    const source = fs.readFileSync(new URL(file, root), 'utf8');
    const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
    const exports = ast.body.filter(n => n.type.startsWith('Export')).flatMap(n =>
      n.declaration?.id?.name || n.declaration?.declarations?.map(d => d.id.name) || n.specifiers?.map(s => s.exported.name) || '?');
    assert(exports.length > 0, file);
    const expected = file === composer ? ['createLazyComposerTarget', 'adaptComposerTarget', 'revertComposerTarget']
      : file === composerFormat ? ['composerGradeKeepsPackedTargetNonnegative', 'selectComposerTargetFormat', 'configureComposerColorTargets'] : [];
    assert(exports.every(name => /^adapt[A-Z]/.test(name) || expected.includes(name)),
      `New runtime export requires removing ${file} from the build-only list: ${exports}`);
  }
  for (const file of runtimeHelpers) assert(!BUILD_ONLY_PATCH_MODULES.has(file), file);
});

const site = process.env.INKWAVE_BUILT_SITE && path.resolve(process.env.INKWAVE_BUILT_SITE);
test('emitted worker keeps the complete runtime graph, installs, and replays verified offline bytes', { skip: !site }, async () => {
  const identity = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
  const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(identity.inputHash, hash(JSON.stringify(identity.files)));
  for (const file of ['inkwave-source-composition.mjs', 'lib/inkwave-build-only-modules.mjs', 'lib/inkwave-worker-compaction.mjs']) {
    assert.equal(identity.files['build-script/' + file], hash(fs.readFileSync(new URL('scripts/' + file, root))),
      'direct builder helper participates in source identity: ' + file);
  }
  const workerSource = fs.readFileSync(path.join(site, 'sw.js'), 'utf8');
  assert(Buffer.byteLength(workerSource) <= 64 * 1024, 'unchanged worker ceiling');
  const ast = parse(workerSource, { ecmaVersion: 'latest', sourceType: 'script' });
  const binding = ast.body.flatMap(n => n.type === 'VariableDeclaration' ? n.declarations : []).find(n => n.id.name === 'BUILD');
  const config = JSON.parse(workerSource.slice(binding.init.start, binding.init.end));
  for (const file of BUILD_ONLY_PATCH_MODULES) {
    assert(!fs.existsSync(path.join(site, file)), file);
    assert(!Object.hasOwn(config.assets, file), file);
    assert(!config.precache.includes(file), file);
  }
  for (const file of runtimeHelpers) {
    assert(fs.existsSync(path.join(site, file)), file);
    assert(Object.hasOwn(config.assets, file), file);
    assert(config.precache.includes(file), file);
  }
  const index = fs.readFileSync(path.join(site, 'index.html'));
  const bodies = Object.fromEntries(Object.keys(config.assets).map(file =>
    [file, fs.readFileSync(path.join(site, '_versions', config.revision, file))]));
  // Audit every emitted module, including literal dynamic imports, rather than
  // assuming a filename suffix always means build-only.
  function inspect(node, from) {
    if (!node || typeof node !== 'object') return;
    const spec = ['ImportDeclaration', 'ExportAllDeclaration', 'ExportNamedDeclaration', 'ImportExpression'].includes(node.type) && node.source?.value;
    if (typeof spec === 'string' && spec.startsWith('.')) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
      assert(!BUILD_ONLY_PATCH_MODULES.has(target), `runtime dependency ${from} -> ${target}`);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) for (const child of value) inspect(child, from);
      else if (value && typeof value === 'object') inspect(value, from);
    }
  }
  for (const [file, bytes] of Object.entries(bodies)) if (/\.m?js$/.test(file)) {
    inspect(parse(bytes.toString(), { ecmaVersion: 'latest', sourceType: 'module' }), file);
  }
  const build = { config, index, bodies }, world = new World();
  world.serve(build);
  const worker = world.worker(build, workerSource);
  await worker.install(); await worker.activate();
  assert.equal((await worker.status()).offlineReady, true);
  assert.equal(worker.counts.skipWaiting, 0);
  world.offline = true;
  assert.equal(await (await worker.request('./', { mode: 'navigate' })).response.text(), index.toString());
  for (const file of config.precache) {
    const result = await worker.request(`_versions/${config.revision}/${file}`);
    assert.deepEqual(Buffer.from(await result.response.arrayBuffer()), bodies[file], file);
  }
  const corrupt = new World(); corrupt.serve(build);
  corrupt.route(`_versions/${config.revision}/src/main.js`, 'tampered');
  const candidate = corrupt.worker(build, workerSource);
  await assert.rejects(candidate.install(), /integrity/);
  assert.equal((await candidate.status()).offlineReady, false);
  assert(!corrupt.puts.some(row => row.url.endsWith('__inkwave_cache_complete__')));
});
