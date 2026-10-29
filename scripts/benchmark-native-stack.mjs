// Paired native-ray traversal benchmark and optional V8 allocation sampling.
// INKWAVE_NATIVE_PREBUILT_ROOT=/hydrated/native-prebuilt node scripts/benchmark-native-stack.mjs
import fs from 'node:fs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import inspector from 'node:inspector';
import * as THREE from '../inkwave-public/vendor/three/build/three.module.js';
import {sphereTriangleEntry} from '../patches/native-stages/runtime/sphere-triangle-entry.mjs';
const load=src=>new Function('THREE','sphereTriangleEntry',src.replace(/^import .*;$/gm,'').replace(/^export /gm,'')+'\nreturn TriangleWorld;')(THREE,sphereTriangleEntry);
const Before=load(fs.readFileSync(new URL('../patches/native-stages/tests/fixtures/triangle-world-before-cursor.mjs.txt',import.meta.url),'utf8'));
const After=load(fs.readFileSync(new URL('../patches/native-stages/runtime/triangle-world.mjs',import.meta.url),'utf8'));
const folder=path.join(process.env.INKWAVE_NATIVE_PREBUILT_ROOT||'native-prebuilt','crableg'),record=JSON.parse(fs.readFileSync(path.join(folder,'stage.json'),'utf8')),data={};
for(const name of ['triangles','normals','flags','objectIds','nodes','order']){
 const spec=record.arrays[name],Type=globalThis[spec.type],buffer=new ArrayBuffer(spec.length*Type.BYTES_PER_ELEMENT);let at=0;
 for(const chunk of spec.chunks){const bytes=fs.readFileSync(path.join(folder,chunk.file));if(bytes.length!==chunk.bytes)throw Error('Expected hydrated '+chunk.file);new Uint8Array(buffer,at,bytes.length).set(bytes);at+=bytes.length;}data[name]=new Type(buffer);
}
let seed=83192;const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const inputs=[];for(let i=0;i<2048;i++){
 let id;do{id=Math.floor(rnd()*data.flags.length);}while(data.normals[id*3+1]<.68);
 const n=id*9,a=data.triangles,origin=new THREE.Vector3((a[n]+a[n+3]+a[n+6])/3,(a[n+1]+a[n+4]+a[n+7])/3+.1+rnd()*2,(a[n+2]+a[n+5]+a[n+8])/3);
 const dir=i%4?new THREE.Vector3(rnd()-.5,-rnd(),rnd()-.5).normalize():new THREE.Vector3(0,-1,0);
 inputs.push({origin,dir,far:.05+rnd()*2});
}
const before=new Before(data),after=new After(data),out={point:new THREE.Vector3(),normal:new THREE.Vector3()},options={ignoreGrates:true};
const flat=h=>h&&({triangle:h.triangle,distance:h.distance,point:h.point.toArray(),normal:h.normal.toArray(),u:h.u,v:h.v,flags:h.flags,object:h.object});
for(const p of inputs){const a=JSON.stringify(flat(before.ray(p.origin,p.dir,p.far,options,out))),b=JSON.stringify(flat(after.ray(p.origin,p.dir,p.far,options,out)));if(a!==b)throw Error('Hit mismatch');}
const count=30000,run=world=>{const start=performance.now();for(let i=0;i<count;i++){const p=inputs[i%inputs.length];world.ray(p.origin,p.dir,p.far,options,out);}return performance.now()-start;};
run(before);run(after);const b=[],a=[];
for(let i=0;i<5;i++){if(i%2){a.push(run(after));b.push(run(before));}else{b.push(run(before));a.push(run(after));}}
const median=x=>[...x].sort((a,b)=>a-b)[x.length>>1];
const result={runtime:process.version,scope:'Node query CPU/allocation microbenchmark; not browser FPS or iPad evidence',sourceSha256:record.sourceSha256,triangles:data.flags.length,queriesPerRound:count,exactParityQueries:inputs.length,beforeMs:b,afterMs:a,beforeMedianMs:median(b),afterMedianMs:median(a),reductionPercent:(1-median(a)/median(b))*100};
if(process.env.INKWAVE_SAMPLE_ALLOCATIONS==='1'){
 const session=new inspector.Session();session.connect();const post=(name,args={})=>new Promise((resolve,reject)=>session.post(name,args,(error,result)=>error?reject(error):resolve(result)));
 const samples=[];for(const [name,world]of [['before',before],['after',after]]){
  await post('HeapProfiler.startSampling',{samplingInterval:16384,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});run(world);
  const {profile}=await post('HeapProfiler.stopSampling');let total=0,ray=0;
  const walk=n=>{total+=n.selfSize;if(n.callFrame.functionName==='ray')ray+=n.selfSize;for(const c of n.children||[])walk(c);};walk(profile.head);samples.push({name,totalEstimatedBytes:total,raySelfEstimatedBytes:ray});
 }session.disconnect();result.allocationSampling=samples;
}
console.log(JSON.stringify(result,null,2));
