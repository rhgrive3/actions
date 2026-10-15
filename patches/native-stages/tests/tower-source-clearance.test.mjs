import test from 'node:test';import assert from 'node:assert/strict';
import {buildSourceBVH} from '../runtime/source-convert.mjs';
import {nativeTowerClearance} from '../runtime/native-tower-clearance.mjs';
import {nativeFixture} from './fixture.mjs';

const f=await nativeFixture(),body=f.PLAYER;
function source(ceilingY=4.6,x0=-2,x1=2,z0=-2,z1=2){
 const triangles=new Float32Array([
  -20,0,-20,20,0,-20,20,0,20,-20,0,-20,20,0,20,-20,0,20,
  x0,ceilingY,z0,x1,ceilingY,z0,x1,ceilingY,z1,x0,ceilingY,z0,x1,ceilingY,z1,x0,ceilingY,z1,
 ]),{nodes,order}=buildSourceBVH(triangles);
 return new f.NativeLevel({triangles,nodes,order,normals:new Float32Array([0,1,0,0,1,0,0,-1,0,0,-1,0]),flags:new Uint32Array(4).fill(1),objectIds:new Uint32Array(4),triangleFace:new Int32Array(4).fill(-1),mask:new Uint8Array(),manifest:{id:'tower-clearance-unit-fixture',bounds:{minX:-20,minZ:-20,maxX:20,maxZ:20},spawnPads:[[-10,.08,0],[10,.08,0]],spawnBarrier:1,objects:[],faces:[]}});
}
test('source ceiling rejects a raised deck and keeps supported lower clearance',()=>{
 const level=source(),check=nativeTowerClearance(level,body);
 assert.equal(check.clear([0,3.3,0]),false,'raised deck/pole/capsule overlaps unchanged source ceiling');
 assert.equal(check.clear([0,1.2,0]),true,'lower local lift clears the source ceiling and source floor');
 assert.equal(check.clear([0,.1,0]),false,'deck underside cannot intersect source floor');
 const board=lift=>{
  const L=f.G.level=source();f.G.physics=new f.NativePhysics(L);f.G.paint={sample:()=>0,splat:()=>0};
  L._addBlock({kind:'obox',center:[0,lift-.12,0],size:[2.4,.24,2.4],rotY:0,paint:false,hidden:true});const deck=L.blocks.at(-1).id;
  const actor=f.make();actor.grounded=false;actor.vel.set(0,0,0);actor.pos.set(.7,lift,0);actor._resolve(false,lift,false);
  return {grounded:actor.grounded,hit:actor.ground.hit,block:actor.ground.block,deck,ceiling:actor.contacts.ceiling};
 };
 const obstructed=board(3.3);assert.equal(obstructed.ceiling,true);assert.equal(obstructed.grounded,false);
 const supported=board(1.2);assert.equal(supported.hit,true);assert.equal(supported.grounded,true);assert.equal(supported.block,supported.deck);
});
test('full swept route rejects a thin source ceiling between individually clear endpoints',()=>{
 const check=nativeTowerClearance(source(4,-.05,.05,-.05,.05),body);
 assert.equal(check.clear([-5,3.3,0]),true);assert.equal(check.clear([5,3.3,0]),true);
 assert.equal(check.clear([-5,3.3,0],[5,3.3,0]),false,'endpoint probes cannot certify an obstructed route');
});
test('deck footprint, full live capsule envelope, and tall tower pole all retain source collision',()=>{
 assert.equal(nativeTowerClearance(source(3.2,1.45,1.55,-.1,.1),body).clear([0,3.3,0]),false,'source under a rotating deck corner');
 assert.equal(nativeTowerClearance(source(4,1.95,2.02,-.1,.1),body).clear([0,3.3,0]),false,'human capsule on the deck edge extends beyond the deck footprint');
 assert.equal(nativeTowerClearance(source(5.1,-.1,.1,-.1,.1),body).clear([0,3.3,0]),false,'tower pole extends above human headroom');
 assert.equal(nativeTowerClearance(source(10),{radius:.8,height:7}).clear([0,3.3,0]),false,'uses changed live capsule dimensions');
});
