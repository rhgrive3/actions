#!/usr/bin/env node
// Run: node --experimental-vm-modules scripts/bench-inkwave-native-combat-support.mjs ASSET_ROOT OUTPUT_JSON
// Static original-source API cost, not Actor movement, Game timing or hardware FPS.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {nativeFixture,readStage} from '../patches/native-stages/tests/fixture.mjs';

const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const f=await nativeFixture(),G=f.G,data=readStage(root,'shipshape');
G.level=new f.NativeLevel(data);G.physics=new f.NativePhysics(G.level);
const a=f.make('shooter');a.pos.set(19.008217972071392,6,45.533175676955224);
a.alive=a.grounded=true;a.s3.squidSpawn=null;a.superJumpState=null;a.specialActive=false;
const brain=new f.BotBrain(a,'normal');brain.mode='fight';
const candidate=()=>brain._wet(a.pos.x+.3,a.pos.z+.8,a.pos.y);
const baseline=()=>{const gy=G.level.groundHeight(a.pos.x+.3,a.pos.z+.8,a.pos.y+.6);return gy===-Infinity||gy<f.PLAYER.fallDeathY;};
assert.equal(candidate(),false);assert.equal(baseline(),false);
let probes=0;const originalProbe=G.physics.groundProbe;
G.physics.groundProbe=function(...args){probes++;return originalProbe.apply(this,args);};
for(let i=0;i<100;i++){baseline();candidate();}
const cases=[];
for(let round=0;round<30;round++){
 const row={round};
 for(const policy of round%2?['candidate','baseline']:['baseline','candidate']){
  const run=policy==='candidate'?candidate:baseline,before=probes,t=performance.now();
  for(let i=0;i<100;i++)assert.equal(run(),false);
  row[policy]={milliseconds:performance.now()-t,calls:100,groundProbeCalls:probes-before};
 }
 cases.push(row);
}
const stats=policy=>{const perCall=cases.map(c=>c[policy].milliseconds/c[policy].calls).sort((a,b)=>a-b);return {millisecondsPerCall:{p50:perCall[15],p95:perCall[28],max:perCall.at(-1)},groundProbeCallsPerWet:cases[0][policy].groundProbeCalls/100};};
const receipt={scope:'Static source-supported wet API microbenchmark, identical source/position/query, 30 alternating warm pairs of 100 calls; f.make only supplies predicate state. No Actor movement, actual Game timing, hardware FPS or overall speedup claim.',sourceSha256:G.level.manifest.sourceSha256,baseline:stats('baseline'),candidate:stats('candidate'),cases};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(receipt,null,2));
console.log(JSON.stringify({scope:receipt.scope,baseline:receipt.baseline,candidate:receipt.candidate}));
