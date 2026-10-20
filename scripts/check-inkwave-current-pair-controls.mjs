#!/usr/bin/env node
// Current reviewed main/candidate source admission controls. No production writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MAIN_INK_BASELINE_PATHS, planMainInkBaseline } from './lib/inkwave-main-ink-baseline.mjs';

const arg = name => {
  const at = process.argv.indexOf(name);
  assert.ok(at >= 0 && process.argv[at + 1], 'required ' + name);
  return path.resolve(process.argv[at + 1]);
};
const baseline = arg('--baseline'), candidate = arg('--candidate');
assert.notEqual(fs.realpathSync(baseline), fs.realpathSync(candidate), 'separate source roots required');
const receiptAt = process.argv.indexOf('--receipt');
if (receiptAt >= 0) assert.ok(process.argv[receiptAt + 1], 'required --receipt value');
const output = receiptAt < 0 ? null : path.resolve(process.argv[receiptAt + 1]);
const paths = [...MAIN_INK_BASELINE_PATHS, 'patches/splatoon3/profile.json'];
if (output) {
  const destination = fs.existsSync(output) ? fs.realpathSync(output) : output;
  for (const root of [baseline, candidate]) for (const rel of paths)
    assert.notEqual(destination, fs.realpathSync(path.join(root, rel)), 'receipt must not replace an input file');
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const snapshot = root => new Map(paths.map(rel => [rel, fs.readFileSync(path.join(root, rel))]));
const before = snapshot(baseline), after = snapshot(candidate);
const sourceMap = rows => new Map(MAIN_INK_BASELINE_PATHS.map(rel => [rel, rows.get(rel).toString('utf8')]));
const originalHashes = rows => Object.fromEntries([...rows].map(([rel, bytes]) => [rel, hash(bytes)]));
const verify = (root, rows) => {
  for (const [rel, bytes] of rows) assert.deepEqual(fs.readFileSync(path.join(root, rel)), bytes, rel + ': input bytes preserved');
};
// Fail before making a scratch copy if these are not the exact reviewed inputs.
const admitted = planMainInkBaseline(sourceMap(before), sourceMap(after));
assert.equal(admitted.evidence.mode, 'current-pair-with-gameplay-differences', 'current pair controls cannot silently test a legacy replay');
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
  return spawnSync(process.execPath, [prepare, '--baseline', b, '--candidate', a, '--receipt', receipt], { encoding: 'utf8' });
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
  assert.equal(evidence.mode, 'current-pair-with-gameplay-differences');
  assert.equal(evidence.paint.mode, evidence.mode);
  assert.deepEqual(evidence.changes, []);
  assert.deepEqual(evidence.writtenPaths, []);
  assert.equal(evidence.paint.paths.length, 13);
  assert.equal(evidence.paint.paths.filter(row => row.originalSha256 !== row.candidateSha256).length, 4);
  for (const row of evidence.paint.paths) {
    assert.equal(row.mode, 'reviewed-current-pair');
    assert.deepEqual(row.replayed, []);
    assert.equal(row.referenceSha256, row.originalSha256);
  }
  assert.match(evidence.scope, /Gameplay differences remain/);
  assert.doesNotMatch(evidence.scope, /identical.*physics/);
  verify(left, before); verify(right, after);
  counts.positiveCli++;
}
try {
  write(left, before); write(right, after);
  positive();
  for (const [side, root, rows] of [['before', left, before], ['after', right, after]]) {
    for (const rel of MAIN_INK_BASELINE_PATHS) for (const mutation of ['byte', 'missing']) {
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
  rejectCli(right, left);
  rejectCli(right, right);
  for (const [root, copied, restore] of [[right, before, after], [left, after, before]]) {
    write(root, copied);
    try { rejectCli(); verify(root, copied); }
    finally { write(root, restore); }
  }
  for (const [b, a] of [[sourceMap(after), sourceMap(before)], [sourceMap(before), sourceMap(before)], [sourceMap(after), sourceMap(after)]]) {
    assert.throws(() => planMainInkBaseline(b, a)); counts.helperRejected++;
  }
  // Both-side drift must not escape into the historical replay branch.
  for (const rel of MAIN_INK_BASELINE_PATHS) for (const mutation of ['byte', 'missing']) {
    const b = sourceMap(before), a = sourceMap(after);
    for (const rows of [b, a]) {
      if (mutation === 'missing') rows.delete(rel);
      else rows.set(rel, rows.get(rel) + '\n// both-side drift\n');
    }
    assert.throws(() => planMainInkBaseline(b, a)); counts.helperRejected++;
  }
  positive();
  assert.deepEqual(counts, { positiveCli: 2, cliRejected: 56, helperRejected: 29 });
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
  beforeSha256: originalHashes(before), afterSha256: originalHashes(after),
};
if (output) { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n'); }
console.log(JSON.stringify(evidence));
