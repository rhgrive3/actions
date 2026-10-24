import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { auditStaticTwins } from '../audit-inkwave-static-twins.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'static-twins-audit-'));
  const files = {
    'index.html': 'root entry',
    'src/same.js': 'same body', '_versions/reviewed/src/same.js': 'same body',
    'sw.js': 'root worker', '_versions/reviewed/sw.js': 'stub worker',
    '_versions/reviewed/assets/deduped.bin': 'already deduplicated binary',
    '_versions/old/old.js': 'old version retained',
  }, artifacts = {};
  for (const [rel, body] of Object.entries(files)) {
    const file = path.join(dir, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body); artifacts[rel] = hash(body);
  }
  const manifest = { build: { revision: 'reviewed', optimization: 'fixture' }, inputHash: 'fixture', artifacts, contentHash: hash(JSON.stringify(artifacts)) };
  const save = () => { manifest.contentHash = hash(JSON.stringify(manifest.artifacts)); fs.writeFileSync(path.join(dir, 'inkwave-build.json'), JSON.stringify(manifest)); };
  save();
  try { return fn({ dir, files, manifest, save }); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
test('completed bytes distinguish equal twins, same-size variants, root omissions and unrelated versions', () => fixture(({ dir, files }) => {
  const before = Object.fromEntries(Object.keys(files).map(rel => [rel, fs.readFileSync(path.join(dir, rel)).toString('hex')]));
  const result = auditStaticTwins(dir);
  assert.equal(result.summary.identicalPairs, 1); assert.equal(result.summary.identicalRootLogicalBytes, Buffer.byteLength(files['src/same.js']));
  assert.equal(result.summary.differentPairs, 1); assert.equal(result.summary.missingRootPairs, 1);
  assert.equal(result.summary.currentRevisionFiles, 3); assert.equal(result.summary.otherRevisionFiles, 1);
  assert.equal(result.summary.rootOnlyFiles, 2); assert.equal(result.summary.manifestArtifactsVerified, 7);
  assert.equal(result.summary.filesOutsideArtifactMap, 1); assert.equal(result.summary.totalFiles, 8);
  assert.equal(result.summary.actualFilesRemoved, 0); assert.equal(result.summary.actualBytesRemoved, 0);
  assert.equal(result.pairs.find(row => row.rootPath === 'sw.js').status, 'different');
  assert.equal(result.pairs.find(row => row.rootPath === 'assets/deduped.bin').root, null);
  assert.deepEqual(result.duplicateGroups, { src: { files: 1, bytes: 9 } });
  assert.deepEqual(Object.fromEntries(Object.keys(files).map(rel => [rel, fs.readFileSync(path.join(dir, rel)).toString('hex')])), before);
}));
test('extra final-stage files are inventoried without pretending they are in the content identity', () => fixture(({ dir }) => {
  fs.mkdirSync(path.join(dir, 'late')); fs.writeFileSync(path.join(dir, 'late/stage.glb'), 'late external asset');
  const result = auditStaticTwins(dir);
  assert.equal(result.summary.filesOutsideArtifactMap, 2);
  assert.equal(result.rootOnly.find(row => row.path === 'late/stage.glb').inBuildManifest, false);
}));
test('changed, missing or forged declared artifact bytes fail closed', () => {
  for (const kind of ['bytes', 'missing', 'manifest']) fixture(({ dir, manifest }) => {
    if (kind === 'bytes') fs.writeFileSync(path.join(dir, 'src/same.js'), 'fake body');
    if (kind === 'missing') fs.unlinkSync(path.join(dir, 'src/same.js'));
    if (kind === 'manifest') { manifest.artifacts['src/same.js'] = '0'.repeat(64); fs.writeFileSync(path.join(dir, 'inkwave-build.json'), JSON.stringify(manifest)); }
    assert.throws(() => auditStaticTwins(dir), /artifact identity|manifest content identity/);
  });
});
test('unsafe revisions, path traversal and symlinks cannot escape completed-tree scope', () => {
  for (const kind of ['revision', 'path', 'symlink']) fixture(({ dir, manifest, save }) => {
    if (kind === 'revision') { manifest.build.revision = '../outside'; save(); }
    if (kind === 'path') { manifest.artifacts['../outside'] = '0'.repeat(64); save(); }
    if (kind === 'symlink') fs.symlinkSync(path.join(dir, 'index.html'), path.join(dir, 'linked.html'));
    assert.throws(() => auditStaticTwins(dir), /safe revision|valid artifact|symlinks/);
  });
});
