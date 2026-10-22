#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { verifyDeclaredPaintSources } from './lib/inkwave-declared-paint-source-pair.mjs';
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
const value = name => {const at=process.argv.indexOf(name);return at<0?null:process.argv[at+1];};
const declaredFlags=['--base-sha','--candidate-sha','--base-git-root','--candidate-git-root'];
const hasDeclared=declaredFlags.some(flag=>process.argv.includes(flag));
let declared=null,declaredExpected=null;
if(hasDeclared){
 for(const flag of ['--base-sha','--candidate-sha'])assert.ok(value(flag)&&process.argv.indexOf(flag)===process.argv.lastIndexOf(flag),'complete unique '+flag);
 declared=verifyDeclaredPaintSources({baseline:originals,candidate:candidates,
  baseGitRoot:value('--base-git-root')||baseline,candidateGitRoot:value('--candidate-git-root')||candidate,
  baseSha:value('--base-sha'),candidateSha:value('--candidate-sha')});
 const immutablePlan=planMainInkBaseline(declared.baseline,declared.candidate);
 declaredExpected=Object.fromEntries(['mode','sourceBase','sourceHead'].map(key=>[key,immutablePlan.evidence[key]]));
 assert.ok(Object.values(declaredExpected).every(v=>typeof v==='string'&&v),'declared pair requires exact admitted source epoch');
}
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
const expectationFlags = ['--expected-mode','--expected-source-base','--expected-source-head'];
const hasExpectation = expectationFlags.some(flag => process.argv.includes(flag));
let expectedPair = null;
if (hasExpectation) {
  const values = expectationFlags.map(flag => {
    const at=process.argv.indexOf(flag);
    assert.ok(at>=0 && process.argv[at+1] && !process.argv[at+1].startsWith('--'),'complete '+flag);
    assert.equal(process.argv.lastIndexOf(flag),at,'duplicate '+flag);
    return process.argv[at+1];
  });
  expectedPair={mode:values[0],sourceBase:values[1],sourceHead:values[2]};
}
if(declaredExpected){
 if(expectedPair)assert.deepEqual(expectedPair,declaredExpected,'explicit expectation must match declared immutable source epoch');
 expectedPair=declaredExpected;
}
const paint = planMainInkBaseline(planned, candidates, expectedPair);
const changes = [...birth.changes, ...pool.changes];
const source = paint.sources.get(file);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const writes = [...paint.sources].filter(([rel, value]) => value !== originals.get(rel));
const evidence = {
  schema: 2,
  scope: 'Replay only the two reviewed Roller birth expressions, the native Slosher pool-index initializer and the pinned 13-path main-ink paint integration in the separate main reference.',
  limitation: 'An INKWAVE regression comparison. Nintendo coordinate mapping and stencil implementation remain unverified. Physical, claimed-area and paint-coverage comparisons remain enabled.',
  file, originalSha256: sha256(original), referenceSha256: sha256(source), candidateSha256: sha256(subject),
  declaredSources: declared?.evidence??null,
  changes, paint: paint.evidence, writtenPaths: writes.map(([rel]) => rel),
};

if (paint.evidence.mode === 'current-pair-with-gameplay-differences') {
  assert.equal(changes.length, 0, 'reviewed current pair must not replay birth/pool source');
  assert.equal(writes.length, 0, 'reviewed current pair must preserve every reference file');
  evidence.mode = paint.evidence.mode;
  evidence.scope = 'Preserve the exact reviewed current main/candidate source pair without replay or production writes. Gameplay differences remain; physical-state and image equivalence require the independent browser comparison.';
}

if (paint.evidence.mode === 'pr1746-byte-identical-current-paint') {
  assert.equal(changes.length,0,'exact identity must not replay birth or pool source');
  assert.equal(writes.length,0,'exact identity must preserve all input bytes');
  evidence.mode=paint.evidence.mode;
  evidence.scope='Preserve the complete byte-identical PR1746 source epoch without replay or production writes. This unchanged-source comparison is not evidence of an improvement. Source identity does not establish compiled, physical-state or image equivalence; independent comparison remains required.';
}

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
