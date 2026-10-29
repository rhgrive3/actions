#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert/strict';
export function compareComposedCpu(before,repeat,after,{allowBvhWorkReduction=false}={}){
 const harnessFiles=['benchmark-inkwave-composed-cpu.mjs','lib/inkwave-cpu-gameplay-digest.mjs','lib/inkwave-cpu-counters.mjs','lib/inkwave-cpu-trace.mjs','lib/inkwave-runtime-evidence.mjs','lib/inkwave-sandbox-browser.mjs'];
 for(const report of [before,repeat,after]){
  assert.equal(report.schema,2,'measured-window counter schema');assert.equal(report.status,'passed');assert.match(report.sourceSha,/^[a-f0-9]{40}$/);
  assert.deepEqual(Object.keys(report.harness||{}).sort(),[...harnessFiles].sort(),'complete benchmark implementation receipt');
  for(const file of harnessFiles)assert.match(report.harness[file],/^[a-f0-9]{64}$/);
  assert.ok(Array.isArray(report.scenarios)&&report.scenarios.length>0,'at least one measured scenario');
  for(const row of report.scenarios){
   assert.ok(Number.isInteger(row.frames)&&row.frames>=30&&row.frames<=18000,'measured frame count matches capture bounds');
   assert.ok([30,60,120].includes(row.hz),'measured cadence matches capture options');
   assert.equal(row.ticks,Math.round(row.frames*60/row.hz),'measured fixed ticks match capture contract');
   assert.equal(row.contextLost,false,'each measured scenario retains its GL context');
   assert.deepEqual(row.errors,[],'each measured scenario has no page errors');
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
   for(const key of ['frames','hz','ticks','minActors','minLiving','digest','digests','counts','state','draw','resources','scene'])assert.deepEqual(row[key],base[key],base.stage+' '+key+' parity');
   // Exact Boolean early exits may reduce BVH work while preserving every
   // recorded gameplay result. This explicit mode never relaxes A/A, state,
   // rendering, resource, environment or harness identity checks.
   if(allowBvhWorkReduction&&row===after.scenarios[i]){
    assert.deepEqual(Object.keys(row.bvh).sort(),['queries','triangleTests']);
    assert.deepEqual(Object.keys(base.bvh).sort(),['queries','triangleTests']);
    for(const key of ['queries','triangleTests']){
     assert.ok(Number.isSafeInteger(base.bvh[key])&&base.bvh[key]>=0,'valid baseline BVH work');
     assert.ok(Number.isSafeInteger(row.bvh[key])&&row.bvh[key]>=0&&row.bvh[key]<=base.bvh[key],base.stage+' non-increasing BVH '+key);
    }
   }else assert.deepEqual(row.bvh,base.bvh,base.stage+' bvh parity');
  }
  return {stage:base.stage,status:'exact-recorded-state-parity',beforeMs:base.cpuFrameMs,repeatMs:repeat.scenarios[i].cpuFrameMs,afterMs:after.scenarios[i].cpuFrameMs,
   bvh:{policy:allowBvhWorkReduction?'explicit-non-increasing-candidate-work':'exact',before:base.bvh,repeat:repeat.scenarios[i].bvh,after:after.scenarios[i].bvh},
   gc:[base.gc,repeat.scenarios[i].gc,after.scenarios[i].gc],limits:'Host CPU workload only; measured draw/allocation and live-scene counters are compared. No physical-device, presented FPS, whole-image or absolute resource-budget acceptance; A/A noise must accompany A/B timings.'};
 });
}
if(import.meta.url===new URL(process.argv[1],'file:').href){
 const allowBvhWorkReduction=process.argv.includes('--allow-bvh-work-reduction');
 const args=process.argv.slice(2).filter(arg=>arg!=='--allow-bvh-work-reduction');
 if(args.some(arg=>arg.startsWith('--'))||args.length<3||args.length>4)throw Error('Usage: compare-inkwave-composed-cpu.mjs before.json repeat.json after.json [out.json] [--allow-bvh-work-reduction]');
 const [before,repeat,after,out]=args;
 const rows=compareComposedCpu(...[before,repeat,after].map(file=>JSON.parse(fs.readFileSync(file))),{allowBvhWorkReduction});
 if(out)fs.writeFileSync(out,JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify(rows));
}
