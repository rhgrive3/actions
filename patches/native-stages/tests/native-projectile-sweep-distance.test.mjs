import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 as V } from '../../../inkwave-public/vendor/three/build/three.core.js';
import { sweepNativeCatalogueSphere, sweepNativeLevelSphere } from '../runtime/native-projectile-sweep.mjs';
// Frozen main 7d5446 native sweep oracle (blob ebec4113); wrapper-only fixture.
// Real Vector3 numeric inputs; mocked triangle and moving-OBB results.
// No browser/FPS or source-triangle solver acceptance is claimed here.
function reference(){
// This module operates on vectors supplied by the caller rather than importing
// the entire native-stage engine or a second Three.js module instance.
const scratchVector = from => new from.constructor();
const dynamicViews=new WeakMap();
const catalogueViews=new WeakMap();
/** Catalogue projectiles use the same source triangles as legacy ink. Only
 * genuine moving game blocks enter the unchanged analytic OBB solver. */
function sweepNativeCatalogueSphere(physics,from,to,r0,r1,out,skipGrates,sweepOBB){
 const level=physics.level;
 let state=catalogueViews.get(level);
 if(!state){
  const view={get blocks(){return level.blocks;},get faces(){return level.faces;},queryBlocks:(minX,minZ,maxX,maxZ,out)=>level.queryDynamicBlocks(minX,minZ,maxX,maxZ,out)};
  state={physics:{level:view},options:{ignoreGrates:false,endRadius:0},hit:{point:scratchVector(from),normal:scratchVector(from)},sourceHit:{point:scratchVector(from),normal:scratchVector(from)}};catalogueViews.set(level,state);
 }
 state.options.ignoreGrates=skipGrates;state.options.endRadius=r1;
 const source=level.triangleWorld.sweepSphere(from,to,r0,state.options,state.sourceHit);
 const moving=level.blocks.length===level.staticBlockCount?null:sweepOBB(state.physics,from,to,r0,r1,state.hit,skipGrates);
 out.hit=false;out.dist=from.distanceTo(to);out.block=out.face=out.triangle=-1;out.u=out.v=0;
 if(moving?.hit&&(!source||moving.dist<source.distance)){
  out.hit=true;out.dist=moving.dist;out.point.copy(moving.point);out.normal.copy(moving.normal);
  out.block=moving.block;out.face=moving.face;out.u=moving.u||0;out.v=moving.v||0;return out;
 }
 if(!source)return out;
 out.hit=true;out.dist=source.distance;out.point.copy(source.point);out.normal.copy(source.normal);out.triangle=source.triangle;
 out.block=level.blockForTriangle(source.triangle);out.face=level.data.triangleFace[source.triangle];
 if(out.face>=0){const face=level.faces[out.face],x=out.point.x-face.origin.x,y=out.point.y-face.origin.y,z=out.point.z-face.origin.z;
  out.u=x*face.u.x+y*face.u.y+z*face.u.z;out.v=x*face.v.x+y*face.v.y+z*face.v.z;}
 return out;
}
/** Keep the original analytic OBB sweep for actual moving game entities. Source
 * chart rectangles and merged object AABBs describe bookkeeping, not solids. */
function sweepNativeLevelSphere(level,from,to,radius,out,skipGrates,sweepOBB){
 let state=dynamicViews.get(level);
 if(!state){
  const view={get blocks(){return level.blocks;},get faces(){return level.faces;},queryBlocks:(minX,minZ,maxX,maxZ,out)=>level.queryDynamicBlocks(minX,minZ,maxX,maxZ,out)};
  state={view,options:{ignoreGrates:false},hit:{point:scratchVector(from),normal:scratchVector(from)},sourceHit:{point:scratchVector(from),normal:scratchVector(from)}};dynamicViews.set(level,state);
 }
 state.options.ignoreGrates=skipGrates;
 const source=level.triangleWorld.sweepSphere(from,to,radius,state.options,state.sourceHit);
 const moving=level.blocks.length===level.staticBlockCount?null:sweepOBB(state.view,from,to,radius,state.hit,skipGrates);
 out.hit=false;out.dist=from.distanceTo(to);out.block=out.face=out.triangle=-1;out.u=out.v=0;
 if(moving?.hit&&(!source||moving.dist<source.distance)){
  out.hit=true;out.dist=moving.dist;out.point.copy(moving.point);out.normal.copy(moving.normal);
  out.block=moving.block;out.face=moving.face;out.u=moving.u||0;out.v=moving.v||0;return out;
 }
 if(!source)return out;
 out.hit=true;out.dist=source.distance;out.point.copy(source.point);out.normal.copy(source.normal);out.triangle=source.triangle;
 out.block=level.blockForTriangle(source.triangle);out.face=level.data.triangleFace[source.triangle];
 if(out.face>=0){const face=level.faces[out.face],x=out.point.x-face.origin.x,y=out.point.y-face.origin.y,z=out.point.z-face.origin.z;
  out.u=x*face.u.x+y*face.u.y+z*face.u.z;out.v=x*face.v.x+y*face.v.y+z*face.v.z;}
 return out;
}

return [sweepNativeCatalogueSphere,sweepNativeLevelSphere];
}
const old=reference(),neo=[sweepNativeCatalogueSphere,sweepNativeLevelSphere];
function fixture(i,edge=false){
 const vals=[NaN,Infinity,-Infinity,-0,0,Number.MIN_VALUE,1e308,-1e308];
 const dist=edge?vals[i%8]:(i%29)/7;
 const source=i%3?{distance:dist,point:new V(1,2,3),normal:new V(0,1,0),triangle:0}:null;
 const moving={hit:i%4!==0,dist:edge?vals[(i>>3)%8]:(i%31)/9,point:new V(4,5,6),normal:new V(1,0,0),block:3,face:2,u:-0,v:NaN};
 const events=[];
 const level={blocks:i%5?[]:[1],staticBlockCount:0,faces:[{origin:new V(0,0,0),u:new V(1,0,0),v:new V(0,0,1)}],data:{triangleFace:[i%2?0:-1]},triangleWorld:{sweepSphere(){events.push('source');return source;}},blockForTriangle(){events.push('block');return 4;},queryDynamicBlocks(){}};
 const from=new V(edge?vals[(i>>6)%8]:i%7,i%11,i%13),to=new V(i%17,i%19,i%23);
 const out={point:new V(-1,-2,-3),normal:new V(5,6,7)};
 const sweep=()=>{events.push('moving');return moving;};
 return {level,from,to,out,sweep,events};
}
function call(fn,k,f){return k===0?fn({level:f.level},f.from,f.to,.2,.3,f.out,false,f.sweep):fn(f.level,f.from,f.to,.2,f.out,false,f.sweep);}

for(const k of [0,1])test(`native sweep ${k} preserves numeric hit/no-hit results and query ordering`,()=>{
 for(let i=0;i<12000;i++){
  const a=fixture(i,i<2048),b=fixture(i,i<2048);
  assert.equal(call(old[k],k,a),a.out);assert.equal(call(neo[k],k,b),b.out);
  assert.deepEqual(b.out,a.out,`case ${i}`);assert.deepEqual(b.events,a.events);
  assert.deepEqual(b.from,a.from);assert.deepEqual(b.to,a.to);
 }
});
test('no-hit keeps full segment distance and untouched point/normal',()=>{
 for(const k of [0,1]){
  const f=fixture(0);f.level.blocks=[];f.level.triangleWorld.sweepSphere=()=>null;
  f.from=new V(1,2,3);f.to=new V(4,6,3);
  const p=f.out.point,n=f.out.normal;
  call(neo[k],k,f);
  assert.equal(f.out.dist,5);assert.equal(f.out.hit,false);
  assert.equal(f.out.point,p);assert.equal(f.out.normal,n);
  assert.deepEqual(p,new V(-1,-2,-3));assert.deepEqual(n,new V(5,6,7));
 }
});
