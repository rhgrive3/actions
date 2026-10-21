#!/usr/bin/env node
// One-case ABBA feasibility pilot, not a performance acceptance gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const option=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const site=path.resolve(option('--site','_site'));
const root=path.resolve(option('--evidence-dir','.ci-scratch/inkjet-paired-pilot'));
const overlay=path.resolve(option('--baseline-overlay','.ci-scratch/inkjet-baseline/special-vfx.mjs'));
const blocks=Number(option('--blocks','1'));assert.ok(Number.isInteger(blocks)&&blocks>=1&&blocks<=5);
const results=[];
for(let block=0;block<blocks;block++){
 const observations=[];
 for(const [position,variant] of ['A','B','B','A'].entries()){
  const directory=path.join(root,'block-'+block+'-'+position+'-'+variant);
  const args=['scripts/check-inkwave-splashdown-browser.mjs','--site',site,'--inkjet','--hz','60','--actors','1','--layout','near','--warmup-seconds','2','--sample-seconds','3','--timing-only','--evidence-dir',directory];
  if(variant==='A')args.push('--baseline-overlay',overlay);
  execFileSync(process.execPath,args,{stdio:'inherit',timeout:240000});
  const result=JSON.parse(fs.readFileSync(path.join(directory,'result.json'),'utf8'));
  assert.equal(result.cases.length,1);assert.deepEqual(result.failures,[]);assert.deepEqual(result.errors,[]);
  const row=result.cases[0];assert.equal(row.variant,variant==='A'?'baseline-overlay':'candidate');
  assert.deepEqual(row.viewport,{width:960,height:720});assert.equal(row.frames.length,180);
  assert.equal(row.exhaustGlows.length,1);assert.equal(row.exhaustGlows[0],360);
  observations.push({position,variant,directory,contentHash:result.contentHash,servedHashes:result.servedHashes,case:row});
 }
 assert.equal(new Set(observations.map(r=>r.contentHash)).size,1,'one unchanged emitted build');
 assert.equal(observations[0].servedHashes['patches/splatoon3/runtime/special-vfx.mjs'],observations[3].servedHashes['patches/splatoon3/runtime/special-vfx.mjs']);
 assert.equal(observations[1].servedHashes['patches/splatoon3/runtime/special-vfx.mjs'],observations[2].servedHashes['patches/splatoon3/runtime/special-vfx.mjs']);
 const mean=(variant,key)=>{const a=observations.filter(r=>r.variant===variant).map(r=>r.case[key].mean);return a.reduce((n,x)=>n+x,0)/a.length;};
 const ratios={fxCpu:mean('B','cpuFxUpdateMs')/mean('A','cpuFxUpdateMs'),renderSubmitCpu:mean('B','cpuRenderSubmissionMs')/mean('A','cpuRenderSubmissionMs')};
 results.push({block,observations,ratios});
}
fs.mkdirSync(root,{recursive:true});
const report={scope:'single-case ABBA feasibility pilot on SwiftShader; frozen gameplay; fresh browser per observation; no hardware GPU, allocation or whole-game performance acceptance',case:{hz:60,actorCount:1,layout:'near'},blocks:results,performanceAccepted:false,limitations:['One block is insufficient to bound noise.','PNG/readPixels occur outside the timed sample window; continuous visual captures remain a separate acceptance pass.','Full acceptance requires all actor/rate/distance cases, separate capture passes and block-level uncertainty.','CPU render-submission is not GPU completion.']};
fs.writeFileSync(path.join(root,'paired-result.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({evidence:root,ratios:results.map(r=>r.ratios),performanceAccepted:false}));
