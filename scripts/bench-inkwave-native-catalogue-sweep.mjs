#!/usr/bin/env node
// Original-source collision caller workload. This is a CPU component measure,
// with no render, Actor movement, hardware FPS or full-match speedup claim.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fixture} from '../patches/splatoon3/tests/source-fixture.mjs';
import {adaptBuildSource} from './inkwave-source-composition.mjs';
import {readStage} from '../patches/native-stages/tests/fixture.mjs';

const root=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]);
const catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json')));
const f=await fixture({fullRuntime:true,realProjectiles:true,adaptNative:adaptBuildSource,adaptRuntime:adaptBuildSource,
 extraExports:"export {NativeLevel,NativePhysics} from './patches/native-stages/runtime/engine.mjs'; export {sweptWorldHit} from './patches/splatoon3/runtime/weapons-collision.mjs';"});
let ReferenceWorld;
if(process.env.NATIVE_SWEEP_REFERENCE_RUNTIME){
 globalThis.__nativeSweepReferenceTHREE=f.THREE;
 const source=fs.readFileSync(process.env.NATIVE_SWEEP_REFERENCE_RUNTIME,'utf8').replace("import * as THREE from 'three';","const THREE=globalThis.__nativeSweepReferenceTHREE;");
 ReferenceWorld=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).TriangleWorld;
}
const V=()=>new f.THREE.Vector3(),stats=values=>{const s=values.toSorted((a,b)=>a-b);return{samples:s.length,p50:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)],p99:s[Math.floor(s.length*.99)],max:s.at(-1)};};
const rows=[];
for(const stage of catalog.stages){
 const data=readStage(root,stage.id),level=new f.NativeLevel(data),physics=new f.NativePhysics(level),world=level.triangleWorld;
 const reference=ReferenceWorld?new ReferenceWorld(data):null;
 const hash=()=>crypto.createHash('sha256').update(Buffer.from(data.triangles.buffer)).update(Buffer.from(data.flags.buffer)).update(Buffer.from(data.mask.buffer)).digest('hex'),before=hash();
 const cases=[];
 for(let i=0;i<16;i++){
  const id=Math.floor((i+.5)*world.triangleCount/16),t=world.triangle(id),center=t.a.clone().add(t.b).add(t.c).multiplyScalar(1/3),normal=new f.THREE.Vector3().fromArray(data.normals,id*3);
  for(const [kind,r0,r1] of [['fixed',.2,.2],['growing',.1,.8],['shrinking',.8,.1]])cases.push({kind,r0,r1,from:center.clone().addScaledVector(normal,1.2),to:center.clone().addScaledVector(normal,-1.2),sourceTriangle:id,hit:{point:V(),normal:V()}});
 }
 const invoke=c=>f.sweptWorldHit(physics,c.from,c.to,c.r0,c.r1,c.hit,false);
 if(reference)for(const c of cases){
  const before=reference.sweepSphere(c.from,c.to,c.r0,{endRadius:c.r1}),after=world.sweepSphere(c.from,c.to,c.r0,{endRadius:c.r1});
  assert.equal(!!after,!!before,stage.id+' hit eligibility');
  if(before){
   const label=stage.id+' '+c.kind+' source triangle '+c.sourceTriangle;
   assert.equal(after.triangle,before.triangle,label+' contact triangle');
   assert.equal(after.flags,before.flags,label+' flags');assert.equal(after.object,before.object,label+' object');
   assert(Math.abs(after.time-before.time)<2e-7,label+' time');
   assert(after.point.distanceTo(before.point)<2e-6,label+' point');assert(after.normal.distanceTo(before.normal)<2e-6,label+' normal');
  }
 }
 const controls=cases.map(c=>{const h=invoke(c);assert.equal(h.hit,true,'submitted source-crossing sphere must hit '+stage.id);return{hit:h.hit,triangle:h.triangle,block:h.block,face:h.face,distance:h.dist,point:h.point.toArray(),normal:h.normal.toArray()};});
 for(let warm=0;warm<4;warm++)for(const c of cases)invoke(c);
 const measurements=[];
 for(let round=0;round<8;round++){
  const order=round%2?[...cases.keys()].reverse():[...cases.keys()];
  for(const index of order){const c=cases[index],q=world.queryCount,t=world.triangleTests,start=performance.now(),h=invoke(c),milliseconds=performance.now()-start;
   const result={hit:h.hit,triangle:h.triangle,block:h.block,face:h.face,distance:h.dist,point:h.point.toArray(),normal:h.normal.toArray()};assert.deepEqual(result,controls[index],'warmed repeat changes source collision authority');
   measurements.push({round,index,kind:c.kind,milliseconds,sourceQueries:world.queryCount-q,sourceTriangleTests:world.triangleTests-t});
  }
 }
 assert.equal(hash(),before,'benchmark changed source geometry/flags/mask');
 const row={id:stage.id,sourceSha256:data.manifest.sourceSha256,sourceBuffersUnchanged:true,referenceComparison:reference?{queries:cases.length,hitAndTriangleAndFlagsAndObjectExact:true,timeTolerance:2e-7,pointAndNormalTolerance:2e-6}:null,syntheticSourceCenteredSegments:cases.length,measuredQueries:measurements.length,
  costs:Object.fromEntries(['fixed','growing','shrinking'].map(kind=>{const m=measurements.filter(x=>x.kind===kind);return[kind,{millisecondsPerQuery:stats(m.map(x=>x.milliseconds)),sourceTriangleTests:stats(m.map(x=>x.sourceTriangleTests))}];})),measurements};
 rows.push(row);console.log(JSON.stringify({id:row.id,costs:row.costs}));
}
const bindings=Object.fromEntries(['patches/native-stages/adapter.mjs','patches/native-stages/runtime/triangle-world.mjs','patches/native-stages/runtime/sphere-triangle-entry.mjs','patches/native-stages/runtime/native-projectile-sweep.mjs','patches/splatoon3/runtime/weapons-collision.mjs'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
const report={status:'passed',scope:'16 evenly spaced original triangles per stage; source-centred synthetic 2.4-unit segments, fixed/growing/shrinking field radii; four warm rounds, eight alternating-order measured rounds; caller hit/point/normal/IDs repeat exactly; source data unchanged. Node CPU component only, no hardware/render/full-match guarantee or timing comparison against the incorrect OBB route.',sourcePin:catalog.sourceCommit,bindings,stages:rows};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
