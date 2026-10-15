#!/usr/bin/env node
// Actual production-composed NativePhysics on identical synthetic overlapping
// triangles. Alternating component CPU timings are not game/device FPS.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import {fixture} from '../patches/splatoon3/tests/source-fixture.mjs';
import {adaptBuildSource} from './inkwave-source-composition.mjs';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {setup,geometry,flatten,oldWorld,oldPhysics} from '../patches/native-stages/tests/fixtures/bvh-query-fixture.mjs';
if(process.env.INKWAVE_BUILT_SITE)throw Error('Source CPU comparison requires identical VM/module composition for both variants.');
const f=await setup(),baseline=await fixture({productionComposition:true,adaptRuntime:(rel,s)=>adaptBuildSource(rel,rel==='patches/native-stages/runtime/triangle-world.mjs'?oldWorld:rel==='patches/native-stages/runtime/native-physics.mjs'?oldPhysics:s),extraExports:"export {NativeLevel,NativePhysics} from './patches/native-stages/runtime/engine.mjs';"});
const level=new baseline.NativeLevel(geometry()),pairs={before:{level,world:level.triangleWorld,physics:new baseline.NativePhysics(level)},after:f.make()},V=f.V;
const inputs=Array.from({length:300},(_,i)=>({origin:V((i%19-9)*.4,3+(i%7)*.2,(i%13-6)*.4),dir:i%4?V(0,-1,0):V(.3,-.8,.1).normalize(),feet:V((i%23-11)*.4,(i%9)*.3,0),grate:i%2===0}));
const out=new f.Hit(),parityBefore=new f.Hit(),parityAfter=new f.Hit();
// Complete equivalence outside measured windows, including every Hit field.
for(const input of inputs){const {origin,dir,feet,grate}=input;const a=pairs.before.physics,b=pairs.after.physics;
 assert.deepEqual(flatten(a.raycast(origin,dir,12,parityBefore,grate)),flatten(b.raycast(origin,dir,12,parityAfter,grate)));
 if(a.bodyFits(feet,.38,.1,1.45,grate)!==b.bodyFits(feet,.38,.1,1.45,grate))throw Error('Fit parity');
}
const run=(variant,kind,loops)=>{const p=pairs[variant].physics;let checksum=0;
 for(let k=0;k<loops;k++)for(const {origin,dir,feet,grate}of inputs){if(kind==='raycast'){p.raycast(origin,dir,12,out,grate);checksum+=out.hit?out.dist:0;}else checksum+=p.bodyFits(feet,.38,.1,1.45,grate)?1:0;}
 return checksum;
};
const results=[];
for(const kind of ['raycast','bodyFits']){
 for(const variant of ['before','after','after','before'])run(variant,kind,10);
 for(const variant of ['before','after','after','before','before','after','after','before']){
  const cpu0=process.cpuUsage(),t=performance.now(),checksum=run(variant,kind,50),ms=performance.now()-t,cpu=process.cpuUsage(cpu0);
  results.push({kind,variant,queries:inputs.length*50,checksum,ms,cpu});
 }
}
for(const kind of ['raycast','bodyFits'])if(new Set(results.filter(r=>r.kind===kind).map(r=>r.checksum)).size!==1)throw Error('Measured checksum mismatch');
// Count real construction and clone calls in the exact before/after world
// bodies, using the same THREE implementation with a counting subclass.
// The source-level count complements timing; it is not a heap-size estimate.
const {unmodule}=await import('../patches/native-stages/tests/fixtures/bvh-query-fixture.mjs');
const currentWorld=fs.readFileSync(new URL('../patches/native-stages/runtime/triangle-world.mjs',import.meta.url),'utf8'),currentPhysics=fs.readFileSync(new URL('../patches/native-stages/runtime/native-physics.mjs',import.meta.url),'utf8');
const allocations={};
for(const variant of ['before','after']){
 let vectors=0;class CountVector extends f.THREE.Vector3{constructor(...a){super(...a);vectors++;}}
 const THREE={...f.THREE,Vector3:CountVector};
 const W=new Function('THREE',unmodule(variant==='before'?oldWorld:currentWorld)+'\nreturn TriangleWorld;')(THREE);
 const P=new Function('THREE','Physics','Hit',unmodule(variant==='before'?oldPhysics:currentPhysics)+'\nreturn NativePhysics;')(THREE,f.Physics,f.Hit);
 const level=new f.NativeLevel(geometry());level.triangleWorld=new W(level.data);const p=new P(level),origin=new CountVector(0,6,0),dir=new CountVector(0,-1,0),hit=new f.Hit();
 p.raycast(origin,dir,12,hit);vectors=0;let hits=0;
 for(let i=0;i<1000;i++)hits+=p.raycast(origin,dir,12,hit).hit?1:0;
 allocations[variant]={queries:1000,hits,vectorConstructions:vectors};
}
if(allocations.before.hits!==1000||allocations.before.vectorConstructions!==2000||allocations.after.hits!==1000||allocations.after.vectorConstructions!==0)throw Error('Unexpected allocation count');
const summary={};for(const kind of ['raycast','bodyFits']){summary[kind]={};for(const variant of ['before','after']){const values=results.filter(r=>r.kind===kind&&r.variant===variant).map(r=>r.ms).sort((a,b)=>a-b);summary[kind][variant]={medianMs:(values[1]+values[2])/2,minMs:values[0],maxMs:values[3]};}}
const result={schema:1,component:'NativePhysics BVH query lifetime',runtime:'production-composed source; separate identical VM fixtures',environment:{node:process.version,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length},baseline:{commit:'ee06c87fc623cc793ebf9aaffd3ffc3a5081c60a',worldSha256:createHash('sha256').update(oldWorld).digest('hex'),physicsSha256:createHash('sha256').update(oldPhysics).digest('hex')},inputs:{queries:inputs.length,triangles:geometry().triangles.length/9,synthetic:true},allocations,summary,results,limits:['CPU component on synthetic dense geometry; no whole-game/browser/mobile FPS claim.','Timing includes shared-host noise; samples alternate before/after order.','Vector counter executes exact source bodies with a counting THREE subclass; timing uses actual production-composed source constructors.','Caller-owned Hit supplied for both variants; default ray results remain independently owned.']};
const at=process.argv.indexOf('--out');if(at>=0)fs.writeFileSync(process.argv[at+1],JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({summary,allocations}));
