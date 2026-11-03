import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './weapon-edgecases-fixture.mjs';
import {FixedClock} from '../runtime/clock.mjs';

// S3: a Charger shot is released only after its 8F minimum charge. A tap is
// still guaranteed to fire, but at the same tick as a press held to 8F:
// 1F startup + 8F charge + 1F release gap -> emitted on tick 11.
for(const frames of [1,2,3,7,9])test(`${frames}-tick Charger press releases one paid minimum shot after the 8F minimum`,async()=>{
 const f=await fixture({composeProductionAdapters:true}),a=f.make('charger'),r=a.weaponRunner;
 a.ink=100;a.intent.fire=true;f.tick(a,frames);assert.equal(f.shots.length,0);
 a.intent.fire=false;let shotTick=0,holdTick=0,paid=NaN;
 for(let t=frames+1;t<=20&&!shotTick;t++){f.tick(a);if(!holdTick&&r.s3ReleaseHold){holdTick=t;paid=100-a.ink;}if(f.shots.length)shotTick=t;}
 assert.equal(holdTick,10,'release recognised after the 8th charge frame');
 assert.equal(shotTick,11,'tap fires at the native 8F minimum boundary');
 assert(Math.abs(paid-a.weapon.inkMin)<1e-9,'exactly the minimum ink is paid');
 assert.equal(f.shots[0].charge,a.weapon.minimumChargeTime/a.weapon.chargeTime);
 f.tick(a,60);assert.equal(f.shots.length,1,'released input cannot auto-repeat');
});
test('mashing ZR cannot outpace the 8F charge + 6F recharge cycle',async()=>{
 for(const [hold,gap] of [[1,1],[1,2],[2,1],[2,3]]){
  const f=await fixture({composeProductionAdapters:true}),a=f.make('charger');a.ink=100;
  const times=[];let t=0;
  while(t<300){
   a.intent.fire=true;for(let i=0;i<hold;i++){f.tick(a);t++;a.ink=100;if(f.shots.length>times.length)times.push(t);}
   a.intent.fire=false;for(let i=0;i<gap;i++){f.tick(a);t++;a.ink=100;if(f.shots.length>times.length)times.push(t);}
  }
  const gaps=times.slice(1).map((x,i)=>x-times[i]);
  assert(gaps.length>10,`${hold}/${gap}: mashing still fires`);
  assert(Math.min(...gaps)>=15,`${hold}/${gap}: minimum shot interval ${Math.min(...gaps)}F >= 1F gap + 6F recharge + 8F charge`);
 }
});
test('minimum tap cannot bypass empty ink, squid, sub, input cancellation or reset',async()=>{
 for(const stop of ['empty','squid','sub','cancel','reset']){
  const f=await fixture({composeProductionAdapters:true}),a=f.make('charger'),r=a.weaponRunner;
  a.intent.fire=true;f.tick(a);a.intent.fire=false;
  if(stop==='empty')a.ink=0;
  if(stop==='squid')a.intent.squid=true;
  if(stop==='sub')a.intent.sub=true;
  if(stop==='cancel')r.cancelPendingInput();
  if(stop==='reset')r.reset();
  f.tick(a,3);assert.equal(f.shots.length,0,stop);assert.equal(r.s3ReleaseHold,false,stop);
 }
});
test('normal partial/full charges and recovery keep their existing owners',async()=>{
 for(const frames of [30,61]){
  const f=await fixture(),a=f.make('charger'),r=a.weaponRunner;
  a.intent.fire=true;f.tick(a,frames);const charge=r.charge,paid=r.s3ChargerSpent;
  a.intent.fire=false;f.tick(a,2);assert.equal(f.shots.length,1);assert.equal(f.shots[0].charge,charge);
  assert(paid>a.weapon.inkMin);assert(r.cooldown>0);
  a.intent.fire=true;f.tick(a,2);assert.equal(f.shots.length,1,'cooldown blocks a second release');
 }
});
test('same single-tick tap and release have identical results at 30/60/120Hz rendering',async()=>{
 const traces=[];
 for(const hz of [30,60,120]){
  const f=await fixture(),a=f.make('charger'),clock=new FixedClock();let tick=0;
  for(let frame=0;frame<hz;frame++)clock.advance(1/hz,()=>{a.intent.fire=tick++===0;f.tick(a);});
  traces.push([f.shots.length,f.shots[0]?.charge,a.weaponRunner.cooldown]);
 }
 assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
});

test('catalogue Charger variants retain their existing minimum-tap emission',async()=>{
 const {fixture:catalogFixture}=await import('./source-fixture.mjs');
 const f=await catalogFixture({productionComposition:true,fullRuntime:true,realProjectiles:true});
 const ids=['s3-charger-normalscope','s3-charger-long','s3-charger-longscope','s3-charger-keeper','s3-charger-light','s3-charger-pencil'];
 for(const id of ids){
  const a=f.make(id),events=[];a.ink=100;
  const off=f.on('weapon:fire',event=>{if(event.actor===a)events.push(event);});
  try{a.intent.fire=true;f.tick(a);a.intent.fire=false;f.tick(a,30);
   assert.equal(events.length,1,id);assert.equal(a.weaponRunner.charging,false,id);
   assert(a.ink<100,id+' pays minimum ink');
  }finally{off();}
 }
});
