import {isNativeModuleWorkerOwner,verifyNativeModuleWorkerRows} from './inkwave-native-module-worker.mjs';
// A declared QA comparison, never a production overlay or a rebaseline.
// Retain the raw historical build and A/A captures. The only controlled variable
// is the already-shipped Three UUID isolation, composed from verified source.
import fs from 'node:fs';
import { isMusicOwner, verifyMusicWorkers } from './inkwave-roller-blob-provenance.mjs';
import {verifyGeneratedWorkerRows} from './inkwave-generated-music-worker.mjs';
export {NATIVE_MUSIC_TIMER_SOURCE,createBlobWorkerEvidence,recordBlobWorkerCreation,observeGeneratedWorker,bindBlobWorkerEvidence,installBlobWorkerObserver} from './inkwave-generated-music-worker.mjs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { adaptBuildSource } from '../inkwave-source-composition.mjs';
import { adaptUuidRandom } from '../../patches/splatoon3/uuid-random-adapter.mjs';
import { compactModuleStrings } from './inkwave-source-compaction.mjs';

export const hashBytes = bytes => createHash('sha256').update(bytes).digest('hex');
export const UUID_COMPARISON = Object.freeze({
  schema: 1, kind: 'historical-three-uuid-isolation-only',
  baseline: '83f27e5d59db944458a85122a95d1154e3543393',
  esbuild: '0.28.2',
  builder: '76361c270da4afe957560f113f38e7a3f056cdb593d5842a1354eb765e150ba7',
  adapter: 'eb6916b9ebd838e12324c8bb8298b602604b2517f3d7563868943ecf3bda797c',
  core: '9edde002b066a9a05676a6127f67735b62baf399bdea529f2f7e31657da769e6',
  module: '9052042d676cb0fdc1ddfefe193053f34b7ac0513a616fdac4535d49987812ea',
  raw: '6e3595cd58d4704e8fc823e6c9f6b85a955dd56e5448561444d04176e283cf45',
  isolated: 'fd6aba4bb49e5544f860931c8379242980552c3bc6e453a850d356bf4db99760',
  relativePath: 'vendor/three/build/three.module.js',
});
const P = UUID_COMPARISON;
const read = file => fs.readFileSync(file, 'utf8');
const once = (code, before, after, label) => {
  const at = code.indexOf(before);
  assert(at >= 0 && code.indexOf(before, at + before.length) < 0, label);
  return code.slice(0, at) + after + code.slice(at + before.length);
};
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.name !== '.rsync-tmp').flatMap(d => {
  const file = path.join(dir, d.name);
  return d.isDirectory() ? walk(file) : [file];
});

// Canonicalize the nearest existing ancestor before creating new output paths.
// Lexical containment alone can be bypassed by an ancestor symlink.
function canonicalNewPath(file) {
  let existing = path.resolve(file);
  const missing = [];
  for (;;) {
    try { fs.lstatSync(existing); break; }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(existing);
      assert.notEqual(parent, existing, 'Comparison output has no existing ancestor');
      missing.unshift(path.basename(existing)); existing = parent;
    }
  }
  return path.resolve(fs.realpathSync(existing), ...missing);
}

export async function prepareUuidComparison({ sourceRoot, siteRoot, outDir }) {
  const source = fs.realpathSync(path.resolve(sourceRoot)), site = fs.realpathSync(path.resolve(siteRoot));
  assert(!fs.existsSync(path.resolve(outDir)), 'Comparison output must be new; never rewrite a receipt');
  const output = canonicalNewPath(outDir);
  assert(!fs.existsSync(output), 'Comparison output must be new; never rewrite a receipt');
  assert(output !== source && !output.startsWith(source + path.sep) && output !== site && !output.startsWith(site + path.sep), 'Comparison output must not modify historical source or site');
  const builder = read(path.join(source, 'scripts/build-inkwave.mjs'));
  assert.equal(hashBytes(builder), P.builder, 'Historical builder is not the independently pinned83 source');
  const manifestBytes = fs.readFileSync(path.join(site, 'inkwave-build.json'));
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.contentHash, hashBytes(JSON.stringify(manifest.artifacts)));
  assert.equal(manifest.inputHash, hashBytes(JSON.stringify(manifest.files)));
  assert.equal(manifest.build.script, P.builder);
  assert.equal(manifest.build.esbuild, P.esbuild);
  const rawBytes = fs.readFileSync(path.join(site, P.relativePath));
  assert.equal(hashBytes(rawBytes), P.raw, 'Raw historical emitted Three bytes changed');
  assert.equal(manifest.artifacts[P.relativePath], P.raw);
  const paths = [P.relativePath, `_versions/${manifest.build.revision}/${P.relativePath}`];
  for (const rel of paths) {
    assert.equal(manifest.artifacts[rel], P.raw);
    assert.equal(hashBytes(fs.readFileSync(path.join(site, rel))), P.raw);
  }
  const SRC = path.join(source, 'inkwave-public');
  const inputs = {};
  for (const [name, expected] of [['three.core.js', P.core], ['three.module.js', P.module]]) {
    const rel = 'vendor/three/build/' + name, code = read(path.join(SRC, rel));
    assert.equal(hashBytes(code), expected, 'Historical source bytes changed: ' + rel);
    assert.equal(manifest.files['upstream/' + rel], expected);
    // Reject a broad composer change: the whole transformation must equal the
    // existing UUID-only adapter, not any other Three/renderer adjustment.
    assert.equal(adaptBuildSource(rel, code), adaptUuidRandom(rel, code, once), 'Only the reviewed UUID source adapter may change Three');
    inputs[rel] = expected;
  }
  const adapterBytes = fs.readFileSync(fileURLToPath(new URL('../../patches/splatoon3/uuid-random-adapter.mjs', import.meta.url)));
  assert.equal(hashBytes(adapterBytes), P.adapter, 'UUID adapter needs renewed independent review');
  const esbuild = await import(process.env.ESBUILD_MODULE ? pathToFileURL(process.env.ESBUILD_MODULE).href : 'esbuild');
  assert.equal(esbuild.version, P.esbuild);
  // Execute the actual byte-verified historical stage. Do not duplicate its
  // export discovery, compiler settings or source transform implementation.
  const start = builder.indexOf('const THREE_DIR = '), end = builder.indexOf('\n}\n', start) + 3;
  assert(start > 0 && end > start);
  const stage = builder.slice(start, end), loads = [];
  async function compile(isolated) {
    const BUILD = fs.mkdtempSync(path.join(os.tmpdir(), 'roller-three-compare-'));
    try {
      fs.mkdirSync(path.join(BUILD, 'vendor/three/build'), { recursive: true });
      for (const name of ['three.module.js', 'three.core.js']) fs.copyFileSync(path.join(SRC, 'vendor/three/build', name), path.join(BUILD, 'vendor/three/build', name));
      const compiler = { async build(options) {
        assert.equal(options.plugins, undefined, 'Historical stage must not contain hidden transforms');
        return esbuild.build({ ...options, plugins: [{ name: 'verified-historical-three-composition', setup(build) {
          build.onLoad({ filter: /\.m?js$/ }, args => {
            const rel = path.relative(SRC, args.path).split(path.sep).join('/');
            assert(Object.hasOwn(inputs, rel), 'Unexpected Three dependency: ' + rel);
            const input = read(args.path);
            assert.equal(hashBytes(input), inputs[rel]);
            const contents = isolated ? adaptBuildSource(rel, input) : input;
            if (isolated) loads.push({ path: rel, inputSha256: hashBytes(input), outputSha256: hashBytes(contents) });
            return { loader: 'js', contents };
          });
        } }] });
      } };
      const params = { fs, path, SRC, BUILD, unminified: false, esbuild: compiler, walk,
        PATCH_ROOT: path.join(source, 'patches/splatoon3'), QUALITY_ROOT: path.join(source, 'patches/local-quality'),
        RELIABILITY_ROOT: path.join(source, 'patches/reliability'), NETWORK_ROOT: path.join(source, 'patches/network-replication'),
        RANGE_ROOT: path.join(source, 'patches/practice-range'), NATIVE_ROOT: path.join(source, 'patches/native-stages'),
        compactEsm: code => compactModuleStrings(code).code, kb: String, gz: () => 0,
        console: { log() {} }, process: { env: {} },
      };
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      await new AsyncFunction(...Object.keys(params), stage)(...Object.values(params));
      return fs.readFileSync(path.join(BUILD, P.relativePath));
    } finally { fs.rmSync(BUILD, { recursive: true, force: true }); }
  }
  const repeatedRaw = await compile(false);
  assert.deepEqual(repeatedRaw, rawBytes, 'Real historical compile must reproduce the raw emitted bytes exactly');
  const isolated = await compile(true);
  assert.deepEqual(loads.map(load => load.path).sort(), Object.keys(inputs).sort(), 'Only the two independently verified Three source modules may load');
  assert.equal(hashBytes(isolated), P.isolated, 'Controlled compiled bytes differ from independently verified UUID-isolated output');
  assert.equal(hashBytes(fs.readFileSync(path.join(site, 'inkwave-build.json'))), hashBytes(manifestBytes));
  for (const rel of paths) assert.equal(hashBytes(fs.readFileSync(path.join(site, rel))), P.raw);
  const declaration = { ...P, sourceBuild: manifest.contentHash, sourceManifestSha256: hashBytes(manifestBytes),
    historicalStageSha256: hashBytes(stage), paths, loads: loads.sort((a, b) => a.path.localeCompare(b.path)),
    note: 'Controlled QA comparison only. Historical source, build, manifest and raw A/A evidence remain unmodified. No gameplay, paint, model, pose or RNG gate is waived.' };
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'three.module.js'), isolated);
  fs.writeFileSync(path.join(output, 'declaration.json'), JSON.stringify(declaration, null, 2) + '\n');
  return declaration;
}

export function loadUuidComparison(directory, siteRoot) {
  const declaration = JSON.parse(read(path.join(directory, 'declaration.json')));
  for (const [key, value] of Object.entries(P)) assert.deepEqual(declaration[key], value, 'Unreviewed comparison declaration: ' + key);
  const manifestBytes = fs.readFileSync(path.join(siteRoot, 'inkwave-build.json')), manifest = JSON.parse(manifestBytes);
  assert.equal(declaration.sourceManifestSha256, hashBytes(manifestBytes));
  assert.equal(declaration.sourceBuild, manifest.contentHash);
  assert.deepEqual(declaration.paths, [P.relativePath, `_versions/${manifest.build.revision}/${P.relativePath}`]);
  for (const rel of declaration.paths) {
    assert.equal(manifest.artifacts[rel], P.raw);
    assert.equal(hashBytes(fs.readFileSync(path.join(siteRoot, rel))), P.raw);
  }
  const bytes = fs.readFileSync(path.join(directory, 'three.module.js'));
  assert.equal(hashBytes(bytes), P.isolated);
  return { declaration, bytes };
}

// Observe executable responses, not only same-origin filenames. Any script
// outside the pinned site must fail instead of disappearing from its receipt.
export async function recordLoadedModuleResponse(response, origin, loadedModules, blobEvidence = null) {
  const url = new URL(response.url());
  const type = response.request().resourceType();
  const mime = (response.headers()['content-type'] || '').split(';')[0].trim();
  const script = type === 'script' || /\.m?js$/.test(url.pathname) || /^(?:text|application)\/(?:javascript|ecmascript|x-javascript)$/i.test(mime);
  if (!script) return false;
  assert.equal(url.origin, origin, 'Unexpected script origin: ' + url.origin);
  assert(response.ok(), 'Failed loaded module: ' + url.pathname);
  const bytes = await response.body();
  if (url.protocol === 'blob:') {
    assert(blobEvidence, 'Blob script lacks creation provenance; explicit provenance required');
    blobEvidence.responses.push({ url: response.url(), protocol: url.protocol, body: bytes.toString('utf8'), sha256: hashBytes(bytes), bytes: bytes.length });
    return true;
  }
  assert(['http:', 'https:'].includes(url.protocol), 'Unexpected script protocol: ' + url.protocol);
  const rel = decodeURIComponent(url.pathname).replace(/^\//, '');
  if (blobEvidence && (isMusicOwner(rel)||isNativeModuleWorkerOwner(rel))) blobEvidence.owners.push({ url: response.url(), body: bytes.toString('utf8') });
  const actual = { sha256: hashBytes(bytes), bytes: bytes.length };
  if (loadedModules[rel]) assert.deepEqual(loadedModules[rel], actual, 'Loaded module changed within capture: ' + rel);
  loadedModules[rel] = actual;
  return true;
}

export function verifyLoadedModules(loaded, manifest, isolation = null, blobEvidence = null) {
  const entries = Object.entries(loaded).sort(([a], [b]) => a.localeCompare(b));
  assert(entries.length > 100, 'Complete loaded runtime module evidence is required');
  const generated=verifyGeneratedWorkerRows(loaded,manifest);
  verifyNativeModuleWorkerRows(loaded,manifest);
  let isolatedLoads = 0;
  for (const [rel, actual] of entries) {
    if(generated&&rel==='@generated/native-music-timer-worker')continue;
    assert(Object.hasOwn(manifest.artifacts, rel), 'Unbound loaded module: ' + rel);
    const controlled = isolation?.paths.includes(rel);
    if (controlled) {
      assert.equal(manifest.artifacts[rel], P.raw);
      isolatedLoads++;
    }
    assert.equal(actual.sha256, controlled ? P.isolated : manifest.artifacts[rel], 'Loaded bytes differ: ' + rel);
    assert(Number.isInteger(actual.bytes) && actual.bytes > 0);
  }
  if (isolation) assert(isolatedLoads > 0, 'The declared controlled module was not loaded');
  if (!generated && entries.some(([rel]) => isMusicOwner(rel))) assert(blobEvidence, 'Loaded music requires Blob provenance');
  const dynamicWorkers = blobEvidence && blobEvidence.schema!==2 ? verifyMusicWorkers(blobEvidence, loaded, manifest) : null;
  return { ...(dynamicWorkers ? { dynamicWorkers } : {}), schema: 1, mode: isolation ? P.kind : 'unmodified-production', moduleCount: entries.length,
    isolatedLoads, sha256: hashBytes(JSON.stringify(entries)), modules: Object.fromEntries(entries) };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const [sourceRoot, siteRoot, outDir] = process.argv.slice(2);
  assert(sourceRoot && siteRoot && outDir, 'Usage: node inkwave-roller-uuid-comparison.mjs SOURCE SITE NEW_OUTPUT');
  console.log(JSON.stringify(await prepareUuidComparison({ sourceRoot, siteRoot, outDir }), null, 2));
}
