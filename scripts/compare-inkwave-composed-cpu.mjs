#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert/strict';
export function compareComposedCpu(before,repeat,after){
 for(const report of [before,repeat,after]){assert.equal(report.status,'passed');assert.match(report.sourceSha,/^[a-f0-9]{40}$/);}
 assert.equal(before.contentHash,repeat.contentHash,'A/A uses identical build');
 for(const other of [repeat,after]){
  assert.deepEqual(other.environment,before.environment,'same quality/viewport/browser/CPU/instrumentation');
  assert.deepEqual(other.scenarios.map(x=>x.stage),before.scenarios.map(x=>x.stage),'same requested stages');
 }
 return before.scenarios.map((base,i)=>{
  for(const row of [repeat.scenarios[i],after.scenarios[i]]){
   assert.deepEqual(row.initial,base.initial,'same loaded geometry, roster, source readiness and settings');
   for(const key of ['frames','hz','ticks','digest','digests','counts','state','bvh','draw','resources'])assert.deepEqual(row[key],base[key],base.stage+' '+key+' parity');
   assert.equal(row.contextLost,false);assert.deepEqual(row.errors,[]);
  }
  return {stage:base.stage,status:'exact-gameplay-parity',beforeMs:base.cpuFrameMs,repeatMs:repeat.scenarios[i].cpuFrameMs,afterMs:after.scenarios[i].cpuFrameMs,
   gc:[base.gc,repeat.scenarios[i].gc,after.scenarios[i].gc],limits:'Host CPU workload only. No physical-device or presented FPS claim; A/A noise must accompany A/B timings.'};
 });
}
if(import.meta.url===new URL(process.argv[1],'file:').href){
 const [before,repeat,after,out]=process.argv.slice(2);
 const rows=compareComposedCpu(...[before,repeat,after].map(file=>JSON.parse(fs.readFileSync(file))));
 if(out)fs.writeFileSync(out,JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify(rows));
}
