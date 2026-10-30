// CPU-only A/B of native ground footprints, using identical source geometry.
// Example:
// git show <baseline-sha>:patches/native-stages/runtime/triangle-world.mjs > .ci-scratch/triangle-world-before.mjs
// node --experimental-vm-modules scripts/benchmark-native-ground-mask.mjs --baseline-file .ci-scratch/triangle-world-before.mjs --stage robo --out .ci-scratch/ground-mask.json
// Hydrate native-prebuilt/<stage> first. No source assets or rendered FPS here.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {setup,geometry,unmodule} from '../patches/native-stages/tests/fixtures/bvh-query-fixture.mjs';
import {sphereTriangleEntry} from '../patches/native-stages/runtime/sphere-triangle-entry.mjs';

const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const baselineFile=arg('--baseline-file'),candidateFile=arg('--candidate-file','patches/native-stages/runtime/triangle-world.mjs');
if(!baselineFile)throw Error('--baseline-file is required; pass the exact pre-change source');
const stage=arg('--stage','robo'),folder=path.resolve(arg('--prebuilt-root','native-prebuilt'),stage);
const count=Number(arg('--count',5000)),trials=Number(arg('--trials',7));
assert(Number.isSafeInteger(count)&&count>0&&Number.isSafeInteger(trials)&&trials>=3);
const hash=b=>createHash('sha256').update(b).digest('hex');
const f=await setup(),sources={before:fs.readFileSync(baselineFile,'utf8'),after:fs.readFileSync(candidateFile,'utf8')};
const types=Object.fromEntries(Object.entries(sources).map(([name,source])=>[name,
 new Function('THREE','sphereTriangleEntry',unmodule(source)+'\nreturn TriangleWorld;')(f.THREE,sphereTriangleEntry)]));
const recordBytes=fs.readFileSync(path.join(folder,'stage.json')),record=JSON.parse(recordBytes),data={manifest:record.manifest,...record.extra};
for(const [name,spec]of Object.entries(record.arrays)){
 const chunks=spec.chunks.map(chunk=>{
  const bytes=fs.readFileSync(path.join(folder,chunk.file));
  assert.equal(bytes.length,chunk.bytes,chunk.file);assert.equal(hash(bytes),chunk.sha256,chunk.file);return bytes;
 });
 const bytes=Buffer.concat(chunks),Type=globalThis[spec.type];
 data[name]=new Type(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 assert.equal(data[name].length,spec.length,name);
}
let seed=87238;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const poses=[];
for(let i=0;i<1024;i++){
 let id;do{id=Math.floor(random()*data.flags.length);}while(data.normals[id*3+1]<.68);
 const at=id*9,a=data.triangles;
 poses.push([(a[at]+a[at+3]+a[at+6])/3,(a[at+1]+a[at+4]+a[at+7])/3+.45,(a[at+2]+a[at+5]+a[at+8])/3]);
}
const densePoses=Array.from({length:256},()=>[(random()-.5)*7,2.5+random()*.4,(random()-.5)*7]);
const offsets=Array.from({length:9},(_,i)=>i?[Math.cos((i-1)/8*Math.PI*2)*.28,Math.sin((i-1)/8*Math.PI*2)*.28]:[0,0]);
const flatten=h=>h.hit?{triangle:h.triangle,distance:h.distance,point:Array.from(h.point.toArray()),normal:Array.from(h.normal.toArray()),u:h.u,v:h.v,flags:h.flags,object:h.object}:null;
const result={schema:1,node:process.version,scope:'Node CPU footprint component, not browser/device/GPU FPS',stage,stageRecordSha256:hash(recordBytes),sourceSha256:record.sourceSha256,
 implementationSha256:Object.fromEntries(Object.entries(sources).map(([k,s])=>[k,hash(s)])),count,trials,cases:[]};
for(const [name,input,positions]of [[stage,data,poses],['dense-overlapping-sheets',geometry(),densePoses]]){
 const worlds=Object.fromEntries(Object.entries(types).map(([k,World])=>[k,new World(input)]));
 const origins=Array.from({length:9},()=>f.V()),outputs=Object.fromEntries(Object.keys(worlds).map(k=>[k,origins.map(()=>({point:f.V(),normal:f.V()}))]));
 const position=p=>{for(let i=0;i<9;i++)origins[i].set(p[0]+offsets[i][0],p[1],p[2]+offsets[i][1]);};
 // Complete output and traversal-count parity is checked before measuring.
 for(const p of positions){
  position(p);for(const [key,w]of Object.entries(worlds))w.rayDownBatch(origins,1.05,{},outputs[key]);
  assert.deepEqual(outputs.after.map(flatten),outputs.before.map(flatten));
  assert.equal(worlds.after.queryCount,worlds.before.queryCount);assert.equal(worlds.after.triangleTests,worlds.before.triangleTests);
 }
 const run=(key,n)=>{
  const w=worlds[key],beforeQueries=w.queryCount,beforeTests=w.triangleTests,cpuStart=process.cpuUsage(),start=performance.now();
  for(let i=0;i<n;i++){position(positions[i%positions.length]);w.rayDownBatch(origins,1.05,{},outputs[key]);}
  const wallMs=performance.now()-start,cpu=process.cpuUsage(cpuStart);
  return {wallMs,cpuMs:(cpu.user+cpu.system)/1000,queries:w.queryCount-beforeQueries,triangleTests:w.triangleTests-beforeTests};
 };
 for(const key of ['before','after','after','before'])run(key,2000);
 const samples={before:[],after:[]};
 for(let i=0;i<trials;i++)for(const key of i%2?['after','before']:['before','after'])samples[key].push(run(key,count));
 for(let i=0;i<trials;i++){
  assert.equal(samples.after[i].queries,samples.before[i].queries);assert.equal(samples.after[i].triangleTests,samples.before[i].triangleTests);
 }
 const median=(rows,field)=>rows.map(r=>r[field]).sort((a,b)=>a-b)[Math.floor(rows.length/2)];
 const summary=Object.fromEntries(['wallMs','cpuMs'].map(field=>{
  const before=median(samples.before,field),after=median(samples.after,field);return[field,{before,after,reductionPercent:(1-after/before)*100}];
 }));
 result.cases.push({name,triangles:input.triangles.length/9,poses:positions.length,inputSha256:hash(JSON.stringify(positions)),parity:true,samples,summary});
}
const json=JSON.stringify(result,null,2)+'\n',out=arg('--out');if(out)fs.writeFileSync(out,json);console.log(json);
