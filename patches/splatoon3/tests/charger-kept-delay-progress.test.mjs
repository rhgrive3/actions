import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,ROOT}from '../../../scripts/weapons-fixture.mjs';import{FixedClock,STEP}from '../runtime/clock.mjs';
for(const hz of[30,60,120])test(`kept Charger existing delay reaches zero after surfacing at${hz}Hz`,async()=>{
 const f=await fixture({site:`${ROOT}.kept-delay-source`,fidelity:true}),a=f.make('charger'),r=a.weaponRunner;f.G.actors=[a];
 const tick=()=>{f.G.time+=STEP;a.update(STEP);};a.intent.fire=true;for(let i=0;i<80;i++)tick();f.G.paint.sample=()=>1;a.intent.squid=true;tick();tick();assert(r.s3Stored);
 const remaining=r.s3Stored.fireDelay,paid=a.ink;assert(remaining>0);a.intent.squid=false;let ticks=0,restored=null;const clock=new FixedClock();
 for(let n=0;n<hz;n++)clock.advance(1/hz,()=>{ticks++;tick();if(restored===null&&!r.s3Stored)restored=ticks;});
 assert.equal(restored,Math.ceil((remaining-1e-10)/STEP));assert.equal(r.charging,true);assert.equal(a.ink,paid);assert.equal(f.projectiles._fidelityChargerFlights?.length||0,0);
 a.lastFire=0; // isolate paid-shot accounting from ordinary passive refill
 a.intent.fire=false;tick();tick();assert.equal(f.projectiles._fidelityChargerFlights.length,1);assert.equal(a.ink,paid);
});
