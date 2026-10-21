#!/usr/bin/env node
// Fixed-step full native practice-range pilot. No whole-device/GPU acceptance.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const [site,source,overlay,rootArg]=process.argv.slice(2),root=path.resolve(rootArg);
fs.mkdirSync(root,{recursive:true});
const print=x=>{const bytes=Buffer.from(JSON.stringify(x)+'\n');let p=0;while(p<bytes.length)p+=fs.writeSync(1,bytes,p,bytes.length-p);};
const median=a=>{const s=[...a].sort((x,y)=>x-y);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;};
const stats=a=>{assert.ok(a.length&&a.every(Number.isFinite));const m=median(a);return{n:a.length,mean:a.reduce((x,y)=>x+y,0)/a.length,median:m,mad:median(a.map(x=>Math.abs(x-m))),min:Math.min(...a),max:Math.max(...a),p95:[...a].sort((x,y)=>x-y)[Math.ceil(.95*a.length)-1]};};
const requireSameCondition=(actual,expected)=>assert.deepEqual(actual,expected,'same native world/camera/paint/clocks/workload across all lanes');
const requireMaterialSignal=(before,after)=>assert.notEqual(before,after,'actual painted material sensitivity');
// Negative controls exercise the exact acceptance predicates before launching browsers.
const control={clocks:{game:3,paint:3},atlasHash:'painted-atlas',camera:[0,1,2]};
requireSameCondition(structuredClone(control),control);
for(const bad of [{...control,clocks:{game:4,paint:3}},{...control,atlasHash:'wrong-atlas'},{...control,camera:[0,1,3]}])
 assert.throws(()=>requireSameCondition(bad,control),assert.AssertionError);
requireMaterialSignal('original-painted','candidate-painted');
assert.throws(()=>requireMaterialSignal('same-painted','same-painted'),assert.AssertionError);
print({phase:'condition-negative-controls',status:'passed',rejected:['clock drift','atlas mismatch','camera mismatch','zero material signal']});
const blocks=[];let reference=null;
for(let block=0;block<3;block++){
 const rows=[];
 for(const [order,variant]of ['A','B','B','A'].entries()){
  const out=path.join(root,block+'-'+order+'-'+variant);
  execFileSync(process.execPath,['scripts/check-inkwave-material-native-frame.mjs',site,source,overlay,out,variant],{stdio:'inherit',timeout:900000});
  const row=JSON.parse(fs.readFileSync(path.join(out,'receipt.json'),'utf8'));assert.equal(row.status,'passed');assert.equal(row.variant,variant);
  assert.equal(row.sourceSha,'429cc1352d9b13ffe83c579ed714b84acf6139ed');assert.equal(row.result.samples.length,120);
  const r=row.result,condition={inputHash:row.inputHash,contentHash:row.contentHash,environment:row.environment,initial:r.initial,placements:r.placements,atlasHash:r.atlasHash,beforeWarm:r.beforeWarm,before:r.before,after:r.after,conditions:r.conditions,gpu:r.gpu};
  if(!reference)reference=condition;else requireSameCondition(condition,reference);
  const cost=r.samples.map(({frame,renderCalls,webglPasses,drawCalls,triangles,resources})=>({frame,renderCalls,webglPasses,drawCalls,triangles,resources}));
  if(rows.length)assert.deepEqual(cost,rows[0].cost,'same per-frame render burden');
  const metrics=Object.fromEntries(['frameCpuMs','renderCpuMs','webglSubmitMs'].map(k=>[k,stats(r.samples.map(s=>s[k]))]));
  metrics.completedTransactionMsPerFrame={mean:r.completedTransactionMsPerFrame,n:1,scope:'whole 120-frame transaction plus final completion wait, normalized per frame; not GPU time'};
  rows.push({variant,order,directory:out,metrics,cost,pixels:r.pixels,completionDrainMs:r.completionDrainMs});
  print({phase:'native-observation',block,order,variant,sourceSha:row.sourceSha,conditions:r.conditions,initial:r.initial,before:r.before,after:r.after,paint:{samples:r.placements.length,atlasHash:r.atlasHash,pixels:r.pixels},metrics,completionDrainMs:r.completionDrainMs,gpu:r.gpu,allocations:r.allocations,scope:r.scope});
 }
 assert.equal(rows[0].pixels.unpainted,rows[1].pixels.unpainted,'unpainted original/candidate must match');
 assert.equal(rows[0].pixels.painted,rows[3].pixels.painted,'A repeat pixels');assert.equal(rows[1].pixels.painted,rows[2].pixels.painted,'B repeat pixels');
 requireMaterialSignal(rows[0].pixels.painted,rows[1].pixels.painted);
 const paired=Object.fromEntries(['frameCpuMs','renderCpuMs','webglSubmitMs','completedTransactionMsPerFrame'].map(k=>{
  const before=(rows[0].metrics[k].mean+rows[3].metrics[k].mean)/2,after=(rows[1].metrics[k].mean+rows[2].metrics[k].mean)/2;
  assert.ok(before>0&&after>0&&Number.isFinite(before)&&Number.isFinite(after));
  return[k,{beforeMeanMs:before,afterMeanMs:after,deltaMs:after-before,deltaPercent:(after/before-1)*100}];
 }));
 blocks.push({block,rows,paired});print({phase:'paired-native-block',block,paired});
}
const summary=Object.fromEntries(['frameCpuMs','renderCpuMs','webglSubmitMs','completedTransactionMsPerFrame'].map(k=>[k,{beforeMeanMs:stats(blocks.map(b=>b.paired[k].beforeMeanMs)),afterMeanMs:stats(blocks.map(b=>b.paired[k].afterMeanMs)),deltaMs:stats(blocks.map(b=>b.paired[k].deltaMs)),deltaPercent:stats(blocks.map(b=>b.paired[k].deltaPercent))}]));
const report={status:'passed',sourceSha:'429cc1352d9b13ffe83c579ed714b84acf6139ed',scenario:'native practice range',blocks,summary,
 performanceAccepted:false,scope:'3 ABBA blocks; 12 observations x120 full native fixed frames, not independent 1440 benchmark repeats',
 rangeObservedWithinThreePercent:summary.frameCpuMs.deltaPercent.max<=3&&summary.completedTransactionMsPerFrame.deltaPercent.max<=3,
 limitations:['Object-stage scenario still required.','Three paired blocks describe observed spread, not a device-level confidence bound.','SwiftShader CPU submission is not physical GPU time or iPad performance.','Live presented FPS and allocation rate are unmeasured.','Frame/readback sensitivity validates workload, not retail fidelity.']};
fs.writeFileSync(path.join(root,'paired-result.json'),JSON.stringify(report,null,2));print({status:report.status,sourceSha:report.sourceSha,summary,performanceAccepted:false,rangeObservedWithinThreePercent:report.rangeObservedWithinThreePercent,limitations:report.limitations});
