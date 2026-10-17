import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './weapon-edgecases-fixture.mjs';
import {FixedClock} from '../runtime/clock.mjs';
import {verticalRollerPose, horizontalRollerPose} from '../runtime/roller.mjs';
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
  if(vertical){for(let i=0;i<6;i++)r.update(dt,{fire:false});a.grounded=true;}
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
 const f=await setup(),{a,r}=f;a.intent.move.set(0,0,1);r.update(dt,{fire:true,firePressed:true});for(let i=0;i<42;i++)r.update(dt,{fire:true});assert.ok(r.rolling);near(r.moveSpeed(),a.weapon.rollBaseSpeed);
 r.rollT=2;near(r.moveSpeed(),a.weapon.rollSpeed);r.update(dt,{fire:false});assert.equal(r.rolling,false);r.reset();near(r.moveSpeed(),f.PLAYER.runSpeed);
 a.ink=0;r.update(dt,{fire:true,firePressed:true});assert.equal(r.flick,-1);near(r.moveSpeed(),f.PLAYER.runSpeed);r.reset();r.flick=.1;r.lockT=.1;near(r.moveSpeed(),0);
 a.setWeapon('shooter');r.reset();r.firingT=.2;near(r.moveSpeed(),f.PLAYER.runSpeed);
 // Current Shooter movement is owned by actual shot emission, not presentation firingT.
 a.ink=100;a.intent.fire=true;const projectiles=new f.Projectiles(new f.THREE.Scene());f.G.projectiles=projectiles;
 for(let i=0;i<8&&projectiles.list.length===0;i++)f.tick(a);
 assert.ok(projectiles.list.length>0);near(r.moveSpeed(),a.weapon.moveSpeedFiring);
});
test('#373 fixed 60Hz traces are equal at 30/60/120 render schedules',async()=>{
 const traces=[];
 for(const hz of [30,60,120]){const f=await setup(true),clock=new FixedClock(),trace=[];let tick=0;
  for(let frame=0;frame<hz;frame++)clock.advance(1/hz,delta=>{f.r.update(delta,{fire:tick===0,firePressed:tick===0});trace.push([f.r.flick,f.r.moveSpeed(),f.a.ink,f.shots.length]);tick++;});traces.push(trace);}
 assert.deepEqual(traces[1],traces[0]);assert.deepEqual(traces[2],traces[0]);
});

test('vertical release retains source swing speed until 56F recovery, including airborne steering',async()=>{
  const f=await setup(true),{a,r}=f;
  a.intent.move.set(1,0,0);a.vel.set(0,0,0);
  r.update(dt,{fire:true,firePressed:true});
  for(let i=0;i<31;i++)r.update(dt,{fire:false});
  assert.equal(f.shots.length,1);
  assert.equal(r.s3RollerAttack.vertical,true);
  for(let i=0;i<21;i++){
    r.update(dt,{fire:false});
    near(r.moveSpeed(),2.88);
    a.vel.set(0,0,0);
    // Air steering accelerates by one fixed increment each tick; 8 ticks
    // produce 2.666... WU/s, while the 9th reaches the sourced 2.88 target.
    // Preserve native acceleration rather than snapping to the target early.
    for(let j=0;j<9;j++)a._horizontal(dt,false,false);
    near(a.vel.x,2.88); // P.airMinSpeed=4.6 must not erase Roller attack speed.
  }
  for(let i=0;i<5;i++)r.update(dt,{fire:false});
  assert.equal(r.s3RollerAttack,null);
  near(r.moveSpeed(),f.PLAYER.runSpeed);
});

test('vertical ink-release key stays upright through follow-through, never replays the horizontal flick',()=>{
 const release=31/60,interval=56/60;
 const before=verticalRollerPose(release-1/60,release,interval);
 const at=verticalRollerPose(release,release,interval);
 const follow=verticalRollerPose(release+3/60,release,interval);
 const horizontal=horizontalRollerPose(21/60,21/60,42/60);
 assert.ok(before.rotation[2]>1.25,'upright before emission');
 near(at.rotation[2],Math.PI/2);
 near(follow.rotation[2],Math.PI/2);
 assert.ok(Math.abs(at.rotation[2]-horizontal.rotation[2])>.6,'vertical release is not horizontal release');
});
