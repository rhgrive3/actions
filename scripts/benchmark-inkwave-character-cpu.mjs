import fs from 'node:fs';
import os from 'node:os';
import {sourceLoadedActorFixture} from '../patches/splatoon3/tests/source-loaded-actor-fixture.mjs';
import {adaptBuildSource} from './inkwave-source-composition.mjs';
import {adaptMotionFkHotpath} from '../patches/local-quality/motion-fk-hotpath-adapter.mjs';
import {replaceOnce} from '../patches/local-quality/adapter.mjs';
const oldRoot=fs.readFileSync(new URL('../patches/local-quality/tests/fixtures/root-hair-07f44b97.mjs.txt',import.meta.url),'utf8'),oldBank=fs.readFileSync(new URL('../patches/local-quality/tests/fixtures/source-bank-07f44b97.mjs.txt',import.meta.url),'utf8');
const before=(rel,raw)=>rel==='src/game/motion/root-hair.js'?oldRoot:rel==='src/game/motion/source-bank.js'?adaptMotionFkHotpath(rel,oldBank,replaceOnce):adaptBuildSource(rel,raw);
const api=await Promise.all([sourceLoadedActorFixture({transform:before,sourceOnly:true,random:()=>.4}),sourceLoadedActorFixture({sourceOnly:true,random:()=>.4})]),actors=await Promise.all(api.map(a=>a.make())),frame=[0,0],times=[[],[]],cpu=[[],[]];
const tick=k=>{const i=frame[k]++,ch=actors[k].character,ang=i*.025;ch.onEvent=null;ch.root.position.set(Math.sin(ang)*2,0,Math.cos(ang)*2);ch.root.rotation.y=ang;api[k].G.time+=1/60;ch.update(1/60,{form:'kid',grounded:true,speed:4,localMove:{x:Math.sin(ang),z:Math.cos(ang)},firing:i%120>60,ink:1,hp:1,vy:0,aimPitch:.12});ch.root.updateMatrixWorld(true);ch.skeleton.update();};
for(let k=0;k<2;k++)for(let i=0;i<200;i++)tick(k);
for(let window=0;window<8;window++){
 const k=[0,1,1,0][window%4],c=process.cpuUsage(),t=performance.now();for(let i=0;i<600;i++)tick(k);times[k].push(performance.now()-t);const used=process.cpuUsage(c);cpu[k].push((used.user+used.system)/1000);
}
const median=a=>{a=[...a].sort((a,b)=>a-b);return(a[1]+a[2])/2;};
const report={scope:'Loaded source Character simulation only, 600 updates/window, ABBA x2; not renderer/device FPS',node:process.version,cpu:os.cpus()[0].model,timesMs:times,cpuMs:cpu,medians:times.map(median),cpuMedians:cpu.map(median)};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));api.forEach(a=>a.reset());
