import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
export const CHARACTER_POSE_PATHS = Object.freeze([
  'patches/splatoon3/adapter.mjs', 'patches/splatoon3/body-proportion-adapter.mjs',
  'patches/splatoon3/runtime/body-proportion.mjs', 'patches/splatoon3/runtime/idle-motion.mjs',
  'patches/splatoon3/runtime/install.mjs', 'patches/splatoon3/runtime/roller.mjs',
  'patches/splatoon3/runtime/source-posture.mjs', 'patches/splatoon3/upstream-lock.json',
  'patches/splatoon3/runtime/weapon-handoff-motion.mjs',
  'patches/splatoon3/runtime/weapon-models/brushes.mjs',
  'patches/splatoon3/runtime/weapon-models/family-holds.mjs',
  'patches/splatoon3/runtime/weapon-models/kit.mjs',
  'patches/splatoon3/runtime/weapon-models/registry.mjs',
  'patches/splatoon3/runtime/weapon-models/stringers.mjs',
  'patches/splatoon3/runtime/weapon-models/variants-milk-followup.mjs',
  'patches/splatoon3/weapon-catalog-adapter.mjs',
]);
export const CHARACTER_POSE_MANIFEST_BLOB = 'cb433a272a402d9b72741d0ba740b07769c9ef1e';
export const poseSourceSha256 = text => createHash('sha256').update(text).digest('hex');
const blob = text => createHash('sha1').update('blob ' + Buffer.byteLength(text) + '\0').update(text).digest('hex');
export function parseCharacterPoseManifest(raw) {
  assert.equal(blob(raw), CHARACTER_POSE_MANIFEST_BLOB, 'Character pose manifest reviewed blob');
  const data = JSON.parse(raw);
  assert.equal(data.schema, 1);
  assert.equal(data.sourceBase, '85acc45d0ab23a95161b599d4287fd8142e8145b');
  assert.equal(data.sourceHead, '3e386b37f7d94d3dc5ee396131a04f9cbb16c34b');
  assert.deepEqual(data.files.map(row => row.path), CHARACTER_POSE_PATHS, 'character-only path allowlist');
  return data;
}
export const CHARACTER_POSE_MANIFEST = parseCharacterPoseManifest(fs.readFileSync(new URL('../fixtures/inkwave-character-pose-baseline.json', import.meta.url), 'utf8'));
// Validate all inputs before the caller writes anything. Shared modules may
// only be the exact reviewed original or final blob; never overwrite unknown
// baseline work or copy an arbitrary candidate's physics into the reference.
export function planCharacterPoseBaseline(baseline, candidate, rows = CHARACTER_POSE_MANIFEST.files) {
  const sources = new Map(baseline), changes = [], evidence = [];
  for (const row of rows) {
    const original = baseline.get(row.path) ?? null, subject = candidate.get(row.path);
    assert.equal(typeof subject, 'string', row.path + ': missing candidate');
    assert.equal(poseSourceSha256(subject), row.candidateSha256 ?? row.afterSha256, row.path + ': unreviewed candidate');
    if (row.candidateBlob ?? row.afterBlob) assert.equal(blob(subject), row.candidateBlob ?? row.afterBlob, row.path + ': candidate blob');
    // Shared registry/UI files also contain #1550's independent variant work.
    // Remove only its reviewed exact edits from the reference, keeping that
    // work exclusively on the candidate side of the comparison.
    let reference = subject;
    for (const { from, to } of row.candidateToReference ?? []) {
      assert.ok(from && reference.split(from).length === 2, row.path + ': unique reviewed reference edit');
      reference = reference.replace(from, to);
    }
    assert.equal(poseSourceSha256(reference), row.afterSha256, row.path + ': reference source');
    if (row.afterBlob) assert.equal(blob(reference), row.afterBlob, row.path + ': reference blob');
    const originalHash = original === null ? null : poseSourceSha256(original);
    assert.ok(originalHash === row.beforeSha256 || originalHash === row.afterSha256, row.path + ': unreviewed baseline');
    if (original !== null && row.beforeBlob && originalHash === row.beforeSha256)
      assert.equal(blob(original), row.beforeBlob, row.path + ': original blob');
    sources.set(row.path, reference);
    if (original !== reference) changes.push({ path: row.path, source: reference });
    evidence.push({ path: row.path, originalSha256: originalHash, candidateSha256: row.candidateSha256 ?? row.afterSha256,
      referenceSha256: row.afterSha256, changed: original !== reference });
  }
  return { sources, changes, evidence };
}
