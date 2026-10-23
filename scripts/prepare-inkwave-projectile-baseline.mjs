#!/usr/bin/env node
import assert from 'node:assert/strict';
import {parseSourceAdmissionArgs, assertReceiptSeparate} from './lib/inkwave-source-admission-cli.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { verifyDeclaredPaintSources } from './lib/inkwave-declared-paint-source-pair.mjs';
import { alignRollerBirthBaseline, alignProjectilePoolBaseline, assertUnchangedRollerSource } from './lib/inkwave-roller-birth-baseline.mjs';
import { QUEUE1801_IDENTICAL_PAINT_SOURCE_PAIR, QUEUE1801_PAINT_SOURCE_PAIR, MAINCEB58_PAINT_SOURCE_PAIR, MAINA350_PAINT_SOURCE_PAIR, paintSourcePaths, MAINE1F_PAINT_SOURCE_PAIR, MAIN9FE_PAINT_SOURCE_PAIR, MAIN_INK_BASELINE_PATHS, planMainInkBaseline } from './lib/inkwave-main-ink-baseline.mjs';

const options = parseSourceAdmissionArgs(process.argv.slice(2), ['--baseline', '--candidate', '--receipt', '--base-sha', '--candidate-sha', '--base-git-root', '--candidate-git-root', '--expected-mode', '--expected-source-base', '--expected-source-head'], ['--baseline', '--candidate', '--receipt']);
// Separate reviewed four-leaf nozzle epoch; preserve the original three-leaf mode.
if (options.get('--expected-mode') === 'frozen354-reviewed-special-nozzle-pair') {
  const {runSpecialNozzleAdmissionCLI} = await import('./lib/inkwave-special-nozzle-production-epoch.mjs');
  await runSpecialNozzleAdmissionCLI(options, 'prepare');
  process.exit(0);
}
// Explicit closed special epoch; previous production admissions remain unchanged.
if (options.get('--expected-mode') === 'frozen354-reviewed-special-production-pair') {
  const {runSpecialAdmissionCLI} = await import('./lib/inkwave-special-production-epoch.mjs');
  await runSpecialAdmissionCLI(options, 'prepare');
  process.exit(0);
}
// Separate reviewed eight-delta epoch; never treat changed production as byte-identical.
if (options.get('--expected-mode') === 'main26a4-reviewed-runtime-ui-production-pair') {
  const {runRuntimeUIAdmissionCLI} = await import('./lib/inkwave-runtime-ui-production-epoch.mjs');
  await runRuntimeUIAdmissionCLI(options, 'prepare');
  process.exit(0);
}
// New immutable QA-only epoch; historical planners below remain unchanged.
if (options.get('--expected-mode') === 'main26a4-byte-identical-production-epoch') {
  const {runMain26a4AdmissionCLI} = await import('./lib/inkwave-main26a4-production-epoch.mjs');
  await runMain26a4AdmissionCLI(options, 'prepare');
  process.exit(0);
}
const value = name => options.get(name) ?? null;
const selectedPaths = paintSourcePaths({mode: value('--expected-mode')});
const arg = name => path.resolve(value(name));
const baseline = arg('--baseline'), candidate = arg('--candidate'), receipt = arg('--receipt');
assert.notEqual(fs.realpathSync(baseline), fs.realpathSync(candidate), 'the reference must be a separate checkout');
const file = 'patches/splatoon3/runtime/weapons-fidelity.mjs';
const profile = 'patches/splatoon3/profile.json';
const receiptInputs = [...selectedPaths, profile];
const receiptGitRoots = [value('--base-git-root') || baseline, value('--candidate-git-root') || candidate];
assertReceiptSeparate(receipt, [baseline, candidate], receiptInputs, receiptGitRoots);
assertUnchangedRollerSource(JSON.parse(fs.readFileSync(path.join(baseline, profile))), JSON.parse(fs.readFileSync(path.join(candidate, profile))));

const readSource = (root, rel) => {
  try { return fs.readFileSync(path.join(root, rel), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};
const originals = new Map(selectedPaths.map(rel => [rel, readSource(baseline, rel)]));
const candidates = new Map(selectedPaths.map(rel => [rel, readSource(candidate, rel)]));
const expectationFlags = ['--expected-mode','--expected-source-base','--expected-source-head'];
const hasExpectation = expectationFlags.some(flag => options.has(flag));
let expectedPair = null;
if (hasExpectation) {
  const values = expectationFlags.map(flag => {
    assert.ok(options.has(flag), 'complete ' + flag);
    return value(flag);
  });
  expectedPair={mode:values[0],sourceBase:values[1],sourceHead:values[2]};
}
const declaredFlags=['--base-sha','--candidate-sha','--base-git-root','--candidate-git-root'];
const hasDeclared=declaredFlags.some(flag=>options.has(flag));
if(expectedPair?.mode === MAIN9FE_PAINT_SOURCE_PAIR.mode)
 assert.ok(hasDeclared,'main9fe source epoch requires declared immutable Git source commits');
if([QUEUE1801_PAINT_SOURCE_PAIR.mode,QUEUE1801_IDENTICAL_PAINT_SOURCE_PAIR.mode].includes(expectedPair?.mode))
 assert.ok(hasDeclared,'queue1801 source epoch requires declared immutable Git source commits');
if(expectedPair?.mode === MAINCEB58_PAINT_SOURCE_PAIR.mode)
 assert.ok(hasDeclared,'mainceb58 source epoch requires declared immutable Git source commits');
if(expectedPair?.mode === MAINA350_PAINT_SOURCE_PAIR.mode)
 assert.ok(hasDeclared,'maina350 source epoch requires declared immutable Git source commits');
if(expectedPair?.mode === MAINE1F_PAINT_SOURCE_PAIR.mode)
 assert.ok(hasDeclared,'maine1f source epoch requires declared immutable Git source commits');
let declared=null,declaredExpected=null;
if(hasDeclared){
 for(const flag of ['--base-sha','--candidate-sha'])assert.ok(value(flag),'complete '+flag);
 declared=verifyDeclaredPaintSources({baseline:originals,candidate:candidates,
  baseGitRoot:value('--base-git-root')||baseline,candidateGitRoot:value('--candidate-git-root')||candidate,
  baseSha:value('--base-sha'),candidateSha:value('--candidate-sha'),expectedPair:expectedPair});
 const immutablePlan=planMainInkBaseline(declared.baseline,declared.candidate,expectedPair);
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

if (paint.evidence.mode === MAIN9FE_PAINT_SOURCE_PAIR.mode) {
  assert.ok(declared, 'main9fe source epoch requires declared immutable Git verification');
  assert.equal(changes.length, 0, 'main9fe source epoch must not replay birth or pool source');
  assert.equal(writes.length, 0, 'main9fe source epoch must preserve all input bytes');
  evidence.mode = paint.evidence.mode;
  evidence.scope = 'Preserve the explicitly selected main9fe thirteen-leaf paint source epoch without replay or production writes. The epoch includes changed Bloblobber floor-contact physics relative to PR1746; cross-epoch equivalence is not claimed. Exact source identity is not evidence of an improvement or compiled, physical-state, RNG or image equivalence; independent comparison remains required.';
}

if (paint.evidence.mode === MAINA350_PAINT_SOURCE_PAIR.mode) {
  assert.ok(declared, 'maina350 source epoch requires declared immutable Git verification');
  assert.equal(changes.length, 0, 'maina350 source epoch must not replay birth or pool source');
  assert.equal(writes.length, 0, 'maina350 source epoch must preserve all input bytes');
  evidence.mode = paint.evidence.mode;
  evidence.scope = 'Preserve the explicitly selected maina350 fourteen-leaf paint source epoch without replay or production writes. The epoch includes changed Bloblobber windup yaw and nearest ground paint relative to e1f, including the launch-sweep dependency; cross-epoch equivalence is not claimed. Exact source identity is not evidence of an improvement or compiled, physical-state, RNG or image equivalence; independent comparison remains required.';
}
if (paint.evidence.mode === QUEUE1801_IDENTICAL_PAINT_SOURCE_PAIR.mode) {
  assert.ok(declared,'queue1801 identity requires immutable declared Git verification');
  assert.equal(changes.length,0,'queue1801 identity must not replay source');
  assert.equal(writes.length,0,'queue1801 identity must preserve all input bytes');
  evidence.mode=paint.evidence.mode;
  evidence.scope='Preserve the explicitly selected queue1801 fourteen-leaf paint source epoch on both sides without replay. Source identity is not evidence of compiled, physical-state, RNG or image equivalence; independent comparison remains required.';
}
if (paint.evidence.mode === QUEUE1801_PAINT_SOURCE_PAIR.mode) {
  assert.ok(declared,'queue1801 requires immutable declared Git verification');
  assert.equal(changes.length,0,'queue1801 must not replay source');assert.equal(writes.length,0,'queue1801 must preserve all input bytes');
  evidence.mode=paint.evidence.mode;
  evidence.scope='Preserve the explicitly selected queue1801 fourteen-leaf paint source pair without replay. Two source leaves differ; TIME UP and FIFO changes remain visible to independent compiled, physical-state, RNG and image comparison. No gameplay equivalence or performance improvement is claimed.';
}

if (paint.evidence.mode === MAINCEB58_PAINT_SOURCE_PAIR.mode) {
  assert.ok(declared, 'mainceb58 source epoch requires declared immutable Git verification');
  assert.equal(changes.length, 0, 'mainceb58 source epoch must not replay birth or pool source');
  assert.equal(writes.length, 0, 'mainceb58 source epoch must preserve all input bytes');
  evidence.mode = paint.evidence.mode;
  evidence.scope = 'Preserve the explicitly selected mainceb58 fourteen-leaf paint source epoch without replay or production writes. The epoch includes sourced Slosher camera pitch and XZ lift changes relative to a350, including the launch-sweep dependency; cross-epoch equivalence is not claimed. Exact source identity is not evidence of an improvement or compiled, physical-state, RNG or image equivalence; independent comparison remains required.';
}


if (paint.evidence.mode === MAINE1F_PAINT_SOURCE_PAIR.mode) {
  assert.ok(declared, 'maine1f source epoch requires declared immutable Git verification');
  assert.equal(changes.length, 0, 'maine1f source epoch must not replay birth or pool source');
  assert.equal(writes.length, 0, 'maine1f source epoch must preserve all input bytes');
  evidence.mode = paint.evidence.mode;
  evidence.scope = 'Preserve the explicitly selected maine1f thirteen-leaf paint source epoch without replay or production writes. The epoch includes changed Bloblobber floor-normal rebound cap physics relative to main9fe/f8, preserving tangential velocity; cross-epoch equivalence is not claimed. Exact source identity is not evidence of an improvement or compiled, physical-state, RNG or image equivalence; independent comparison remains required.';
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
assertReceiptSeparate(receipt, [baseline, candidate], receiptInputs, receiptGitRoots);
for (const [rel, value] of writes) {
  fs.mkdirSync(path.dirname(path.join(baseline, rel)), { recursive: true });
  fs.writeFileSync(path.join(baseline, rel), value);
}
assertReceiptSeparate(receipt, [baseline, candidate], receiptInputs, receiptGitRoots);
fs.mkdirSync(path.dirname(receipt), { recursive: true });
fs.writeFileSync(receipt, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ receipt, changes: changes.map(row => row.name),
  writtenPaths: evidence.writtenPaths, manifestGitBlob: paint.evidence.manifestGitBlob }));
