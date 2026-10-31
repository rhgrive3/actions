import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const f=await fixture({productionComposition:true,extraExports:"export {NativePhysics} from './patches/native-stages/runtime/native-physics.mjs';export {TriangleWorld} from './patches/native-stages/runtime/triangle-world.mjs';export {blasterBlastExposed} from './patches/splatoon3/runtime/blast-occlusion.mjs';"});
const {THREE,NativePhysics,TriangleWorld,Physics,PLAYER,blasterBlastExposed}=f;
function nextUp(n){const d=new DataView(new ArrayBuffer(8));d.setFloat64(0,n,false);d.setBigUint64(0,d.getBigUint64(0,false)+1n,false);return d.getFloat64(0,false);}
function wall(plane,angle=0){
 const axis=new THREE.Vector3(Math.sin(angle),0,Math.cos(angle)),normal=axis.clone().negate(),q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),angle);
 const coordinates=[-10,-10,plane,10,-10,plane,10,10,plane,-10,-10,plane,10,10,plane,-10,10,plane];
 const data=new Float32Array(coordinates.length);for(let i=0;i<coordinates.length;i+=3)new THREE.Vector3(...coordinates.slice(i,i+3)).applyQuaternion(q).toArray(data,i);
 const min=[0,1,2].map(k=>Math.min(...Array.from({length:6},(_,i)=>data[i*3+k]))),max=[0,1,2].map(k=>Math.max(...Array.from({length:6},(_,i)=>data[i*3+k])));
 const world=new TriangleWorld({triangles:data,normals:new Float32Array([...normal.toArray(),...normal.toArray()]),nodes:new Float64Array([...min,...max,-1,2]),order:new Uint32Array([0,1]),flags:new Uint8Array([1,1]),objectIds:new Uint32Array([0,0])});
 const physics=new NativePhysics({triangleWorld:world,blocks:[],faces:[],staticBlockCount:0,queryBlocks:()=>[],queryDynamicBlocks:()=>[],blockForTriangle:()=>-1,data:{triangleFace:new Int32Array([-1,-1])}});
 const center=axis.clone().multiplyScalar(nextUp(plane));center.y=.7;return{world,physics,center,normal,axis};
}
function actor(at){return{pos:at,form:'kid'};}
test('native Float32 triangles block full cover after one-ULP contact reconstruction at small and translated coordinates',()=>{
 for(const plane of [Math.fround(.42),1,100]){const s=wall(plane),before=s.center.clone(),normal=s.normal.clone();
  assert(s.world.hasCanonicalRay());const far=actor(new THREE.Vector3(0,0,plane+3)),near=actor(new THREE.Vector3(0,0,plane-3));
  assert.equal(blasterBlastExposed(s.physics,s.center,far,PLAYER,{normal:s.normal}),false);
  assert.equal(blasterBlastExposed(s.physics,s.center,near,PLAYER,{normal:s.normal}),true);
  assert(s.center.equals(before));assert(s.normal.equals(normal));assert(s.world.triangleTests>0);
 }
});
test('oblique and grazing native triangle visibility retains full-cover and incident-side admission',()=>{
 for(const angle of [Math.atan2(.6,.8),-Math.PI/4]){const s=wall(Math.fround(.42),angle),far=s.axis.clone().multiplyScalar(3),near=s.axis.clone().multiplyScalar(-3);far.y=near.y=0;
  assert.equal(blasterBlastExposed(s.physics,s.center,actor(far),PLAYER,{normal:s.normal}),false);
  assert.equal(blasterBlastExposed(s.physics,s.center,actor(near),PLAYER,{normal:s.normal}),true);
  const tangent=new THREE.Vector3(Math.cos(angle),0,-Math.sin(angle)).multiplyScalar(100);far.add(tangent);
  assert.equal(blasterBlastExposed(s.physics,s.center,actor(far),PLAYER,{normal:s.normal}),false,'grazing rays still cross the native plane');
 }
});
test('microscopic and ordinary OBB walls remain blocking without moving the physical contact',()=>{
 for(const thickness of [1e-7,1e-5,.001,.08]){const plane=.42,block={id:0,solid:true,grate:false,center:new THREE.Vector3(0,0,plane+thickness/2),half:new THREE.Vector3(10,10,thickness/2),axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)],faces:Array(6).fill(-1)},physics=new Physics({blocks:[block],faces:[],queryBlocks:()=>[0]}),center=new THREE.Vector3(0,.7,nextUp(plane)),normal=new THREE.Vector3(0,0,-1);
  assert.equal(blasterBlastExposed(physics,center,actor(new THREE.Vector3(0,0,3)),PLAYER,{normal}),false);
  assert.equal(blasterBlastExposed(physics,center,actor(new THREE.Vector3(0,0,-3)),PLAYER,{normal}),true);assert.equal(center.z,nextUp(plane));
 }
});
test('native LOS retains its existing target-end 0.05 distance exclusion on either side',()=>{
 const plane=Math.fround(.42),s=wall(plane),from=s.center.clone().addScaledVector(s.normal,1e-4);
 assert.equal(s.physics.los(from,new THREE.Vector3(0,.7,plane+.0499)),true);
 assert.equal(s.physics.los(from,new THREE.Vector3(0,.7,plane+.0501)),false);
});
test('legacy and unknown collision-normal inputs retain the unshifted original API and probes',()=>{
 assert.equal(blasterBlastExposed.length,4);const center={x:0,y:.7,z:0},target=actor({x:0,y:0,z:3});
 for(const collision of [null,{}, {normal:null},{normal:{x:NaN,y:0,z:-1}}]){const from=[],points=[];assert.equal(blasterBlastExposed({los(a,b){from.push(a);points.push([b.x,b.y,b.z]);return false;}},center,target,PLAYER,collision),false);assert.equal(from.length,7);assert(from.every(a=>a===center));assert.equal(points.length,7);}
});
