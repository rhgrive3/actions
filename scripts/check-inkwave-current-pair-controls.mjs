#!/usr/bin/env node
// Current reviewed main/candidate source admission controls. No production writes.
import assert from 'node:assert/strict';
import {parseSourceAdmissionArgs, assertReceiptSeparate} from './lib/inkwave-source-admission-cli.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyDeclaredPaintSources } from './lib/inkwave-declared-paint-source-pair.mjs';
import { QUEUE1801_IDENTICAL_PAINT_SOURCE_PAIR, QUEUE1801_PAINT_SOURCE_PAIR, MAINCEB58_PAINT_SOURCE_PAIR, MAINA350_PAINT_SOURCE_PAIR, paintSourcePaths, MAINE1F_PAINT_SOURCE_PAIR, MAIN9FE_PAINT_SOURCE_PAIR, MAIN_INK_BASELINE_PATHS, planMainInkBaseline } from './lib/inkwave-main-ink-baseline.mjs';

const options = parseSourceAdmissionArgs(process.argv.slice(2), ['--baseline', '--candidate', '--receipt', '--base-sha', '--candidate-sha', '--expected-mode', '--expected-source-base', '--expected-source-head'], ['--baseline', '--candidate']);
// Separate reviewed eight-delta epoch; never treat changed production as byte-identical.
if (options.get('--expected-mode') === 'main26a4-reviewed-runtime-ui-production-pair') {
  const {runRuntimeUIAdmissionCLI} = await import('./lib/inkwave-runtime-ui-production-epoch.mjs');
  await runRuntimeUIAdmissionCLI(options, 'controls');
  process.exit(0);
}
// New immutable QA-only epoch; historical planners below remain unchanged.
if (options.get('--expected-mode') === 'main26a4-byte-identical-production-epoch') {
  const {runMain26a4AdmissionCLI} = await import('./lib/inkwave-main26a4-production-epoch.mjs');
  await runMain26a4AdmissionCLI(options, 'controls');
  process.exit(0);
}
const value = name => options.get(name) ?? null;
const selectedPaths = paintSourcePaths({mode: value('--expected-mode')});
const arg = name => path.resolve(value(name));
const baseline = arg('--baseline'), candidate = arg('--candidate');
assert.notEqual(fs.realpathSync(baseline), fs.realpathSync(candidate), 'separate source roots required');
const output = value('--receipt') === null ? null : path.resolve(value('--receipt'));
const paths = [...selectedPaths, 'patches/splatoon3/profile.json'];
if (output) assertReceiptSeparate(output, [baseline, candidate], paths);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const snapshot = root => new Map(paths.map(rel => [rel, fs.readFileSync(path.join(root, rel))]));
const before = snapshot(baseline), after = snapshot(candidate);
const sourceMap = rows => new Map(selectedPaths.map(rel => [rel, rows.get(rel).toString('utf8')]));
const originalHashes = rows => Object.fromEntries([...rows].map(([rel, bytes]) => [rel, hash(bytes)]));
const verify = (root, rows) => {
  for (const [rel, bytes] of rows) assert.deepEqual(fs.readFileSync(path.join(root, rel)), bytes, rel + ': input bytes preserved');
};
// Fail before making a scratch copy if these are not the exact reviewed inputs.
const expectationFlags = ['--expected-mode','--expected-source-base','--expected-source-head'];
const hasExpectation = expectationFlags.some(flag => options.has(flag));
let requestedPair = null;
if (hasExpectation) {
  const values = expectationFlags.map(flag => {
    assert.ok(options.has(flag), 'complete ' + flag);
    return value(flag);
  });
  requestedPair={mode:values[0],sourceBase:values[1],sourceHead:values[2]};
}
const hasDeclared=options.has('--base-sha')||options.has('--candidate-sha');
if(requestedPair?.mode === MAIN9FE_PAINT_SOURCE_PAIR.mode)
 assert.ok(hasDeclared,'main9fe source epoch requires declared immutable Git source commits');
if([QUEUE1801_PAINT_SOURCE_PAIR.mode,QUEUE1801_IDENTICAL_PAINT_SOURCE_PAIR.mode].includes(requestedPair?.mode))
 assert.ok(hasDeclared,'queue1801 source epoch requires declared immutable Git source commits');
if(requestedPair?.mode === MAINCEB58_PAINT_SOURCE_PAIR.mode)
 assert.ok(hasDeclared,'mainceb58 source epoch requires declared immutable Git source commits');
if(requestedPair?.mode === MAINA350_PAINT_SOURCE_PAIR.mode)
 assert.ok(hasDeclared,'maina350 source epoch requires declared immutable Git source commits');
if(requestedPair?.mode === MAINE1F_PAINT_SOURCE_PAIR.mode)
 assert.ok(hasDeclared,'maine1f source epoch requires declared immutable Git source commits');
const declared=hasDeclared?verifyDeclaredPaintSources({baseline:sourceMap(before),candidate:sourceMap(after),
 baseGitRoot:baseline,candidateGitRoot:candidate,baseSha:value('--base-sha'),candidateSha:value('--candidate-sha'),expectedPair:requestedPair}):null;
const admitted = planMainInkBaseline(declared?.baseline??sourceMap(before), declared?.candidate??sourceMap(after),requestedPair);
const main9fe = admitted.evidence.mode === MAIN9FE_PAINT_SOURCE_PAIR.mode;
const maine1f = admitted.evidence.mode === MAINE1F_PAINT_SOURCE_PAIR.mode;
const maina350 = admitted.evidence.mode === MAINA350_PAINT_SOURCE_PAIR.mode;
const mainceb58 = admitted.evidence.mode === MAINCEB58_PAINT_SOURCE_PAIR.mode;
const queue1801 = admitted.evidence.mode === QUEUE1801_PAINT_SOURCE_PAIR.mode;
const queue1801Identity = admitted.evidence.mode === QUEUE1801_IDENTICAL_PAINT_SOURCE_PAIR.mode;
const identity = queue1801Identity || mainceb58 || maina350 || maine1f || main9fe || admitted.evidence.mode === 'pr1746-byte-identical-current-paint';
assert.ok(identity || queue1801 || admitted.evidence.mode === 'current-pair-with-gameplay-differences', 'current controls cannot test a legacy replay');
const expectedPair = Object.freeze(Object.fromEntries(['mode','sourceBase','sourceHead'].map(key=>[key,admitted.evidence[key]])));
assert.deepEqual(admitted.changes, []);
assert.deepEqual([...admitted.sources], [...sourceMap(before)]);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'inkwave-current-pair-controls-'));
const left = path.join(scratch, 'before'), right = path.join(scratch, 'after');
const receipt = path.join(scratch, 'receipt.json');
const prepare = fileURLToPath(new URL('./prepare-inkwave-projectile-baseline.mjs', import.meta.url));
const sentinel = 'prior receipt must survive rejected planning\n';
const counts = { positiveCli: 0, cliRejected: 0, helperRejected: 0 };
function write(root, rows) {
  for (const [rel, bytes] of rows) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
  }
}
function run(b = left, a = right) {
  return spawnSync(process.execPath, [prepare, '--baseline', b, '--candidate', a, '--receipt', receipt,
    '--expected-mode',expectedPair.mode,'--expected-source-base',expectedPair.sourceBase,'--expected-source-head',expectedPair.sourceHead,...(declared?['--base-sha',declared.evidence.declaredBaseCommit,'--candidate-sha',declared.evidence.declaredCandidateCommit,'--base-git-root',baseline,'--candidate-git-root',candidate]:[])], { encoding: 'utf8' });
}
function rejectCli(b = left, a = right) {
  fs.writeFileSync(receipt, sentinel);
  const result = run(b, a);
  assert.equal(result.error, undefined, 'CLI subprocess must actually start');
  assert.equal(result.signal, null, 'a process crash is not source rejection');
  assert.equal(result.status, 1, result.stderr || 'invalid current pair must reject');
  assert.equal(fs.readFileSync(receipt, 'utf8'), sentinel, 'rejection preserves the prior receipt');
  counts.cliRejected++;
}
function positive() {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  const evidence = JSON.parse(fs.readFileSync(receipt, 'utf8'));
  assert.equal(evidence.mode, admitted.evidence.mode);
  assert.equal(evidence.paint.mode, evidence.mode);
  assert.deepEqual(evidence.changes, []);
  assert.deepEqual(evidence.writtenPaths, []);
  assert.equal(evidence.paint.paths.length, selectedPaths.length);
  // PR1746's exact 95c -> f312 tuple has two differing leaves. The older
  // four-leaf contract remains unchanged for its separately pinned pairs.
  const integrated23 = evidence.paint.sourceBase === '26a4db4123d23162a3dbf8a12150b1b5bc6ccf64' && evidence.paint.sourceHead === 'c8564cb617e1708759a502a662ef1b538eaad14c';
  const expectedChanged = integrated23 ? 9 : queue1801 ? 2 : identity ? 0 : evidence.paint.sourceBase === '95c25af145418691991a1452d4d10589754a0f1c' &&
    evidence.paint.sourceHead === 'f31238a48b9d1a4af2d4f5f5f9182af777a79c83' ? 2 : 4;
  assert.equal(evidence.paint.paths.filter(row => row.originalSha256 !== row.candidateSha256).length, expectedChanged);
  for (const row of evidence.paint.paths) {
    assert.equal(row.mode, queue1801Identity ? 'queue1801-exact-paint-source-epoch' : queue1801 ? 'queue1801-exact-paint-source-pair' : mainceb58 ? 'mainceb58-exact-paint-source' : maina350 ? 'maina350-exact-paint-source' : maine1f ? 'maine1f-exact-paint-source' : main9fe ? 'main9fe-exact-paint-source' : identity ? 'pr1746-exact-current-paint' : 'reviewed-current-pair');
    assert.deepEqual(row.replayed, []);
    assert.equal(row.referenceSha256, row.originalSha256);
  }
  assert.match(evidence.scope, queue1801Identity ? /explicitly selected queue1801 fourteen-leaf paint source epoch/ : queue1801 ? /explicitly selected queue1801 fourteen-leaf paint source pair/ : mainceb58 ? /explicitly selected mainceb58 fourteen-leaf paint source epoch/ : maina350 ? /explicitly selected maina350 fourteen-leaf paint source epoch/ : maine1f ? /explicitly selected maine1f thirteen-leaf paint source epoch/ : main9fe ? /explicitly selected main9fe thirteen-leaf paint source epoch/ : identity ? /complete byte-identical PR1746 source epoch/ : /Gameplay differences remain/);
  assert.doesNotMatch(evidence.scope, /identical.*physics/);
  verify(left, before); verify(right, after);
  counts.positiveCli++;
}
try {
  write(left, before); write(right, after);
  positive();
  for (const [side, root, rows] of [['before', left, before], ['after', right, after]]) {
    for (const rel of selectedPaths) for (const mutation of ['byte', 'missing']) {
      const file = path.join(root, rel), original = rows.get(rel);
      if (mutation === 'byte') fs.writeFileSync(file, Buffer.concat([original, Buffer.from(' ')]));
      else fs.renameSync(file, file + '.omitted');
      try {
        const changed = mutation === 'byte' ? fs.readFileSync(file) : null;
        rejectCli();
        if (changed) assert.deepEqual(fs.readFileSync(file), changed);
        else assert.equal(fs.existsSync(file), false);
        for (const other of paths) if (other !== rel) assert.deepEqual(fs.readFileSync(path.join(root, other)), rows.get(other));
        verify(side === 'before' ? right : left, side === 'before' ? after : before);
      } finally {
        if (mutation === 'missing') fs.renameSync(file + '.omitted', file);
        else fs.writeFileSync(file, original);
      }
    }
  }
  if (!identity) rejectCli(right, left);
  rejectCli(right, right);
  if (!identity) for (const [root, copied, restore] of [[right, before, after], [left, after, before]]) {
    write(root, copied);
    try { rejectCli(); verify(root, copied); }
    finally { write(root, restore); }
  }
  if (!identity) for (const [b, a] of [[sourceMap(after), sourceMap(before)], [sourceMap(before), sourceMap(before)], [sourceMap(after), sourceMap(after)]]) {
    assert.throws(() => planMainInkBaseline(b, a, expectedPair)); counts.helperRejected++;
  }
  // Both-side drift must not escape into the historical replay branch.
  for (const rel of selectedPaths) for (const mutation of ['byte', 'missing']) {
    const b = sourceMap(before), a = sourceMap(after);
    for (const rows of [b, a]) {
      if (mutation === 'missing') rows.delete(rel);
      else rows.set(rel, rows.get(rel) + '\n// both-side drift\n');
    }
    assert.throws(() => planMainInkBaseline(b, a, expectedPair)); counts.helperRejected++;
  }
  positive();
  assert.deepEqual(counts, identity ? { positiveCli: 2, cliRejected: selectedPaths.length * 4 + 1, helperRejected: selectedPaths.length * 2 } : { positiveCli: 2, cliRejected: selectedPaths.length * 4 + 4, helperRejected: selectedPaths.length * 2 + 3 });
} finally {
  // Only the directory created by this invocation is removed; input roots are never cleaned.
  fs.rmSync(scratch, { recursive: true, force: true });
  verify(baseline, before); verify(candidate, after);
}
const evidence = {
  schema: 1, mode: admitted.evidence.mode,
  reviewedBaseSourceEpoch: admitted.evidence.sourceBase,
  reviewedCandidateSourceEpoch: admitted.evidence.sourceHead,
  scope: 'Source admission only; independent native physical-state and image comparison remain required.',
  counts, originalInputsUnchanged: true, scratchRemoved: !fs.existsSync(scratch),
  declaredSources:declared?.evidence??null,
  beforeSha256: originalHashes(before), afterSha256: originalHashes(after),
};
if (output) { assertReceiptSeparate(output, [baseline, candidate], paths); fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n'); }
console.log(JSON.stringify(evidence));
