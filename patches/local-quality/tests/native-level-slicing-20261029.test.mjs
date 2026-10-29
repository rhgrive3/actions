import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import{nativeFixture}from'../../native-stages/tests/fixture.mjs';
import{buildSourceBVH}from'../../native-stages/runtime/source-convert.mjs';
import{assertSourceTerrainObjects}from'../../native-stages/runtime/source-terrain-contract.mjs';
const f=await nativeFixture();
function input(count){const triangles=new Float32Array([-2,0,-2,2,0,2,2,0,-2]),face={origin:[-2,0,-2],u:[1,0,0],v:[0,0,1],n:[0,1,0],su:4,sv:4,nu:4,nv:4,cu:1,cv:1,grid:0,object:0,triangles:[0],bounds:[[-2,0,-2],[2,0,2]]};return{triangles,normals:new Float32Array([0,1,0]),flags:new Uint32Array([3]),objectIds:new Uint32Array([0]),...buildSourceBVH(triangles),triangleFace:new Int32Array([0]),mask:new Uint8Array(16).fill(1),manifest:{id:'slice-test',bounds:{minX:-2,maxX:2,minZ:-2,maxZ:2},spawnPads:[[0,0,0],[1,0,1]],spawnBarrier:.1,faces:Array.from({length:count},()=>structuredClone(face)),objects:Array.from({length:count+3},(_,i)=>({collidable:i%3!==0,bounds:face.bounds}))}}}
const first=new f.NativeLevel(input(1)),Level=Object.getPrototypeOf(f.NativeLevel),TriangleWorld=first.triangleWorld.constructor;
const frozen=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-world-native-extra-before-20261029.json',import.meta.url)))['patches/native-stages/runtime/native-level.mjs'];
const Before=new Function('THREE','Level','TriangleWorld','assertSourceTerrainObjects',frozen.replace(/^import .*;$/gm,'').replaceAll('export ','')+'\nreturn NativeLevel;')(f.THREE,Level,TriangleWorld,assertSourceTerrainObjects);
const snap=x=>structuredClone(Object.fromEntries(['faces','blocks','hash','blockStamp','objectBlock','staticBlockCount','hx0','hz0','hw','hd','hashCell','homeSuperJumpPoints'].map(k=>[k,x[k]])));
test('sliced native faces and blocks preserve independently frozen constructor ordering, identities and complete hash cells',async()=>{
 for(const count of [0,1,127,128,129,513]){const data=input(count),before=new Before(data),sync=new f.NativeLevel(data);let yields=0;const after=await f.NativeLevel.create(data,{budgetMilliseconds:0,yieldTask:async()=>{yields++}});assert.deepEqual(snap(after),snap(before));assert.deepEqual(snap(sync),snap(before));assert.ok(yields>=2);for(let i=0;i<after.faces.length;i++){assert.equal(after.blocks[i].axes[0],after.faces[i].u);assert.equal(after.blocks[i].color,after.faces[i].color);}assert.equal(data.manifest.faces.length,count);}
});
test('abort and superseded native candidates never publish a partial Level or mutate authenticated input',async()=>{
 for(const mode of ['abort','supersede']){const data=input(300),controller=new AbortController();let live=true,yields=0;await assert.rejects(f.NativeLevel.create(data,{signal:controller.signal,current:()=>live,budgetMilliseconds:0,yieldTask:async()=>{yields++;if(mode==='abort')controller.abort();else live=false}}),{name:'AbortError'});assert.equal(yields,1);assert.equal(data.manifest.faces.length,300);assert.ok(data.manifest.faces.every(x=>!('atlas'in x)));}
});
