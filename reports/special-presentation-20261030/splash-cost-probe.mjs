// One-off CPU component probe for the 2026-10-30 splash-cadence review.
// Run from the repository root; recorded results are CPU-only, not mobile FPS.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
const root = process.cwd(), base = pathToFileURL(root + '/patches/splatoon3/runtime/special-vfx-kit.mjs');
const { fixture } = await import(pathToFileURL(root + '/patches/splatoon3/tests/source-fixture.mjs'));
const { specialVfxDirector } = await import(pathToFileURL(root + '/patches/splatoon3/runtime/special-vfx.mjs'));
const source = fs.readFileSync(base, 'utf8');
const before = execFileSync('git', ['show', 'fd6435a4dd2781928d211537c485c87bc50b3784:patches/splatoon3/runtime/special-vfx-kit.mjs'], { encoding:'utf8' });
async function load(code) {
  code = code.replace(/from\s+(['"])(\.[^'"]+)\1/g, (_, q, p) => 'from ' + JSON.stringify(new URL(p, base).href));
  return await import('data:text/javascript;base64,' + Buffer.from(code + '\nexport { SpritePool };').toString('base64'));
}
const { SpritePool: Next, SpecialVfxKit: Kit } = await load(source), { SpritePool: Old } = await load(before);
const f = await fixture({ fullRuntime:true, realProjectiles:true }), { THREE, G } = f;
G.scene = new THREE.Scene();
const fx = new f.installedRuntime.FX(G.scene, {quality:'high'}); G.fx=fx;fx.setCollider(()=>null);
specialVfxDirector(fx).inkBlast(new THREE.Vector3(1,.5,3), [.2,.4,.8], 6, {native:false});
const original = specialVfxDirector(fx).kit;
const seeds = { puffs:original.puffs.p.slice(0,original.puffs.n*23), sparks:original.sparks.p.slice(0,original.sparks.n*23) };
const make = (Type, key, count, alternate=false) => {
  const pool = new Type(THREE, key==='puffs'?520:900, key==='sparks', {value:0});
  const seed=seeds[key];
  for(let i=0;i<count;i++) {
    const k=(i%(seed.length/23))*23;pool.p.set(seed.subarray(k,k+23),i*23);
    if(alternate)pool.p[i*23+10]=[.8,1.12,1.6,2.2][i%4];
  }
  pool.n=count; const initial=pool.p.slice();
  return {pool,initial,count};
};
const reset=r=>{r.pool.p.set(r.initial);r.pool.n=r.count;};
const destroy=r=>{r.pool.mesh.geometry.dispose();r.pool.mesh.material.dispose();};
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const configs=[['burst73', [['puffs',72],['sparks',1]]],['puffs-half260',[['puffs',260]]],['puffs-full520',[['puffs',520]]],['sparks-half450',[['sparks',450]]],['sparks-full900',[['sparks',900]]],['puffs-alternating520',[['puffs',520,true]]],['sparks-alternating900',[['sparks',900,true]]]];
const samples=7, rows=[];let checksum=0;
for(const [name,desc]of configs)for(const hz of [30,60,120]){
 const A=desc.map(x=>make(Old,...x)),B=desc.map(x=>make(Next,...x)),n=desc.reduce((s,x)=>s+x[1],0),cycles=Math.max(60,Math.ceil(300000/n/3));
 const run=(list,count)=>{const cpuStart=process.cpuUsage();let elapsed=0;for(let cycle=0;cycle<count;cycle++){
   for(const r of list)reset(r);
   const start=performance.now();
   for(let k=0;k<3;k++)for(const r of list)r.pool.update(1/hz);
   elapsed+=performance.now()-start;
 }
 const cpu=process.cpuUsage(cpuStart);checksum+=list[0].pool.p[0];return {wall:elapsed/(count*3),cpu:(cpu.user+cpu.system)/1000/(count*3)};};
 run(A,Math.min(200,cycles));run(B,Math.min(200,cycles));
 const old=[],next=[];
 for(let sample=0;sample<samples;sample++){if(sample%2){next.push(run(B,cycles));old.push(run(A,cycles));}else{old.push(run(A,cycles));next.push(run(B,cycles));}}
 for(const list of[A,B])for(const r of list){assert.equal(r.pool.n,r.count);assert.equal(r.pool.mesh.geometry.instanceCount,r.count+1);
   for(const attr of r.pool.updateAttributes){assert.equal(attr.count,r.pool.cap+1);for(const range of attr.updateRanges)assert.ok(range.start+range.count<=attr.array.length);}}
 const oldMs=median(old.map(x=>x.cpu)),newMs=median(next.map(x=>x.cpu));rows.push({name,hz,sprites:n,cycles,oldMs,newMs,deltaMs:newMs-oldMs,ratio:newMs/oldMs,old,next});
 for(const r of[...A,...B])destroy(r);
}
const extremes=[];
for(const rate of[2**-149,1e-40,1e-20,1e-10,1e-3,.06,.12,.3,.6,1,10,1e3,4e4,1e10,1e30,3.4028234663852886e38,Number.MAX_VALUE]){
 const states=[];for(const hz of[30,60,120]){const r=make(Next,'puffs',1);const p=r.pool.p;p[10]=rate;p[7]=2;p[11]=14;p[22]=.6;
   for(let k=0;k<hz/2;k++)r.pool.update(1/hz);
   states.push({hz,storedRate:p[10],finite:[...p.slice(0,6)].every(Number.isFinite),motion:[...p.slice(0,6)]});destroy(r);}
 extremes.push({rate,states});
}
const tinyTime=[];for(const rate of[2**-149,1e-20,1,1e30])for(const dt of[Number.MIN_VALUE,1e-300,1e-30,1e-6,.05]){const r=make(Next,'puffs',1);r.pool.p[10]=rate;r.pool.update(dt);tinyTime.push({rate,dt,finite:[...r.pool.p.slice(0,6)].every(Number.isFinite)});destroy(r);}
const a=new Kit(THREE,new THREE.Scene()),b=new Kit(THREE,new THREE.Scene());
const resources={drawPools:a.root.children.length,capacities:a.allPools.map(p=>({name:p.mesh.name,cap:p.cap||null,attributes:Object.fromEntries(Object.entries(p.mesh.geometry.attributes).filter(([name])=>name.startsWith('i')).map(([name,attr])=>[name,attr.count]))}))};a.dispose();b.dispose();fx.dispose();
const result={sourceCommit:execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim(),sourceSha256:createHash('sha256').update(source).digest('hex'),baselineSha256:createHash('sha256').update(before).digest('hex'),environment:{node:process.version,cpu:os.cpus()[0].model,logicalCpus:os.cpus().length},method:{samples,stepsPerCycle:3,activeWindow:'<=0.1s; reset outside timer; actual SpritePool update and dirty upload bookkeeping; alternating old/new sample order',clock:'process.cpuUsage over sample incl resets; performance.now separately summed per three-step cycle excluding resets',seed:'actual inkBlast radius6 =>72 puffs +1 spark; repeated state for full/half; alternating stress uses .8/1.12/1.6/2.2 rates'},resources,rows,extremes,tinyTime,checksum};
fs.mkdirSync(root+'/.ci-scratch/splash-cost-20261030', {recursive:true});
fs.writeFileSync(root+'/.ci-scratch/splash-cost-20261030/results.json',JSON.stringify(result,(_,value)=>typeof value==='number'&&!Number.isFinite(value)?String(value):value,2)+'\n');
console.log(JSON.stringify({rows:rows.map(({name,hz,sprites,oldMs,newMs,deltaMs,ratio})=>({name,hz,sprites,oldMs,newMs,deltaMs,ratio})),nonfiniteExtremes:extremes.filter(x=>x.states.some(s=>!s.finite)),nonfiniteTinyTime:tinyTime.filter(x=>!x.finite),resources,checksum},null,2));
