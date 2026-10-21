// Node CPU benchmark of the real production-composed Character with source motion:
// "before" = the composition at eb65d48 (pre-migration source-bank.js and the complete
// root-subtree update at retarget ground entry), "after" = the current composition.
// Fixed scripted input, identical workload on both sides, ABBA windows.
// node --experimental-vm-modules reports/inkwave-base-logic-optimization-2026-10-20/benchmark-motion-before-after.mjs [out.json]
import fs from 'node:fs';
import os from 'node:os';
import {sourceLoadedActorFixture} from '../../patches/splatoon3/tests/source-loaded-actor-fixture.mjs';
import {adaptBuildSource} from '../../scripts/inkwave-source-composition.mjs';
const oldBank=fs.readFileSync(new URL('../../patches/local-quality/tests/fixtures/source-bank-composed-before-direct-migration.mjs.txt',import.meta.url),'utf8');
const before=(rel,raw)=>{
 if(rel==='src/game/motion/source-bank.js')return oldBank;
 const code=adaptBuildSource(rel,raw);
 return rel==='src/game/motion/retarget.js'?code.replaceAll('  this._rootWorld();','  c.root.updateWorldMatrix(true,true);'):code;
};
const api=await Promise.all([sourceLoadedActorFixture({transform:before,sourceOnly:true,random:()=>.4}),sourceLoadedActorFixture({sourceOnly:true,random:()=>.4})]);
const actors=await Promise.all(api.map(a=>a.make()));
// idle, walk, run, strafe, back, turn-in-place, shoot-walk; 0.5 s each
const phases=[[0,0,1,false,0],[1.2,0,1,false,0],[5,0,1,false,0],[2.4,1,0,true,0],[2.4,0,-1,true,0],[0,0,1,false,1.6],[3,.7,.7,true,0]];
const frame=[0,0];
const tick=k=>{const i=frame[k]++,ch=actors[k].character,[speed,x,z,firing,turn]=phases[Math.floor(i/30)%phases.length],dt=1/60;ch.onEvent=null;
 const yaw=ch.root.rotation.y+turn*dt;ch.root.rotation.y=yaw;ch.root.position.x+=(x*Math.cos(yaw)+z*Math.sin(yaw))*speed*dt;ch.root.position.z+=(-x*Math.sin(yaw)+z*Math.cos(yaw))*speed*dt;
 if(firing&&i%8===0)ch.trigger('shoot');api[k].G.time+=dt;
 ch.update(dt,{form:'kid',grounded:true,speed,localMove:{x,z},firing,charge:0,ink:1,hp:1,vy:0,aimPitch:.12});ch.root.updateMatrixWorld(true);ch.skeleton.update();};
for(let k=0;k<2;k++)for(let i=0;i<420;i++)tick(k);
const times=[[],[]];
for(let w=0;w<12;w++){const k=[0,1,1,0][w%4],t=performance.now();for(let i=0;i<630;i++)tick(k);times[k].push(performance.now()-t);}
const median=a=>{a=[...a].sort((x,y)=>x-y);return a.length%2?a[a.length>>1]:(a[a.length/2-1]+a[a.length/2])/2;};
const report={scope:'one source-loaded Character, 630 updates/window (3 cycles of 7 gait phases), ABBA x3; simulation only, not device FPS',node:process.version,cpu:os.cpus()[0].model,timesMs:times,medianMs:times.map(median),change:median(times[1])/median(times[0])-1};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));api.forEach(a=>a.reset());
