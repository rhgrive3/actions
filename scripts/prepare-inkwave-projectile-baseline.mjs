#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { alignRollerBirthBaseline, alignProjectilePoolBaseline, assertUnchangedRollerSource } from './lib/inkwave-roller-birth-baseline.mjs';
import { MAIN_INK_BASELINE_PATHS, planMainInkBaseline } from './lib/inkwave-main-ink-baseline.mjs';

const arg = name => {
  const at = process.argv.indexOf(name);
  assert.ok(at >= 0 && process.argv[at + 1], 'required ' + name);
  return path.resolve(process.argv[at + 1]);
};
const baseline = arg('--baseline'), candidate = arg('--candidate'), receipt = arg('--receipt');
assert.notEqual(fs.realpathSync(baseline), fs.realpathSync(candidate), 'the reference must be a separate checkout');
const file = 'patches/splatoon3/runtime/weapons-fidelity.mjs';
const profile = 'patches/splatoon3/profile.json';
assertUnchangedRollerSource(JSON.parse(fs.readFileSync(path.join(baseline, profile))), JSON.parse(fs.readFileSync(path.join(candidate, profile))));

const readSource = (root, rel) => {
  try { return fs.readFileSync(path.join(root, rel), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};
const originals = new Map(MAIN_INK_BASELINE_PATHS.map(rel => [rel, readSource(baseline, rel)]));
const candidates = new Map(MAIN_INK_BASELINE_PATHS.map(rel => [rel, readSource(candidate, rel)]));
const original = originals.get(file), subject = candidates.get(file);
assert.equal(typeof original, 'string', 'baseline weapons-fidelity source exists');
assert.equal(typeof subject, 'string', 'candidate weapons-fidelity source exists');

// First plan the two reviewed birth expressions and pool index initializer.
// Then validate every paint file. No source or receipt is written until all
// three stages succeed, including a failure in the last allowlisted path.
const birth = alignRollerBirthBaseline(original, subject);
const pool = alignProjectilePoolBaseline(birth.source, subject);
const planned = new Map(originals);
planned.set(file, pool.source);
const paint = planMainInkBaseline(planned, candidates);
const changes = [...birth.changes, ...pool.changes];
const source = paint.sources.get(file);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const writes = [...paint.sources].filter(([rel, value]) => value !== originals.get(rel));
const evidence = {
  schema: 2,
  scope: 'Replay only the two reviewed Roller birth expressions, the native Slosher pool-index initializer and the pinned 13-path main-ink paint integration in the separate main reference.',
  limitation: 'An INKWAVE regression comparison. Nintendo coordinate mapping and stencil implementation remain unverified. Physical, claimed-area and paint-coverage comparisons remain enabled.',
  file, originalSha256: sha256(original), referenceSha256: sha256(source), candidateSha256: sha256(subject),
  changes, paint: paint.evidence, writtenPaths: writes.map(([rel]) => rel),
};

const currentOwners = paint.evidence.paths.filter(row => row.mode === 'identical-current-owner');
if (currentOwners.length) {
  const unchanged = writes.length === 0 && [...originals].every(([rel, value]) => value === candidates.get(rel));
  evidence.mode = unchanged ? 'unchanged-current-owner-identity' : 'current-owner-identity-with-reviewed-legacy-replay';
  evidence.scope = unchanged
    ? 'Verify identical reviewed current physics/paint source on both sides; no birth, pool or paint source replay and no production writes. This is not the historical physics epoch or a performance-only comparison.'
    : 'Preserve exact identical current-owner modules; replay only still-reviewed legacy contexts elsewhere. Mixed old/current owner modules are rejected.';
  evidence.currentOwnerPaths = currentOwners.map(({path, ownerCommit, originalSha256}) => ({path, ownerCommit, sha256: originalSha256}));
  evidence.paint.historicalReplaySourceBase = evidence.paint.sourceBase;
  evidence.paint.historicalReplaySourceHead = evidence.paint.sourceHead;
  delete evidence.paint.sourceBase; delete evidence.paint.sourceHead;
}

// This is a validation transaction, not a claim of crash-atomic filesystem
// writes: every known/unknown-source check finishes before the first write.
for (const [rel, value] of writes) {
  fs.mkdirSync(path.dirname(path.join(baseline, rel)), { recursive: true });
  fs.writeFileSync(path.join(baseline, rel), value);
}
fs.mkdirSync(path.dirname(receipt), { recursive: true });
fs.writeFileSync(receipt, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ receipt, changes: changes.map(row => row.name),
  writtenPaths: evidence.writtenPaths, manifestGitBlob: paint.evidence.manifestGitBlob }));
