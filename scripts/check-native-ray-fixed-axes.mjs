// Functional parity on hydrated native source geometry; no wall/CPU measurements.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {setup,unmodule,flatten} from '../patches/native-stages/tests/fixtures/bvh-query-fixture.mjs';

const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const baselineFile=arg('--baseline-file');
if(!baselineFile)throw Error('--baseline-file must identify the exact pre-change source');
const stage=arg('--stage','hagglefish'),folder=path.resolve(arg('--prebuilt-root','native-prebuilt'),stage);
const hash=b=>createHash('sha256').update(b).digest('hex');
const bytes=fs.readFileSync(path.join(folder,'stage.json')),record=JSON.parse(bytes),data={...record.extra,manifest:record.manifest};
for(const [key,spec]of Object.entries(record.arrays)){
 const chunks=spec.chunks.map(c=>{
  const b=fs.readFileSync(path.join(folder,c.file));assert.equal(b.length,c.bytes,c.file);assert.equal(hash(b),c.sha256,c.file);return b;
 });
 const b=Buffer.concat(chunks),Type=globalThis[spec.type];data[key]=new Type(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
 assert.equal(data[key].length,spec.length,key);
}
const f=await setup(),before=fs.readFileSync(baselineFile,'utf8');
const Before=new Function('THREE',unmodule(before)+'\nreturn TriangleWorld;')(f.THREE);
const a=new Before(data),b=new f.CurrentWorld(data),vertices=data.triangles;
const oa={point:f.V(),normal:f.V()},ob={point:f.V(),normal:f.V()};
let seed=838277,queries=0;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
for(let i=0;i<16000;i++){
 const id=(random()*data.flags.length)|0,at=id*9;
 const center=f.V((vertices[at]+vertices[at+3]+vertices[at+6])/3,(vertices[at+1]+vertices[at+4]+vertices[at+7])/3,(vertices[at+2]+vertices[at+5]+vertices[at+8])/3);
 const direction=i%5?f.V(random()-.5,random()-.5,random()-.5).normalize():f.V(-0,-1,0);
 const reach=random()*12+.001,origin=center.clone().addScaledVector(direction,-reach);
 const options={ignoreGrates:!!(i%2),minNormalY:[-2,.62,.68,1.01][i%4],anyHit:i%7===0,minHitY:center.y+(i%3-1)*.001};
 const far=i%101===0?NaN:i%103===0?'12':reach+(i%3-1)*.01;
 assert.deepEqual(flatten(b.ray(origin,direction,far,options,ob)),flatten(a.ray(origin,direction,far,options,oa)),`ray ${i}`);
 assert.equal(b.queryCount,a.queryCount);assert.equal(b.triangleTests,a.triangleTests);assert.equal(b._queryDepth,0);queries++;
}
const result={schema:1,purpose:'Native source-geometry ray functional parity; no performance measurements',stage,stageSha256:hash(bytes),triangles:data.flags.length,
 baselineSha256:hash(before),candidateSha256:hash(fs.readFileSync('patches/native-stages/runtime/triangle-world.mjs')),queries,queryCount:b.queryCount,triangleTests:b.triangleTests,identical:true};
const json=JSON.stringify(result,null,2)+'\n',out=arg('--out');if(out)fs.writeFileSync(out,json);console.log(json);
