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
// Owner 03f00242ce13b7b6d2023caffad5d8d3a618eaba added precisely
// these two Brella registration lines. Normalize only for reviewed hash checks;
// preserve the candidate registration in the reference, not arbitrary source.
const brellaImport = "import { installBrellaNetwork } from './brella-network.mjs';\n";
const brellaCall = '  installBrellaNetwork(api);\n';
function reviewedPoseText(path, text) {
  if (path !== 'patches/splatoon3/runtime/install.mjs' || text === null) return text;
  const imports = text.split(brellaImport).length - 1, calls = text.split(brellaCall).length - 1;
  assert.ok((imports === 0 && calls === 0) || (imports === 1 && calls === 1), path + ': unreviewed duplicate or partial Brella registration');
  return imports ? text.replace(brellaImport, '').replace(brellaCall, '') : text;
}
const CURRENT_IDENTICAL_POSE = Object.freeze({
  "patches/splatoon3/runtime/roller.mjs": {
    "sha256": "fa867edba3abb6dcda398b869a8462e1a632b17afb41ba885ee107a349ac425b",
    "ownerCommit": "f5de1e77c02c972425b27202be43fdd41cbf9dba"
  },
  "patches/splatoon3/runtime/weapon-models/family-holds.mjs": {
    "sha256": "1c607ea9e205bc0c5a41e99080aa5d3ed8ccf28ad08a0fa5bb065ccfe66a1ca4",
    "ownerCommit": "4821928a39e7bb836e8f0c85d32ad64edc2a696f"
  },
  "patches/splatoon3/runtime/weapon-models/kit.mjs": {
    "sha256": "34b8ef1a0850b419b9eadc299281c321831a41466cf2c1dbe95bc0cbbc7f0317",
    "ownerCommit": "79be214b62a70a6ab2ca4cdf406bdcd2c0d0416b"
  },
  "patches/splatoon3/runtime/weapon-models/registry.mjs": {
    "sha256": "2550524e4750711b439eeeaac7e85690d5ec06b7cff6495ad146b0f20adb65b9",
    "ownerCommit": "bd655ccef366d7fbe8b468e79d735be3d9291f3d"
  },
  "patches/splatoon3/runtime/weapon-models/stringers.mjs": {
    "sha256": "2874189b88a3e7e749c3b7c5c9e2f81eddcaf512579bcf983b22b5d5747308e9",
    "ownerCommit": "690c3bdc4551192285c8f49952754b5494735ba5"
  }
});
export function planCharacterPoseBaseline(baseline, candidate, rows = CHARACTER_POSE_MANIFEST.files) {
  const sources = new Map(baseline), changes = [], evidence = [];
  for (const row of rows) {
    const original = baseline.get(row.path) ?? null, subject = candidate.get(row.path);
    assert.equal(typeof subject, 'string', row.path + ': missing candidate');
    // Current owner poses are substantive, not equivalent legacy rewrites.
    // Admit only reviewed byte-identical source on BOTH sides. No old/current
    // replay, no changed source pin in the historical manifest.
    const current = CURRENT_IDENTICAL_POSE[row.path];
    if (current && (poseSourceSha256(subject) === current.sha256 ||
        (original !== null && poseSourceSha256(original) === current.sha256))) {
      assert.equal(poseSourceSha256(subject), current.sha256, row.path + ': unreviewed candidate current pose');
      assert.equal(original, subject, row.path + ': unreviewed baseline current pose; mixed pose epochs cannot be replayed');
      sources.set(row.path, original);
      evidence.push({ path: row.path, originalSha256: current.sha256, candidateSha256: current.sha256, referenceSha256: current.sha256, changed: false, ownerCommit: current.ownerCommit, mode: 'identical-current-pose' });
      continue;
    }
    // Already identical reviewed candidate variants must remain on both sides
    // of a current-main comparison. The historical strip/replay path below
    // still applies when the baseline actually is the historical reference.
    if (row.candidateToReference?.length && original === subject &&
        poseSourceSha256(subject) === row.candidateSha256) {
      if (row.candidateBlob) assert.equal(blob(subject), row.candidateBlob, row.path + ': candidate blob');
      sources.set(row.path, original);
      evidence.push({ path: row.path, originalSha256: row.candidateSha256, candidateSha256: row.candidateSha256,
        referenceSha256: row.candidateSha256, changed: false, mode: 'identical-reviewed-candidate' });
      continue;
    }
    const checkedSubject = reviewedPoseText(row.path, subject);
    const checkedOriginal = reviewedPoseText(row.path, original);
    assert.ok(!(checkedOriginal !== original && checkedSubject === subject), row.path + ': cannot drop reviewed Brella registration');
    assert.equal(poseSourceSha256(checkedSubject), row.candidateSha256 ?? row.afterSha256, row.path + ': unreviewed candidate');
    if (row.candidateBlob ?? row.afterBlob) assert.equal(blob(checkedSubject), row.candidateBlob ?? row.afterBlob, row.path + ': candidate blob');
    // Shared registry/UI files also contain #1550's independent variant work.
    // Remove only its reviewed exact edits from the reference, keeping that
    // work exclusively on the candidate side of the comparison.
    let reference = subject;
    for (const { from, to } of row.candidateToReference ?? []) {
      assert.ok(from && reference.split(from).length === 2, row.path + ': unique reviewed reference edit');
      reference = reference.replace(from, to);
    }
    assert.equal(poseSourceSha256(reviewedPoseText(row.path, reference)), row.afterSha256, row.path + ': reference source');
    if (row.afterBlob) assert.equal(blob(reviewedPoseText(row.path, reference)), row.afterBlob, row.path + ': reference blob');
    const originalHash = original === null ? null : poseSourceSha256(checkedOriginal);
    assert.ok(originalHash === row.beforeSha256 || originalHash === row.afterSha256, row.path + ': unreviewed baseline');
    if (original !== null && row.beforeBlob && originalHash === row.beforeSha256)
      assert.equal(blob(checkedOriginal), row.beforeBlob, row.path + ': original blob');
    sources.set(row.path, reference);
    if (original !== reference) changes.push({ path: row.path, source: reference });
    evidence.push({ path: row.path, originalSha256: original === null ? null : poseSourceSha256(original), candidateSha256: poseSourceSha256(subject),
      referenceSha256: poseSourceSha256(reference), changed: original !== reference });
  }
  return { sources, changes, evidence };
}
