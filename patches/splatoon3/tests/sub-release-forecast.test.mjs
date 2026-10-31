import test from 'node:test';
import assert from 'node:assert/strict';
import { forecastSubRelease, SUB_USE_STARTUP_SECONDS } from '../runtime/sub-release-forecast.mjs';
import { installSubReady } from '../runtime/sub-ready.mjs';
import { kitSubRelease, CURLING } from '../runtime/kit-subs.mjs';

const STEP=1/60;
const SUB={bomb:{id:'bomb',inkCost:70,throwSpeed:67.2},curling:CURLING};
// Exercise the production readiness wrapper and production held-charge owner;
// only the emission sink is recorded instead of creating a mesh/projectile.
class Runner{
  constructor(a){this.a=a;this.aimingSub=true;this.s3SubHold=0;this.emitted=[];}
  update(dt,input){const release=kitSubRelease(SUB,this,dt,input);if(input.subReleased)this.emitted.push(release.__hold);}
  reset(){} busy(){return false;}
}
class Actor{update(){} _startSpecial(){}}
installSubReady({Actor,WeaponRunner:Runner,SUB},{bomb:{readyTimeKid:5*STEP,readyTimeSquid:10*STEP}});
function runner(hold,ready){
  const a={alive:true,ink:100,weapon:{kind:'shooter',sub:'curling'},s3:{modifiers:{}},intent:{},_prevIntent:{}};
  const r=new Runner(a);a.weaponRunner=r;r.s3SubHold=hold;r.s3SubReady={...ready};return r;
}
const state=(age,minimum=5*STEP,useStartup=null)=>({age,minimum,useStartup,pending:useStartup!==null});

test('release-now forecast matches the real readiness owner before, at and after admission',()=>{
  const cases=[
    {hold:10*STEP,ready:state(10*STEP)},
    {hold:STEP,ready:state(0,10*STEP)},
    {hold:4*STEP,ready:state(4*STEP)},
    {hold:11*STEP,ready:state(11*STEP,5*STEP,SUB_USE_STARTUP_SECONDS)},
  ];
  for(const item of cases){
    const r=runner(item.hold,item.ready),before=JSON.stringify({hold:r.s3SubHold,ready:r.s3SubReady});
    const forecast=forecastSubRelease(r,{anticipateRelease:true});
    assert.equal(JSON.stringify({hold:r.s3SubHold,ready:r.s3SubReady}),before,'forecast is read-only');
    let frames=0;
    while(!r.emitted.length&&frames<30){r.update(STEP,{sub:false,subReleased:frames===0});frames++;}
    assert.equal(r.emitted.length,1);
    assert.equal(forecast.hold,r.emitted[0],'same held-charge accumulation order');
    assert.equal(forecast.ticks,frames,'same remaining startup/preparation ticks');
  }
});

test('an admitted throw snapshot keeps present charge unless anticipation is requested',()=>{
  const r=runner(10*STEP,state(10*STEP));
  const immediate=forecastSubRelease(r),releaseNow=forecastSubRelease(r,{anticipateRelease:true});
  assert.equal(immediate.hold,10*STEP);assert.equal(immediate.ticks,0);
  assert.equal(releaseNow.hold,10*STEP+STEP);assert.equal(releaseNow.heldTicks,1);
  r.s3SubReady=null;
  assert.equal(forecastSubRelease(r,{anticipateRelease:true}).hold,r.s3SubHold,'no fabricated readiness after admission');
});

test('Fizzy release consumes only already queued bonus frames through its final emission tick',()=>{
  const r=runner(39*STEP,state(50*STEP));r.s3FizzyCharge={queue:5};
  const actual=forecastSubRelease(r,{anticipateRelease:true,queuedFrames:r.s3FizzyCharge.queue,queueFramesPerSecond:150});
  const expected=(39*STEP+2.5/60)+STEP+2.5/60;
  assert.equal(actual.hold,expected);assert.equal(actual.heldTicks,1);assert.equal(actual.ticks,2);
  assert.equal(r.s3FizzyCharge.queue,5,'preview never drains the live shake queue');
  const capped=forecastSubRelease(r,{anticipateRelease:true,queuedFrames:30,queueFramesPerSecond:150});
  assert.equal(capped.hold,expected,'future extra shake input is not assumed');
});
