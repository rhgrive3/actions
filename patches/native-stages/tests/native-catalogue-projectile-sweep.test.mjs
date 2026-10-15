import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {readStage} from './fixture.mjs';

const f=await fixture({fullRuntime:true,realProjectiles:true,adaptNative:adaptBuildSource,adaptRuntime:adaptBuildSource,
 extraExports:"export {NativeLevel,NativePhysics} from './patches/native-stages/runtime/engine.mjs'; export {sweptWorldHit} from './patches/splatoon3/runtime/weapons-collision.mjs'; export {sphereTriangleEntry} from './patches/native-stages/runtime/sphere-triangle-entry.mjs';"});
const V=(x,y,z)=>new f.THREE.Vector3(x,y,z);
function stage(flags=3,paint=true){
 return new f.NativeLevel({manifest:{id:'synthetic-catalogue-sweep',bounds:{minX:-10,minZ:-10,maxX:10,maxZ:10},spawnPads:[[-5,0,0],[5,0,0]],spawnBarrier:0,
  faces:[{n:[1,0,0],u:[0,1,0],v:[0,0,1],origin:[0,0,0],su:2,sv:2,bounds:[[0,0,0],[0,2,2]],triangles:[0]}],
  objects:[{collidable:true,grate:!!(flags&4),bounds:[[-10,-10,-10],[10,10,10]]}]},
  triangles:new Float32Array([0,0,0,0,2,0,0,0,2]),normals:new Float32Array([1,0,0]),flags:new Uint32Array([flags]),objectIds:new Uint32Array([0]),
  nodes:new Float32Array([0,0,0,0,2,2,-1,1]),order:new Uint32Array([0]),triangleFace:new Int32Array([paint?0:-1]),mask:new Uint8Array([1])});
}
const close=(a,b,tol=2e-6)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
function sweep(level,from,to,r0=.2,r1=r0,skip=true){return f.sweptWorldHit(new f.NativePhysics(level),V(...from),V(...to),r0,r1,{point:V(0,0,0),normal:V(0,0,0)},skip);}

test('catalogue collision bypasses enclosing source bookkeeping boxes and hits the actual thin triangle',()=>{
 const level=stage();level.native=false;const before=sweep(level,[-5,.5,.5],[5,.5,.5]);level.native=true;
 assert.equal(before.hit,true);assert.equal(before.dist,0);assert.equal(before.face,-1);
 const actual=sweep(level,[-5,.5,.5],[5,.5,.5]);assert.equal(actual.hit,true);assert.equal(actual.triangle,0);assert.equal(actual.face,0);
 close(actual.dist,4.8);close(actual.point.x,0);close(actual.point.y,.5);close(actual.normal.x,-1);
 const empty=sweep(level,[-5,1.7,1.7],[5,1.7,1.7],.1);assert.equal(empty.hit,false);assert.equal(empty.triangle,-1);assert.equal(empty.block,-1);assert.equal(empty.face,-1);
});
test('catalogue source time of impact preserves linearly changing field radii',()=>{
 const level=stage(),hit=sweep(level,[-3,.5,.5],[3,.5,.5],.1,.8);
 assert.equal(hit.hit,true);assert.equal(hit.triangle,0);close(hit.dist,6*2.9/6.7);
 const stationary=sweep(level,[-.5,.5,.5],[-.5,.5,.5],.1,.8);assert.equal(stationary.hit,true);close(stationary.point.x,0);
 assert.equal(sweep(level,[-.5,.5,.5],[-.5,.5,.5],.1,.4).hit,false);
 const shrinking=sweep(level,[-3,.5,.5],[3,.5,.5],.8,.1);close(shrinking.dist,6*2.2/5.3);
 // Both endpoints miss, but the changing sphere enters the rounded edge.
 const edge=sweep(level,[-2,-.3,0],[2,-.3,0],.4,.7);
 const expected=(16.24-Math.sqrt(16.24**2-4*15.91*3.93))/(2*15.91);
 assert.equal(edge.hit,true);close(edge.dist,4*expected);
 // A maximum-radius substitute would report this earlier segment as a hit.
 assert.equal(sweep(level,[-2,-.3,0],[2,-.3,0],.35,.35).hit,true);
 assert.equal(sweep(level,[-2,-.3,0],[2,-.3,0],.1,.35).hit,false);
});
test('catalogue source edge and NoPaint collision remain distinct from paint and grate eligibility',()=>{
 const hit=sweep(stage(),[-5,1.1,1.1],[5,1.1,1.1]);assert.equal(hit.hit,true);close(hit.dist,5-Math.sqrt(.2**2-2*.1**2));
 const opaque=sweep(stage(1,false),[-5,.5,.5],[5,.5,.5]);assert.equal(opaque.hit,true);assert.equal(opaque.face,-1);assert.equal(opaque.triangle,0);
 const grate=stage(7);assert.equal(sweep(grate,[-5,.5,.5],[5,.5,.5]).hit,false);assert.equal(sweep(grate,[-5,.5,.5],[5,.5,.5],.2,.2,false).hit,true);
});
test('catalogue actual moving OBBs retain their original growing-radius solver and nearest-hit priority',()=>{
 const level=stage(),id=level.blocks.length;
 level.blocks.push({id,solid:true,grate:false,center:V(-2,1,1),half:V(.5,.5,.5),axes:[V(1,0,0),V(0,1,0),V(0,0,1)],aabbMin:V(-2.5,.5,.5),aabbMax:V(-1.5,1.5,1.5),faces:[-1,-1,-1,-1,-1,-1]});
 const actual=sweep(level,[-5,1,1],[5,1,1],.1,.8);assert.equal(actual.block,id);assert.equal(actual.triangle,-1);close(actual.dist,10*2.4/10.7);close(actual.point.x,-2.5);
 const source=sweep(level,[5,.6,.6],[-5,.6,.6]);assert.equal(source.triangle,0);close(source.dist,4.8);
});

test('changing source spheres agree with independent signed-plane and rounded-edge entry equations',()=>{
 const level=stage();let seed=0x14192026;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 const entry=(x0,x1,r0,r1,offsetSquared)=>{
  if(x0*x0+offsetSquared<=r0*r0)return 0;
  const d=x1-x0,dr=r1-r0,A=d*d-dr*dr,B=2*(x0*d-r0*dr),C=x0*x0+offsetSquared-r0*r0;
  let roots;
  if(Math.abs(A)<1e-13)roots=Math.abs(B)<1e-13?[]:[-C/B];
  else {const disc=B*B-4*A*C;roots=disc<0?[]:[(-B-Math.sqrt(disc))/(2*A),(-B+Math.sqrt(disc))/(2*A)];}
  const times=roots.filter(t=>t>=0&&t<=1).sort((a,b)=>a-b);return times[0]??null;
 };
 const cases=[[-3,3,.1,.8],[-3,3,.8,.1],[-.5,-.5,.1,.8],[-.5,-.5,.1,.4],[3,3,.2,.1],[-.2,3,.3,.1],[-3,-1,.2,.8],[-3,-.2,.8,.3],[-1,1,0,0]];
 for(let i=0;i<2048;i++)cases.push([(random()-.5)*10,(random()-.5)*10,random()*1.5,random()*1.5]);
 for(const offset of [0,.02])for(const [x0,x1,r0,r1] of cases){
  const y=offset?1.1:.5,expected=entry(x0,x1,r0,r1,offset),actual=sweep(level,[x0,y,y],[x1,y,y],r0,r1);
  assert.equal(actual.hit,expected!==null,JSON.stringify({x0,x1,r0,r1,offset,expected,actual}));
  if(actual.hit)close(actual.dist,Math.abs(x1-x0)*expected,2e-6);
 }
});

const sourceRoot=process.env.NATIVE_CATALOGUE_SWEEP_ASSETS;
test('recorded Bluefin Luna first step clears the original source instead of terminating inside its fence box',{
 skip:!sourceRoot||!fs.existsSync(path.join(sourceRoot,'bluefin','manifest.json'))
},()=>{
 const data=readStage(sourceRoot,'bluefin'),level=new f.NativeLevel(data);
 assert.equal(data.manifest.sourceSha256,'e6effc27b375336108429c8c1fc7cd93dc5e8e1559b1b2e0cde6d98d65853527');
 const hash=()=>Object.fromEntries(Object.entries(data).filter(([,v])=>ArrayBuffer.isView(v)).map(([k,v])=>[k,crypto.createHash('sha256').update(Buffer.from(v.buffer,v.byteOffset,v.byteLength)).digest('hex')]));
 const before=hash(),from=[-9.850947775165292,12.646202029552374,-57.598138544525106],to=[-9.848438463982268,12.266427396086442,-56.81540938885681];
 level.native=false;const legacy=sweep(level,from,to);assert.equal(legacy.hit,true);assert.equal(legacy.dist,0);assert.equal(legacy.face,-1);
 level.native=true;const actual=sweep(level,from,to);assert.equal(actual.hit,false);assert.equal(actual.block,-1);assert.equal(actual.face,-1);assert.equal(actual.triangle,-1);close(actual.dist,.87,1e-10);
 assert.deepEqual(hash(),before,'all ten original source buffers remain exact');
});

// Independent distance oracle: convex minimisation and bisection, without
// using the face/edge/vertex equations implemented by the production kernel.
test('analytic entry agrees with an independent convex-distance oracle in arbitrary orientations',()=>{
 let seed=0x20261014;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 const vector=scale=>V((random()-.5)*scale,(random()-.5)*scale,(random()-.5)*scale);
 const probe=V(),normal=V(),position=V(),closest=V();
 for(let i=0;i<12000;i++){
  const triangle=new f.THREE.Triangle(vector(8),vector(8),vector(8));
  const from=vector(12),delta=i%17===0?V():vector(20),r0=i%19===0?0:random()*2,r1=i%3===0?r0:random()*2;
  const gap=t=>{position.copy(from).addScaledVector(delta,t);triangle.closestPointToPoint(position,closest);return position.distanceTo(closest)-r0-(r1-r0)*t;};
  let expected=Infinity;
  if(gap(0)<=1e-10)expected=0;
  else {
   let lo=0,hi=1;const ratio=(Math.sqrt(5)-1)/2;
   let a=hi-ratio*(hi-lo),b=lo+ratio*(hi-lo),fa=gap(a),fb=gap(b);
   for(let j=0;j<96;j++){if(fa<=fb){hi=b;b=a;fb=fa;a=hi-ratio*(hi-lo);fa=gap(a);}else{lo=a;a=b;fa=fb;b=lo+ratio*(hi-lo);fb=gap(b);}}
   let end=fa<=fb?a:b;if(gap(1)<=1e-10)end=1;
   if(gap(end)<=1e-10){lo=0;hi=end;for(let j=0;j<64;j++){const mid=(lo+hi)/2;if(gap(mid)<=1e-10)hi=mid;else lo=mid;}expected=hi;}
  }
  const actual=f.sphereTriangleEntry(triangle,from,delta,r0,r1-r0,probe,normal);
  assert.equal(actual===Infinity,expected===Infinity,'case '+i);
  if(expected!==Infinity)close(actual,expected,2e-7);
 }
});
