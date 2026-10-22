import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { UUID_COMPARISON as P, hashBytes, prepareUuidComparison, loadUuidComparison, recordLoadedModuleResponse, verifyLoadedModules } from '../lib/inkwave-roller-uuid-comparison.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sourceRoot = process.env.INKWAVE_ROLLER_BASELINE_SOURCE;
const siteRoot = process.env.INKWAVE_ROLLER_BASELINE_SITE;
const importText = code => import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function nativeRecipe(THREE, cryptoAvailable, extraGameplayDraw = false) {
  const originalRandom = Math.random, originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 2, 3, -1, 2, 0], 3));
  let state = 1715, draws = 0, cryptoCalls = 0;
  Math.random = () => {
    draws++; let t = state = (state + 0x6D2B79F5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: cryptoAvailable ? {
    getRandomValues(words) { cryptoCalls++; return webcrypto.getRandomValues(words); },
  } : undefined });
  try {
    const clone = geometry.clone(), camera = new THREE.PerspectiveCamera(45, 1280 / 840, .1, 100);
    camera.position.set(1, 2, 3); camera.lookAt(0, .8, .5); camera.updateMatrixWorld(true);
    const allocationDraws = draws;
    if (extraGameplayDraw) Math.random();
    const samples = Array.from({ length: 302 }, () => Math.random());
    return { allocationDraws, draws, cryptoCalls, samples, uuids: [clone.uuid, camera.uuid],
      geometry: Array.from(clone.getAttribute('position').array), camera: { matrix: camera.matrixWorld.toArray(), projection: camera.projectionMatrix.toArray() } };
  } finally {
    Math.random = originalRandom;
    if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto); else delete globalThis.crypto;
  }
}
const recipe = r => ({ ...r, contactSeeds: r.contactSeeds.map(({ returnedClaimedArea, ...seed }) => seed) });

test('real historical stage reproduces raw83 and only the reviewed compiled UUID isolation', { skip: !sourceRoot || !siteRoot }, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'roller-uuid-test-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const outDir = path.join(temp, 'controlled');
  const manifestBefore = fs.readFileSync(path.join(siteRoot, 'inkwave-build.json'));
  const rawBefore = fs.readFileSync(path.join(siteRoot, P.relativePath));
  const declaration = await prepareUuidComparison({ sourceRoot, siteRoot, outDir });
  assert.equal(declaration.raw, hashBytes(rawBefore));
  const controlled = loadUuidComparison(outDir, siteRoot);
  assert.deepEqual(controlled.declaration, declaration);
  assert.deepEqual(fs.readFileSync(path.join(siteRoot, 'inkwave-build.json')), manifestBefore, 'Do not rewrite historical manifests');
  assert.deepEqual(fs.readFileSync(path.join(siteRoot, P.relativePath)), rawBefore, 'Do not replace historical emitted bytes');
  const raw = await importText(rawBefore), isolated = await importText(controlled.bytes);
  assert.deepEqual(Object.keys(raw), Object.keys(isolated), 'Compiled public exports remain exact');
  const a = nativeRecipe(raw, true), b = nativeRecipe(isolated, true);
  assert.equal(a.allocationDraws, 8); assert.equal(a.draws, 310); assert.equal(a.cryptoCalls, 0);
  assert.equal(b.allocationDraws, 0); assert.equal(b.draws, 302); assert.equal(b.cryptoCalls, 2);
  for (const r of [a, b]) { assert.equal(new Set(r.uuids).size, 2); assert(r.uuids.every(uuid => UUID.test(uuid))); }
  assert.deepEqual(a.geometry, b.geometry); assert.deepEqual(a.camera, b.camera);
  assert.notDeepEqual(a.samples, b.samples, 'Raw83 cannot be passed off as equal to isolated gameplay RNG');
  assert.deepEqual(nativeRecipe(raw, false), nativeRecipe(isolated, false), 'Native no-crypto fallback stays exact');
  const canonical = nativeRecipe(isolated, true);
  assert.deepEqual(b.samples, canonical.samples);
  assert.notDeepEqual(nativeRecipe(isolated, true, true).samples, canonical.samples, 'Real gameplay extra-draw mutation is NOT filtered out');
  await assert.rejects(prepareUuidComparison({ sourceRoot, siteRoot, outDir }), /must be new/);
  // Source identity negatives are rejected before compilation or output writes.
  const badSource = path.join(temp, 'source-mutation');
  fs.mkdirSync(path.join(badSource, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(badSource, 'scripts/build-inkwave.mjs'), 'export const fake = true;');
  await assert.rejects(prepareUuidComparison({ sourceRoot: badSource, siteRoot, outDir: path.join(temp, 'bad-builder-output') }), /Historical builder/);
  fs.copyFileSync(path.join(sourceRoot, 'scripts/build-inkwave.mjs'), path.join(badSource, 'scripts/build-inkwave.mjs'));
  fs.mkdirSync(path.join(badSource, 'inkwave-public/vendor/three/build'), { recursive: true });
  fs.writeFileSync(path.join(badSource, 'inkwave-public/vendor/three/build/three.core.js'), 'Math.random();');
  await assert.rejects(prepareUuidComparison({ sourceRoot: badSource, siteRoot, outDir: path.join(temp, 'bad-core-output') }), /Historical source bytes changed/);
  assert(!fs.existsSync(path.join(temp, 'bad-core-output')));

  // The actual compiled byte mutation must be rejected, not merely a flag change.
  fs.appendFileSync(path.join(outDir, 'three.module.js'), '\nMath.random();\n');
  assert.throws(() => loadUuidComparison(outDir, siteRoot), /Expected values to be strictly equal/);
});

test('loaded response identity rejects bypasses, wrong bytes, extra modules and absent override', () => {
  const manifest = { artifacts: {} }, loaded = {};
  for (let i = 0; i < 101; i++) {
    const rel = `src/native-${i}.js`, bytes = Buffer.from(`export const native${i}=${i};\n`);
    manifest.artifacts[rel] = hashBytes(bytes); loaded[rel] = { sha256: hashBytes(bytes), bytes: bytes.length };
  }
  manifest.artifacts[P.relativePath] = P.raw;
  loaded[P.relativePath] = { sha256: P.isolated, bytes: 1000 };
  const isolation = { ...P, paths: [P.relativePath] };
  assert.equal(verifyLoadedModules(loaded, manifest, isolation).isolatedLoads, 1);
  assert.throws(() => verifyLoadedModules(loaded, manifest), /Loaded bytes differ/);
  const raw = structuredClone(loaded); raw[P.relativePath].sha256 = P.raw;
  assert.equal(verifyLoadedModules(raw, manifest).mode, 'unmodified-production');
  assert.throws(() => verifyLoadedModules(raw, manifest, isolation), /Loaded bytes differ/);
  const absent = structuredClone(loaded); delete absent[P.relativePath];
  assert.throws(() => verifyLoadedModules(absent, manifest, isolation), /was not loaded/);
  const paint = structuredClone(loaded); paint['src/native-0.js'].sha256 = P.isolated;
  assert.throws(() => verifyLoadedModules(paint, manifest, isolation), /Loaded bytes differ/);
  const extra = structuredClone(loaded); extra['unbound.js'] = { sha256: P.raw, bytes: 1 };
  assert.throws(() => verifyLoadedModules(extra, manifest, isolation), /Unbound loaded module/);
});

test('exact RNG/contact and physical gates remain enabled in the six-capture workflow', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/inkwave-main-weapons.yml'), 'utf8');
  for (const gate of [
    "assert.deepEqual(recipe(sides[0].measurement.recipeRandom), recipe(other.measurement.recipeRandom), 'Global/contact RNG stream differs')",
    "assert.deepEqual(before[key], stamp[key], `Contact recipe differs: ${i}/${key}`)",
    "assert.ok(stamp.contactError < 1e-5, 'Every paint contact follows the actual drum')",
    "assert.ok(Math.abs(stamp.at[axis] - before.at[axis] - offset[axis]) < .003",
    "['before', 'before-control', 'before-isolated', 'before-isolated-control', 'after', 'after-control']",
    "['gpuFootprint', 'recipeRandom', 'recipeRandomTrace', 'contactStamps']",
  ]) assert(workflow.includes(gate), 'Required gate missing: ' + gate);
  // Execute the exact still-enabled RNG expression with positive and mutation
  // controls. In particular neither draw-count nor contact seeds are excluded.
  const line = workflow.split('\n').find(line => line.includes("'Global/contact RNG stream differs'"));
  const check = new Function('assert', 'recipe', 'sides', 'other', line);
  const original = { mode: 'seeded-synchronous-180-tick', draws: 302, contactSeeds: [{ order: 0, seed: .25, returnedClaimedArea: 1 }] };
  const side = r => ({ measurement: { recipeRandom: r } });
  check(assert, recipe, [side(original)], side(structuredClone(original)));
  for (const mutation of [{ ...original, draws: 310 }, { ...original, contactSeeds: [{ order: 0, seed: .5, returnedClaimedArea: 1 }] }])
    assert.throws(() => check(assert, recipe, [side(original)], side(mutation)), /Global\/contact RNG stream differs/);
});


test('response collection rejects foreign scripts rather than silently omitting them', async () => {
  const origin = 'http://127.0.0.1:1234', loaded = {};
  const response = (url, type = 'script', mime = 'text/javascript', body = 'export const native = 1;') => ({
    url: () => url, request: () => ({ resourceType: () => type }), headers: () => ({ 'content-type': mime }),
    ok: () => true, body: async () => Buffer.from(body),
  });
  for (const r of [response('https://unbound.invalid/remote.js'), response('https://unbound.invalid/extensionless'),
    response('https://unbound.invalid/mime-only', 'fetch', 'application/javascript')])
    await assert.rejects(recordLoadedModuleResponse(r, origin, loaded), /Unexpected script origin/);
  assert.deepEqual(loaded, {}, 'Foreign scripts must not become an apparently valid same-origin receipt');
  assert.equal(await recordLoadedModuleResponse(response('https://assets.invalid/image.png', 'image', 'image/png'), origin, loaded), false);
  assert.equal(await recordLoadedModuleResponse(response(origin + '/src/native.js'), origin, loaded), true);
  assert.deepEqual(loaded['src/native.js'], { sha256: hashBytes('export const native = 1;'), bytes: 24 });
  await assert.rejects(recordLoadedModuleResponse(response(origin + '/src/native.js', 'script', 'text/javascript', 'Math.random();'), origin, loaded), /Loaded module changed within capture/);
  assert.equal(await recordLoadedModuleResponse(response(origin + '/extensionless'), origin, loaded), true, 'Extensionless scripts must also reach manifest binding');
});

test('output ancestor symlinks cannot write inside historical source or site', async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'roller-uuid-path-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const source = path.join(temp, 'source'), site = path.join(temp, 'site');
  for (const dir of [source, site]) fs.mkdirSync(dir);
  for (const [name, target] of [['source', source], ['site', site]]) {
    const alias = path.join(temp, 'alias-' + name);
    fs.symlinkSync(target, alias, 'dir');
    await assert.rejects(prepareUuidComparison({ sourceRoot: source, siteRoot: site, outDir: path.join(alias, 'nested', 'output') }), /must not modify historical source or site/);
    assert(!fs.existsSync(path.join(target, 'nested')), 'Reject before creating any directory in protected history');
  }
  await assert.rejects(prepareUuidComparison({ sourceRoot: path.join(temp, 'alias-source'), siteRoot: path.join(temp, 'alias-site'), outDir: path.join(source, 'output') }), /must not modify historical source or site/);
});

test('raw A/A frozen yaw and release gameplay remain strict even when controlled A/A passes', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/inkwave-main-weapons.yml'), 'utf8');
  const start = workflow.indexOf('          for (const [first, repeat] of [[allSides[0], allSides[1]]');
  const end = workflow.indexOf('          for (const other of sides.slice(1))', start);
  assert(start >= 0 && end > start, 'Exact same-build comparison loop must remain identifiable');
  const check = new Function('assert', 'allSides', 'sides', workflow.slice(start, end));
  const side = () => ({ build: { contentHash: 'same-build' }, runtimeIdentity: {}, measurement: {
    frozenState: { yaw: 0 }, gpuFootprint: {}, recipeRandom: {}, recipeRandomTrace: {}, contactStamps: [],
  }, release: { frames: [1, 4, 12].map(tick => ({ tick, pos: [0, 0, 0], yaw: 0, rolling: true })) } });
  const canonical = Array.from({ length: 6 }, side);
  check(assert, canonical, canonical.slice(2));
  const yaw = structuredClone(canonical); yaw[1].measurement.frozenState.yaw = .01;
  assert.throws(() => check(assert, yaw, yaw.slice(2)), /Same-build A\/A frozen yaw differs/);
  for (const [key, value] of [['tick', 2], ['pos', [1, 0, 0]], ['yaw', .01], ['rolling', false]]) {
    const changed = structuredClone(canonical); changed[1].release.frames[0][key] = value;
    assert.deepEqual(changed.slice(2), canonical.slice(2), 'Controlled and candidate A/A remain unchanged in this negative');
    assert.throws(() => check(assert, changed, changed.slice(2)), /Same-build A\/A release gameplay differs/);
  }
});
