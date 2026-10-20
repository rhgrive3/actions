#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CHARACTER_POSE_PATHS, CHARACTER_POSE_MANIFEST, CHARACTER_POSE_MANIFEST_BLOB, planCharacterPoseBaseline } from './lib/inkwave-character-pose-baseline.mjs';
const arg = name => { const at = process.argv.indexOf(name); assert.ok(at >= 0 && process.argv[at + 1], name); return path.resolve(process.argv[at + 1]); };
const baseline = arg('--baseline'), candidate = arg('--candidate'), receipt = arg('--receipt');
assert.notEqual(fs.realpathSync(baseline), fs.realpathSync(candidate), 'separate baseline required');
const read = (root, rel) => { try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
const before = new Map(CHARACTER_POSE_PATHS.map(rel => [rel, read(baseline, rel)]));
const after = new Map(CHARACTER_POSE_PATHS.map(rel => [rel, read(candidate, rel)]));
const plan = planCharacterPoseBaseline(before, after);
const evidence = { schema: 1, scope: CHARACTER_POSE_MANIFEST.purpose, sourceBase: CHARACTER_POSE_MANIFEST.sourceBase,
  sourceHead: CHARACTER_POSE_MANIFEST.sourceHead, manifestGitBlob: CHARACTER_POSE_MANIFEST_BLOB,
  reviewedDiffSha256: CHARACTER_POSE_MANIFEST.reviewedDiffSha256, paths: plan.evidence };
if (plan.pairEvidence) {
  assert.equal(plan.changes.length, 0, 'current pose pair must not replay source');
  assert.deepEqual([...plan.sources], [...before], 'current pose pair preserves the baseline');
  Object.assign(evidence, plan.pairEvidence, { writtenPaths: [] });
  delete evidence.reviewedDiffSha256;
}
const currentOwners = plan.evidence.filter(row => row.mode === 'identical-current-pose');
if (currentOwners.length) {
  const unchanged = plan.changes.length === 0 && [...before].every(([rel, value]) => value === after.get(rel));
  evidence.mode = unchanged ? 'unchanged-current-pose-identity' : 'current-pose-identity-with-reviewed-legacy-replay';
  evidence.scope = unchanged
    ? 'Verify identical reviewed current pose source on both sides; no pose source replay or production writes. Historical pose identity is not claimed.'
    : 'Preserve identical reviewed current-owner poses; only separately reviewed legacy pose/registration edits may replay elsewhere. Mixed current/old owner pose files are rejected.';
  evidence.historicalReplaySourceBase = evidence.sourceBase;
  evidence.historicalReplaySourceHead = evidence.sourceHead;
  delete evidence.sourceBase; delete evidence.sourceHead;
  evidence.writtenPaths = plan.changes.map(row => row.path);
}

for (const row of plan.changes) { const file = path.join(baseline, row.path); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, row.source); }
fs.mkdirSync(path.dirname(receipt), { recursive: true }); fs.writeFileSync(receipt, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ receipt, writtenPaths: plan.changes.map(row => row.path), manifestGitBlob: CHARACTER_POSE_MANIFEST_BLOB }));
