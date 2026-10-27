// Entirely fabricated receipt metadata. These tests prove no browser output.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { CATALOG_MODULES, catalogInputPath, validateCatalogReceipts } from '../../scripts/check-inkwave-motion-catalog.mjs';
import { writeBuildIdentity } from '../../patches/splatoon3/adapter.mjs';
import { safeSameHeadReceiptUnion } from './safe-same-head-receipt-union.mjs';

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fx = '_versions/fixture/src/fx/fxHooks.js';
const cue = '_versions/fixture/patches/splatoon3/runtime/bomb-cues.mjs';
function fixture() {
  const suffixes = [...CATALOG_MODULES.map(([id]) => 'patches/splatoon3/runtime/' + id + '-motion.mjs'),
    'patches/splatoon3/runtime/install.mjs', 'patches/splatoon3/runtime/render.mjs', 'patches/splatoon3/runtime/walk.mjs',
    'src/game/actor.js', 'src/game/character.js', 'src/game/weapons.js', 'src/game/physics.js', 'src/game/match.js',
    'src/fx/fxHooks.js', 'patches/splatoon3/runtime/bomb-cues.mjs'];
  const artifacts = Object.fromEntries(suffixes.map(file => ['_versions/fixture/' + file, hash('fabricated ' + file)]));
  const files = { 'upstream/src/game/actor.js': hash('fabricated actor'), 'build-script/inkwave-source-composition.mjs': hash('fabricated composition') };
  const manifest = { schema: 1, contentHash: hash(JSON.stringify(artifacts)), inputHash: hash(JSON.stringify(files)),
    build: { revision: 'fixture', script: hash('fabricated builder') }, files, artifacts };
  const manifestBytes = JSON.stringify(manifest, null, 2) + '\n';
  const expected = { manifestSha256: hash(manifestBytes), sourceHead: 'a'.repeat(40) };
  const sourceInputs = Object.entries(files).map(([key, sha256]) => ({ key,
    file: key.startsWith('upstream/') ? key.replace('upstream/', 'inkwave-public/') : key.replace('build-script/', 'scripts/'),
    sha256, committedSHA256: sha256, bytes: 100 }));
  const rows = Object.entries(artifacts).map(([file, sha256]) => ({ file, sha256, bytes: 100, status: 200 }));
  const metadata = { ...expected, contentHash: manifest.contentHash, inputHash: manifest.inputHash,
    build: manifest.build, builderSHA256: manifest.build.script, artifacts, sourceInputs, errors: [] };
  return { manifestBytes, expected: structuredClone(expected),
    original: structuredClone({ ...metadata, loaded: rows.filter(row => row.file !== cue) }),
    fresh: structuredClone({ ...metadata, loaded: rows.filter(row => row.file === cue || row.file === fx) }) };
}

test('receipt-only union adds absent entry, retains exact duplicates and never mutates inputs', () => {
  const input = fixture(), before = structuredClone(input);
  const loaded = safeSameHeadReceiptUnion(input);
  assert.equal(loaded.length, input.original.loaded.length + 1);
  assert.equal(loaded.filter(row => row.file === fx).length, 1);
  assert.deepEqual(input, before);
  assert.equal(Object.hasOwn(loaded, 'status'), false, 'no replay acceptance certificate');
  loaded[0].bytes++;
  assert.deepEqual(input, before, 'returned rows do not alias capture rows');
});

test('actual canonical identity writer keeps builder separate from manifest.files and union accepts that schema', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'same-head-schema-'));
  try {
    const source = path.join(temp, 'source'), patch = path.join(temp, 'patch'), out = path.join(temp, 'out');
    for (const dir of [source, patch, out]) fs.mkdirSync(dir);
    fs.mkdirSync(path.join(source, 'src/game'), { recursive: true });
    fs.writeFileSync(path.join(source, 'src/game/actor.js'), 'fabricated actor bytes');
    fs.writeFileSync(path.join(patch, 'fixture.json'), '{}');
    for (const file of Object.keys(JSON.parse(fixture().manifestBytes).artifacts)) {
      fs.mkdirSync(path.dirname(path.join(out, file)), { recursive: true });
      fs.writeFileSync(path.join(out, file), 'fabricated emitted bytes: ' + file);
    }
    const builderSHA256 = hash(fs.readFileSync(new URL('../../scripts/build-inkwave.mjs', import.meta.url)));
    const manifest = writeBuildIdentity(source, out, patch, { revision: 'fixture', script: builderSHA256 });
    assert.equal(Object.hasOwn(manifest.files, 'build-script/build-inkwave.mjs'), false);
    assert.equal(manifest.build.script, builderSHA256);
    const manifestBytes = fs.readFileSync(path.join(out, 'inkwave-build.json'));
    const expected = { manifestSha256: hash(manifestBytes), sourceHead: 'a'.repeat(40) };
    const sourceInputs = Object.entries(manifest.files).map(([key, sha256]) => ({
      key, file: catalogInputPath(key), sha256, committedSHA256: sha256, bytes: 100,
    }));
    const metadata = { ...expected, contentHash: manifest.contentHash, inputHash: manifest.inputHash,
      artifacts: manifest.artifacts, build: manifest.build, builderSHA256, sourceInputs, errors: [] };
    const loaded = Object.entries(manifest.artifacts).map(([file, sha256]) => ({
      file, sha256, bytes: fs.statSync(path.join(out, file)).size, status: 200,
    }));
    const original = structuredClone({ ...metadata, loaded: loaded.filter(row => row.file !== cue) });
    const fresh = structuredClone({ ...metadata, loaded: loaded.filter(row => row.file === cue || row.file === fx) });
    assert.equal(safeSameHeadReceiptUnion({ manifestBytes, expected, original, fresh }).length, loaded.length);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test('historical exact union can conceal corrupt old FX row; safe union rejects before replacement', () => {
  const input = fixture();
  input.original.loaded.find(row => row.file === fx).sha256 = 'f'.repeat(64);
  const historical = fs.readFileSync(new URL('./browser-probe.mjs', import.meta.url), 'utf8');
  const snippet = historical.match(/const union=new Map\(original\.loaded\.map\(x=>\[x\.file,x\]\)\);for\(const row of r\.loaded\)union\.set\(row\.file,row\);/)[0];
  const overwritten = vm.runInNewContext('(()=>{' + snippet + 'return [...union.values()]})()', {
    original: input.original, r: { loaded: input.fresh.loaded },
  });
  assert.doesNotThrow(() => validateCatalogReceipts(JSON.parse(input.manifestBytes), overwritten));
  assert.throws(() => safeSameHeadReceiptUnion(input), /original loaded-byte identity .*fxHooks/);
});

for (const [name, mutate, pattern] of [
  ['corrupt old row followed by good same-array duplicate', x => {
    const good = structuredClone(x.original.loaded.find(row => row.file === fx));
    x.original.loaded.find(row => row.file === fx).sha256 = 'f'.repeat(64); x.original.loaded.push(good);
  }, /original loaded-byte identity/],
  ['old HTTP failure followed by fresh 200', x => x.original.loaded.find(row => row.file === fx).status = 500, /original loaded-byte identity/],
  ['old zero byte count followed by fresh valid', x => x.original.loaded.find(row => row.file === fx).bytes = 0, /original loaded-byte identity/],
  ['valid hash but conflicting old duplicate byte count', x => {
    const row = structuredClone(x.original.loaded.find(row => row.file === fx)); row.bytes++; x.original.loaded.push(row);
  }, /original conflicting duplicate/],
  ['conflicting fresh duplicate', x => { const row = structuredClone(x.fresh.loaded[0]); row.bytes++; x.fresh.loaded.push(row); }, /fresh conflicting duplicate/],
  ['cross-capture conflicting byte count', x => x.fresh.loaded.find(row => row.file === fx).bytes++, /cross-capture conflicting duplicate/],
  ['cross-capture conflicting extra metadata', x => x.fresh.loaded.find(row => row.file === fx).note = 'different observation', /cross-capture conflicting duplicate/],
  ['corrupt fresh row', x => x.fresh.loaded[0].sha256 = 'f'.repeat(64), /fresh loaded-byte identity/],
  ['unknown old artifact', x => x.original.loaded.push({ file: '_versions/fixture/unknown.mjs', sha256: 'f'.repeat(64), bytes: 1 }), /original loaded-byte identity/],
  ['old retained error cannot be cleared by fresh success', x => x.original.errors.push('prior HTTP mismatch'), /original retained capture errors/],
  ['fresh retained error', x => x.fresh.errors.push('HTTP mismatch'), /fresh retained capture errors/],
  ['different source head', x => x.fresh.sourceHead = 'b'.repeat(40), /fresh manifest\/build\/source identity/],
  ['missing original source identity', x => delete x.original.sourceHead, /original manifest\/build\/source identity/],
  ['different build', x => x.fresh.build = { ...x.fresh.build, revision: 'other' }, /fresh manifest\/build\/source identity/],
  ['missing separate original builder digest', x => delete x.original.builderSHA256, /original source builder identity/],
  ['corrupt separate fresh builder digest', x => x.fresh.builderSHA256 = 'f'.repeat(64), /fresh source builder identity/],
  ['different content hash', x => x.original.contentHash = 'f'.repeat(64), /original manifest\/build\/source identity/],
  ['different input hash', x => x.original.inputHash = 'f'.repeat(64), /original manifest\/build\/source identity/],
  ['different artifact table', x => x.fresh.artifacts = { ...x.fresh.artifacts, extra: 'f'.repeat(64) }, /fresh manifest\/build\/source identity/],
  ['different captured raw manifest hash', x => x.original.manifestSha256 = 'f'.repeat(64), /original manifest\/build\/source identity/],
  ['modified raw manifest bytes', x => x.manifestBytes += ' ', /raw manifest identity/],
  ['missing externally pinned source head', x => delete x.expected.sourceHead, /explicit manifest\/source pins/],
  ['corrupt original committed source input', x => x.original.sourceInputs[0].committedSHA256 = 'f'.repeat(64), /committed source input identity/],
  ['missing fresh source input', x => x.fresh.sourceInputs.pop(), /source input denominator/],
  ['missing required union entry', x => x.fresh.loaded = x.fresh.loaded.filter(row => row.file !== cue), /missing-module installed graph .*bomb-cues/],
]) test('fail closed: ' + name, () => {
  const input = fixture(); mutate(input);
  assert.throws(() => safeSameHeadReceiptUnion(input), pattern);
});

test('archived helper and aggregation remain byte-identical, not repaired historical evidence', () => {
  const archived = {
    'browser-probe.mjs': '2797c0f58cf1f562a788b47e754e2c042953ed04cdb8a30daa88a4c560253def',
    'combined-saved-validation.json': 'ce3f2a6f3786357f8328a07fa893bc275f20a7415e10d81da679ad07f878b198',
  };
  for (const [file, sha256] of Object.entries(archived)) assert.equal(hash(fs.readFileSync(new URL(file, import.meta.url))), sha256);
});
