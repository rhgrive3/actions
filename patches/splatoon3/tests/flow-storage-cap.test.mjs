import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {fixture} from './source-fixture.mjs';
import {FixedClock} from '../runtime/clock.mjs';
const site=process.env.INKWAVE_FLOW_CAP_SITE;
const {createFlow,awardFlow,advanceFlow,penalizeFlowDeath}=await import(site?pathToFileURL(path.join(site,'patches/splatoon3/runtime/flow.mjs')):new URL('../runtime/flow.mjs',import.meta.url));
const cfg=JSON.parse(fs.readFileSync(new URL('../profile.json',import.meta.url))).flow;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const fill=(s,c=cfg)=>{for(let i=0;i<10;i++)awardFlow(s,'turf',1000,c);};
// Turf input stays bound to the current profile; this suite owns the storage cap.
const turfGain=(area,c=cfg)=>area*c.weights.turf;
const decayLoss=(seconds,c=cfg)=>{const p=c.progress,slow=Math.min(seconds,p.fastDecayAfter);return (slow*p.decayPerSecond+(seconds-slow)*p.fastDecayPerSecond)*c.threshold/p.referenceThreshold;};

test('#768 normalized cap allows threshold excess without activation and requires a splat',()=>{
 const s=createFlow();awardFlow(s,'turf',1000,cfg);near(s.score,turfGain(1000));assert.equal(s.active,false);
 awardFlow(s,'assist',3,cfg);near(s.score,turfGain(1000)+3*cfg.weights.assist);assert.equal(s.active,false);
 fill(s);near(s.score,6);assert.equal(s.active,false);
 awardFlow(s,'damage',100000,cfg);near(s.score,6);
 assert.equal(awardFlow(s,'splat',1,cfg),true);near(s.score,0);near(s.remaining,cfg.duration);
});

test('cap follows the existing reference-fp normalization, not a fixed runtime six',()=>{
 for(const threshold of [3,10,100]){
  const c={...cfg,threshold},s=createFlow();awardFlow(s,'assist',100000,c);
  near(s.score,200*threshold/c.progress.referenceThreshold);assert.equal(s.active,false);
 }
});

for(const hz of [30,60,120])test(`#768 ${hz}Hz decay cannot use an oversized pre-activation bank`,()=>{
 const s=createFlow(),uncapped=createFlow(),old={...cfg,progress:{...cfg.progress}};delete old.progress.referenceCap;
 fill(s);fill(uncapped,old);near(s.score,6);near(uncapped.score,turfGain(10000));
 const clock=new FixedClock();for(let i=0;i<hz*60;i++)clock.advance(1/hz,dt=>{advanceFlow(s,dt,cfg);advanceFlow(uncapped,dt,old);});
 near(s.score,6-decayLoss(60));near(uncapped.score,turfGain(10000)-decayLoss(60));
 assert.equal(awardFlow(s,'splat',1,cfg),false);assert.equal(awardFlow(uncapped,'splat',1,old),true);
});

test('death losses start at the cap; active extension remains independent',()=>{
 for(const [cause,expected]of [['shooter',5.85],['water',5.7],['fall',5.7]]){
  const s=createFlow();fill(s);penalizeFlowDeath(s,cause,cfg);near(s.score,expected);
 }
 const active={...createFlow(),active:true,remaining:10};awardFlow(active,'turf',100000,cfg);near(active.score,0);near(active.remaining,10);
 awardFlow(active,'assist',1,cfg);near(active.remaining,10+cfg.extension);near(active.score,0);
});

async function world(mode){
 const options=site?{adapt:rel=>fs.readFileSync(path.join(site,rel),'utf8'),adaptRuntime:rel=>fs.readFileSync(path.join(site,rel),'utf8')}:{};
 const f=await fixture(options);f.G.match.mode=mode;f.G.match.canRespawn=()=>false;
 f.G.level.spawnPads=[new f.THREE.Vector3(),new f.THREE.Vector3(0,0,20)];
 f.G.physics.groundProbe=(_x,_y,_z,_r,_d,_foot,h)=>{h.hit=false;return h;};
 return{...f,a:f.make()};
}

test('native Turf events cap Flow only, preserving turf/special credits and lifecycle',async()=>{
 const f=await world('turf'),a=f.a;
 for(let i=0;i<10;i++)a.addTurf(1000);
 near(a.stats.turf,10000);near(a.special,a.specialCost());near(a.s3.flow.score,6);assert.equal(a.s3.flow.active,false);
 a.splat(null,'water');near(a.s3.flow.score,5.7);a.respawn();near(a.s3.flow.score,5.7);
 a.reset();near(a.s3.flow.score,0);
});

test('custom Boss and non-match tools retain their previous accumulation',async()=>{
 for(const mode of ['boss',undefined,'range']){
  const f=await world(mode);for(let i=0;i<10;i++)f.a.addTurf(1000);near(f.a.s3.flow.score,turfGain(10000));assert.equal(f.a.s3.flow.active,false);
 }
});
