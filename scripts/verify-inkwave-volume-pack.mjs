#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { unpackVolumes } from '../patches/local-quality/ink-volume/pack.mjs';
import { decodeVTF } from '../patches/local-quality/ink-volume/vtf.mjs';
const [directory,...inputs]=process.argv.slice(2), manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'))),bytes=fs.readFileSync(path.join(directory,manifest.binary));
const pack=unpackVolumes(manifest,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));let total=0;
for(let p=0;p<pack.patterns.length;p++) {
 const original=inputs[p]?decodeVTF(fs.readFileSync(inputs[p])):null;
 for(let f=0;f<pack.patterns[p].frames.length;f++) {
  const frame=pack.patterns[p].frames[f];if(original)assert.deepEqual(frame.rgba,original.frames[f]);
  for(const level of frame.levels) {
   const edges=new Map();let volume=0;
   for(let i=0;i<level.indices.length;i+=3) {
    const ids=Array.from(level.indices.subarray(i,i+3));assert(new Set(ids).size===3);
    const points=ids.map(id=>Array.from(level.positions.subarray(id*3,id*3+3)));
    const [a,b,c]=points,ab=b.map((v,j)=>v-a[j]),ac=c.map((v,j)=>v-a[j]);
    const cross=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    assert(Math.hypot(...cross)>1e-16,'non-degenerate triangle');
    volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
    for(let k=0;k<3;k++){const a=ids[k],b=ids[(k+1)%3],key=Math.min(a,b)+':'+Math.max(a,b),e=edges.get(key)||[0,0];e[0]++;e[1]+=a<b?1:-1;edges.set(key,e);}
   }
   for(const [count,winding] of edges.values()){assert.equal(count,2);assert.equal(winding,0);}assert(volume>0,'outward closed volume');total++;
  }
 }
}
console.log(JSON.stringify({frames:pack.patterns.reduce((n,p)=>n+p.frames.length,0),closedLevels:total,sourcePixelsCompared:!!inputs.length,binaryBytes:bytes.length}));
