#!/usr/bin/env node
// Diagnostic timings, never a hardware-FPS assertion or a CI timing threshold.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {distanceFixture,makePaint,randomStream} from '../patches/local-quality/tests/distance-fixture.mjs';
const apis=await Promise.all([distanceFixture(true),distanceFixture()]);
const median=a=>{a=[...a].sort((x,y)=>x-y);return(a[(a.length-1)>>1]+a[a.length>>1])/2;};
function measure(step,iterations){
 const times=[[],[]],cpu=[[],[]];for(let k=0;k<2;k++)for(let i=0;i<iterations;i++)step(k,i);
 for(let run=0;run<12;run++){const k=[0,1,1,0][run%4],start=performance.now(),c=process.cpuUsage();for(let i=0;i<iterations;i++)step(k,i);const used=process.cpuUsage(c);times[k].push(performance.now()-start);cpu[k].push((used.user+used.system)/1000);}
 const beforeMs=median(times[0]),afterMs=median(times[1]),beforeCpu=median(cpu[0]),afterCpu=median(cpu[1]);return{iterations,windowsPerVersion:6,order:'ABBA repeated',wallTimesMs:times,cpuTimesMs:cpu,beforeMedianMs:beforeMs,afterMedianMs:afterMs,reduction:1-afterMs/beforeMs,beforeMedianCpuMs:beforeCpu,afterMedianCpuMs:afterCpu,cpuReduction:1-afterCpu/beforeCpu};
}
const paints=apis.map(a=>makePaint(a)),faces=paints.map(p=>p.level.faces.find(f=>f.turf));
const rand=randomStream(7),inputs=Array.from({length:400},(_,i)=>{const angle=rand()*Math.PI*2;return[5+rand()*38,5+rand()*38,.15+rand()*2.8,i%2,rand(),Math.cos(angle),Math.sin(angle),rand()*1.3,[0,1,3,5,8,9][i%6]];});
const paint=measure((k,i)=>paints[k]._cpuSplat(faces[k],...inputs[i%inputs.length]),1200);
assert.equal(Buffer.compare(Buffer.from(paints[0].grid),Buffer.from(paints[1].grid)),0,'final paint grid');
assert.deepEqual(Array.from(paints[0].counts),Array.from(paints[1].counts),'final turf counts');
const result={scope:'source-composed CPU methods with real PaintSystem/Level; no rendering or complete match/device FPS',node:process.version,cpu:os.cpus()[0].model,paint};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
