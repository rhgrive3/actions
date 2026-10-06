import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture} from './weapon-edgecases-fixture.mjs';import {FixedClock} from '../runtime/clock.mjs';
const DT=1/60,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
async function endStream(frames=72){const f=await fixture(),a=f.make('splatling'),r=a.weaponRunner;for(let i=0;i<frames;i++)r.update(DT,{fire:true});r.update(DT,{fire:false});let ticks=0;while(r.streaming&&ticks<200){r.update(DT,{fire:true});ticks++;}assert.ok(!r.streaming);return {...f,a,r,ticks};}
test('#501 natural stream end admits new charge on fourth subsequent tick, no sooner',async()=>{
 for(const frames of [1,19,48,72]){const f=await endStream(frames);near(f.r.cooldown,4/60);near(f.a.weapon.inkRecoverStop,40/60);
  for(let i=1;i<=4;i++){f.r.update(DT,{fire:true});assert.equal(f.r.charging,i===4,`charge ${frames} / recovery tick ${i}`);}
 }
});
test('#501 first/full charge and burst endpoints, shots and separate refill stop are preserved',async()=>{
 for(const frames of [48,72]){const f=await endStream(frames);assert.equal(f.ticks,frames===48?80:160);assert.equal(f.shots.length,frames===48?20:40);near(f.a.weapon.firstChargeTime,48/60);near(f.a.weapon.chargeTime,72/60);near(f.a.weapon.fireInterval,4/60);near(f.a.weapon.inkRecoverStop,40/60);}
});
test('#501 squid cancellation never acquires natural-end recovery or emits a phantom burst',async()=>{
 const f=await fixture(),a=f.make('splatling'),r=a.weaponRunner;r.update(DT,{fire:true});r.update(DT,{fire:false});a.form='squid';r.update(DT,{fire:false});assert.equal(r.streaming,false);assert.equal(f.shots.length,0);assert.ok(r.cooldown<4/60);r.reset();assert.equal(r.charging,false);
});
test('#501 physical barrel-loop presentation cannot extend natural charge admission',async()=>{
 const f=await endStream(1);let calls=0;f.r.spinLoop={stop(){calls++;},set(){}};for(let i=0;i<4;i++)f.r.update(DT,{fire:true});assert.equal(f.r.charging,true);near(f.r.charge,1/72); // Native audio lifecycle remains independent.
});
test('#501 repeat-cycle state histories match at 30/60/120 render cadences',async()=>{
 const traces=[];for(const hz of [30,60,120]){const f=await fixture(),a=f.make('splatling'),r=a.weaponRunner,clock=new FixedClock(),trace=[];let n=0;
  for(let j=0;j<hz*2;j++)clock.advance(1/hz,dt=>{r.update(dt,{fire:n!==1});trace.push([r.streaming,r.charging,r.cooldown,r.charge,a.ink,f.shots.length]);n++;});traces.push(trace);}
 assert.deepEqual(traces[1],traces[0]);assert.deepEqual(traces[2],traces[0]);
});
