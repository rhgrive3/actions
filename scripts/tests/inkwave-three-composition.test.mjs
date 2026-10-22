import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { webcrypto, createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptBuildSource } from '../inkwave-source-composition.mjs';
import { compactModuleStrings } from '../lib/inkwave-source-compaction.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const SRC = path.join(root, 'inkwave-public');
const THREE_REL = 'vendor/three/build/';
const read = rel => fs.readFileSync(path.join(SRC, rel), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const importText = code => import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).filter(d => d.name !== '.rsync-tmp').flatMap(d => {
  const file = path.join(directory, d.name);
  return d.isDirectory() ? walk(file) : [file];
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function nativeAllocation(THREE, cryptoAvailable, extraGeometries = 0) {
  const originalRandom = Math.random;
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  let draws = 0, cryptoCalls = 0, state = 0x12345678;
  Math.random = () => { draws++; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: cryptoAvailable ? {
    getRandomValues(words) { cryptoCalls++; return webcrypto.getRandomValues(words); },
  } : undefined });
  try {
    for (let i = 0; i < extraGeometries; i++) new THREE.BufferGeometry();
    const objects = [new THREE.Object3D(), new THREE.Material(), new THREE.BufferGeometry(), new THREE.Texture()];
    const uuids = [...objects.map(object => object.uuid), objects[3].source.uuid];
    const allocationDraws = draws;
    const nextGameplay = [Math.random(), Math.random(), Math.random()];
    return { allocationDraws, cryptoCalls, uuids, nextGameplay };
  } finally {
    Math.random = originalRandom;
    if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
    else delete globalThis.crypto;
  }
}

async function runProductionThreeStage(t, compose = adaptBuildSource) {
  const esbuild = await import(process.env.ESBUILD_MODULE ? pathToFileURL(process.env.ESBUILD_MODULE).href : 'esbuild');
  const BUILD = fs.mkdtempSync(path.join(os.tmpdir(), 'inkwave-three-composition-'));
  t.after(() => fs.rmSync(BUILD, { recursive: true, force: true }));
  const files = ['three.module.js', 'three.core.js'];
  const before = new Map(files.map(file => [file, hash(read(THREE_REL + file))]));
  fs.mkdirSync(path.join(BUILD, THREE_REL), { recursive: true });
  // Match the ordinary copy pass, which the tree-shaken output later replaces.
  for (const file of files) {
    const code = adaptBuildSource(THREE_REL + file, read(THREE_REL + file));
    const result = await esbuild.transform(code, { loader: 'js', minify: true, charset: 'utf8', legalComments: 'inline', sourcefile: THREE_REL + file });
    fs.writeFileSync(path.join(BUILD, THREE_REL + file), result.code);
  }
  // Execute this exact production stage, rather than duplicating its bundle options.
  // This is a real esbuild compile of the vendored sources, not a full-site build.
  const script = fs.readFileSync(path.join(root, 'scripts/build-inkwave.mjs'), 'utf8');
  const start = script.indexOf('const THREE_DIR = ');
  const end = script.indexOf('\n// The current audio route', start);
  assert(start >= 0 && end > start, 'production Three stage remains identifiable');
  const stage = script.slice(start, end);
  const loads = [];
  const adapted = (rel, code) => {
    const output = compose(rel, code);
    loads.push({ rel, input: hash(code), output: hash(output) });
    return output;
  };
  const params = { fs, path, SRC, BUILD, unminified: false, esbuild, walk,
    PATCH_ROOT: path.join(root, 'patches/splatoon3'), QUALITY_ROOT: path.join(root, 'patches/local-quality'),
    RELIABILITY_ROOT: path.join(root, 'patches/reliability'), NETWORK_ROOT: path.join(root, 'patches/network-replication'),
    RANGE_ROOT: path.join(root, 'patches/practice-range'), NATIVE_ROOT: path.join(root, 'patches/native-stages'),
    adaptBuildSource: adapted, compactEsm: code => compactModuleStrings(code).code,
    kb: bytes => String(bytes), gz: bytes => zlib.gzipSync(bytes, { level: 9 }).length,
    console: { log() {} }, process: { env: {} },
  };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction(...Object.keys(params), stage)(...Object.values(params));
  const code = fs.readFileSync(path.join(BUILD, THREE_REL + 'three.module.js'), 'utf8');
  assert(!fs.existsSync(path.join(BUILD, THREE_REL + 'three.core.js')), 'core remains bundled, not separately emitted');
  for (const file of files) assert.equal(hash(read(THREE_REL + file)), before.get(file), 'upstream input stays immutable: ' + file);
  return { code, loads, module: await importText(code), esbuildVersion: esbuild.version };
}

test('production Three bundle retains all vendor composition and native UUID RNG isolation', async t => {
  const rawCore = read(THREE_REL + 'three.core.js');
  const raw = await importText(rawCore);
  const composed = await importText(adaptBuildSource(THREE_REL + 'three.core.js', rawCore));
  const production = await runProductionThreeStage(t);
  const bypass = await runProductionThreeStage(t, (_rel, code) => code);
  assert.deepEqual(production.loads.map(load => load.rel).sort(), [THREE_REL + 'three.core.js', THREE_REL + 'three.module.js']);
  for (const load of production.loads) {
    assert.equal(load.input, hash(read(load.rel)), 'bundle reads original source: ' + load.rel);
    assert.equal(load.output, hash(adaptBuildSource(load.rel, read(load.rel))), 'bundle uses the complete composer: ' + load.rel);
  }
  assert.deepEqual(Object.keys(production.module), Object.keys(bypass.module), 'tree-shaken public exports are unchanged');
  const fullCore = adaptBuildSource(THREE_REL + 'three.core.js', rawCore);
  assert.notEqual(fullCore, rawCore, 'UUID adapter changes the source');

  for (const [name, THREE] of [['raw upstream', raw], ['uncomposed negative control', bypass.module]]) {
    const present = nativeAllocation(THREE, true);
    const absent = nativeAllocation(THREE, false);
    assert.equal(present.allocationDraws, 20, name + ': five UUIDs consume the gameplay stream');
    assert.equal(present.cryptoCalls, 0);
    assert.deepEqual(present, absent, name + ': native crypto was bypassed');
    assert.notDeepEqual(nativeAllocation(THREE, true, 5).nextGameplay, present.nextGameplay, name + ': visual allocation shifts gameplay');
  }
  for (const [name, THREE] of [['composed source', composed], ['production emitted', production.module]]) {
    const present = nativeAllocation(THREE, true);
    assert.equal(present.allocationDraws, 0, name + ': UUIDs never consume gameplay RNG when crypto exists');
    assert.equal(present.cryptoCalls, 5);
    assert.equal(new Set(present.uuids).size, 5);
    assert(present.uuids.every(uuid => UUID.test(uuid)), name + ': UUID version and variant remain valid');
    assert.deepEqual(nativeAllocation(THREE, true, 5).nextGameplay, present.nextGameplay, name + ': extra visual allocation leaves gameplay unchanged');
    assert.deepEqual(nativeAllocation(THREE, false), nativeAllocation(raw, false), name + ': no-crypto fallback preserves source UUIDs and draw order');
  }
  assert.deepEqual(nativeAllocation(production.module, true).nextGameplay, nativeAllocation(composed, true).nextGameplay, 'source/emitted RNG parity');
});

const builtSite = process.env.INKWAVE_BUILT_SITE;
test('full-site emitted Three UUIDs use native crypto without gameplay draws', { skip: !builtSite }, async () => {
  const THREE = await importText(fs.readFileSync(path.join(builtSite, THREE_REL + 'three.module.js'), 'utf8'));
  const present = nativeAllocation(THREE, true);
  assert.equal(present.allocationDraws, 0);
  assert.equal(present.cryptoCalls, 5);
  assert(present.uuids.every(uuid => UUID.test(uuid)));
  assert.deepEqual(nativeAllocation(THREE, true, 5).nextGameplay, present.nextGameplay);
});
