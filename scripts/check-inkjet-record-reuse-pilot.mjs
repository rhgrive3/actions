#!/usr/bin/env node
// One-case ABOOBA feasibility pilot, not a performance acceptance gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const option=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const site=path.resolve(option('--site','_site'));
const root=path.resolve(option('--evidence-dir','.ci-scratch/inkjet-paired-pilot'));
const overlay=path.resolve(option('--baseline-overlay','.ci-scratch/inkjet-baseline/special-vfx.mjs'));
const optimized=path.resolve(option('--optimized-overlay','.ci-scratch/inkjet-optimized/inkjet-vfx-budget.mjs'));
const blocks=Number(option('--blocks','1'));assert.ok([1,3,5].includes(blocks));
const print=value=>{const bytes=Buffer.from(JSON.stringify(value)+'\n');let offset=0;while(offset<bytes.length)offset+=fs.writeSync(1,bytes,offset,bytes.length-offset);};
const results=[];
for(let block=0;block<blocks;block++){
 const observations=[];
 for(const [position,variant] of ['A','B','O','O','B','A'].entries()){
  const directory=path.join(root,'block-'+block+'-'+position+'-'+variant);
  const args=['scripts/check-inkwave-splashdown-browser.mjs','--site',site,'--inkjet','--hz','60','--actors','1','--layout','near','--warmup-seconds','2','--sample-seconds','3','--timing-only','--evidence-dir',directory];
  if(variant==='A')args.push('--baseline-overlay',overlay);
  if(variant==='O')args.push('--budget-overlay',optimized);
  execFileSync(process.execPath,args,{stdio:'inherit',timeout:240000});
  const result=JSON.parse(fs.readFileSync(path.join(directory,'result.json'),'utf8'));
  assert.equal(result.cases.length,1);assert.deepEqual(result.failures,[]);assert.deepEqual(result.errors,[]);
  const row=result.cases[0];assert.equal(row.variant,variant==='A'?'baseline-overlay':variant==='O'?'optimized-budget-overlay':'candidate');
  assert.deepEqual(row.viewport,{width:960,height:720});assert.equal(row.frames.length,180);
  assert.equal(row.exhaustGlows.length,1);assert.equal(row.exhaustGlows[0],360);
  observations.push({position,variant,directory,contentHash:result.contentHash,servedHashes:result.servedHashes,case:row});
 }
 print({block,kind:'raw observations before cross-validation, not accepted',observations:observations.map(r=>({position:r.position,variant:r.variant,phaseBefore:r.case.phaseBefore,phaseAfter:r.case.phaseAfter,startupRng:r.case.startupRng,rngBoundary:r.case.rngBoundary,cpuFxUpdateMs:r.case.cpuFxUpdateMs,cpuRenderSubmissionMs:r.case.cpuRenderSubmissionMs}))});
 assert.equal(new Set(observations.map(r=>r.contentHash)).size,1,'one unchanged emitted build');
 assert.equal(observations[0].servedHashes['patches/splatoon3/runtime/special-vfx.mjs'],observations[5].servedHashes['patches/splatoon3/runtime/special-vfx.mjs']);
 assert.equal(observations[1].servedHashes['patches/splatoon3/runtime/special-vfx.mjs'],observations[4].servedHashes['patches/splatoon3/runtime/special-vfx.mjs']);
 for(const observation of observations.slice(1))for(const key of ['seed','camera','viewport','clock','hz','actorCount','layout','quality','puffCap','phaseBefore','phaseAfter','rngBoundary'])assert.deepEqual(observation.case[key],observations[0].case[key],key+' identical across ABOOBA');
 const frameSignature=row=>JSON.stringify(row.frames.map(({frame,time,puffs,sparks,drawCalls,triangles})=>({frame,time,puffs,sparks,drawCalls,triangles})));
 assert.equal(frameSignature(observations[0].case),frameSignature(observations[5].case),'A repeated visual burden deterministic');
 assert.equal(frameSignature(observations[1].case),frameSignature(observations[4].case),'B repeated visual burden deterministic');
 assert.equal(frameSignature(observations[2].case),frameSignature(observations[3].case),'optimized repeated visual burden deterministic');
 assert.equal(frameSignature(observations[1].case),frameSignature(observations[2].case),'optimized versus current exact per-frame burden');
 for(const o of observations)for(const file of Object.keys(o.servedHashes)){
  if(file.endsWith('/special-vfx.mjs')&&o.variant==='A')continue;
  if(file.endsWith('/inkjet-vfx-budget.mjs')&&o.variant==='O')continue;
  assert.equal(o.servedHashes[file],observations[1].servedHashes[file],'unchanged shared emitted input '+file);
 }
 const sharedFrames=observations[0].case.frames.map((a,i)=>{const b=observations[1].case.frames[i];return {frame:a.frame,time:a.time,puffsDelta:b.puffs-a.puffs,sparksDelta:b.sparks-a.sparks,drawCallsDelta:b.drawCalls-a.drawCalls,trianglesDelta:b.triangles-a.triangles};});
 const mean=(variant,key)=>{const a=observations.filter(r=>r.variant===variant).map(r=>r.case[key].mean);return a.reduce((n,x)=>n+x,0)/a.length;};
 for(const variant of ['A','B','O'])for(const key of ['cpuFxUpdateMs','cpuRenderSubmissionMs'])assert.ok(Number.isFinite(mean(variant,key))&&mean(variant,key)>0,'finite positive timing denominator '+variant+'/'+key);
 const ratios={optimizedFxVsCurrent:mean('O','cpuFxUpdateMs')/mean('B','cpuFxUpdateMs'),optimizedSubmitVsCurrent:mean('O','cpuRenderSubmissionMs')/mean('B','cpuRenderSubmissionMs'),optimizedFxVsBaseline:mean('O','cpuFxUpdateMs')/mean('A','cpuFxUpdateMs'),optimizedSubmitVsBaseline:mean('O','cpuRenderSubmissionMs')/mean('A','cpuRenderSubmissionMs'),fxCpu:mean('B','cpuFxUpdateMs')/mean('A','cpuFxUpdateMs'),renderSubmitCpu:mean('B','cpuRenderSubmissionMs')/mean('A','cpuRenderSubmissionMs')};
 results.push({block,observations,ratios,sharedFrames});
 print({block,ratios,observations:observations.map(r=>({position:r.position,variant:r.variant,case:r.case})),sharedFrames});
}
fs.mkdirSync(root,{recursive:true});
const summarize=key=>{const a=results.map(r=>r.ratios[key]).sort((a,b)=>a-b);return {median:a[Math.floor(a.length/2)],min:a[0],max:a.at(-1),blockRatios:a};};
const dispersion=Object.fromEntries(Object.keys(results[0].ratios).map(key=>[key,summarize(key)]));
const report={dispersion,scope:'single-case baseline/current/optimized symmetric ABOOBA diagnostic on SwiftShader; frozen gameplay; fresh browser per observation; no hardware GPU, allocation or whole-game performance acceptance',case:{hz:60,actorCount:1,layout:'near'},blocks:results,performanceAccepted:false,limitations:['One block is insufficient to bound noise.','PNG/readPixels occur outside the timed sample window; continuous visual captures remain a separate acceptance pass.','Full acceptance requires all actor/rate/distance cases, separate capture passes and block-level uncertainty.','CPU render-submission is not GPU completion.']};
fs.writeFileSync(path.join(root,'paired-result.json'),JSON.stringify(report,null,2)+'\n');
print({evidence:root,ratios:results.map(r=>r.ratios),dispersion,performanceAccepted:false});
