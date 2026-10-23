#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert/strict';
export function compareComposedCpu(before,repeat,after){
 const harnessFiles=['benchmark-inkwave-composed-cpu.mjs','lib/inkwave-cpu-gameplay-digest.mjs','lib/inkwave-cpu-counters.mjs','lib/inkwave-cpu-trace.mjs','lib/inkwave-runtime-evidence.mjs'];
 for(const report of [before,repeat,after]){
  assert.equal(report.schema,2,'measured-window counter schema');assert.equal(report.status,'passed');assert.match(report.sourceSha,/^[a-f0-9]{40}$/);
  assert.deepEqual(Object.keys(report.harness||{}).sort(),[...harnessFiles].sort(),'complete benchmark implementation receipt');
  for(const file of harnessFiles)assert.match(report.harness[file],/^[a-f0-9]{64}$/);
  for(const row of report.scenarios){
   const {before:start,after:end}=row.rawCounters;
   assert.deepEqual(row.draw,{...end.draw,frame:end.draw.frame-start.draw.frame},'draw counter window agrees with raw observations');
   assert.deepEqual(row.resources,Object.fromEntries(Object.keys(end.resources).map(k=>[k,end.resources[k]-start.resources[k]])),'allocation window agrees with raw observations');
   assert.deepEqual(row.scene,end.scene,'final live-scene workload agrees with raw observation');
   assert.deepEqual(row.initial.scene,start.scene,'initial live-scene workload is unchanged before measurement');
  }
 }
 assert.equal(before.contentHash,repeat.contentHash,'A/A uses identical build');
 for(const other of [repeat,after]){
  assert.deepEqual(other.harness,before.harness,'same benchmark, digest, trace and source verifier');
  assert.deepEqual(other.environment,before.environment,'same quality/viewport/browser/CPU/instrumentation');
  assert.deepEqual(other.scenarios.map(x=>x.stage),before.scenarios.map(x=>x.stage),'same requested stages');
 }
 return before.scenarios.map((base,i)=>{
  for(const row of [repeat.scenarios[i],after.scenarios[i]]){
   assert.deepEqual(row.initial,base.initial,'same loaded geometry, roster, source readiness and settings');
   for(const key of ['frames','hz','ticks','digest','digests','counts','state','bvh','draw','resources','scene'])assert.deepEqual(row[key],base[key],base.stage+' '+key+' parity');
   assert.equal(row.contextLost,false);assert.deepEqual(row.errors,[]);
  }
  return {stage:base.stage,status:'exact-recorded-state-parity',beforeMs:base.cpuFrameMs,repeatMs:repeat.scenarios[i].cpuFrameMs,afterMs:after.scenarios[i].cpuFrameMs,
   gc:[base.gc,repeat.scenarios[i].gc,after.scenarios[i].gc],limits:'Host CPU workload only; measured draw/allocation and live-scene counters are compared. No physical-device, presented FPS, whole-image or absolute resource-budget acceptance; A/A noise must accompany A/B timings.'};
 });
}
if(import.meta.url===new URL(process.argv[1],'file:').href){
 const [before,repeat,after,out]=process.argv.slice(2);
 const rows=compareComposedCpu(...[before,repeat,after].map(file=>JSON.parse(fs.readFileSync(file))));
 if(out)fs.writeFileSync(out,JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify(rows));
}
