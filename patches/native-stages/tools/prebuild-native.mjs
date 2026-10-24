#!/usr/bin/env node
// Prebuilt native stages: the exact browser-direct conversion, done once.
//
// The runtime normally downloads the pinned KiTrix OBJ/MTL/PNG in the player's
// browser and converts them in source-worker.mjs. This tool runs the same
// convertSource + compactInactiveDisplay in Node, applies loadNativeTextures'
// pixel inference at build time, and encodes every (texture, role) as KTX2
// UASTC. The game then loads verified, already converted data and GPU-compressed
// textures from its own origin.
//
//   node --max-old-space-size=12000 patches/native-stages/tools/prebuild-native.mjs [stage-id ...]
//
// Requires curl, python3 (numpy, Pillow) and basisu (BASISU env or PATH).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync, spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {nativeStageCatalog, nativeBrowserStageIntegrity} from '../../../scripts/lib/inkwave-native-stages.mjs';
import {convertSource} from '../runtime/source-convert.mjs';
import {SOURCE_COMMIT, SOURCE_RECIPE} from '../runtime/source-catalog.mjs';
import {PREBUILT_SCHEMA, PREBUILT_CHUNK_BYTES, FACE_KEYS, FACE_F64, FACE_I32} from '../runtime/prebuilt-format.mjs';
import {prebuiltConverterIdentity} from '../../../scripts/lib/inkwave-native-prebuilt.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// The worker's own compaction, taken from its source (as source-worker-compaction.test.mjs does).
const WORKER_SOURCE = fs.readFileSync(path.join(HERE, '../runtime/source-worker.mjs'), 'utf8');
const compactInactiveDisplay = new Function(WORKER_SOURCE.slice(WORKER_SOURCE.indexOf('function compactInactiveDisplay'), WORKER_SOURCE.indexOf('self.onmessage')) + '\nreturn compactInactiveDisplay;')();
const REPO = path.resolve(HERE, '../../..');
const OUT = path.resolve(process.env.INKWAVE_PREBUILT_OUT || path.join(REPO, 'native-prebuilt'));
const WORK = path.resolve(process.env.INKWAVE_PREBUILT_WORK || path.join(os.tmpdir(), 'inkwave-prebuild'));
const BASISU = process.env.BASISU || 'basisu';
const JOBS = Math.max(1, Number(process.env.INKWAVE_PREBUILT_JOBS) || 2);
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
const gitSha1 = b => crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob ' + b.length + '\0'), b])).digest('hex');

// UASTC settings per role. Colour maps use mild RDO (zstd-friendly, ~51-57 dB
// on source albedo); normal and linear data maps are encoded without RDO.
const ENCODE = {
  albedo: ['-uastc_level', '2', '-uastc_rdo_l', '1.0', '-mip_srgb'],
  emissive: ['-uastc_level', '2', '-uastc_rdo_l', '1.0', '-mip_srgb'],
  opacity: ['-uastc_level', '3', '-linear', '-mip_linear'],
  roughness: ['-uastc_level', '3', '-linear', '-mip_linear'],
  normal: ['-uastc_level', '3', '-normal_map', '-mip_linear'],
};

// Encoded file names change with the encoder settings or the pixel preprocessing.
const PIXEL_SHA = sha256(fs.readFileSync(path.join(HERE, 'prebuild_textures.py')));
const encodeTag = role => sha256(JSON.stringify([ENCODE[role], PIXEL_SHA, '-ktx2_zstandard_level 18 -mipmap'])).slice(0, 10);

function curl(url, file) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { execFileSync('curl', ['-sS', '--fail', '-L', '--retry', '3', '-o', file, url], {stdio: ['ignore', 'ignore', 'pipe']}); return; }
    catch (error) { if (attempt === 3) throw error; }
  }
}
function sourceUrl(stage, file) {
  const host = file.endsWith('.obj') ? 'https://media.githubusercontent.com/media/kirakira-dev/KiTrix/' : 'https://raw.githubusercontent.com/kirakira-dev/KiTrix/';
  return host + SOURCE_COMMIT + '/stages/' + stage.internal + '/' + file.split('/').map(encodeURIComponent).join('/');
}
function fetchPinned(stage, file, pin) {
  const local = path.join(WORK, 'source', stage.internal, file);
  fs.mkdirSync(path.dirname(local), {recursive: true});
  const ok = () => {
    if (!fs.existsSync(local)) return false;
    const bytes = fs.readFileSync(local);
    if (pin.bytes !== undefined && bytes.length !== pin.bytes) return false;
    return pin.sha256 ? sha256(bytes) === pin.sha256 : gitSha1(bytes) === pin.gitSha1;
  };
  if (!ok()) { curl(sourceUrl(stage, file), local); if (!ok()) throw Error('Pinned source mismatch: ' + stage.internal + '/' + file); }
  return local;
}
function sourceFiles(stage) {
  const inventory = JSON.parse(fs.readFileSync(path.join(REPO, 'patches/native-stages/source-inventories', stage.tree + '.json'), 'utf8'));
  if (inventory.tree !== stage.tree) throw Error('Inventory tree mismatch: ' + stage.id);
  const files = {};
  for (const [mode, file, sha, size] of inventory.entries) {
    if (mode === '040000') continue;
    if (file.startsWith('/') || file.split('/').some(p => p === '..' || p === '')) throw Error('Unsafe source path');
    files[file] = {bytes: size, gitSha1: sha};
  }
  return files;
}

// loadNativeTextures (quality 'high', active materials): one job per file and
// the last assigned role wins. Inference results apply exactly as at runtime.
function textureJobs(manifest) {
  const active = new Set(manifest.objects.filter(o => o?.active).map(o => o.material));
  const materials = Object.entries(manifest.materials).filter(([name]) => active.has(name)).map(([, m]) => m);
  const jobs = new Map(), uses = new Map();
  for (const src of materials) {
    const roles = {albedo: src.albedo, opacity: src.maps?.opacity, normal: src.maps?.normal, roughness: src.maps?.roughness, emissive: src.maps?.emissive};
    for (const [role, file] of Object.entries(roles)) if (file) {
      jobs.set(file, role);
      if (!uses.has(file)) uses.set(file, new Set());
      uses.get(file).add(role);
    }
  }
  const matched = new Map();
  for (const m of materials) for (const file of new Set([m.albedo, ...Object.values(m.maps || {})])) {
    if (!jobs.has(file)) continue;
    if (!matched.has(file)) matched.set(file, []);
    matched.get(file).push(m);
  }
  return {jobs, uses, matched};
}

function runPool(tasks, limit) {
  let next = 0, failed = null;
  const worker = async () => { while (next < tasks.length && !failed) { const task = tasks[next++]; try { await task(); } catch (e) { failed ||= e; } } };
  return Promise.all(Array.from({length: Math.min(limit, tasks.length)}, worker)).then(() => { if (failed) throw failed; });
}
function encode(png, role, out) {
  return new Promise((resolve, reject) => {
    const args = ['-uastc', ...ENCODE[role], '-ktx2', '-ktx2_zstandard_level', '18', '-mipmap', '-file', png, '-output_file', out];
    const child = spawn(BASISU, args, {stdio: ['ignore', 'ignore', 'pipe']});
    let err = ''; child.stderr.on('data', d => { err += d; });
    child.on('close', code => code === 0 && fs.existsSync(out) ? resolve() : reject(Error('basisu failed for ' + png + ': ' + err.slice(-400))));
  });
}

function packFaces(faces) {
  const n = faces.length, f64 = new Float64Array(n * FACE_F64), i32 = new Int32Array(n * FACE_I32), offsets = new Uint32Array(n + 1);
  let tris = 0;
  for (const f of faces) tris += f.triangles.length;
  const ids = new Uint32Array(tris);
  faces.forEach((f, i) => {
    const keys = Object.keys(f).join();
    if (keys !== FACE_KEYS) throw Error('Unexpected paint face layout: ' + keys);
    f64.set([...f.origin, ...f.u, ...f.v, ...f.n, f.su, f.sv, f.cu, f.cv, ...f.bounds[0], ...f.bounds[1], f.area], i * FACE_F64);
    i32.set([f.nu, f.nv, f.grid, f.object], i * FACE_I32);
    offsets[i + 1] = offsets[i] + f.triangles.length;
    ids.set(f.triangles, offsets[i]);
    for (const [key, value] of Object.entries(f)) if (typeof value === 'number' && ['nu', 'nv', 'grid', 'object'].includes(key) && !Number.isInteger(value)) throw Error('Non-integer face field ' + key);
  });
  return {faceF64: f64, faceI32: i32, faceTriangleOffsets: offsets, faceTriangles: ids};
}

function writeChunks(dir, name, typed) {
  const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength), chunks = [];
  for (let offset = 0, index = 0; offset < bytes.length || index === 0; offset += PREBUILT_CHUNK_BYTES, index++) {
    const part = bytes.subarray(offset, Math.min(bytes.length, offset + PREBUILT_CHUNK_BYTES)), file = `${name}.${index}.bin`;
    fs.writeFileSync(path.join(dir, file), part);
    chunks.push({file, bytes: part.length, sha256: sha256(part)});
    if (!bytes.length) break;
  }
  return {type: typed.constructor.name, length: typed.length, chunks};
}

async function prebuild(stage, catalogStage) {
  const t0 = Date.now(), files = sourceFiles(stage);
  const objFile = stage.internal + '.obj', mtlFile = stage.internal + '.mtl';
  if (!files[mtlFile]) throw Error('Missing pinned MTL: ' + stage.id);
  console.log(`[${stage.id}] source`);
  const obj = fs.readFileSync(fetchPinned(stage, objFile, {sha256: stage.sourceSha256}));
  const mtl = fs.readFileSync(fetchPinned(stage, mtlFile, files[mtlFile]), 'utf8');
  console.log(`[${stage.id}] convert`);
  // Same options as source-worker.mjs on an unconstrained client.
  let data = convertSource(catalogStage, new Uint8Array(obj.buffer, obj.byteOffset, obj.byteLength), mtl, files, () => {}, null, {compactBVHCenters: false, compactInactiveDisplay: true});
  data = compactInactiveDisplay(data);
  const manifest = data.manifest;
  // Paint-chart faces are ~0.5 KB of JSON each (33 MB on Brinewater). Store
  // them column-wise; the runtime rebuilds the identical objects.
  Object.assign(data, packFaces(manifest.faces));
  manifest.faces = null;
  manifest.prebuiltFaces = manifest.geometry.paintFaces;

  // Texture inference + preprocessing (python), then KTX2 encoding (basisu).
  const {jobs, uses, matched} = textureJobs(manifest);
  const scratch = path.join(WORK, 'pixels', stage.id);
  fs.rmSync(scratch, {recursive: true, force: true}); fs.mkdirSync(scratch, {recursive: true});
  const keyOf = file => files[file].gitSha1;
  // Byte-identical files (same git blob) under different paths and roles
  // share one decode with the union of their roles.
  const byBlob = new Map();
  for (const [file, roles] of uses) {
    const job = byBlob.get(keyOf(file));
    if (job) for (const role of roles) { if (!job.roles.includes(role)) job.roles.push(role); }
    else byBlob.set(keyOf(file), {png: fetchPinned(stage, file, files[file]), roles: [...roles], out: scratch, key: keyOf(file)});
  }
  const pyJobs = [...byBlob.values()];
  console.log(`[${stage.id}] infer ${pyJobs.length} textures`);
  const inferred = JSON.parse(execFileSync('python3', [path.join(HERE, 'prebuild_textures.py')], {input: JSON.stringify(pyJobs), maxBuffer: 1 << 28}).toString());
  const byKey = new Map(inferred.map(r => [r.key, r]));

  // Apply exactly the runtime's single job per file (last role wins).
  for (const [file, role] of jobs) {
    const info = byKey.get(keyOf(file)).roles[role];
    for (const m of matched.get(file) || []) {
      if (role === 'albedo' && m.albedo === file) m.hasAlpha = info.hasAlpha;
      if (role === 'normal') m.normalEncoding = info.normalEncoding;
      if (role === 'roughness' || role === 'opacity') m.channels[role] = info.channel;
    }
  }
  const texDir = path.join(OUT, 'textures');
  fs.mkdirSync(texDir, {recursive: true});
  const prebuiltTextures = {}, encodeTasks = [];
  for (const [file, roles] of uses) {
    const entry = byKey.get(keyOf(file));
    prebuiltTextures[file] = {};
    for (const role of roles) {
      const name = `${keyOf(file)}.${role}.${encodeTag(role)}.ktx2`, target = path.join(texDir, name);
      prebuiltTextures[file][role] = {file: 'textures/' + name, width: entry.width, height: entry.height};
      if (!fs.existsSync(target)) encodeTasks.push(() => encode(entry.roles[role].png, role, target + '.tmp').then(() => fs.renameSync(target + '.tmp', target)));
    }
  }
  console.log(`[${stage.id}] encode ${encodeTasks.length} KTX2 (${Object.values(prebuiltTextures).reduce((n, r) => n + Object.keys(r).length, 0)} variants)`);
  await runPool(encodeTasks, JOBS);
  for (const roles of Object.values(prebuiltTextures)) for (const variant of Object.values(roles)) {
    const bytes = fs.readFileSync(path.join(OUT, variant.file));
    variant.bytes = bytes.length; variant.sha256 = sha256(bytes);
  }
  manifest.prebuiltTextures = prebuiltTextures;

  // Typed arrays in chunks; everything else stays JSON.
  const dir = path.join(OUT, stage.id);
  fs.rmSync(dir, {recursive: true, force: true}); fs.mkdirSync(dir, {recursive: true});
  const arrays = {}, extra = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === 'manifest') continue;
    if (ArrayBuffer.isView(value)) arrays[key] = writeChunks(dir, key, value);
    else extra[key] = value;
  }
  const record = {schema: PREBUILT_SCHEMA, id: stage.id, sourceCommit: SOURCE_COMMIT, sourceRecipe: SOURCE_RECIPE,
    sourceSha256: stage.sourceSha256, stageIntegritySha256: catalogStage.integritySha256,
    converter: prebuiltConverterIdentity(), arrays, extra, manifest};
  fs.writeFileSync(path.join(dir, 'stage.json'), JSON.stringify(record));
  fs.rmSync(scratch, {recursive: true, force: true});
  console.log(`[${stage.id}] done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

const {stages} = nativeStageCatalog();
const wanted = process.argv.slice(2);
for (const id of wanted) if (!stages.some(s => s.id === id)) throw Error('Unknown playable native stage: ' + id);
try { execFileSync(BASISU, ['-version'], {stdio: 'ignore'}); } catch { throw Error('basisu not found (set BASISU)'); }
for (const stage of stages.filter(s => !wanted.length || wanted.includes(s.id))) {
  // The worker converts SOURCE_STAGES from the sealed build config: the
  // catalogue stage plus its browser integrity identity.
  await prebuild(stage, {...stage, integritySha256: nativeBrowserStageIntegrity(stage)});
}
