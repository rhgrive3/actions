#!/usr/bin/env node
// Whole-function CPU diagnostics. No CI timing threshold or device/FPS claim.
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {nativePaintGoalIds as after} from '../../patches/native-stages/runtime/native-bots.mjs';
const baselineUrl=new URL('../../patches/native-stages/tests/fixtures/native-bots-3715e29d.mjs.txt',import.meta.url);
const candidateUrl=new URL('../../patches/native-stages/runtime/native-bots.mjs',import.meta.url);
const original=fs.readFileSync(baselineUrl,'utf8'),candidate=fs.readFileSync(candidateUrl,'utf8');
const hash=s=>createHash('sha256').update(s).digest('hex');
assert.equal(hash(original),'dd6c3ce9b7c616b2e4f509a7669161dc4400a193c1dd2905994e41de4771be86');
const load=(source,math=Math)=>new Function('Math',source.replace('export function','function')+'\nreturn nativePaintGoalIds;')(math);
const before=load(original),functions=[before,after];
function graph(width,step){
 const nodes=[];
 for(let z=0;z<width;z++)for(let x=0;x<width;x++)nodes.push({id:nodes.length,x:x*step,y:0,z:z*step,zone:-1,nativePaintable:true,nb:[]});
 for(const n of nodes)for(const [dx,dz]of [[-1,0],[1,0],[0,-1],[0,1]]){
  const x=n.id%width+dx,z=Math.floor(n.id/width)+dz;
  if(x>=0&&x<width&&z>=0&&z<width)n.nb.push({to:z*width+x});
 }
 return{nodes,valid:new Uint8Array(nodes.length).fill(1),nearest:()=>0};
}
const median=xs=>{const a=xs.toSorted((x,y)=>x-y);return(a[(a.length-1)>>1]+a[a.length>>1])/2;};
function scenario(width,step,iterations,cacheHit=false){
 const navs=[graph(width,step),graph(width,step)];
 const brains=navs.map(()=>({a:{pos:{x:width*step/2,z:width*step/2},team:0}}));
 const worlds=navs.map(nav=>({nav}));
 const run=k=>{if(!cacheHit)brains[k]._nativeGoalIds=null;return functions[k](brains[k],worlds[k]);};
 assert.deepEqual(run(1),run(0));
 const hypotCalls=[0,0];
 for(let k=0;k<2;k++){
  const math=Object.create(Math);math.hypot=(...v)=>{hypotCalls[k]++;return Math.hypot(...v);};
  load(k?candidate:original,math)({a:brains[k].a},{nav:graph(width,step)});
 }
 for(let warmup=0;warmup<2;warmup++)for(let k=0;k<2;k++)for(let i=0;i<iterations;i++)run(k);
 const wallMs=[[],[]],cpuMs=[[],[]];
 for(let window=0;window<12;window++){
  const k=[0,1,1,0][window%4],cpu=process.cpuUsage(),start=performance.now();
  for(let i=0;i<iterations;i++)run(k);
  const used=process.cpuUsage(cpu);wallMs[k].push(performance.now()-start);cpuMs[k].push((used.user+used.system)/1000);
 }
 assert.deepEqual(run(1),run(0));
 const medianWallMs=wallMs.map(median),medianCpuMs=cpuMs.map(median);
 return{width,step,nodes:width*width,cacheHit,iterations,windowsPerVersion:6,order:'ABBA repeated',hypotCallsPerUncachedQuery:hypotCalls,wallMs,cpuMs,medianWallMs,medianCpuMs,wallReduction:1-medianWallMs[1]/medianWallMs[0],cpuReduction:1-medianCpuMs[1]/medianCpuMs[0]};
}
const result={baselineSha:'3715e29d1656a00b853f73e12a89624b17985b7c',baselineFixtureSha256:hash(original),candidateSourceSha256:hash(candidate),node:process.version,cpu:os.cpus()[0].model,
 scope:'Synthetic connected navigation grids, whole nativePaintGoalIds calls; no rendering, production-stage, game-FPS or Nintendo comparison',
 scenarios:[scenario(24,1,8000),scenario(120,1,300),scenario(80,2,400),scenario(24,1,500000,true)]};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
