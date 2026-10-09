import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './weapon-edgecases-fixture.mjs';
import {FixedClock} from '../runtime/clock.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const dt=1/60;
async function setup(vertical=false){const f=await fixture(),a=f.make('roller');a.grounded=!vertical;return {...f,a,r:a.weaponRunner};}
test('#373 horizontal/vertical actual windup holds 2.88 without changing 21/31F release or ink',async()=>{
 for(const vertical of [false,true]){
  const f=await setup(vertical),{a,r}=f;r.update(dt,{fire:true,firePressed:true});const frames=vertical?31:21;
  for(let i=0;i<frames;i++){near(r.moveSpeed(),2.88);assert.equal(f.shots.length,0);r.update(dt,{fire:false});}
  assert.equal(f.shots.length,1);near(a.ink,91.5);assert.equal(r.s3RollerAttack.released,true);near(r.s3RollerAttack.elapsed,frames/60);
 }
});
test('#373 independent target remains constant with gear/Flow and selected mode survives landing',async()=>{
 for(const vertical of [false,true]){
  const f=await setup(vertical),{a,r}=f;a.s3.loadout=Array.from({length:3},()=>({main:'runSpeed',subs:['runSpeed','runSpeed','runSpeed']}));a.setWeapon('roller');
  r.update(dt,{fire:true,firePressed:true});const expected=r.moveSpeed();assert.ok(expected>=2.88); // Preserve whichever gear classification the composed gear owner selects.
  if(vertical)a.grounded=true;
  for(let i=0;i<10;i++)r.update(dt,{fire:false});near(r.moveSpeed(),expected);assert.equal(r.s3FlickVertical,vertical);
  a.s3.flow.active=true;near(r.moveSpeed(),expected*f.profile.flow.runMultiplier);
 }
});
test('#373 native actor horizontal uses fixed target and keeps acceleration, not a velocity snap',async()=>{
 const f=await setup(),{a,r}=f;a.intent.move.set(0,0,1);a.vel.set(0,0,0);r.update(dt,{fire:true,firePressed:true});
 a._horizontal(dt,false,false);const first=a.vel.length();assert.ok(first>0&&first<2.88);
 for(let i=0;i<19;i++){r.update(dt,{fire:false});a._horizontal(dt,false,false);near(r.moveSpeed(),2.88);assert.ok(a.vel.length()<=2.88+1e-9);}
 near(a.vel.length(),2.88);
});
test('#373 hold-to-roll transition, dash, lock, reset and dry admission retain native branches',async()=>{
 const f=await setup(),{a,r}=f;r.update(dt,{fire:true,firePressed:true});for(let i=0;i<42;i++)r.update(dt,{fire:true});assert.ok(r.rolling);near(r.moveSpeed(),a.weapon.rollBaseSpeed);
 r.rollT=2;near(r.moveSpeed(),a.weapon.rollSpeed);r.update(dt,{fire:false});assert.equal(r.rolling,false);r.reset();near(r.moveSpeed(),f.PLAYER.runSpeed);
 a.ink=0;r.update(dt,{fire:true,firePressed:true});assert.equal(r.flick,-1);near(r.moveSpeed(),f.PLAYER.runSpeed);r.reset();r.flick=.1;r.lockT=.1;near(r.moveSpeed(),0);
 a.setWeapon('shooter');r.reset();r.firingT=.2;near(r.moveSpeed(),a.weapon.moveSpeedFiring);
});
test('#373 fixed 60Hz traces are equal at 30/60/120 render schedules',async()=>{
 const traces=[];
 for(const hz of [30,60,120]){const f=await setup(true),clock=new FixedClock(),trace=[];let tick=0;
  for(let frame=0;frame<hz;frame++)clock.advance(1/hz,delta=>{f.r.update(delta,{fire:tick===0,firePressed:tick===0});trace.push([f.r.flick,f.r.moveSpeed(),f.a.ink,f.shots.length]);tick++;});traces.push(trace);}
 assert.deepEqual(traces[1],traces[0]);assert.deepEqual(traces[2],traces[0]);
});
