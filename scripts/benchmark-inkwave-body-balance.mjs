#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import {sourceLoadedActorFixture} from '../patches/splatoon3/tests/source-loaded-actor-fixture.mjs';
import {baselineBalanceSource,poseSnapshot} from '../patches/local-quality/tests/body-balance-work-fixture.mjs';
import assert from 'node:assert/strict';
const extraExports="export {locomotionProfile} from './src/game/motion/locomotion-profile.js';";
const pair=await Promise.all([sourceLoadedActorFixture({sourceOnly:true,transform:baselineBalanceSource,random:()=>.4,extraExports}),sourceLoadedActorFixture({sourceOnly:true,random:()=>.4,extraExports})]);
try{
 const actors=await Promise.all(pair.map(api=>api.make())),controllers=actors.map(a=>a.character.sourceMotion);
 for(let k=0;k<controllers.length;k++){const c=controllers[k];c.bank.sample('WalkHold_Nrml',12.25,c.pose);c.bodyBalance.clear();c.bodyBalance.add(pair[k].locomotionProfile(c.bank,'WalkHold_Nrml'),1);}
 const run=k=>{const c=controllers[k];let checksum=0;for(let i=0;i<40000;i++){c.bodyBalance.apply(c.pose,c.pose,{run:.4,weight:1,pivot:(i%10)/10,strafe:(i%7)/7});checksum+=c.bodyBalance.pose.wp[21].y;}return checksum;};
 run(0);run(1);const samples=[];
 for(const variant of [0,1,1,0,0,1,1,0]){const cpu=process.cpuUsage(),t=performance.now(),checksum=run(variant);samples.push({variant:variant?'after':'before',ms:performance.now()-t,cpu:process.cpuUsage(cpu),checksum});}
 assert.equal(new Set(samples.map(x=>x.checksum)).size,1);assert.deepEqual(structuredClone(poseSnapshot(controllers[1].bodyBalance.pose)),structuredClone(poseSnapshot(controllers[0].bodyBalance.pose)));
 const median=a=>{a.sort((a,b)=>a-b);return(a[1]+a[2])/2;};
 const result={scope:'40000 actual production-composed BodyBalance.apply calls/window, lossless Player00; ABBA x2. Not whole-game/device FPS.',environment:{node:process.version,cpu:os.cpus()[0].model},intermediateWorldRotations:controllers.map(c=>c.bodyBalance.rotationWorldIndices?.length??c.bank.bones.length),outputBones:controllers[0].bank.bones.length,samples,medianMs:Object.fromEntries(['before','after'].map(v=>[v,median(samples.filter(x=>x.variant===v).map(x=>x.ms))]))};
 if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{pair.forEach(api=>api.reset());}
