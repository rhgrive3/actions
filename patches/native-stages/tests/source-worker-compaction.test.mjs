import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeStageTextureCaps} from '../runtime/native-texture-budget.mjs';
const source=fs.readFileSync(new URL('../runtime/source-worker.mjs',import.meta.url),'utf8');
const compact=new Function(source.slice(source.indexOf('function compactInactiveDisplay'),source.indexOf('self.onmessage'))+'\nreturn compactInactiveDisplay;')();
test('worker removes only inactive display buffers and preserves collision object ordinal identities',()=>{
 const vertices=Float32Array.from({length:12*8},(_,i)=>i+.25),indices=new Uint32Array([0,1,2,0,2,3,0,1,2,0,2,3,0,1,2,0,2,3]);
 const objects=Array.from({length:3},(_,i)=>({name:'object'+i,active:i!==1,vo:i*4,vc:4,io:i*6,ic:6,bounds:[[i,0,0],[i+1,1,1]]})),objectIds=new Uint32Array([0,2,2]);
 const data={vertices,indices,objectIds,manifest:{objects,materials:{},geometry:{vertices:150001,triangles:6,collisionTriangles:3}}},before=structuredClone(data),out=compact(data);
 assert.equal(out,data);assert.equal(out.objectIds,objectIds);assert.deepEqual(out.objectIds,before.objectIds);
 assert.deepEqual(out.manifest.objects.map(o=>[o.name,o.vo,o.io,o.vc,o.ic]),[['object0',0,0,4,6],['object1',4,6,0,0],['object2',4,6,4,6]]);
 assert.deepEqual(out.vertices,Float32Array.from([...vertices.slice(0,32),...vertices.slice(64,96)]));
 assert.deepEqual(out.indices,Uint32Array.from([...indices.slice(0,6),...indices.slice(12,18)]));
 assert.deepEqual(out.manifest.sourceGeometry,before.manifest.geometry);assert.deepEqual(nativeStageTextureCaps(out.manifest,'high'),nativeStageTextureCaps(before.manifest,'high'),'display compaction must not raise texture budgets');
 for(const key of ['vertices','indices'])assert.equal(out[key].byteLength,out[key].buffer.byteLength);
});
test('all-active, absent registries and placement diagnostics retain original buffer ownership',()=>{
 for(const manifest of [{},{objects:[{active:true,vc:3}]},{objects:[{active:false,vc:3}],placementReceipt:{diagnostic:true}}]){
  const data={manifest,vertices:new Float32Array(24),indices:new Uint32Array([0,1,2])},vertices=data.vertices,indices=data.indices;assert.equal(compact(data),data);assert.equal(data.vertices,vertices);assert.equal(data.indices,indices);
 }
});
