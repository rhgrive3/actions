// CPU-only benchmark: exact old scalar footprint versus ordered BVH batch.
// Run: node --experimental-vm-modules scripts/benchmark-native-ground-batch.mjs
import {performance} from 'node:perf_hooks';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {unpackFaces} from '../patches/native-stages/runtime/prebuilt-format.mjs';
import {setup,geometry} from '../patches/native-stages/tests/fixtures/bvh-query-fixture.mjs';
import {buildSourceBVH} from '../patches/native-stages/runtime/source-convert.mjs';
const f=await setup();
function stageGrid(){
 const a=[];for(let z=-24;z<24;z++)for(let x=-24;x<24;x++){
  const y=(Math.floor(x/5)+Math.floor(z/5))%3*.08;
  a.push(x,y,z,x+1,y,z+1,x+1,y,z,x,y,z,x,y,z+1,x+1,y,z+1);
 }
 const triangles=new Float32Array(a),n=a.length/9,normals=new Float32Array(n*3);for(let i=0;i<n;i++)normals[i*3+1]=1;
 return {...geometry(),triangles,normals,flags:new Uint32Array(n).fill(3),objectIds:new Uint32Array(n),triangleFace:new Int32Array(n).fill(-1),...buildSourceBVH(triangles)};
}
let seed=3928;const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const poses=Array.from({length:512},()=>[(rnd()-.5)*7,2.5+rnd()*.4,(rnd()-.5)*7]);
const median=a=>a.sort((a,b)=>a-b)[a.length>>1],rows=[];
const cases=[['overlapping-source-sheets',geometry()],['4608-triangle-stage-grid',stageGrid()]];
if(process.env.INKWAVE_NATIVE_PREBUILT_ROOT){
 const folder=path.join(process.env.INKWAVE_NATIVE_PREBUILT_ROOT,'crableg'),record=JSON.parse(fs.readFileSync(path.join(folder,'stage.json'),'utf8')),data={...record.extra,manifest:record.manifest};
 for(const [name,spec]of Object.entries(record.arrays)){
  const Type=globalThis[spec.type],buffer=new ArrayBuffer(spec.length*Type.BYTES_PER_ELEMENT);let at=0;
  for(const chunk of spec.chunks){const bytes=fs.readFileSync(path.join(folder,chunk.file));if(bytes.length!==chunk.bytes)throw Error('Expected hydrated '+chunk.file);new Uint8Array(buffer,at,bytes.length).set(bytes);at+=bytes.length;}data[name]=new Type(buffer);
 }
 data.manifest.faces=unpackFaces(data.faceF64,data.faceI32,data.faceTriangleOffsets,data.faceTriangles);
 cases.push(['crableg-187949-source-triangles',data]);
}
for(const [name,data]of cases){
 const level=new f.NativeLevel(data),physics=new f.NativePhysics(level),out=new f.GroundHit();
 let inputs=poses;
 if(name.startsWith('crableg')){
  inputs=[];for(let i=0;i<512;i++){let id;do{id=Math.floor(rnd()*data.flags.length);}while(data.normals[id*3+1]<.68);const n=id*9,a=data.triangles;inputs.push([(a[n]+a[n+3]+a[n+6])/3,(a[n+1]+a[n+4]+a[n+7])/3+.1,(a[n+2]+a[n+5]+a[n+8])/3]);}
  const expected=new f.GroundHit(),actual=new f.GroundHit(),flat=h=>JSON.stringify({...h,normal:h.normal.toArray()});
  for(const p of inputs){f.Physics.prototype.groundProbe.call(physics,...p,.35,.7,.28,expected);physics.groundProbe(...p,.35,.7,.28,actual);if(flat(expected)!==flat(actual))throw Error('Real-stage ground mismatch');}
 }
 const run=(batch,count)=>{const start=performance.now();for(let i=0;i<count;i++){const p=inputs[i%inputs.length];if(batch)physics.groundProbe(p[0],name.startsWith('4608')?.4:p[1],p[2],.35,.7,.28,out);else f.Physics.prototype.groundProbe.call(physics,p[0],name.startsWith('4608')?.4:p[1],p[2],.35,.7,.28,out);}return performance.now()-start;};
 run(false,5000);run(true,5000);const before=[],after=[],count=5000;
 for(let round=0;round<5;round++){if(round%2){after.push(run(true,count));before.push(run(false,count));}else{before.push(run(false,count));after.push(run(true,count));}}
 const b=median(before),a=median(after);rows.push({case:name,operation:"groundProbe",sourceTriangles:data.triangles.length/9,sourceSha256:data.manifest.sourceSha256||null,inputsSha256:createHash("sha256").update(JSON.stringify(inputs)).digest("hex"),footprints:count,samplesPerFootprint:9,beforeMedianMs:b,afterMedianMs:a,reductionPercent:(1-a/b)*100,beforeSamplesMs:before,afterSamplesMs:after});
 const segments=inputs.map((p,i)=>{const target=inputs[(i*37+17)%inputs.length];return [f.V(p[0],p[1]+.9,p[2]),f.V(target[0],target[1]+.9-(i%3===0?3:0),target[2])];});
 for(const [from,to]of segments)if(physics.los(from,to)!==f.Physics.prototype.los.call(physics,from,to))throw Error('LOS mismatch');
 const losRun=(optimized,count)=>{const start=performance.now();for(let i=0;i<count;i++){const [from,to]=segments[i%segments.length];if(optimized)physics.los(from,to);else f.Physics.prototype.los.call(physics,from,to);}return performance.now()-start;};
 losRun(false,5000);losRun(true,5000);const losBefore=[],losAfter=[];
 for(let round=0;round<5;round++){if(round%2){losAfter.push(losRun(true,count));losBefore.push(losRun(false,count));}else{losBefore.push(losRun(false,count));losAfter.push(losRun(true,count));}}
 const lb=median(losBefore),la=median(losAfter);rows.push({case:name,operation:'los',queries:count,sourceTriangles:data.triangles.length/9,sourceSha256:data.manifest.sourceSha256||null,beforeMedianMs:lb,afterMedianMs:la,reductionPercent:(1-la/lb)*100,beforeSamplesMs:losBefore,afterSamplesMs:losAfter});
}
console.log(JSON.stringify({runtime:process.version,scope:'Node CPU synthetic fixtures and optional hydrated source-stage geometry; not browser/frame/GPU/iPad FPS',rows},null,2));
