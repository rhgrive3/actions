import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {FACE_KEYS, FACE_F64, FACE_I32, PREBUILT_SCHEMA, unpackFaces} from '../runtime/prebuilt-format.mjs';
import {admitPrebuiltStages, prebuiltConverterIdentity} from '../../../scripts/lib/inkwave-native-prebuilt.mjs';
import {copyPrebuiltNativeAssets} from '../../../scripts/lib/inkwave-native-stages.mjs';

const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const face = i => ({origin: [i + .1, 2.000000123, -3.5], u: [0, 0, 1], v: [0, 1, 0], n: [-1, 0, 0], su: 1.3043999671936035 + i, sv: .9028000831604004,
  nu: 6 + i, nv: 4, cu: .21739999453226724, cv: .2257000207901001, grid: 24 * i, object: 98 + i, triangles: Array.from({length: i + 1}, (_, k) => 710 + k),
  bounds: [[31.5, 4.475399971008301, 4.5], [31.5, 5.378200054168701, 5.8043999671936035 + i]], area: .639749601483345 * (i + 1)});
// The tool's column layout, written independently of the runtime decoder.
function pack(faces) {
  const f64 = new Float64Array(faces.length * FACE_F64), i32 = new Int32Array(faces.length * FACE_I32), offsets = new Uint32Array(faces.length + 1), ids = [];
  faces.forEach((f, i) => {
    f64.set([...f.origin, ...f.u, ...f.v, ...f.n, f.su, f.sv, f.cu, f.cv, ...f.bounds[0], ...f.bounds[1], f.area], i * FACE_F64);
    i32.set([f.nu, f.nv, f.grid, f.object], i * FACE_I32);
    offsets[i + 1] = offsets[i] + f.triangles.length; ids.push(...f.triangles);
  });
  return {f64, i32, offsets, ids: Uint32Array.from(ids)};
}

test('paint faces round-trip exactly, including key order', () => {
  const faces = [face(0), face(1), face(2)], p = pack(faces), out = unpackFaces(p.f64, p.i32, p.offsets, p.ids);
  assert.deepEqual(out, faces);
  assert.equal(JSON.stringify(out), JSON.stringify(faces));
  assert.equal(Object.keys(out[0]).join(), FACE_KEYS);
});

function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prebuilt-')), id = 'stage';
  fs.mkdirSync(path.join(root, id)); fs.mkdirSync(path.join(root, 'packs'));
  const chunk = Buffer.from(new Float32Array([1, 2, 3]).buffer), pack = Buffer.from('<ktx2-bytes>'), unused = Buffer.from('unused');
  fs.writeFileSync(path.join(root, id, 'triangles.0.bin'), chunk);
  fs.writeFileSync(path.join(root, 'packs/p.bin'), pack);
  fs.writeFileSync(path.join(root, 'packs/unused.bin'), unused);
  const stage = {id, sourceSha256: 'a'.repeat(64), integritySha256: 'b'.repeat(64)};
  const record = {schema: PREBUILT_SCHEMA, id, sourceSha256: stage.sourceSha256, stageIntegritySha256: stage.integritySha256, converter: prebuiltConverterIdentity(),
    arrays: {triangles: {type: 'Float32Array', length: 3, chunks: [{file: 'triangles.0.bin', bytes: chunk.length, sha256: sha256(chunk)}]}},
    extra: {}, manifest: {prebuiltTextures: {'textures/a.png': {albedo: {pack: 'packs/p.bin', offset: 1, bytes: 10, sha256: sha256(pack.subarray(1, 11))}}},
      prebuiltTexturePacks: [{file: 'packs/p.bin', group: 'color', bytes: pack.length, sha256: sha256(pack)}]}};
  fs.writeFileSync(path.join(root, id, 'stage.json'), JSON.stringify(record));
  return {root, stage, record};
}

test('admission takes only current, complete records', () => {
  const {root, stage, record} = fixtureRoot();
  const ok = admitPrebuiltStages([stage], root);
  assert.deepEqual(Object.keys(ok.admitted), ['stage']);
  assert.equal(ok.admitted.stage.stageSha256, sha256(fs.readFileSync(path.join(root, 'stage/stage.json'))));
  assert.deepEqual(admitPrebuiltStages([{...stage, integritySha256: 'c'.repeat(64)}], root).stale, ['stage'], 'reviewed stage definition changed');
  fs.writeFileSync(path.join(root, 'stage/stage.json'), JSON.stringify({...record, converter: {...record.converter, sha256: 'old'}}));
  assert.deepEqual(admitPrebuiltStages([stage], root).stale, ['stage'], 'converter changed');
  fs.writeFileSync(path.join(root, 'stage/stage.json'), JSON.stringify(record));
  const outside = structuredClone(record); outside.manifest.prebuiltTextures['textures/a.png'].albedo.offset = 3;
  fs.writeFileSync(path.join(root, 'stage/stage.json'), JSON.stringify(outside));
  assert.deepEqual(admitPrebuiltStages([stage], root).missing, ['stage'], 'texture outside its pack');
  fs.writeFileSync(path.join(root, 'stage/stage.json'), JSON.stringify(record));
  fs.writeFileSync(path.join(root, 'packs/p.bin'), '<tampered!>!');
  assert.deepEqual(admitPrebuiltStages([stage], root).missing, ['stage'], 'payload mismatch');
  fs.writeFileSync(path.join(root, 'stage/stage.json'), 'version https://git-lfs.github.com/spec/v1\noid sha256:00\nsize 1\n');
  const lfs = admitPrebuiltStages([stage], root);
  assert.deepEqual([lfs.missing, Object.keys(lfs.admitted)], [['stage'], []], 'LFS pointer without pull');
  assert.deepEqual(admitPrebuiltStages([{...stage, id: 'absent'}], root).admitted, {});
});

test('site copy holds admitted stages and only their texture packs', () => {
  const {root, stage} = fixtureRoot(), build = fs.mkdtempSync(path.join(os.tmpdir(), 'site-'));
  const admitted = admitPrebuiltStages([stage], root).admitted;
  const summary = copyPrebuiltNativeAssets(build, {prebuiltRoot: root, config: {prebuilt: {stages: admitted}}});
  assert.equal(summary.files, 3);
  assert.ok(fs.existsSync(path.join(build, 'native-prebuilt/stage/triangles.0.bin')));
  assert.ok(fs.existsSync(path.join(build, 'native-prebuilt/packs/p.bin')));
  assert.ok(!fs.existsSync(path.join(build, 'native-prebuilt/packs/unused.bin')));
  assert.equal(copyPrebuiltNativeAssets(build, {config: {}}), null);
});

if (!vm.SourceTextModule) {
  test('prebuilt runtime loader VM subprocess', () => {
    const env = {...process.env}; delete env.NODE_TEST_CONTEXT;
    execFileSync(process.execPath, ['--experimental-vm-modules', '--test', fileURLToPath(import.meta.url)], {env, stdio: 'pipe'});
  });
} else {
  async function loader(files) {
    const fetched = [];
    const context = vm.createContext({URL, TextDecoder, ArrayBuffer, Uint8Array, Float32Array, Float64Array, Int32Array, Uint32Array, CustomEvent: class {constructor(t, o) { this.type = t; this.detail = o.detail; }},
      crypto: globalThis.crypto, Array, Object, JSON, Error, Promise, location: {href: 'https://game.test/_versions/r/index.html'}, dispatchEvent() {},
      fetch: async url => { fetched.push(url); const body = files[url]; return body ? {ok: true, status: 200, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)} : {ok: false, status: 404}; }});
    const make = values => new vm.SyntheticModule(Object.keys(values), function () { for (const [k, v] of Object.entries(values)) this.setExport(k, v); }, {context});
    const format = new vm.SourceTextModule(fs.readFileSync(new URL('../runtime/prebuilt-format.mjs', import.meta.url), 'utf8'), {context});
    await format.link(() => { throw Error('unexpected'); }); await format.evaluate();
    return {fetched, files, context, make, format};
  }
  async function load(env, stages, id) {
    const m = new vm.SourceTextModule(fs.readFileSync(new URL('../runtime/prebuilt-load.mjs', import.meta.url), 'utf8'), {context: env.context});
    await m.link(spec => spec === './prebuilt-format.mjs' ? env.format : env.make({nativeStageBuild: {prebuilt: {baseURL: '../../native-prebuilt/', stages}}}));
    await m.evaluate();
    return m.namespace.loadPrebuiltSource(id);
  }
  function siteFiles(mutate = r => r) {
    const faces = [face(0), face(1)], p = pack(faces), base = 'https://game.test/native-prebuilt/s/', files = {}, arrays = {};
    const add = (name, typed) => { const b = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength); files[base + name + '.0.bin'] = b;
      arrays[name] = {type: typed.constructor.name, length: typed.length, chunks: [{file: name + '.0.bin', bytes: b.length, sha256: sha256(b)}]}; };
    add('triangles', new Float32Array([1.5, 2.5, 3.5])); add('faceF64', p.f64); add('faceI32', p.i32); add('faceTriangleOffsets', p.offsets); add('faceTriangles', p.ids);
    // Two chunks: a split array is reassembled in order.
    const mask = Uint8Array.from([1, 2, 3, 4, 5]), a = Buffer.from(mask.subarray(0, 3)), b = Buffer.from(mask.subarray(3));
    files[base + 'mask.0.bin'] = a; files[base + 'mask.1.bin'] = b;
    arrays.mask = {type: 'Uint8Array', length: 5, chunks: [{file: 'mask.0.bin', bytes: 3, sha256: sha256(a)}, {file: 'mask.1.bin', bytes: 2, sha256: sha256(b)}]};
    const record = mutate({schema: PREBUILT_SCHEMA, id: 's', sourceRecipe: 'r', arrays, extra: {integrity: {x: 1}}, manifest: {faces: null, prebuiltFaces: 2, materials: {}}});
    const stage = Buffer.from(JSON.stringify(record)); files[base + 'stage.json'] = stage;
    return {files, faces, entry: {s: {stageSha256: sha256(stage), bytes: stage.length}}};
  }
  test('runtime loader reassembles verified chunks into the worker data shape', async () => {
    const site = siteFiles(), env = await loader(site.files), data = await load(env, site.entry, 's');
    assert.deepEqual(Array.from(data.triangles), [1.5, 2.5, 3.5]);
    assert.deepEqual(Array.from(data.mask), [1, 2, 3, 4, 5]);
    assert.equal(JSON.stringify(data.manifest.faces), JSON.stringify(site.faces));
    assert.deepEqual(data.integrity, {x: 1});
    for (const k of ['faceF64', 'faceI32', 'faceTriangleOffsets', 'faceTriangles']) assert.equal(k in data, false);
    assert.equal(data.sourceMetrics.prebuilt, true);
    assert.ok(env.fetched.every(u => u.startsWith('https://game.test/native-prebuilt/s/')));
  });
  test('runtime loader rejects tampered chunks, stage records and incomplete faces', async () => {
    const site = siteFiles(), key = Object.keys(site.files).find(k => k.endsWith('triangles.0.bin'));
    site.files[key] = Buffer.from(new Float32Array([9, 9, 9]).buffer);
    await assert.rejects(load(await loader(site.files), site.entry, 's'), /integrity mismatch/);
    const other = siteFiles();
    await assert.rejects(load(await loader(other.files), {s: {...other.entry.s, stageSha256: '0'.repeat(64)}}, 's'), /integrity mismatch/);
    const short = siteFiles(r => ({...r, manifest: {...r.manifest, prebuiltFaces: 3}}));
    await assert.rejects(load(await loader(short.files), short.entry, 's'), /faces incomplete/);
  });

  async function textures({ktx2Fails = false, abort = false, quality = 'balanced'} = {}) {
    const calls = {bitmaps: 0, parsed: 0, warned: [], packs: [], slices: []}, signal = {aborted: false};
    class Texture { constructor(image) { this.image = image; } dispose() { this.disposed = true; } }
    const context = vm.createContext({Map, Blob, Uint8Array, DOMException, URL, location: {href: 'https://game.test/_versions/r/index.html'},
      console: {warn: m => calls.warned.push(m)},
      createImageBitmap: async () => { calls.bitmaps++; return {width: 64, height: 64, close() {}}; }});
    const make = values => { const m = new vm.SyntheticModule(Object.keys(values), function () { for (const [k, v] of Object.entries(values)) this.setExport(k, v); }, {context}); return m; };
    const ready = async m => { await m.link(() => { throw Error('unexpected'); }); await m.evaluate(); return m; };
    class KTX2Loader { setTranscoderPath() { return this; } detectSupport() { return this; } dispose() {}
      parse(bytes, onLoad, onError) { calls.parsed++; calls.slices.push(Array.from(new Uint8Array(bytes))); if (abort) signal.aborted = true;
        if (ktx2Fails) return onError(Error('transcoder unavailable'));
        onLoad({isCompressedTexture: true, image: {width: 2048, height: 2048}, mipmaps: [2048, 1024, 512, 256].map(n => ({width: n, height: n, data: new Uint8Array(1)})), dispose() {}}); } }
    const dynamic = {
      '../../../vendor/three/jsm/loaders/KTX2Loader.js': {KTX2Loader},
      './prebuilt-load.mjs': {fetchVerified: async file => { calls.packs.push(file); return Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]).buffer; }},
    };
    const mods = {three: {Texture, DataTexture: Texture, SRGBColorSpace: 'srgb', NoColorSpace: '', RepeatWrapping: 1000},
      './registry.mjs': {nativeStageURL: () => ''}, './build-config.mjs': {nativeStageBuild: {mode: 'browser-direct'}},
      './source-data.mjs': {loadBrowserSource: () => {}}, './source-cache.mjs': {sourceBytes: async () => new Uint8Array(26).buffer}};
    const m = new vm.SourceTextModule(fs.readFileSync(new URL('../runtime/native-load.mjs', import.meta.url), 'utf8'), {context,
      importModuleDynamically: async spec => ready(make(dynamic[spec]))});
    await m.link(async name => make(mods[name])); await m.evaluate();
    const data = {manifest: {materials: {m: {albedo: 'a.png', maps: {}, channels: {}}, n: {albedo: 'b.png', maps: {}, channels: {}}},
      prebuiltTextures: {'a.png': {albedo: {pack: 'packs/p.bin', offset: 2, bytes: 3, sha256: 'x'}}, 'b.png': {albedo: {pack: 'packs/p.bin', offset: 5, bytes: 2, sha256: 'y'}}},
      prebuiltTexturePacks: [{file: 'packs/p.bin', group: 'color', bytes: 8, sha256: 'z'}]}, integrity: {}};
    let result, error;
    try { result = await m.namespace.loadNativeTextures('fixture', data, {capabilities: {getMaxAnisotropy: () => 16}}, quality, signal, {maxDimension: 1024, perRole: {}}); }
    catch (e) { error = e; }
    return {calls, result, error};
  }
  test('KTX2 textures skip PNG decoding and start their mip chain within the cap', async () => {
    const {calls, result, error} = await textures();
    assert.equal(error, undefined);
    assert.equal(calls.bitmaps, 0);
    const t = result.get('a.png');
    assert.equal(JSON.stringify([t.image, t.mipmaps.map(m => m.width)]), JSON.stringify([{width: 1024, height: 1024}, [1024, 512, 256]]));
    assert.deepEqual([t.colorSpace, t.wrapS, t.wrapT, t.anisotropy, t.needsUpdate], ['srgb', 1000, 1000, 4, true]);
    // Both textures are slices of one pack fetched once.
    assert.deepEqual(calls.packs, ['packs/p.bin']);
    assert.deepEqual(calls.slices.map(x => x.join()).sort(), ['2,3,4', '5,6']);
  });
  test('a failed KTX2 texture falls back to its pinned PNG; an abort does not', async () => {
    const fallback = await textures({ktx2Fails: true});
    assert.equal(fallback.error, undefined);
    assert.equal(fallback.calls.bitmaps, 2);
    assert.match(fallback.calls.warned[0], /decoding source PNG/);
    assert.equal(fallback.result.get('a.png').isCompressedTexture, undefined);
    const aborted = await textures({abort: true});
    assert.equal(aborted.error?.name, 'AbortError');
    assert.equal(aborted.calls.bitmaps, 0);
  });
}

// CI scripts read `git ls-tree -r -z` with Node's default 1 MiB buffer; one
// tracked file per texture once pushed the listing past it.
test('committed prebuilt data stays a few hundred files', () => {
  let listing;
  try { listing = execFileSync('git', ['ls-files', '-z', '--', 'native-prebuilt'], {cwd: fileURLToPath(new URL('../../..', import.meta.url)), encoding: 'utf8'}); }
  catch { return; }
  assert.ok(listing.split('\0').filter(Boolean).length <= 800, 'pack textures instead of tracking one file each');
});
