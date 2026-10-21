#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const site=path.resolve(process.argv[2]||'_site');
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
const current=await import(pathToFileURL(path.join(site,'_versions',manifest.build.revision,'patches/splatoon3/runtime/inkjet-vfx-budget.mjs')));
const optimized=await import(pathToFileURL(path.resolve('.ci-scratch/inkjet-optimized/inkjet-vfx-budget.mjs')));
let compared=0;
for(const hz of [30,60,120])for(const n of [1,2,4]){
 const actors=Array.from({length:n},()=>({alive:true,specialActive:{id:'inkjet'},form:'kid',intent:{}}));
 const ds=[0,1].map(()=>({time:0,G:{actors,projectiles:{list:[]}},kit:{puffs:{cap:182,n:177},sparks:{cap:900,n:895}}}));
 for(let frame=0;frame<hz*5;frame++){
  for(const a of actors){a.alive=frame%17!==0;a.form=frame%13===0?'squid':'kid';a.superJumpState=frame%23===0?{}:null;}
  const live=actors.map(owner=>({wid:frame%19===0?'shooter':'inkjet',dead:frame%11===0,pos:{},owner}));
  for(const d of ds){d.time+=1/hz;d.G.projectiles.list=live;d.kit.puffs.n=177+frame%6;d.kit.puffs.cap=frame%29===0?100:182;d.kit.sparks.n=895+frame%6;}
  for(let pass=0;pass<2;pass++)for(const a of actors){
   const records=[current,optimized].map((m,i)=>m.inkjetVfxAdmission(ds[i],a));
   assert.deepEqual(records[0],records[1]);
   for(const kind of ['puffs','sparks'])assert.equal(current.inkjetVfxRoom(records[0],ds[0].kit[kind],kind),optimized.inkjetVfxRoom(records[1],ds[1].kit[kind],kind));
   compared++;
  }
 }
}
console.log(JSON.stringify({scope:'emitted helper functional equivalence, not CPU/GPU timing',compared,status:'passed'}));
