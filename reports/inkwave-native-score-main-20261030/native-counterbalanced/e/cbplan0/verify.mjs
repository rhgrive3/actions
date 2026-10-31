import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {assertReplayParity, summarizeQuartets} from '../../scripts/benchmark-inkwave-composed-native-counterbalanced.mjs';

const planDir=path.dirname(fileURLToPath(import.meta.url));
const plan=JSON.parse(fs.readFileSync(path.join(planDir,'plan.json')));
const run=plan.runs.find(run=>run.name===process.argv[2]);
assert.ok(run,'valid run name');
const dir=run.evidence, raw=fs.readFileSync(path.join(dir,'result.json')), r=JSON.parse(raw);
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const exit=JSON.parse(fs.readFileSync(path.join(dir,'exit.json')));
assert.equal(r.status,'passed'); assert.equal(exit.exitCode,0); assert.equal(exit.resultStatus,'passed');
assert.equal(exit.resultSha256,sha(raw));
assert.equal(exit.planSha256,sha(fs.readFileSync(path.join(planDir,'plan.json'))));
for(const key of ['warmups','preflight','measurements','parityPairs','rejectedWindowAttempts'])
  assert.equal(r[key].length,run.expected[key],key);
assert.equal(r.config.pageOrder,run.conditions.pageOrder);
assert.equal(r.config.quartetStart,run.conditions.quartetStart);
assert.deepEqual(r.config.warmupSchedule,run.conditions.warmupSchedulePerPhase);
assert.deepEqual(r.config.pageCreationOrder,[...run.conditions.pageOrder]);
assert.equal(r.config.render,false); assert.equal(r.config.allowBvhWorkReduction,false);
assert.deepEqual(r.harness,plan.harness);
for(const [file,hash] of Object.entries(r.harness)) {
  assert.equal(sha(fs.readFileSync(path.join(dir,'harness',file))),hash,file);
  assert.equal(sha(fs.readFileSync(path.join(plan.cwd,'scripts',file))),hash,file);
}
const all=[...r.warmups,...r.preflight,...r.measurements];
assert.equal(all.length,run.expected.totalWindows);
const pairs=new Map(), gpuPid=r.environment.affinity.gpuPid;
let observedThreadEntries=0;
for(const w of all) {
  assertReplayParity(null,w);
  assert.equal(w.frames,run.conditions.frames);
  assert.equal(w.hz,60); assert.equal(w.sceneRenderCalls,0);
  assert.equal(w.buildSide,w.phase==='preflight'?'a':w.side);
  assert.ok(w.draw.calls>0 && w.draw.triangles>0,'paint atlas draw counters remain active');
  assert.equal(w.scoreSnapshot.coverageBits,w.scoreSnapshot.hudCoverageBits);
  assert.match(w.scoreSnapshot.coverageBits,/^[0-9a-f]{32}$/);
  const bits=Buffer.from(w.scoreSnapshot.coverageBits,'hex');
  for(let i=0;i<2;i++) {
    const value=bits.readDoubleBE(i*8), saved=w.scoreSnapshot.coverage[i];
    assert.ok(Number.isFinite(value)&&value>=0&&value<=1);
    assert.ok(Object.is(value,saved)||(value===0&&saved===0),'binary64 matches numeric snapshot, allowing JSON signed-zero loss');
    assert.equal(saved,w.scoreSnapshot.hudCoverage[i]);
  }
  for(const when of ['before','after']) {
    const affinity=w.affinity[when]; assert.deepEqual(affinity.violations,[]);
    assert.deepEqual(affinity.snapshot.processes.filter(p=>p.type==='GPU').map(p=>p.pid),[gpuPid]);
    for(const process of affinity.snapshot.processes) for(const thread of process.threads) {
      assert.deepEqual(thread.allowedCpus,process.type==='GPU'?[0,1]:[2,3]); observedThreadEntries++;
    }
  }
  const key=[w.phase,w.kind,w.replayOrdinal].join('/');
  const group=pairs.get(key)||[];group.push(w);pairs.set(key,group);
}
assert.equal(pairs.size,run.expected.parityPairs);
const pairInventory=[];
for(const [key,rows] of pairs) {
  assert.equal(rows.length,2,key);rows.sort((a,b)=>a.side.localeCompare(b.side));
  assert.deepEqual(rows.map(w=>w.side),['a','b']);assertReplayParity(rows[0],rows[1]);
  pairInventory.push({key,status:'exact-recorded-parity-including-existing-score-hud-cache',digest:rows[0].digest,
    coverageBits:rows[0].scoreSnapshot.coverageBits,coverage:rows[0].scoreSnapshot.coverage,
    stamp:rows[0].scoreSnapshot.before,hudFlags:rows[0].scoreSnapshot.hudFlags,counts:rows[0].counts,bvh:rows[0].bvh,draw:rows[0].draw});
}
for(const [phase,orders] of [['preflight',run.conditions.aaOrders],['measurements',run.conditions.abOrders]]) {
  assert.deepEqual(summarizeQuartets(r[phase]),r[phase+'Summary']);
  assert.deepEqual(r[phase+'Summary'].quartets.map(q=>q.order),orders);
  for(const w of r[phase]) assert.equal(w.replayOrdinal,run.conditions.warmupRunsPerSidePerPhase+w.round*2+(w.slot<2?1:2));
}
const sources={};
for(const side of ['a','b']) {
  const build=r.builds[side],source=plan.source[side];
  assert.equal(build.sourceSha,source.sha);assert.equal(build.contentHash,source.contentHash);
  assert.equal(build.sourceBinding.status,'verified');assert.equal(build.sourceBinding.privateFiles,17);
  assert.equal(build.sourceBinding.sourceSha,source.sha);
  const manifest=JSON.parse(fs.readFileSync(path.join(source.site,'inkwave-build.json')));
  assert.equal(manifest.contentHash,source.contentHash);
  const privateRecords=Object.fromEntries(build.sourceBinding.privateRecords.map(record=>{
    assert.equal(record.status,'verified');assert.equal(record.sha256,record.actualSha256);assert.equal(record.bytes,record.actualBytes);
    return [record.file,record];
  }));
  const receipts=r.servedByteReceipts[side];
  assert.deepEqual(Object.keys(receipts).sort(),r.servedArtifacts[side]);
  for(const [file,receipt] of Object.entries(receipts)) {
    assert.equal(receipt.sha256,privateRecords[file]?.sha256??manifest.artifacts[file],file);
    assert.equal(receipt.bytes,fs.statSync(path.join(source.site,file)).size,file);
    if(privateRecords[file])assert.equal(receipt.bytes,privateRecords[file].bytes,file);
    assert.ok(Number.isInteger(receipt.requests)&&receipt.requests>0);
  }
  sources[side]={sourceSha:build.sourceSha,contentHash:build.contentHash,privateFiles:17,
    publicFiles:build.sourceBinding.publicFiles,servedUniqueFiles:Object.keys(receipts).length,
    totalRequests:Object.values(receipts).reduce((n,receipt)=>n+receipt.requests,0),
    unrequestedPrivateFiles:Object.keys(privateRecords).filter(file=>!receipts[file])};
}
const analysis={verifiedAt:new Date().toISOString(),status:'verified-after-saved-file-readback',run:run.name,
  resultSha256:sha(raw),resultBytes:raw.length,planSha256:exit.planSha256,startedAt:r.startedAt,completedAt:r.completedAt,
  counts:run.expected,config:r.config,sourceAndReceipts:sources,
  validation:{gpuPid,observedThreadEntries,scoreSnapshot:'all windows current/unchanged and all matched pairs exact including binary64 HUD coverage',
    sceneRenderCalls:0,paintDrawsActive:true,pageErrors:0,contextLoss:0,rejectedWindowAttempts:0,exitCode:0},
  pairInventory,limits:r.limits};
fs.writeFileSync(path.join(dir,'analysis.json'),JSON.stringify(analysis,null,2)+'\n');
console.log(JSON.stringify(analysis,null,2));
