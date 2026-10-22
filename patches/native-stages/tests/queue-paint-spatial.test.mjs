import test from 'node:test';import assert from 'node:assert/strict';
import {fixture}from'../../splatoon3/tests/source-fixture.mjs';
import {nativeFixture}from'./fixture.mjs';
test('canonical legacy grid point queries match real Level pointInside at hash boundaries, rotated blocks and overrides',async()=>{
 const f=await fixture({extraExports:"export {Level} from './inkwave-public/src/world/level.js';"}),{Level,THREE}=f;
 const layout={bounds:{minX:-20,maxX:20,minZ:-20,maxZ:20},spawnPads:[[0,0,0],[1,0,1]],spawnBarrier:0,half:[],single:[]};
 let word=31;const random=()=>((word=(Math.imul(word,1664525)+1013904223)>>>0)/4294967296);
 for(let i=0;i<45;i++)layout.single.push({kind:'obox',center:[(random()-.5)*35,(random()-.5)*5,(random()-.5)*35],size:[1+random()*7,1+random()*6,1+random()*7],rotY:random()*180,solid:i%7!==0});
 const level=new Level(layout);let fast=0;
 for(let i=0;i<18000;i++){
  const x=i%3===0?level.hx0+4*(i%12)+[0,.009,.011,-.009,-.011][i%5]:(random()-.5)*70,z=(random()-.5)*70,p=new THREE.Vector3(x,(random()-.5)*15,z),exclude=i%46-1;
  const before=level._stamp,actual=level.pointInsideGrid(p,exclude);if(level._stamp===before)fast++;
  assert.equal(actual,level.pointInside(p,0,exclude),'sample '+i);
 }
 assert.ok(fast>1000,'the exact single-cell path was exercised');
 const native=level.pointInside;let overridden=0;level.pointInside=function(...args){overridden++;return native.apply(this,args);};
 level.pointInsideGrid(new THREE.Vector3(1,1,1),-1);assert.equal(overridden,1);
});
test('identical static native chart bounds skip chunk re-enumeration and clear/move invalidate the memo',async()=>{
 const f=await nativeFixture(),{THREE}=f,g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,2,0,0,0,0,2,100,0,100,102,0,100,100,0,102],3));
 const face=(x,z,tri)=>({origin:new THREE.Vector3(x,0,z),u:new THREE.Vector3(1,0,0),v:new THREE.Vector3(0,0,1),su:2,sv:2,atlas:{pad:1,ppm:4},triangles:[tri]});
 const faces=[face(0,0,0),face(100,100,1)],paint={paintFaces:faces,grid:new Uint8Array(2),_pushQuad(){},clear(){}};
 const mesh=new f.NativeInkMesh(g,new THREE.MeshBasicMaterial());mesh.bindPaint(paint);
 let queries=0;const original=mesh._faceChunks;mesh._faceChunks=function(...args){queries++;return original.apply(this,args);};
 paint._pushQuad(faces[0],0,1,0,1);const first=queries;assert.ok(first>0);assert.equal(mesh._paintedCount,1);
 paint._pushQuad(faces[0],0,1,0,1);assert.equal(queries,first);
 paint.clear();paint._pushQuad(faces[0],0,1,0,1);assert.equal(queries,first+1);
 faces[0].origin.set(100,0,100);paint._pushQuad(faces[0],0,1,0,1);assert.equal(queries,first+2);assert.equal(mesh._paintedCount,2);
 mesh.dispose();mesh.material.dispose();
});
