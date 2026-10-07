import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,ROOT} from '../../../scripts/weapons-fixture.mjs';
import {FixedClock,STEP} from '../runtime/clock.mjs';
async function setup(full=false){
 const f=await fixture({site:process.env.INKWAVE_CHARGER_SUB_SITE||`${ROOT}.charger-sub-source`,fidelity:true}),a=f.make('charger'),r=a.weaponRunner;
 f.G.actors=[a];let tick=0,shot=null;const throws=[],fire=f.projectiles.fireCharger,bomb=f.projectiles.throwBomb;
 f.projectiles.fireCharger=function(...args){const before=this._fidelityChargerFlights?.length||0,result=fire.apply(this,args);if((this._fidelityChargerFlights?.length||0)>before)shot=tick;return result;};
 f.projectiles.throwBomb=function(...args){throws.push(tick-shot);return bomb.apply(this,args);};
 const step=(fireInput=false,sub=false)=>{tick++;a.intent.fire=fireInput;a.intent.sub=sub;f.G.time+=STEP;a.update(STEP);};
 for(let i=0;i<(full?80:14);i++)step(true);
 for(let i=0;i<5&&shot===null;i++)step();
 assert.ok(shot!==null,'an actual finite flight was emitted after the existing1F gap');
 assert.ok(Math.abs(r.s3ChargerPostShot-16*STEP)<1e-9);
 return {...f,a,r,throws,step,get tick(){return tick;},get shot(){return shot;}};
}
for(const hz of [30,60,120])for(const full of [false,true])test(`${hz}Hz ${full?'full':'partial'} shot admits sub at15F and then advances the existing preparation once`,async()=>{
 const h=await setup(full),clock=new FixedClock();let aim=null;const initialInk=h.a.ink;
 for(let frame=0;frame<hz;frame++)clock.advance(1/hz,()=>{
  const age=h.tick+1-h.shot;h.step(false,age<16);
  if(h.r.aimingSub&&aim===null)aim=age;
  if(age<15){assert.equal(h.r.aimingSub,false);assert.equal(h.r.s3SubReady,null);assert.equal(h.throws.length,0);}
  if(age===15){assert.equal(h.r.s3SubReady.age,0);assert.ok(h.r.s3ChargerPostShot>0);}
  if(age===16)assert.ok(h.r.s3ChargerPostShot<1e-9,'squid clock stays16F');
 });
 assert.equal(aim,15);assert.deepEqual(h.throws,[15+Math.round(h.profile.bomb.readyTimeKid/STEP)]);
 assert.equal(h.projectiles._fidelityChargerFlights.length,1,'sub input never produces another shot');
 assert.ok(h.a.ink<initialInk,'one actual bomb paid its normal cost');
});
test('blocked early tap and low-ink release cannot create a delayed phantom bomb',async()=>{
 for(const lowInk of [false,true]){
  const h=await setup();if(lowInk)h.a.ink=0;
  for(let age=1;age<=35;age++)h.step(false,lowInk?age<16:age===1);
  assert.deepEqual(h.throws,[]);assert.equal(h.r.s3SubReady,null);assert.equal(h.r.aimingSub,false);
 }
});
test('reset and death retire the existing shot clock and pending sub state',async()=>{
 for(const state of ['reset','dead']){
  const h=await setup();h.step(false,true);
  if(state==='reset')h.r.reset();else {h.a.alive=false;h.a.respawnTimer=100;}
  h.step(false,false);assert.equal(h.r.s3ChargerPostShot,0);assert.equal(h.r.s3SubReady,null);assert.equal(h.r.aimingSub,false);assert.deepEqual(h.throws,[]);
 }
});
test('non-fired release cancellation uses its5F gate and creates no post-shot gate',async()=>{
 const f=await fixture({site:`${ROOT}.charger-sub-source`,fidelity:true}),a=f.make('charger');f.G.actors=[a];
 for(let t=1;t<=8;t++){a.intent.fire=t<=2;a.intent.sub=t>=3;f.G.time+=STEP;a.update(STEP);if(t<8)assert.equal(a.weaponRunner.aimingSub,false);}
 assert.equal(f.projectiles._fidelityChargerFlights?.length||0,0);assert.equal(a.weaponRunner.s3ChargerPostShot,0);
 assert.equal(a.weaponRunner.aimingSub,true,'the separate #844 interruption gate has elapsed');
});

test('visual ghost flight never starts a local post-shot or SubReady clock',async()=>{
 const f=await fixture({site:`${ROOT}.charger-sub-source`,fidelity:true}),a=f.make('charger');a.remote=true;
 f.projectiles.ghostFire(a,{weapon:'charger',charge:1,muzzle:a.pos,dir:a.aimDir,len:10});
 assert.equal(f.projectiles._fidelityChargerFlights.length,1);assert.equal(f.projectiles._fidelityChargerFlights[0].ghost,true);
 assert.equal(a.weaponRunner.s3ChargerPostShot,0);assert.equal(a.weaponRunner.s3SubReady,null);
});
test('special and Super Jump transitions retire the reused shot lock without queuing a bomb',async()=>{
 for(const state of ['special','jump']){
  const h=await setup();h.step(false,true);
  if(state==='special')h.a.specialActive={id:'storm',phase:'hold',t:0,subWasDown:true,subArmed:false};
  else assert.equal(h.a.superJump(new h.THREE.Vector3(10,0,0)),true);
  h.step(false,false);assert.equal(h.r.s3ChargerPostShot,0);assert.equal(h.r.aimingSub,false);assert.deepEqual(h.throws,[]);
 }
});
