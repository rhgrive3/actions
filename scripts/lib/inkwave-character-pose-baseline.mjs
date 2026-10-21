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
// Exact current source identity, not pose or gameplay equivalence. Preserve
// both epochs verbatim so independent native-state/image gates see differences.
// Never replay current registrations, ownership or Rainmaker poses into main.
const CURRENT_POSE_PAIR = Object.freeze({
  sourceBase: 'b77b51df6a4e6683ca23a213c8ba4b0bc2f0c8ae',
  sourceHead: 'cb7b7575c22443776b2e820aba9a0f8655c34604',
  paths: Object.freeze({
  "patches/splatoon3/adapter.mjs": {
    "baseline": "ff8c13bf6ade3149594776333a1627265a260488",
    "candidate": "78fa9f0eddac0acda9f258c8f9ec5527d02d89e0"
  },
  "patches/splatoon3/body-proportion-adapter.mjs": {
    "baseline": "fb7fd54c6b6c1f9ae8b4013b03e152e30a5194cf",
    "candidate": "fb7fd54c6b6c1f9ae8b4013b03e152e30a5194cf"
  },
  "patches/splatoon3/runtime/body-proportion.mjs": {
    "baseline": "5d7dfb8103b4375379ccb9c8fda53e615d00adff",
    "candidate": "5d7dfb8103b4375379ccb9c8fda53e615d00adff"
  },
  "patches/splatoon3/runtime/idle-motion.mjs": {
    "baseline": "06d276d899aa764df7e75d41612f7ca1ec22953b",
    "candidate": "06d276d899aa764df7e75d41612f7ca1ec22953b"
  },
  "patches/splatoon3/runtime/install.mjs": {
    "baseline": "e99e141ee2b93f6c368d64ac71fa00ce4680dde9",
    "candidate": "83f726bb9958f367bd89ec946ffecb30f903c439"
  },
  "patches/splatoon3/runtime/roller.mjs": {
    "baseline": "c0e52a78ccb9912ab805771e8da7eb4e076793c8",
    "candidate": "c0e52a78ccb9912ab805771e8da7eb4e076793c8"
  },
  "patches/splatoon3/runtime/source-posture.mjs": {
    "baseline": "a31d8224d129665917632ee7083c4081de5803a4",
    "candidate": "a31d8224d129665917632ee7083c4081de5803a4"
  },
  "patches/splatoon3/upstream-lock.json": {
    "baseline": "bdc56430f3d9af9c822e0ec1d3d26571b1b2a3ee",
    "candidate": "db19eaaee31820263cfd9871b0ebe90db9133f3d"
  },
  "patches/splatoon3/runtime/weapon-handoff-motion.mjs": {
    "baseline": "88dcc18c462ec32ea636f04e5e736c0ad01fa608",
    "candidate": "32e456e3a80302621b6d7ca73f3ce8c5bf1f6e7f"
  },
  "patches/splatoon3/runtime/weapon-models/brushes.mjs": {
    "baseline": "b2caf7fc704bc177a6c73f0e1c8baca163a052a2",
    "candidate": "b2caf7fc704bc177a6c73f0e1c8baca163a052a2"
  },
  "patches/splatoon3/runtime/weapon-models/family-holds.mjs": {
    "baseline": "91a672123486114f9849de61509c6ee6ec96363f",
    "candidate": "91a672123486114f9849de61509c6ee6ec96363f"
  },
  "patches/splatoon3/runtime/weapon-models/kit.mjs": {
    "baseline": "3ab94f55c299b56485880ede17b92d5150101f7d",
    "candidate": "3ab94f55c299b56485880ede17b92d5150101f7d"
  },
  "patches/splatoon3/runtime/weapon-models/registry.mjs": {
    "baseline": "7f651d20395cb8b2622ca0dcd9180019b7533ce1",
    "candidate": "7f651d20395cb8b2622ca0dcd9180019b7533ce1"
  },
  "patches/splatoon3/runtime/weapon-models/stringers.mjs": {
    "baseline": "ba2e3856064aed3a3bcb0d74c97bad0921d5c94e",
    "candidate": "ba2e3856064aed3a3bcb0d74c97bad0921d5c94e"
  },
  "patches/splatoon3/runtime/weapon-models/variants-milk-followup.mjs": {
    "baseline": "9f68724343748037145c552937025d74ac5df8b9",
    "candidate": "9f68724343748037145c552937025d74ac5df8b9"
  },
  "patches/splatoon3/weapon-catalog-adapter.mjs": {
    "baseline": "55582fd6109ff814ed107577db74b990d755a926",
    "candidate": "55582fd6109ff814ed107577db74b990d755a926"
  }
}),
});
function currentPosePair(baseline, candidate) {
  const matches = CHARACTER_POSE_PATHS.every(path =>
    typeof baseline.get(path) === 'string' && typeof candidate.get(path) === 'string' &&
    blob(baseline.get(path)) === CURRENT_POSE_PAIR.paths[path].baseline &&
    blob(candidate.get(path)) === CURRENT_POSE_PAIR.paths[path].candidate);
  if (!matches) {
    const path = 'patches/splatoon3/adapter.mjs';
    if ((typeof baseline.get(path) === 'string' && blob(baseline.get(path)) === CURRENT_POSE_PAIR.paths[path].baseline) ||
        (typeof candidate.get(path) === 'string' && blob(candidate.get(path)) === CURRENT_POSE_PAIR.paths[path].candidate))
      throw Error('Character pose current source pair differs; mixed, missing or modified source cannot be replayed');
    return null;
  }
  return { sources: new Map(baseline), changes: [],
    pairEvidence: { mode: 'current-pose-pair-with-gameplay-differences',
      sourceBase: CURRENT_POSE_PAIR.sourceBase, sourceHead: CURRENT_POSE_PAIR.sourceHead,
      scope: 'Preserve the exact current main/candidate pose source pair without replay. Pose and gameplay differences remain visible to independent native-state and image comparison gates.',
      validationLimit: 'Source identity only; this is not pose or gameplay equivalence.' },
    evidence: CHARACTER_POSE_PATHS.map(path => ({path, mode: 'pinned-current-pose-pair',
      originalGitBlob: blob(baseline.get(path)), referenceGitBlob: blob(baseline.get(path)), candidateGitBlob: blob(candidate.get(path)),
      originalSha256: poseSourceSha256(baseline.get(path)), referenceSha256: poseSourceSha256(baseline.get(path)),
      candidateSha256: poseSourceSha256(candidate.get(path)), changed: false, replayed: []})) };
}
export function planCharacterPoseBaseline(baseline, candidate, rows = CHARACTER_POSE_MANIFEST.files) {
  if (rows === CHARACTER_POSE_MANIFEST.files) {
    const pair = currentPosePair(baseline, candidate);
    if (pair) return pair;
  }
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
