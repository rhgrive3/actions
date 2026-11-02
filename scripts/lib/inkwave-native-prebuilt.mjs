// Identity and admission of prebuilt native stage records (native-prebuilt/).
// A record is used only when it was produced by the current converter for the
// current reviewed stage definition; anything else falls back to the
// browser-direct KiTrix conversion.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {PREBUILT_SCHEMA} from '../../patches/native-stages/runtime/prebuilt-format.mjs';
import {SOURCE_COMMIT, SOURCE_RECIPE} from '../../patches/native-stages/runtime/source-catalog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PREBUILT_ROOT = path.join(ROOT, 'native-prebuilt');
const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
// Everything that decides the converted bytes or the encoded textures.
const CONVERTER_FILES = [
  'patches/native-stages/runtime/source-convert.mjs',
  'patches/native-stages/runtime/source-worker.mjs',
  'patches/native-stages/tools/prebuild-native.mjs',
  'patches/native-stages/tools/prebuild_textures.py',
];
export function prebuiltConverterIdentity() {
  const files = {};
  for (const rel of CONVERTER_FILES) if (fs.existsSync(path.join(ROOT, rel))) files[rel] = sha256(fs.readFileSync(path.join(ROOT, rel)));
  return {schema: PREBUILT_SCHEMA, recipe: SOURCE_RECIPE, sourceCommit: SOURCE_COMMIT, files, sha256: sha256(JSON.stringify(files))};
}
/** Stages whose record matches the current converter and stage identity. */
export function admitPrebuiltStages(stages, root = PREBUILT_ROOT) {
  const converter = prebuiltConverterIdentity(), admitted = {}, stale = [];
  const missing = [];
  for (const s of stages) {
    const file = path.join(root, s.id, 'stage.json');
    if (!fs.existsSync(file)) continue;
    const bytes = fs.readFileSync(file);
    // Git LFS checkouts without `git lfs pull` hold pointer files instead.
    if (bytes.subarray(0, 64).toString('latin1').startsWith('version https://git-lfs')) { missing.push(s.id); continue; }
    const record = JSON.parse(bytes);
    if (record.schema !== PREBUILT_SCHEMA || record.id !== s.id || record.sourceSha256 !== s.sourceSha256 ||
        record.stageIntegritySha256 !== s.integritySha256 || record.converter?.sha256 !== converter.sha256) { stale.push(s.id); continue; }
    // Every payload the runtime will verify must already match here.
    const packs = new Map((record.manifest.prebuiltTexturePacks || []).map(p => [p.file, p]));
    const payload = [...Object.values(record.arrays).flatMap(a => a.chunks.map(c => [path.join(root, s.id, c.file), c])),
      ...[...packs.values()].map(p => [path.join(root, p.file), p])];
    // Each texture is a whole slice of one listed pack.
    const placed = Object.values(record.manifest.prebuiltTextures || {}).flatMap(roles => Object.values(roles))
      .every(v => packs.has(v.pack) && Number.isSafeInteger(v.offset) && v.offset >= 0 && v.offset + v.bytes <= packs.get(v.pack).bytes);
    if (!placed || !payload.every(([f, e]) => fs.existsSync(f) && fs.statSync(f).size === e.bytes && sha256(fs.readFileSync(f)) === e.sha256)) { missing.push(s.id); continue; }
    admitted[s.id] = {stageSha256: sha256(bytes), bytes: bytes.length};
  }
  return {admitted, stale, missing, converter};
}

// Files that decide the encoded KTX2 textures. A record whose geometry
// conversion is stale can still supply GPU-compressed textures when these and
// the pinned source match: textures are keyed by source image and role, and the
// browser-direct conversion references the same source images.
const TEXTURE_FILES = ['patches/native-stages/tools/prebuild-native.mjs', 'patches/native-stages/tools/prebuild_textures.py'];
/**
 * Texture-only admission for stages without an admitted full record. Only the
 * colour group (albedo/opacity, the touch High/Balanced profile) is offered;
 * detail maps keep their PNG path. Returns {id: {file, table, bytes}}.
 */
export function admitPrebuiltTextures(stages, admittedIds = new Set(), root = PREBUILT_ROOT, groups = ['color']) {
  const converter = prebuiltConverterIdentity(), out = {}, skipped = [];
  for (const s of stages) {
    if (admittedIds.has(s.id)) continue;
    const file = path.join(root, s.id, 'stage.json');
    if (!fs.existsSync(file)) continue;
    const bytes = fs.readFileSync(file);
    if (bytes.subarray(0, 64).toString('latin1').startsWith('version https://git-lfs')) { skipped.push(s.id); continue; }
    const record = JSON.parse(bytes);
    const sameTools = TEXTURE_FILES.every(rel => record.converter?.files?.[rel] === converter.files[rel]);
    if (record.schema !== PREBUILT_SCHEMA || record.id !== s.id || record.sourceSha256 !== s.sourceSha256 || !sameTools) { skipped.push(s.id); continue; }
    const packs = (record.manifest.prebuiltTexturePacks || []).filter(p => groups.includes(p.group)
      && fs.existsSync(path.join(root, p.file)) && fs.statSync(path.join(root, p.file)).size === p.bytes
      && sha256(fs.readFileSync(path.join(root, p.file))) === p.sha256);
    const allowed = new Set(packs.map(p => p.file)), table = {};
    for (const [image, roles] of Object.entries(record.manifest.prebuiltTextures || {})) {
      for (const [role, variant] of Object.entries(roles)) {
        if (!allowed.has(variant.pack) || !Number.isSafeInteger(variant.offset) || variant.offset < 0) continue;
        const pack = packs.find(p => p.file === variant.pack);
        if (variant.offset + variant.bytes > pack.bytes) continue;
        (table[image] ||= {})[role] = variant;
      }
    }
    if (!Object.keys(table).length) { skipped.push(s.id); continue; }
    const json = Buffer.from(JSON.stringify({schema: 1, id: s.id, sourceSha256: s.sourceSha256, prebuiltTextures: table, prebuiltTexturePacks: packs}));
    out[s.id] = {file: s.id + '/textures.json', bytes: json.length, sha256: sha256(json), json, packs: packs.map(p => p.file)};
  }
  return {textures: out, skipped};
}
