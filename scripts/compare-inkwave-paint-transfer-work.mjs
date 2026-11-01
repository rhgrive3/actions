// Compare the unchanged batched paint renderer against the packed-transfer build.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const [basePath, repeatPath, trialPath, outPath] = process.argv.slice(2);
if (!outPath) throw new Error('usage: node scripts/compare-inkwave-paint-transfer-work.mjs base.json repeat.json trial.json out.json');
const receipts = [basePath, repeatPath, trialPath].map(p => JSON.parse(fs.readFileSync(p, 'utf8')));
const [base, repeat, trial] = receipts.map(r => r.result);
function compare(a, b) {
  const same = k => JSON.stringify(a[k]) === JSON.stringify(b[k]);
  return { roster: same('roster'), ticks: same('ticks'), stateAndPoseFrames: same('seq') && a.seq.length > 0,
    grid: same('grid'), order: same('order'), counts: same('counts'), atlas: same('atlasSamples') &&
    a.atlasHash === b.atlasHash && a.atlasSize === b.atlasSize && a.atlasGlError === 0 && b.atlasGlError === 0 &&
    a.atlasSamples.every(x => x.glError === 0) };
}
const summary = { frames: receipts[0].frames, inputs: [basePath, repeatPath, trialPath],
  baselineHashes: receipts.map(r => r.baselineSha256), moduleHashes: receipts.map(r => r.trialSha256),
  baselineComparison: compare(base, repeat), trialComparison: compare(base, trial),
  work: [base, repeat, trial].map(r => r.transferStats), errors: [base, repeat, trial].map(r => r.errors),
  scope: 'Native Scorch offline Turf, deterministic 30 Hz presentation and 60 Hz simulation, eight actors; scene display rendering disabled, atlas rendering enabled. Instrumented counts; no timing claim.' };
fs.writeFileSync(outPath, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
assert(receipts.every(r => r.frames === receipts[0].frames));
assert([base, repeat, trial].every(r => r.stage === 'scorch' && r.native && r.actors === 8 && r.bots === 7 && r.intercepted >= 1 && r.errors.length === 0));
assert(Object.values(summary.baselineComparison).every(Boolean), 'baseline did not reproduce');
assert.deepEqual(base.transferStats, repeat.transferStats, 'baseline work counts did not reproduce');
assert(Object.values(summary.trialComparison).every(Boolean), 'trial differs');
assert.equal(trial.transferStats.atlasRenders, base.transferStats.atlasRenders, 'unexpected change in atlas renders');
assert(trial.transferStats.uploads < base.transferStats.uploads, 'no reduction in upload calls');
assert.equal(trial.transferStats.bytes * 256, base.transferStats.bytes * 80, 'unexpected upload bytes');
