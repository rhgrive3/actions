import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
const source=fs.readFileSync(new URL('../runtime/source-worker.mjs',import.meta.url),'utf8');
const prepare=new Function(source.slice(source.indexOf('function compactInactiveDisplay'),source.indexOf('self.onmessage'))+'\nreturn data=>prepareDisplayTransport(compactInactiveDisplay(data));')();
test('worker spheres match Three exact Float32 positions and packed triangle IDs survive a single transfer',()=>{
 let seed=2;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 const vertices=new Float32Array(500*8);for(let i=0;i<500;i++)for(let k=0;k<3;k++)vertices[i*8+k]=(random()-.5)*1e5;
 const objects=[];for(let j=0;j<100;j++){const geometry=new THREE.BufferGeometry(),data=new THREE.InterleavedBuffer(vertices.subarray(j*40,j*40+40),8);geometry.setAttribute('position',new THREE.InterleavedBufferAttribute(data,3,0));geometry.computeBoundingBox();geometry.computeBoundingSphere();objects.push({active:j%7!==0,vo:j*5,vc:5,io:j*3,ic:3,bounds:[geometry.boundingBox.min.toArray(),geometry.boundingBox.max.toArray()],expected:{center:geometry.boundingSphere.center.toArray(),radius:geometry.boundingSphere.radius}});}
 const ids=[[3,1,2],[],[20,9,100]],data=prepare({vertices,indices:Uint32Array.from({length:300},(_,i)=>i%3),manifest:{objects,geometry:{vertices:500,triangles:100},faces:ids.map(triangles=>({triangles}))}});
 for(const object of data.manifest.objects)if(object.active)assert.deepEqual(object.boundingSphere,object.expected);
 assert.deepEqual(Array.from(data.faceTriangles),ids.flat());for(let i=0;i<ids.length;i++){assert.deepEqual(Array.from(data.manifest.faces[i].triangles),ids[i]);assert.equal(data.manifest.faces[i].triangles.buffer,data.faceTriangles.buffer);}
 const moved=structuredClone(data,{transfer:[data.vertices.buffer,data.indices.buffer,data.faceTriangles.buffer]});assert.equal(data.faceTriangles.byteLength,0);for(let i=0;i<ids.length;i++){assert.deepEqual(Array.from(moved.manifest.faces[i].triangles),ids[i]);assert.equal(moved.manifest.faces[i].triangles.buffer,moved.faceTriangles.buffer);}
});
test('normal length fast path is RGBA-byte exact for every 8-bit pair and both interpretations',()=>{
 const text=fs.readFileSync(new URL('../runtime/native-load.mjs',import.meta.url),'utf8'),loop=text.split('\n').find(line=>line.includes('for(let i=0;i<pixels.length;i+=4){let x=encoding'));
 const candidate=new Function('pixels','encoding',loop),baseline=new Function('pixels','encoding',loop.replace('x*x+y*y<.9025-1e-14?0:Math.hypot(x,y)','Math.hypot(x,y)'));
 for(const encoding of ['signed-byte-rg','unorm-rg']){const pixels=new Uint8ClampedArray(256*256*4);for(let r=0;r<256;r++)for(let g=0;g<256;g++){const offset=(r*256+g)*4;pixels[offset]=r;pixels[offset+1]=g;}const expected=pixels.slice();baseline(expected,encoding);candidate(pixels,encoding);assert.deepEqual(pixels,expected);}
});
