#!/usr/bin/env node
// Matched production-adapted source Actors on a controlled native dry floor.
// Read-only pose predicate diagnostic, not browser/retail/network transport.
// Run with node --experimental-vm-modules.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {spawnOwnerFixture,prepareSpawn,launchSpawn,installDryFloor,spawnOwnerRow} from '../patches/splatoon3/tests/respawn-spawn-owner-fixture.mjs';
const out=path.resolve(process.argv[2]);assert(!fs.existsSync(out),'Preserve earlier traces');fs.mkdirSync(out,{recursive:true});
const rel='patches/splatoon3/runtime/spawn-pose-motion.mjs',old=execFileSync('git',['show','702ce3d146043928fd4b783241105871515f9d92:'+rel],{encoding:'utf8'}),current=fs.readFileSync(rel,'utf8');
const result={scope:'source-loaded production Actor/Character; real native physics on replaced lower dry floor; no real transport or display FPS',beforeCommit:'702ce3d146043928fd4b783241105871515f9d92',sourceHashes:{before:createHash('sha256').update(old).digest('hex'),after:createHash('sha256').update(current).digest('hex')},traces:{}};
for(const variant of ['before','after']){
 let seed=0x5350574e;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const f=await spawnOwnerFixture({sourceOnly:true,random,moduleTransform:variant==='before'?(p,s)=>p===rel?old:s:null});
 const a=await prepareSpawn(f);launchSpawn(f,a);installDryFloor(f,-8);const rows=[];
 for(let step=0;step<240;step++){
  f.tick(a);rows.push({step,...spawnOwnerRow(f,a)});
  if(!a.s3.squidSpawn){f.tick(a);rows.push({step:step+1,...spawnOwnerRow(f,a)});break;}
 }
 assert(a.alive);assert(a.grounded);assert.equal(a.s3.squidSpawn,undefined);
 // Arrays originate in separate VM realms. Compare their complete serialized
 // values rather than realm-specific Array prototypes. Preserve each input.
 result.traces[variant]=JSON.parse(JSON.stringify(rows));
 fs.writeFileSync(path.join(out,variant+'.json'),JSON.stringify(result.traces[variant],null,2)+'\n');f.reset();
}
const physical=r=>{const {eligible,anchor,rotation,...rest}=r;return rest;};
assert.deepEqual(result.traces.after.map(physical),result.traces.before.map(physical),'All native input/physics/lifecycle/timer/action records must match');
const premature=result.traces.before.filter(r=>r.spawn?.phase==='landing'&&!r.grounded&&r.eligible);
assert(premature.length>0,'Frozen 702 source must reproduce the regression');
assert.equal(result.traces.after.filter(r=>r.spawn&&r.eligible).length,0,'No active lifecycle may yield ready');
assert.equal(result.traces.after.at(-1).eligible,true,'Supported touchdown still yields next native frame');
result.status='passed';result.matchedPhysicsSamples=result.traces.after.length;result.prematureBefore=premature.map(r=>({step:r.step,y:r.position[1],spawnTime:r.spawnTime,phase:r.spawn.phase,pose:r.pose}));
fs.writeFileSync(path.join(out,'trace.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,samples:result.matchedPhysicsSamples,prematureBefore:result.prematureBefore}));
