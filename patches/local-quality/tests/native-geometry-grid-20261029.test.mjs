import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
const frozen=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-world-native-extra-before-20261029.json',import.meta.url)));
const raw=p=>fs.readFileSync(new URL('../../../'+p,import.meta.url),'utf8');
const compile=(s,names)=>new Function('THREE','Level',s.replace(/^import .*;$/gm,'').replaceAll('export ','')+'\nreturn {'+names+'};')(THREE,class{});
const render='patches/native-stages/runtime/native-render.mjs',level='patches/native-stages/runtime/native-level.mjs';
const renderPair=[frozen[render],raw(render)].map(s=>compile(s,'nativeInkGeometry,nativeDisplay'));
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
const snap=g=>Object.fromEntries(Object.entries(g.attributes).map(([k,a])=>[k,bytes(a.array)]));
test('native scalar triangle projection retains all Float32 GPU bytes and attribute metadata',()=>{
 for(const scalar of [0,-0,1e-12,1e6,-3.14159265359]){
  const triangles=new Float32Array(Array.from({length:900},(_,i)=>Math.sin(i*.37)*scalar));
  const v=(x,y,z)=>new THREE.Vector3(x,y,z),faces=Array.from({length:12},(_,i)=>({triangles:[i,i+13,i+25],origin:v(i*.01,-i*.13,scalar),u:v(.1,.7,-.5),v:v(.3,.17,-.9),n:v(0,1,0),su:2,sv:3,wall:i%2,atlas:i%4===0?null:{x:i*9,y:i*11,pad:2,ppm:3.1}}));
  const models=renderPair.map(k=>k.nativeInkGeometry({data:{triangles}},{paintFaces:faces,size:4096}));
  assert.deepEqual(snap(models[1]),snap(models[0]));assert.deepEqual(models[1].boundingSphere,models[0].boundingSphere);models.forEach(g=>g.dispose());
 }
});
test('native Uint16 display indices preserve exact vertex IDs with 65535 primitive-restart and offset fallback',()=>{
 for(const maximum of [0,3,65534,65535,65536]){
  const indices=new Uint32Array([9,0,1,maximum,7]),vertices=new Float32Array((maximum+2)*8);for(let i=0;i<vertices.length;i++)vertices[i]=Math.sin(i*.13);
  const data={indices,vertices,manifest:{materials:{},objects:[{active:true,material:'concrete',vo:1,vc:maximum+1,io:1,ic:3,collidable:true}]}};
  const displays=renderPair.map(k=>k.nativeDisplay(data,new Map(),'high')),a=displays[0].group.children[0],b=displays[1].group.children[0];
  assert.deepEqual(Array.from(b.geometry.index.array),Array.from(a.geometry.index.array));
  // Later reviewed native rendering adds a conservative normal-cone attribute.
  // Preserve the complete historical attribute comparison and verify the new
  // attribute independently, including its invalid-index fallback.
  const actual=snap(b.geometry),cone=b.geometry.getAttribute('nativeNormalCone');
  if(maximum===0) assert.equal(cone,undefined,'out-of-range index cannot certify a cone');
  else {
   assert.ok(cone);assert.equal(cone.itemSize,1);assert.equal(cone.normalized,true);
   assert.ok(cone.array instanceof Uint8Array);assert.equal(cone.count,maximum+1);
   assert.ok(cone.array.every(value=>value===255),'this fixture must retain the conservative two-hemisphere fallback');
   delete actual.nativeNormalCone;
  }
  assert.deepEqual(actual,snap(a.geometry));
  assert.equal(b.geometry.index.array.BYTES_PER_ELEMENT,maximum<65535?2:4);assert.deepEqual(b.geometry.boundingSphere,a.geometry.boundingSphere);
  b.geometry.index.onUploadCallback();assert.equal(b.geometry.index.array,null);
  if(cone){cone.onUploadCallback();assert.equal(cone.array,null);}displays.forEach(d=>d.dispose());
 }
});
test('native mask inversion and fused face traversal preserve grid, emptiness and ordered turf area sums',()=>{
 const pair=[frozen[level],raw(level)].map(s=>compile(s,'initNativeGrid'));
 for(const size of [0,1,17,1000])for(const mode of [0,1,2]){
  const mask=Uint8Array.from({length:size},(_,i)=>mode===0?0:mode===1?255:(i*7)%3),faces=Array.from({length:20},(_,i)=>({grid:size?i*13%size:0,nu:size?Math.min(7,size-i*13%size):0,nv:1,turf:i%2===0,cu:.1+i*.001,cv:.17}));
  const outputs=pair.map(k=>{const paint={level:{mask},paintFaces:structuredClone(faces)};k.initNativeGrid(paint);return paint});assert.deepEqual(outputs[1],outputs[0]);
 }
});
