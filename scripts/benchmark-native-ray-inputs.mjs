// Exact recorded-ray component replay. Browser recording overhead and game FPS
// are outside this Node CPU comparison. Keep every ABBA/BAAB sample.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {gunzipSync} from 'node:zlib';
import {setup,unmodule,flatten} from '../patches/native-stages/tests/fixtures/bvh-query-fixture.mjs';

const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const baselineFile=arg('--baseline-file'),inputFile=arg('--inputs');
if(!baselineFile||!inputFile)throw Error('--baseline-file and --inputs are required');
const stage=arg('--stage','hagglefish'),folder=path.resolve(arg('--prebuilt-root','native-prebuilt'),stage);
const hash=b=>createHash('sha256').update(b).digest('hex');
const recordBytes=fs.readFileSync(path.join(folder,'stage.json')),record=JSON.parse(recordBytes),data={...record.extra,manifest:record.manifest};
for(const [key,spec]of Object.entries(record.arrays)){
 const chunks=spec.chunks.map(c=>{const b=fs.readFileSync(path.join(folder,c.file));assert.equal(b.length,c.bytes,c.file);assert.equal(hash(b),c.sha256,c.file);return b;});
 const b=Buffer.concat(chunks),Type=globalThis[spec.type];data[key]=new Type(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));assert.equal(data[key].length,spec.length,key);
}
const f=await setup(),before=fs.readFileSync(baselineFile,'utf8'),after=fs.readFileSync(arg('--candidate-file','patches/native-stages/runtime/triangle-world.mjs'),'utf8');
const load=s=>new Function('THREE',unmodule(s)+'\nreturn TriangleWorld;')(f.THREE);
const classes={A:load(before),B:load(after)};
const inputBytes=fs.readFileSync(inputFile),raw=inputFile.endsWith('.gz')?gunzipSync(inputBytes):inputBytes,recording=JSON.parse(raw),rays=recording.rays;
assert.equal(recording.stage,stage);assert(Array.isArray(rays)&&rays.length>0);
const categories={all:[],'vertical-down':[],'general-anyHit':[],'general-nearest-short':[],'general-nearest-long':[]};
for(const row of rays){
 assert.equal(row.length,12);assert(row.slice(0,10).every(Number.isFinite));assert(row[10]===null||Number.isFinite(row[10]));
 const sample={origin:f.V(...row.slice(0,3)),direction:f.V(...row.slice(3,6)),far:row[6],options:{ignoreGrates:!!row[7],minNormalY:row[8],anyHit:!!row[9],minHitY:row[10]??-Infinity},out:!!row[11]};
 const category=row[3]===0&&row[4]===-1&&row[5]===0?'vertical-down':row[9]?'general-anyHit':row[6]<=1?'general-nearest-short':'general-nearest-long';
 categories[category].push(sample);categories.all.push(sample);
}
const blocks=Number(arg('--blocks',4));assert(Number.isInteger(blocks)&&blocks>=2);
const report={schema:1,purpose:'Node ray component A/B on instrumented real 900tick battle input; no whole-battle/device/FPS claim',
 stage,stageSha256:hash(recordBytes),sourceTriangles:data.flags.length,recordingSha256:hash(raw),recording:recording.metadata,
 sourceSha256:{A:hash(before),B:hash(after)},environment:{node:process.version,cpu:os.cpus()[0].model,quota:fs.readFileSync('/sys/fs/cgroup/cpu.max','utf8').trim()},
 order:'Alternating ABBA and BAAB blocks, after ABBA warmup. All unfavorable samples retained.',categories:[]};
for(const [category,samples]of Object.entries(categories)){
 if(!samples.length)continue;
 const worlds=Object.fromEntries(Object.entries(classes).map(([key,World])=>[key,new World(data)]));
 const outputs={A:{point:f.V(),normal:f.V()},B:{point:f.V(),normal:f.V()}};
 const invoke=(key,s)=>worlds[key].ray(s.origin,s.direction,s.far,s.options,s.out?outputs[key]:null);
 let preflightHits=0;
 for(const s of samples){const a=invoke('A',s),b=invoke('B',s);assert.deepEqual(flatten(b),flatten(a));if(a)preflightHits++;}
 assert.equal(worlds.A.queryCount,worlds.B.queryCount);assert.equal(worlds.A.triangleTests,worlds.B.triangleTests);
 const run=key=>{
  const w=worlds[key],q=w.queryCount,t=w.triangleTests;let hits=0;
  const cpu0=process.cpuUsage(),start=performance.now();
  for(const s of samples)if(invoke(key,s))hits++;
  const wallMs=performance.now()-start,cpu=process.cpuUsage(cpu0);
  return {key,wallMs,cpuMs:(cpu.user+cpu.system)/1000,calls:samples.length,queries:w.queryCount-q,triangleTests:w.triangleTests-t,hits};
 };
 for(const key of 'ABBA')run(key);
 const measurements=[];
 for(let block=0;block<blocks;block++)for(const key of block%2?'BAAB':'ABBA')measurements.push({block,...run(key)});
 const first=measurements[0];for(const row of measurements)for(const field of ['calls','queries','triangleTests','hits'])assert.equal(row[field],first[field]);
 assert.equal(first.hits,preflightHits);
 const median=a=>{const v=a.slice().sort((x,y)=>x-y),m=v.length>>1;return v.length%2?v[m]:(v[m-1]+v[m])*.5;};
 const summary=Object.fromEntries(['wallMs','cpuMs'].map(field=>{
  const a=measurements.filter(x=>x.key==='A').map(x=>x[field]),b=measurements.filter(x=>x.key==='B').map(x=>x[field]);
  return [field,{before:median(a),after:median(b),reductionPercent:(1-median(b)/median(a))*100,beforeMin:Math.min(...a),beforeMax:Math.max(...a),afterMin:Math.min(...b),afterMax:Math.max(...b)}];
 }));
 report.categories.push({category,calls:samples.length,outputsOwned:samples.filter(x=>x.out).length,preflightHits,measurements,summary});
 console.log(JSON.stringify({category,calls:samples.length,summary}));
}
const out=arg('--out');if(!out)throw Error('--out is required to preserve every sample');fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
