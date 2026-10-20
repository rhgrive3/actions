import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {fixture} from './source-fixture.mjs';
const rows=[];
for(const hz of [20,30,60,120])test(`#1607 measured hook admission at ${hz}Hz, unchanged runtime`,async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});const dt=1/hz;
 f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 for(const kind of ['miss','close-floor','near-wall']){
 let casts=0;f.G.physics.raycast=(o,d,length,h)=>{casts++;h.hit=kind!=='miss';h.dist=kind==='close-floor'?2:1;h.point.copy(o).addScaledVector(d,h.dist);h.normal.set(0,kind==='close-floor'?1:0,kind==='near-wall'?-1:0);return h;};
 const a=f.make('shooter');a.weapon={...a.weapon,special:'zipcaster',specialCost:100};a.special=100;a.alive=true;a.remote=false;a._resolve=()=>{};a.aimDir.set(0,0,1);a.aimPoint=new f.THREE.Vector3(0,1,8);f.G.actors=[a];a._startSpecial();const s=a._s3AllSpecialState;const origin=a.pos.toArray();const fuel=s.inkFuel,ink=a.ink;a.intent.sub=true;a._updateSpecial(dt);const first={t:s.t,phase:s.phase,failed:s.failedHooks||0,fuel:s.inkFuel,position:a.pos.toArray(),casts};
 assert.equal(first.casts,1);assert.equal(a.ink,ink,'normal ink remains untouched');
 if(kind==='near-wall'){assert.equal(s.phase,'hookFlight');assert.equal(s.failedHooks||0,0);assert(s.inkFuel<fuel-(s.inkDrainPerSecond??13.05)*dt);const flightDuration=s.hookFlightDuration, phases=[];a.intent.sub=false;let steps=0;while(s.phase!=='ready'&&steps++<300){const prev=s.phase;a._updateSpecial(dt);if(prev!==s.phase)phases.push({from:prev,to:s.phase,t:s.t,hookWait:s.hookWait??null});}assert.equal(s.phase,'ready');assert(phases.some(p=>p.to==='hookWait'));rows.push({hz,kind,first,hookFlightDuration:flightDuration,phases,readyAt:s.t,normalInkPreserved:true});continue;}
 assert.equal(s.phase,'ready');assert.equal(s.failedHooks,1);assert.deepEqual(a.pos.toArray(),origin,'miss does not pull toward empty sky/floor');assert(Math.abs(s.inkFuel-(fuel-(s.inkDrainPerSecond??13.05)*dt))<1e-8,'miss debits only continuous tank drain');assert(Math.abs(s.nextHookAt-s.t-.75)<1e-8);
 const gate=s.nextHookAt;const firstT=s.t;a.intent.sub=false;a._updateSpecial(dt);
 // Input once just below the admission deadline, then release. No accepted raycast occurs.
 while(s.t+3*dt<gate-1e-8)a._updateSpecial(dt);
 a.intent.sub=true;a._updateSpecial(dt);const earlyT=s.t;assert(earlyT<gate);assert.equal(casts,1);assert.equal(s.failedHooks,1);
 a.intent.sub=false;a._updateSpecial(dt);while(s.t+dt<gate-1e-8)a._updateSpecial(dt);
 a.intent.sub=true;a._updateSpecial(dt);const retryT=s.t;assert.equal(casts,2);assert.equal(s.failedHooks,2);assert(retryT+1e-8>=gate);assert(retryT-gate<dt+1e-8);assert.deepEqual(a.pos.toArray(),origin);rows.push({hz,kind,first,earlyT,gate,retryT,retryDelay:retryT-firstT,retryFrames:Math.round((retryT-firstT)*hz),inkOnlyContinuousDrain:true,noHookDisplacement:true});const nextGate=s.nextHookAt;while(s.t<nextGate+dt)a._updateSpecial(dt);assert.equal(casts,2,'held input does not synthesize another press at deadline');a.intent.sub=false;a._updateSpecial(dt);a.intent.sub=true;a._updateSpecial(dt);assert.equal(casts,3,'fresh release/repress is admitted');rows.at(-1).heldInputDoesNotQueue=true;
 }
 f.G.projectiles.clear();f.G.actors=[];
});
process.on('exit',()=>{const report=JSON.stringify({scope:'Current INKWAVE behavior only; not retail verification or approval of 45F',rows},null,2);if(process.env.INKWAVE_1607_REPORT)fs.writeFileSync(process.env.INKWAVE_1607_REPORT,report);else console.log(report);});
