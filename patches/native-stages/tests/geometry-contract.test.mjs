import test from 'node:test';import assert from 'node:assert/strict';
import {nativeFixture} from './fixture.mjs';
function data(){
 const triangles=new Float32Array([-3,0,-3, 3,0,-3, 3,0,3, -3,0,-3, 3,0,3, -3,0,3,
  -2,2,-2, 2,2,-2, 2,2,2, -2,2,-2, 2,2,2, -2,2,2,
  -3,0,3, 3,0,3, 3,4,3, -3,0,3, 3,4,3, -3,4,3]);
 return {triangles,normals:new Float32Array([0,1,0,0,1,0,0,1,0,0,1,0,0,0,-1,0,0,-1]),flags:new Uint32Array([3,3,5,5,3,3]),objectIds:new Uint32Array([0,0,1,1,2,2]),nodes:new Float32Array([-3,0,-3,3,4,3,-1,6]),order:new Uint32Array([0,1,2,3,4,5]),triangleFace:new Int32Array([0,0,-1,-1,1,1]),mask:new Uint8Array(6*6+6*4).fill(1),manifest:{id:'synthetic',bounds:{minX:-3,maxX:3,minZ:-3,maxZ:3},spawnPads:[[0,0,-2],[0,0,2]],spawnBarrier:.5,gridCells:60,objects:[{collidable:true,bounds:[[-3,0,-3],[3,0,3]]},{collidable:true,grate:true,bounds:[[-2,2,-2],[2,2,2]]},{collidable:true,bounds:[[-3,0,3],[3,4,3]]}],faces:[
 {origin:[-3,0,-3],u:[1,0,0],v:[0,0,1],n:[0,1,0],su:6,sv:6,nu:6,nv:6,cu:1,cv:1,grid:0,object:0,triangles:[0,1],bounds:[[-3,0,-3],[3,0,3]]},
 {origin:[-3,0,3],u:[1,0,0],v:[0,1,0],n:[0,0,-1],su:6,sv:4,nu:6,nv:4,cu:1,cv:1,grid:36,object:2,triangles:[4,5],bounds:[[-3,0,3],[3,4,3]]},
 ]}};
}
test('triangle controller respects grate permeability, walls, lifted body and dynamic tower boxes',async()=>{
 const f=await nativeFixture(),{THREE}=f,L=new f.NativeLevel(data()),P=new f.NativePhysics(L),V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z),down=V(0,-1,0);
 assert.equal(P.raycast(V(0,3,0),down,5).point.y,2);
 assert.equal(P.raycast(V(0,3,0),down,5,new f.Hit(),true).point.y,0);
 assert.equal(P.raycast(V(4,3,0),down,5).hit,false,'a chart rectangle cannot create floor beyond the mesh');
 const pos=V(0,0,2.85),c=f.makeContacts();P.collideBody(pos,.38,.3,1.45,c,true);
 assert.ok(pos.z<=2.6201);assert.equal(pos.y,0);assert.ok(c.wall);
 assert.equal(P.bodyFits(V(0,0,2.9),.38,.3,1.45),false);
 L._addBlock({kind:'box',min:[-.5,.8,-.5],max:[.5,1,.5],paint:false,hidden:true});
 const dynamic=P.raycast(V(0,1.5,0),down,2,new f.Hit(),true);assert.equal(dynamic.point.y,1);assert.equal(dynamic.block,L.staticBlockCount);
});
test('polygon holes never acquire CPU paint, turf or swimming ownership',async()=>{
 const f=await nativeFixture(),d=data();d.mask[14]=0;const L=new f.NativeLevel(d);f.G.level=L;f.G.physics=new f.NativePhysics(L);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 const P=f.G.paint=new Cpu(null,L,{atlasSize:256,maxDensity:4});P.splat(new f.THREE.Vector3(-.5,.03,-.5),3,0,{seed:.2,instant:true});
 assert.equal(P.grid[14],0);assert.equal(P.sample(0,2.5,2.5),0);assert.equal(P.turfTotal,35);assert.ok(P.counts[0]<=35);
});
