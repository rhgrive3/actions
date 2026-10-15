import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFixture} from './fixture.mjs';
import {buildSourceBVH} from '../runtime/source-convert.mjs';
// Equal source faces occur at real chart seams. Partition order is an offline
// acceleration detail, and must not change wall ownership or controller input.
test('nearest source ray chooses the same equal-distance triangle in either BVH leaf order',async()=>{
 const f=await nativeFixture(),{THREE}=f;
 const triangles=new Float32Array([-2,0,-2,2,0,-2,0,0,2,-2,0,-2,2,0,-2,0,0,2]);
 const data={triangles,normals:new Float32Array([0,1,0,0,1,0]),flags:new Uint32Array([3,1]),objectIds:new Uint32Array([0,1]),...buildSourceBVH(triangles),triangleFace:new Int32Array([0,-1]),mask:new Uint8Array(),manifest:{id:'source-order',bounds:{minX:-3,maxX:3,minZ:-3,maxZ:3},spawnPads:[[0,0,-2],[0,0,2]],spawnBarrier:0,objects:[],faces:[]}};
 const L=new f.NativeLevel(data),world=L.triangleWorld,origin=new THREE.Vector3(0,1,0),down=new THREE.Vector3(0,-1,0);
 const first=world.ray(origin,down,2);world.order.reverse();const second=world.ray(origin,down,2);
 assert.equal(first.triangle,0);assert.equal(second.triangle,0);assert.equal(first.flags,3);assert.equal(second.flags,3);assert.equal(first.distance,second.distance);
});
test('source capsule corrections and wall normals are independent of broad-phase order',async()=>{
 const f=await nativeFixture(),{THREE}=f;
 const triangles=new Float32Array([0,-2,-3,0,3,-3,0,0,3, -3,-2,0,3,0,0,-3,3,0]);
 const data={triangles,normals:new Float32Array([-1,0,0,0,0,-1]),flags:new Uint32Array([1,1]),objectIds:new Uint32Array([0,0]),...buildSourceBVH(triangles),triangleFace:new Int32Array([-1,-1]),mask:new Uint8Array(),manifest:{id:'corner-order',bounds:{minX:-3,maxX:3,minZ:-3,maxZ:3},spawnPads:[[-2,0,-2],[2,0,2]],spawnBarrier:0,objects:[{name:'Fld_Test',collidable:true,bounds:[[-3,-2,-3],[3,3,3]]}],faces:[]}};
 const solve=reverse=>{
  const level=new f.NativeLevel(data),physics=new f.NativePhysics(level),world=level.triangleWorld;
  if(reverse){const query=world.queryBox.bind(world);world.queryBox=(min,max,fn)=>{const ids=[];query(min,max,id=>ids.push(id));ids.reverse().forEach(fn);};}
  const pos=new THREE.Vector3(-.1,0,-.1),contacts={wall:false,ground:false,ceiling:false,wallNormal:new THREE.Vector3(),groundNormal:new THREE.Vector3()};
  physics.collideBody(pos,.3,0,1,contacts,true);
  return {pos:pos.toArray(),wall:contacts.wall,normal:contacts.wallNormal.toArray()};
 };
 const forward=solve(false);assert.equal(forward.wall,true);assert.ok(forward.pos[0]<-.29&&forward.pos[2]<-.29);
 assert.deepEqual(solve(true),forward);
});
