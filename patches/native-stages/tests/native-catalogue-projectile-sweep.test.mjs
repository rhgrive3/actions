import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';

const f=await fixture({fullRuntime:true,realProjectiles:true,adaptNative:adaptBuildSource,adaptRuntime:adaptBuildSource,
 extraExports:"export {NativeLevel,NativePhysics} from './patches/native-stages/runtime/engine.mjs'; export {sweptWorldHit} from './patches/splatoon3/runtime/weapons-collision.mjs';"});
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
