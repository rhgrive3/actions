#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { unpackVolumes, decodeVolumeBinary } from '../patches/local-quality/ink-volume/pack.mjs';
import { decodeVTF } from '../patches/local-quality/ink-volume/vtf.mjs';
const [directory,...inputs]=process.argv.slice(2), manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'))),bytes=fs.readFileSync(path.join(directory,manifest.binary));
const binary=await decodeVolumeBinary(manifest,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const pack=unpackVolumes(manifest,binary);let total=0;
for(let p=0;p<pack.patterns.length;p++) {
 const original=inputs[p]?decodeVTF(fs.readFileSync(inputs[p])):null;
 for(let f=0;f<pack.patterns[p].frames.length;f++) {
  const frame=pack.patterns[p].frames[f];if(original)assert.deepEqual(frame.rgba,original.frames[f]);
  for(const level of frame.levels) {
   const count=level.positions.length/3;assert.equal(level.normals.length,count*3);assert.equal(level.uvs.length,count*2);
   for(const x of level.positions)assert(Number.isFinite(x));
   for(const x of level.uvs)assert(Number.isFinite(x)&&x>=0&&x<=1);
   const scale=level.normals instanceof Int16Array?32767:1;
   for(let i=0;i<count;i++)assert(Math.abs(Math.hypot(...level.normals.subarray(i*3,i*3+3))/scale-1)<1e-4,'unit source/quantized normal');
   assert.equal(level.indices.length%3,0);
   for(const id of level.indices)assert(id<count,'index inside vertex buffer');
   if(level.opaqueIndices){
    const originalFaces=new Set();for(let i=0;i<level.indices.length;i+=3)originalFaces.add(Array.from(level.indices.subarray(i,i+3)).join(':'));
    const covered=new Set();
    for(const pass of [level.opaqueIndices,level.fringeIndices]){assert.equal(pass.length%3,0);for(let i=0;i<pass.length;i+=3){const key=Array.from(pass.subarray(i,i+3)).join(':');assert(originalFaces.has(key),'pass retains original triangle/winding');covered.add(key);}}
    assert.equal(covered.size,originalFaces.size,'opaque/fringe union covers the complete volume');
   }
   // UV/normal seams duplicate vertices at identical positions. Verify the
   // physical closed surface after exact-position welding, retaining every
   // nonzero-area, index, winding and positive-volume assertion below.
   const vertices=new Map(),canonical=Array.from({length:level.positions.length/3},(_,i)=>{const key=Array.from(level.positions.subarray(i*3,i*3+3)).join(':');if(!vertices.has(key))vertices.set(key,i);return vertices.get(key);});
   const edges=new Map();let volume=0;
   for(let i=0;i<level.indices.length;i+=3) {
    const ids=Array.from(level.indices.subarray(i,i+3));assert(new Set(ids).size===3);
    const points=ids.map(id=>Array.from(level.positions.subarray(id*3,id*3+3)));
    const [a,b,c]=points,ab=b.map((v,j)=>v-a[j]),ac=c.map((v,j)=>v-a[j]);
    const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    assert(Math.hypot(...cross)>1e-16,'non-degenerate triangle');
    volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
    for(let k=0;k<3;k++){const a=canonical[ids[k]],b=canonical[ids[(k+1)%3]],key=Math.min(a,b)+':'+Math.max(a,b),e=edges.get(key)||[0,0];e[0]++;e[1]+=a<b?1:-1;edges.set(key,e);}
   }
   for(const [count,winding] of edges.values()){assert.equal(count,2);assert.equal(winding,0);}assert(volume>0,'outward closed volume');total++;
  }
 }
}
console.log(JSON.stringify({frames:pack.patterns.reduce((n,p)=>n+p.frames.length,0),closedLevels:total,sourcePixelsCompared:!!inputs.length,binaryBytes:bytes.length}));
