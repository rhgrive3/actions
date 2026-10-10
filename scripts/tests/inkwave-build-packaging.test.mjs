import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { networkIdentity } from '../../patches/network-replication/adapter.mjs';
import { qualityIdentity } from '../../patches/local-quality/adapter.mjs';
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
  'patches/local-quality/touch-relayout.mjs',
];

// Explicit auxiliary exports are used by source composition/tests only.
// Never infer this from '*-adapter' names: the emitted graph audit below must
// still reject every static/dynamic runtime reference to an excluded module.
const auditedBuildExports = new Map([
  ['patches/local-quality/audio-listener-adapter.mjs', ['AUDIO_LISTENER_SOURCE']],
  ['patches/local-quality/finish-tape-adapter.mjs', ['replaceOnceFinish']],
  ['patches/local-quality/hud-authority-adapter.mjs', ['SPECIAL_SEGMENTS', 'specialGaugeSVG']],
  ['patches/local-quality/issue-190-adapter.mjs', ['MIP_POLICY', 'shouldRebuildMipmaps', 'replaceOnce']],
  ['patches/local-quality/issue-418-adapter.mjs', ['replaceExact', 'replaceOnce']],
  ['patches/local-quality/issue-461-sfx-mute.mjs', ['REQUIRED_WIRING', 'ISSUE_461_AUDIO_REL']],
  ['patches/local-quality/issue-480-camera-shake-fidelity.mjs', ['REQUIRED_WIRING', 'ISSUE_480_CAMERA_RIG', 'ISSUE_480_SCREENFX', 'ISSUE_480_MENUS']],
  ['patches/local-quality/medal-adapter.mjs', ['replaceOnce', 'S3_AWARDS', 'S3_PRIORITY_RANKS', 'S3_AWARD_ORDER']],
  ['patches/local-quality/minimap-resource-adapter.mjs', ['replaceOnceMinimap']],
  ['patches/local-quality/team-special-signal-adapter.mjs', []],
  ['patches/local-quality/texlib-adapter.mjs', ['replaceOnceTexlib']],
  ['patches/reliability/map-look.mjs', []],
  ['patches/splatoon3/assist-presentation-adapter.mjs', ['ASSIST_PRESENTATION_CONNECTIONS']],
  ['patches/splatoon3/issue-405-adapter.mjs', ['replaceOnce']],
  ['patches/splatoon3/issue-427-adapter.mjs', ['replaceOnce']],
  ['patches/splatoon3/issue-435-adapter.mjs', ['SLOSHER_EMERGE_REL', 'SLOSHER_EMERGE_ANCHOR', 'SLOSHER_EMERGE_REPLACEMENT']],
  ['patches/splatoon3/issue-460-adapter.mjs', ['replaceOnce']],
  ['patches/splatoon3/issue-477-adapter.mjs', ['DUALIES_STARTUP_FRAMES', 'DUALIES_STARTUP_SECONDS', 'DUALIES_ROLL_FRAMES', 'DUALIES_ROLL_SECONDS', 'DUALIES_LOCK_FRAMES', 'DUALIES_LOCK_SECONDS', 'DUALIES_POST_ROLL_FIRE_GATE_FRAMES', 'DUALIES_POST_ROLL_FIRE_GATE_SECONDS', 'PHYSICAL_NINTENDO_ANGLES_UNMEASURED', 'replaceOnce']],
  ['patches/splatoon3/issue-479-adapter.mjs', ['replaceOnce']],
  ['patches/splatoon3/issue-481-adapter.mjs', ['replaceOnce', 'calculateFlowSplatPoints']],
  ['patches/splatoon3/issue-482-adapter.mjs', ['replaceOnce']],
  ['patches/splatoon3/issue-483-adapter.mjs', ['replaceOnce483', 'ISSUE_483_REL', 'ISSUE_483_HEADER', 'ISSUE_483_RIG_ANCHOR', 'ISSUE_483_RIG_TAIL_ANCHOR', 'ISSUE_483_TIER_ANCHOR', 'ISSUE_483_QUALITY_ANCHOR', 'ISSUE_483_DISPOSE_ANCHOR', 'ISSUE_483_GEO_REL', 'ISSUE_483_GEO_ANCHOR', 'ISSUE_483_GEO_APPEND']],
  ['patches/splatoon3/issue-484-adapter.mjs', ['replaceOnce']],
]);

test('excluded modules have audited build-only exports; mixed runtime adapters remain shipped', () => {
  assert(BUILD_ONLY_PATCH_MODULES.size > 0);
  for (const file of BUILD_ONLY_PATCH_MODULES) {
    const source = fs.readFileSync(new URL(file, root), 'utf8');
    const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
    const exports = ast.body.filter(n => n.type.startsWith('Export')).flatMap(n =>
      n.declaration?.id?.name || n.declaration?.declarations?.map(d => d.id.name) || n.specifiers?.map(s => s.exported.name) || '?');
    assert(exports.length > 0, file);
    const expected = file === composer ? ['createLazyComposerTarget', 'adaptComposerTarget', 'revertComposerTarget']
      : file === composerFormat ? ['composerGradeKeepsPackedTargetNonnegative', 'selectComposerTargetFormat', 'configureComposerColorTargets']
      : file === 'patches/local-quality/lobby-quality-adapter.mjs' ? ['patchLobbySetShowcase'] : (auditedBuildExports.get(file) || []);
    assert(exports.every(name => /^adapt[A-Z]/.test(name) || expected.includes(name)),
      `New runtime export requires removing ${file} from the build-only list: ${exports}`);
  }
  for (const file of auditedBuildExports.keys()) assert(BUILD_ONLY_PATCH_MODULES.has(file), file);
  for (const file of runtimeHelpers) assert(!BUILD_ONLY_PATCH_MODULES.has(file), file);
});

const extractedTransforms = [
  ['patches/local-quality/first-touch-adapter.mjs', 'patches/local-quality/first-touch-source-adapter.mjs', 'adaptFirstTouch', ['isMobilePointer', 'adoptCanvasTouch', 'continueCanvasTouch']],
  ['patches/local-quality/touch-relayout.mjs', 'patches/local-quality/touch-relayout-adapter.mjs', 'adaptTouchRelayout', ['physicalOrientation', 'createTouchRelayout']],
  ['patches/local-quality/issue-472-adapter.mjs', 'patches/local-quality/lobby-quality-adapter.mjs', 'patchLobbySetShowcase', ['ISSUE_472_ROOT', 'ISSUE_472_BASELINE', 'LOBBY_SHADOW_INTERVAL_LOW', 'isTouchMobile', 'resolveLobbyQualityName', 'lobbyShadowDue']],
  ['patches/splatoon3/runtime/issue-415-adapter.mjs', 'patches/splatoon3/enemy-ink-recovery-adapter.mjs', 'adaptIssue415', ['resetEnemyInkRecovery']],
];

test('runtime helper URLs retain their exports without carrying build-time source transforms', async () => {
  const quality = qualityIdentity();
  for (const [runtime, transformer, transformName, runtimeExports] of extractedTransforms) {
    assert(!BUILD_ONLY_PATCH_MODULES.has(runtime), runtime);
    assert(BUILD_ONLY_PATCH_MODULES.has(transformer), transformer);
    const mod = await import(new URL(runtime, root));
    assert.deepEqual(Object.keys(mod).sort(), [...runtimeExports].sort(), runtime);
    assert.equal(typeof (await import(new URL(transformer, root)))[transformName], 'function');
    const source = fs.readFileSync(new URL(runtime, root), 'utf8');
    const tokens = [];
    parse(source, { ecmaVersion: 'latest', sourceType: 'module', onToken: tokens });
    assert(!tokens.some(token => token.type.label === 'name' && token.value === transformName),
      'runtime must not import/re-export its build-time transform: ' + runtime);
    if (transformer.startsWith('patches/local-quality/')) {
      const relative = transformer.slice('patches/local-quality/'.length);
      const hash = crypto.createHash('sha256').update(fs.readFileSync(new URL(transformer, root))).digest('hex');
      assert.equal(quality[relative], hash, transformer);
    }
  }
});

const site = process.env.INKWAVE_BUILT_SITE && path.resolve(process.env.INKWAVE_BUILT_SITE);
test('network identity contains only exact paths owned by its namespace', () => {
  const files = networkIdentity();
  assert(Object.hasOwn(files, 'dodge-clock-adapter.mjs'));
  for (const [file, expected] of Object.entries(files)) {
    assert(!path.posix.isAbsolute(file) && !file.split('/').some(part => part === '..' || part === '.'), file);
    const bytes = fs.readFileSync(new URL('patches/network-replication/' + file, root));
    assert.equal(expected, crypto.createHash('sha256').update(bytes).digest('hex'), file);
  }
});

test('emitted identity binds every input to one canonical tracked path including S3 dodge dependencies', { skip: !site }, () => {
  const identity = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
  const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  const roots = { upstream: 'inkwave-public', patch: 'patches/splatoon3',
    'touch-layout': 'patches/touch-layout', reliability: 'patches/reliability',
    'local-quality': 'patches/local-quality', 'network-replication': 'patches/network-replication',
    'practice-range': 'patches/practice-range', 'loading-cache': 'patches/loading-cache', 'build-script': 'scripts' };
  const tracked = new Map(execFileSync('git', ['ls-tree', '-r', '-z', 'HEAD'], { cwd: fileURLToPath(root), encoding: 'utf8' })
    .split('\0').filter(Boolean).map(row => { const [meta, file] = row.split('\t'); return [file, meta.split(' ')[2]]; }));
  const mapped = [];
  for (const [key, expected] of Object.entries(identity.files)) {
    assert(!key.split('/').some(part => part === '..' || part === '.' || part === ''), key);
    const slash = key.indexOf('/'), namespace = key.slice(0, slash);
    assert(Object.hasOwn(roots, namespace), key);
    const file = roots[namespace] + '/' + key.slice(slash + 1);
    assert(tracked.has(file), 'untracked build input: ' + file);
    assert.equal(expected, hash(fs.readFileSync(new URL(file, root))), key);
    mapped.push(file);
  }
  assert.equal(new Set(mapped).size, mapped.length, 'each source has one canonical identity key');
  const blobs = execFileSync('git', ['hash-object', '--', ...mapped], { cwd: fileURLToPath(root), encoding: 'utf8' }).trim().split('\n');
  mapped.forEach((file, i) => assert.equal(blobs[i], tracked.get(file), 'exact commit input: ' + file));
  for (const file of ['remote-dodge-clock.mjs', 'dualies-motion.mjs']) {
    const key = 'patch/runtime/' + file;
    assert.equal(identity.files[key], hash(fs.readFileSync(new URL('patches/splatoon3/runtime/' + file, root))), key);
  }
  assert.equal(identity.inputHash, hash(JSON.stringify(identity.files)));
});

test('emitted gameplay profile preserves all JSON values without shipping indentation', { skip: !site }, () => {
  const source = fs.readFileSync(new URL('patches/splatoon3/profile.json', root), 'utf8');
  const emitted = fs.readFileSync(path.join(site, 'patches/splatoon3/profile.json'), 'utf8');
  assert.deepEqual(JSON.parse(emitted), JSON.parse(source));
  assert.equal(emitted, JSON.stringify(JSON.parse(source)));
  assert(Buffer.byteLength(emitted) < Buffer.byteLength(source));
});

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
  const profileSource = fs.readFileSync(new URL('patches/splatoon3/profile.json', root), 'utf8');
  const profileEmitted = fs.readFileSync(path.join(site, 'patches/splatoon3/profile.json'), 'utf8');
  assert.deepEqual(JSON.parse(profileEmitted), JSON.parse(profileSource),
    'profile compaction preserves every tuning value and source field');
  assert.equal(profileEmitted, JSON.stringify(JSON.parse(profileSource)), 'compact only emitted JSON whitespace');
  assert.equal(identity.files['patch/profile.json'], hash(Buffer.from(profileSource)), 'identity retains raw profile input');
  assert(config.precache.includes('patches/splatoon3/profile.json'), 'all tuning data remains available offline');
  assert(config.precache.reduce((sum, file) => sum + config.assets[file][0], 0) <= 5 * 1024 * 1024,
    'unchanged precache ceiling includes the complete runtime dependency graph');
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
