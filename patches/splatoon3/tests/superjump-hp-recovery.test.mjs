import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture, ROOT} from '../../../scripts/weapons-fixture.mjs';
import {FixedClock, STEP} from '../runtime/clock.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function setup(){
 const f=await fixture({site:process.env.INKWAVE_FLIGHT_HP_SITE||`${ROOT}.flight-hp-source`,fidelity:true});
 const a=f.make('shooter');f.G.actors=[a];
 a.s3.jumpChargeTime=STEP;a.s3.jumpStartupHumanoidF=0;a.s3.jumpFlightTime=2;
 assert.equal(a.superJump(new f.THREE.Vector3(10,0,0)),true);
 const tick=()=>{f.G.time+=STEP;a.update(STEP);};
 for(let i=0;i<120&&a.superJumpState.phase!=='flight';i++)tick();
 assert.equal(a.superJumpState.phase,'flight');a.hp=50;a.lastDamage=10;a.ink=20;
 return {...f,a,tick};
}
for(const hz of [30,60,120])test(`${hz}Hz flight keeps one HP recovery owner and no ink or ground-contact work`,async()=>{
 const f=await setup(),{a}=f,clock=new FixedClock();
 a.submerged=true;a.onEnemy=true; // stale takeoff fields must not become airborne contact.
 a.damageFromInk=7;a.s3.enemyInkTime=.9;a.s3.recoverStopRemaining=.7;
 const before=a.lastDamage;
 for(let i=0;i<hz/2;i++)clock.advance(1/hz,()=>f.tick());
 near(a.hp,50+f.profile.resources.regenRate*.5);near(a.lastDamage,before+.5);
 assert.equal(a.ink,20);assert.equal(a.damageFromInk,7);
 assert.equal(a.s3.enemyInkTime,.9);assert.equal(a.s3.recoverStopRemaining,.7);
});
test('flight preserves configured delay and HP cap without inventing a recovery coefficient',async()=>{
 const f=await setup(),{a}=f,r=f.profile.resources;
 a.lastDamage=r.regenDelay-2*STEP;f.tick();near(a.hp,50);f.tick();near(a.hp,50+r.regenRate*STEP);
 a.hp=99.99;f.tick();near(a.hp,100);
});
test('allied and enemy Storm recovery selection is shared with ordinary HP recovery',async()=>{
 for(const team of [0,1]){
  const f=await setup(),{a}=f;
  f.projectiles.clouds=[{team,t:0,dur:10,group:{position:a.pos.clone().add(new f.THREE.Vector3(0,10,0))}}];
  f.tick();near(a.hp,50+(team===a.team?f.profile.resources.regenRateSwim*STEP:0));
  assert.equal(a.ink,20);
 }
});
test('dead actors and remote flight proxies never gain locally simulated HP',async()=>{
 for(const state of ['dead','remote']){
  const f=await setup(),{a}=f;
  if(state==='dead'){a.alive=false;a.respawnTimer=100;}else a.remote=true;
  f.tick();near(a.hp,50);assert.equal(a.ink,20);
 }
});
test('landing and first ordinary update apply at most one configured recovery step',async()=>{
 const f=await setup(),{a}=f,r=f.profile.resources;
 const bound=Math.ceil(a.superJumpState.dur/STEP)+1;
 for(let n=0;a.superJumpState&&n<bound;n++){const hp=a.hp;f.tick();near(a.hp,Math.min(100,hp+r.regenRate*STEP));}
 assert.equal(a.superJumpState,null,`flight must retire within ${bound} ticks: ${JSON.stringify(a.superJumpState)}`);
 const hp=a.hp;f.tick();near(a.hp,Math.min(100,hp+r.regenRate*STEP));
});

test('the charge-to-flight takeoff tick runs the existing resource path once',async()=>{
 const f=await fixture({site:process.env.INKWAVE_FLIGHT_HP_SITE||`${ROOT}.flight-hp-source`,fidelity:true}),a=f.make('shooter');
 f.G.actors=[a];a.s3.jumpChargeTime=STEP;a.s3.jumpStartupHumanoidF=0;
 a.hp=50;a.lastDamage=10;assert.equal(a.superJump(new f.THREE.Vector3(10,0,0)),true);
 for(let i=0;i<120&&a.superJumpState.phase==='charge';i++){
  const hp=a.hp;f.G.time+=STEP;a.update(STEP);near(a.hp,Math.min(100,hp+f.profile.resources.regenRate*STEP));
 }
 assert.equal(a.superJumpState.phase,'flight');
});
