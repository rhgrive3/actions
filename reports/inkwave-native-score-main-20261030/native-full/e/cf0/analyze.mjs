import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const raw = fs.readFileSync(path.join(dir, 'result.json'));
const report = JSON.parse(raw);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(report.status, 'passed');
assert.deepEqual([report.warmups.length, report.preflight.length, report.measurements.length, report.parityPairs.length, report.rejectedWindowAttempts.length], [20, 8, 16, 22, 0]);
for (const [file, expected] of Object.entries(report.harness))
  for (const base of [path.join(dir, 'harness'), path.resolve(dir, '../../scripts')])
    assert.equal(hash(fs.readFileSync(path.join(base, file))), expected, file);
const {assertReplayParity, summarizeQuartets} = await import('../../scripts/benchmark-inkwave-composed-native-gpu-pool.mjs');
const all = [...report.warmups, ...report.preflight, ...report.measurements];
const pairs = new Map();
for (const row of all) {
  assertReplayParity(null, row);
  assert.equal(row.frames, 900);
  assert.equal(row.hz, 60);
  assert.equal(row.sceneRenderCalls, 0);
  for (const when of ['before', 'after']) {
    assert.deepEqual(row.affinity[when].violations, []);
    const gpu = row.affinity[when].snapshot.processes.find(p => p.type === 'GPU');
    assert.equal(gpu.pid, report.environment.affinity.gpuPid);
    for (const process of row.affinity[when].snapshot.processes)
      for (const thread of process.threads)
        assert.deepEqual(thread.allowedCpus, process.type === 'GPU' ? [0, 1] : [2, 3]);
  }
  const key = [row.phase, row.kind, row.replayOrdinal].join('/');
  const group = pairs.get(key) || [];
  group.push(row); pairs.set(key, group);
}
assert.equal(pairs.size, 22);
for (const [key, rows] of pairs) {
  assert.equal(rows.length, 2, key);
  rows.sort((a,b)=>a.side.localeCompare(b.side));
  assert.deepEqual(rows.map(r=>r.side), ['a','b']);
  assertReplayParity(rows[0], rows[1]);
}
for (const phase of ['preflight', 'measurements'])
  assert.deepEqual(summarizeQuartets(report[phase]), report[phase+'Summary']);
const receiptSummaries = {};
for (const side of ['a', 'b']) {
  const build = report.builds[side];
  assert.equal(build.sourceBinding.status, 'verified');
  assert.equal(build.sourceBinding.privateFiles, 17);
  const unrequestedPrivateFiles = [];
  for (const record of build.sourceBinding.privateRecords) {
    assert.equal(record.status, 'verified');
    assert.equal(record.sha256, record.actualSha256);
    assert.equal(record.bytes, record.actualBytes);
    const receipt = report.servedByteReceipts[side][record.file];
    if (receipt) {
      assert.equal(receipt.sha256, record.sha256);
      assert.equal(receipt.bytes, record.bytes);
    } else unrequestedPrivateFiles.push(record.file);
  }
  assert.deepEqual(Object.keys(report.servedByteReceipts[side]).sort(), report.servedArtifacts[side]);
  receiptSummaries[side] = {sourceSha:build.sourceSha, contentHash:build.contentHash,
    admittedPrivateFiles:build.sourceBinding.privateFiles,
    unrequestedPrivateFiles,
    servedUniqueFiles:Object.keys(report.servedByteReceipts[side]).length,
    totalRequests:Object.values(report.servedByteReceipts[side]).reduce((n,r)=>n+r.requests,0)};
}
const metric = values => ({min:Math.min(...values), max:Math.max(...values), mean:values.reduce((s,v)=>s+v,0)/values.length});
const windows = all.map(row => ({phase:row.phase,kind:row.kind,round:row.round,slot:row.slot,side:row.side,
  buildSide:row.buildSide,replayOrdinal:row.replayOrdinal,startedAt:row.startedAt,completedAt:row.completedAt,
  frameMeanMs:row.frameMeanMs,rendererThreadMsPerTick:row.rendererThreadMsPerTick,
  frameP95Ms:row.frameStats.p95, frameMaxMs:row.frameStats.max,
  cgroupDelta:Object.fromEntries(Object.keys(row.cgroup.before).map(k=>[k,row.cgroup.after[k]-row.cgroup.before[k]])),
  heapBytesBefore:row.heap.before.JSHeapUsedSize,heapBytesAfter:row.heap.after.JSHeapUsedSize,
  heapUsedDelta:row.heap.after.JSHeapUsedSize-row.heap.before.JSHeapUsedSize,
  heapTotalBefore:row.heap.before.JSHeapTotalSize,heapTotalAfter:row.heap.after.JSHeapTotalSize,
  frameBlocks100:row.frameBlocks100,
  evaluationWallMs:row.evaluationWallMs,
  bvh:row.bvh,digest:row.digest,poseDigest:row.poseDigest,sceneRenderCalls:row.sceneRenderCalls,
  budgetTicks:row.budgetWork.reduce((sum,actor)=>sum+actor._oobBudgetTicks,0)}));
const phases = Object.fromEntries(['preflight','measurements'].map(phase => {
  const rows = windows.filter(r=>r.phase===phase && r.kind==='measurement');
  return [phase,{quartetSummary:report[phase+'Summary'],
    windows:rows,throttledWindows:rows.filter(r=>r.cgroupDelta.nr_throttled>0).length,
    throttledPeriods:rows.reduce((s,r)=>s+r.cgroupDelta.nr_throttled,0),
    throttledUsec:rows.reduce((s,r)=>s+r.cgroupDelta.throttled_usec,0),
    sideMeans:Object.fromEntries(['a','b'].map(side=>[side,{
      frameMeanMs:metric(rows.filter(r=>r.side===side).map(r=>r.frameMeanMs)),
      rendererThreadMsPerTick:metric(rows.filter(r=>r.side===side).map(r=>r.rendererThreadMsPerTick))}]))}];
}));
const plan = JSON.parse(fs.readFileSync(path.join(dir,'full-plan.json')));
for (const side of ['a','b']) {
  assert.equal(report.builds[side].sourceSha, plan.source[side].sha);
  assert.equal(report.builds[side].contentHash, plan.priorSmoke.builds[side].contentHash);
}
assert.equal(hash(fs.readFileSync(path.join(dir,'../csm0/result.json'))),plan.priorSmoke.resultSha256);
const analysis={analyzedAt:new Date().toISOString(),resultSha256:hash(raw),resultBytes:raw.length,
  status:'verified-after-saved-file-readback',startedAt:report.startedAt,completedAt:report.completedAt,
  counts:{warmups:20,preflight:8,measurements:16,exactPairs:22,rejected:0},
  sourceAndReceipts:receiptSummaries,phases,allWindows:windows,
  interpretationLimits:report.limits};
fs.writeFileSync(path.join(dir,'analysis.json'),JSON.stringify(analysis,null,2)+'\n');
console.log(JSON.stringify({status:analysis.status,resultSha256:analysis.resultSha256,counts:analysis.counts,
  sourceAndReceipts:analysis.sourceAndReceipts,phases:Object.fromEntries(Object.entries(phases).map(([k,v])=>[k,{quartetSummary:v.quartetSummary,throttledWindows:v.throttledWindows,throttledPeriods:v.throttledPeriods,throttledUsec:v.throttledUsec,sideMeans:v.sideMeans}]))},null,2));
