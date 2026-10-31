import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {hash} from '../../scripts/lib/inkwave-runtime-evidence.mjs';
import {assertReplayParity} from '../../scripts/benchmark-inkwave-composed-native-gpu-pool.mjs';

const evidence = path.resolve(process.argv[2]);
const plan = JSON.parse(fs.readFileSync(new URL('./full-plan.json', import.meta.url)));
const fixed = plan.runs.find(smoke => smoke.evidence === evidence);
assert.ok(fixed, 'smoke was fixed in advance');
const report = JSON.parse(fs.readFileSync(path.join(evidence, 'result.json')));
assert.equal(report.status, 'passed');
assert.deepEqual(report.rejectedWindowAttempts, []);
assert.equal(report.config.render, false);
assert.equal(report.config.allowBvhWorkReduction, false);
assert.equal(report.config.frames, 900);
assert.equal(report.config.warmupFrames, 900);
assert.equal(report.config.warmupRuns, 5);
assert.equal(report.config.aaRounds, 2);
assert.equal(report.config.rounds, 4);
assert.equal(report.config.stage, 'hagglefish');
assert.equal(report.config.quality, 'low');
assert.deepEqual(report.environment.viewport, [480, 300]);
const phases = report.config.preflightOnly ? ['preflight'] : ['preflight', 'measurements'];
assert.equal(report.warmups.length, phases.length * 10);
assert.equal(report.preflight.length, 8);
assert.equal(report.measurements.length, report.config.preflightOnly ? 0 : 16);
const windows = [...report.warmups, ...report.preflight, ...report.measurements];
const groups = new Map();
for (const row of windows) {
  assertReplayParity(null, row);
  assert.equal(row.initial.triangles, 163625);
  assert.equal(row.initial.paintFaces, 65827);
  assert.equal(row.initial.atlas, 2048);
  // Latest main changed native paint density. Full initial-object parity below
  // remains exact within matched ordinals; this is not an old-cohort fixture.
  assert.ok(Number.isFinite(row.initial.ppm) && row.initial.ppm > 0);
  assert.equal(row.frames, 900);
  for (const value of [...row.counts, row.bvh.queries, row.bvh.triangleTests]) assert.ok(Number.isSafeInteger(value) && value >= 0);
  assert.equal(row.buildSide, row.phase === 'preflight' ? 'a' : row.side);
  const key = [row.phase, row.kind, row.replayOrdinal].join('/');
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}
for (const rows of groups.values()) {
  assert.equal(rows.length, 2, 'exactly two matched-ordinal outputs');
  assert.notEqual(rows[0].side, rows[1].side);
  assertReplayParity(rows[0], rows[1]);
}
assert.equal(report.parityPairs.length, groups.size);
const assets = {};
for (const side of ['a', 'b']) {
  const build = report.builds[side], source = build.sourceBinding;
  assert.equal(source.status, 'verified');
  assert.equal(source.sourceSha, build.sourceSha);
  assert.equal(source.privateFiles, 17);
  const sourceIndex = Object.fromEntries(source.privateRecords.map(record => [record.file, record]));
  const site = fixed.args[fixed.args.indexOf('--site-' + side) + 1];
  const manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
  assert.equal(manifest.contentHash, build.contentHash);
  const receipts = report.servedByteReceipts[side];
  assert.deepEqual(Object.keys(receipts).sort(), [...report.servedArtifacts[side]].sort());
  for (const [file, receipt] of Object.entries(receipts)) {
    assert.ok(Number.isSafeInteger(receipt.bytes) && receipt.bytes >= 0);
    assert.ok(Number.isSafeInteger(receipt.requests) && receipt.requests > 0);
    const expected = manifest.artifacts[file] || sourceIndex[file]?.sha256;
    assert.equal(receipt.sha256, expected, 'served body bound to manifest/source: ' + file);
    const bytes = fs.readFileSync(path.join(site, file));
    assert.equal(hash(bytes), receipt.sha256);
    assert.equal(bytes.length, receipt.bytes);
    if (sourceIndex[file]) assert.equal(receipt.bytes, sourceIndex[file].bytes);
  }
  assets[side] = {sourceSha: build.sourceSha, privateInventoryFiles: source.privateFiles, servedFiles: Object.keys(receipts).length,
    servedPrivateFiles: Object.keys(receipts).filter(file => file.startsWith('native-prebuilt/')).length,
    servedBodyShaAndSizeChecks: 'passed'};
}
for (const [file, expected] of Object.entries(report.harness))
  assert.equal(hash(fs.readFileSync(path.join(evidence, 'harness', file))), expected, 'sealed harness snapshot: ' + file);
const processes = execFileSync('ps', ['-eo', 'pid,ppid,stat,etime,comm,args'], {encoding: 'utf8'}).split('\n');
const active = processes.filter(line => /^\s*\d+\s+\d+\s+\S+\s+\S+\s+chromium\s/.test(line) && line.includes(evidence));
assert.deepEqual(active, [], 'smoke browser processes have ended');
const browserExit = {checkedAt: new Date().toISOString(), matchingChromiumProcesses: active, browserCloseAwaitedByHarness: true};
fs.writeFileSync(path.join(evidence, 'browser-exit-check.json'), JSON.stringify(browserExit, null, 2) + '\n');
const summary = {purpose: '900frame native whole-battle full measurement validation; timing interpretation retained separately', status: 'passed', fixedPlanAt: plan.fixedAt,
  sourceBuilds: assets, totalWindows: windows.length, warmupWindows: report.warmups.length, preflightWindows: report.preflight.length,
  comparisonWindows: report.measurements.length, exactMatchedOrdinalPairs: groups.size, nativeAndEightActorsRequiredBeforeEveryWindow: true,
  allWindows: windows.map(row => ({phase: row.phase, kind: row.kind, side: row.side, buildSide: row.buildSide, replayOrdinal: row.replayOrdinal,
    frames: row.frames, ticks: row.ticks, native: row.initial.native, actors: row.initial.actors, bots: row.initial.bots, sourceCharacters: row.initial.sourceCharacters,
    minActors: row.minActors, minLiving: row.minLiving, state: row.state, digest: row.digest, counts: row.counts, draw: row.draw, bvh: row.bvh,
    resourceDeltas: row.resources, sceneRenderCalls: row.sceneRenderCalls, errors: row.errors, contextLost: row.contextLost,
    affinityBefore: row.affinity.before.status, affinityAfter: row.affinity.after.status,
    cgroupThrottledPeriodsDelta: row.cgroup.after.nr_throttled - row.cgroup.before.nr_throttled,
    cgroupThrottledUsecDelta: row.cgroup.after.throttled_usec - row.cgroup.before.throttled_usec})),
  nonfiniteWindowResults: 0, rejectedWindowAttempts: 0, exactGameplayPaintStateDrawResourcesSceneAndBvhParity: true,
  gpuCpus: report.config.gpuCpus, workerCpus: report.config.workerCpus, cpuQuota: report.environment.cpuQuota,
  speedupClaim: false, browserExited: true, limits: report.limits};
fs.writeFileSync(path.join(evidence, 'validation-summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({evidence, status: summary.status, windows: windows.length, pairs: groups.size, assets, browserExited: true}, null, 2));
