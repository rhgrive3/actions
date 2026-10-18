// Run: node --expose-gc --experimental-vm-modules reports/new-families-1130-20261018/stringer-benchmark.mjs
// This is a Node logic hot-path benchmark, not a browser/GPU or retail result.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {fixture} from '../../patches/splatoon3/tests/source-fixture.mjs';
const baseline='9ef63350385bffee71b3afa0a09290a92e9c862b';
const source=execFileSync('git',['show',`${baseline}:patches/splatoon3/runtime/main-weapon-catalog.mjs`],{encoding:'utf8'});
const DT=1/60,iterations=3000,targets=24;
const worlds=[];
for(const name of ['baseline','candidate']){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
    adaptRuntime:(rel,text)=>name==='baseline'&&rel.endsWith('/main-weapon-catalog.mjs')?source:text});
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  const a=f.make('s3-stringer-explosion');a.form='kid';
  for(let i=0;i<80;i++)a.weaponRunner.update(DT,{fire:true,firePressed:i===0});
  a.weaponRunner.update(DT,{fire:false});
  const p=f.G.projectiles.list[0];p.pos.set(0,1,10);p.catalog.stuck=true;
  for(let i=0;i<targets;i++){const enemy=f.make();enemy.team=1;enemy.pos.set(Math.sin(i)*.5,.3,10+Math.cos(i)*.5);}
  let hits=0;f.G.projectiles.applyHit=()=>{hits++;};
  f.G.projectiles.s3DamageSubObjects=()=>{};f.G.projectiles.s3DamageSpecialObjects=()=>{};
  const run=()=>{
    for(let i=0;i<iterations;i++){p.catalog.fuse=DT;assert.equal(f.G.projectiles._step(p,DT),true);}
  };
  run();hits=0;
  worlds.push({name,run,result:{ms:[],heapRetainedBytes:[]},getHits:()=>hits});
}
// Alternate execution order to limit warm-up / host scheduling bias.
for(let sample=0;sample<8;sample++)for(const w of sample%2?[...worlds].reverse():worlds){
  globalThis.gc?.();const heap=process.memoryUsage().heapUsed,before=w.getHits(),start=performance.now();
  w.run();w.result.ms.push(performance.now()-start);
  assert.equal(w.getHits()-before,iterations*targets,'identical work and hit authority in each measured sample');
  globalThis.gc?.();w.result.heapRetainedBytes.push(process.memoryUsage().heapUsed-heap);
}
const median=v=>{const s=v.slice().sort((a,b)=>a-b);return(s[3]+s[4])/2;};
const results=worlds.map(w=>({name:w.name,...w.result,medianMs:median(w.result.ms),medianRetainedBytes:median(w.result.heapRetainedBytes)}));
const output={baseline,candidate:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),node:process.version,
  iterationsPerSample:iterations,targetsPerExplosion:targets,samples:8,results,
  candidateTimeRatio:results[1].medianMs/results[0].medianMs,
  limitations:['Node VM logic only; no GPU rendering, browser GC, network latency or Switch comparison.','Median retained heap uses explicit full GC; it does not measure temporary allocation volume.']};
fs.writeFileSync(new URL('stringer-benchmark.json',import.meta.url),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output,null,2));
