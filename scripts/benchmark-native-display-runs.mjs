// Exact source-order culling comparison on hydrated native display geometry.
// CPU component timing only: no browser, GPU, rendering or device FPS claim.
// node --experimental-vm-modules scripts/benchmark-native-display-runs.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import * as THREE from '../inkwave-public/vendor/three/build/three.module.js';

const option=(name,value)=>{const i=process.argv.indexOf(name);return i<0?value:process.argv[i+1];};
const root=new URL('../',import.meta.url),id=option('--stage','robo');
const stage=path.resolve(option('--prebuilt-root',new URL('native-prebuilt/',root).pathname),id);
const recordBytes=fs.readFileSync(path.join(stage,'stage.json')),record=JSON.parse(recordBytes);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const data={manifest:record.manifest};
for(const name of ['vertices','indices']){
 const spec=record.arrays[name],bytes=Buffer.concat(spec.chunks.map(c=>{
  const b=fs.readFileSync(path.join(stage,c.file));assert.equal(b.length,c.bytes);assert.equal(hash(b),c.sha256);return b;
 }));
 const Type=globalThis[spec.type];data[name]=new Type(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
}
const source=fs.readFileSync(new URL('patches/native-stages/runtime/native-render.mjs',root),'utf8');
const fixture=fs.readFileSync(new URL('patches/native-stages/tests/fixtures/native-display-culling-before-20261030.mjs.txt',root),'utf8');
const fixtureHash=hash(fixture);
assert.equal(fixtureHash,'7cd31ce7b3fe26ed9facdeda1718d8fece10d380b1562d67051826ecb24b92d8');
const begin=source.indexOf('export function installNativeDisplayCulling('),end=source.indexOf('// Display geometry',begin);
assert.ok(begin>=0&&end>begin);
const baselineSource=source.slice(0,begin)+fixture.slice(fixture.indexOf('export function'))+source.slice(end);
async function load(code){
 const context=vm.createContext({console}),modules={
  three:new vm.SyntheticModule(Object.keys(THREE),function(){for(const[k,v]of Object.entries(THREE))this.setExport(k,v);},{context}),
  '../../../src/world/levelMaterial.js':new vm.SyntheticModule(['createLevelMaterial'],function(){this.setExport('createLevelMaterial',()=>{throw Error('unused');});},{context}),
 };
 const m=new vm.SourceTextModule(code,{context});await m.link(n=>modules[n]);await m.evaluate();
 return m.namespace.nativeDisplay(data,new Map(),'balanced');
}
const baseline=await load(baselineSource),candidate=await load(source);
const meshes=d=>d.group.children.filter(m=>m.geometry.index.usage===THREE.DynamicDrawUsage);
const before=meshes(baseline),after=meshes(candidate);assert.equal(before.length,after.length);assert.ok(before.length);
const b=data.manifest.bounds,cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2;
const cameras=Array.from({length:240},(_,i)=>{
 const cam=new THREE.PerspectiveCamera(50,16/9,.1,150),angle=i*.13;
 cam.position.set(cx+35*Math.sin(angle),7+5*Math.sin(angle*.3),cz+35*Math.cos(angle));
 cam.lookAt(cx,3,cz);cam.updateMatrixWorld();return cam;
});
function run(list,loops,verify=false){
 const cpuStart=process.cpuUsage(),start=performance.now();let triangles=0;
 for(let loop=0;loop<loops;loop++)for(const camera of cameras){
  for(let i=0;i<list.length;i++){
   const mesh=list[i];mesh.onBeforeRender(null,null,camera);const g=mesh.geometry;
   // Three uses Infinity for the unmodified complete draw range.
   triangles+=Math.min(g.index.count,g.drawRange.count)/3;
   if(verify){
    const other=after[i];other.onBeforeRender(null,null,camera);const h=other.geometry;
    assert.equal(h.drawRange.count,g.drawRange.count);
    assert.deepEqual(Array.from(h.index.array),Array.from(g.index.array));
    assert.equal(h.index.version,g.index.version);
    assert.equal(JSON.stringify(h.index.updateRanges),JSON.stringify(g.index.updateRanges));
    h.index.clearUpdateRanges();
   }
   g.index.clearUpdateRanges();
  }
 }
 return{ms:performance.now()-start,cpu:process.cpuUsage(cpuStart),triangles};
}
const parity=run(before,1,true);run(before,2);run(after,2);
assert.ok(Number.isFinite(parity.triangles)&&parity.triangles>0);
const samples=[];
for(let i=0;i<8;i++){
 const a=i%2?run(after,4):null,b=run(before,4),c=a||run(after,4);assert.equal(b.triangles,c.triangles);
 samples.push({order:i%2?'candidate-baseline':'baseline-candidate',before:b,after:c});
}
const median=a=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)];
const bm=median(samples.map(s=>s.before.ms)),am=median(samples.map(s=>s.after.ms));
const cpuMs=row=>(row.cpu.user+row.cpu.system)/1000;
const bc=median(samples.map(s=>cpuMs(s.before))),ac=median(samples.map(s=>cpuMs(s.after)));
const result={scope:'Node CPU component using actual source geometry; not browser, GPU or device FPS',node:process.version,
 stage:id,stageRecordSha256:hash(recordBytes),sourceSha256:record.sourceSha256,fixtureSha256:fixtureHash,candidateSourceSha256:hash(source),
 objects:before.length,cameras:cameras.length,loops:4,parity:{exactIndexArrays:true,exactDrawCounts:true,exactUploadRanges:true,exactVersions:true,selectedTriangles:parity.triangles},
 beforeMedianMs:bm,afterMedianMs:am,reductionPercent:100*(1-am/bm),beforeMedianCpuMs:bc,afterMedianCpuMs:ac,cpuReductionPercent:100*(1-ac/bc),samples};
const json=JSON.stringify(result,null,2)+'\n',out=option('--out',null);if(out)fs.writeFileSync(out,json);console.log(json);
baseline.dispose();candidate.dispose();
