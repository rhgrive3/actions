import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,ROOT} from '../../../scripts/weapons-fixture.mjs';
import {FixedClock,STEP} from '../runtime/clock.mjs';
async function setup(ticks=14){
 const f=await fixture({site:`${ROOT}.charger-cancel-source`,fidelity:true}),a=f.make('charger'),r=a.weaponRunner;f.G.actors=[a];
 const step=(fire=false,sub=false)=>{a.intent.fire=fire;a.intent.sub=sub;f.G.time+=STEP;a.update(STEP);};
 for(let i=0;i<ticks;i++)step(true);
 return {...f,a,r,step};
}
for(const hz of [30,60,120])for(const full of [false,true])test(`${hz}Hz ${full?'full':'partial'} charge cancel admits sub at5F before independent preparation`,async()=>{
 const h=await setup(full?80:14),clock=new FixedClock(),ink=h.a.ink;let age=0,first=null;const throws=[];
 const bomb=h.projectiles.throwBomb;h.projectiles.throwBomb=function(...args){throws.push(age);return bomb.apply(this,args);};
 for(let frame=0;frame<hz/2;frame++)clock.advance(1/hz,()=>{
  h.step(true,age<6);
  if(h.r.aimingSub&&first===null)first=age;
  if(age<5){assert.equal(h.r.aimingSub,false);assert.equal(h.r.s3SubReady,null);assert.equal(h.r.charging,false);assert.equal(h.a.ink,ink);}
  if(age===5){assert.equal(h.r.s3SubReady.age,0);assert.equal(h.r.s3ChargerPostShot,0);}
  age++;
 });
 assert.equal(first,5);assert.deepEqual(throws,[10]);assert.equal(h.projectiles._fidelityChargerFlights?.length||0,0);
});
test('early released R is discarded, idle sub remains immediate',async()=>{
 const h=await setup();let throws=0;h.projectiles.throwBomb=()=>throws++;
 for(let age=0;age<15;age++)h.step(false,age===0);
 assert.equal(throws,0);assert.equal(h.r.aimingSub,false);assert.equal(h.r.s3SubReady,null);
 const idle=await setup(0);idle.step(false,true);assert.equal(idle.r.aimingSub,true);assert.equal(idle.r.s3ChargerCancelSubRemaining||0,0);
});
test('reset, explicit input cancellation, death and Super Jump retire the interruption gate',async()=>{
 for(const state of ['reset','input','death','jump']){
  const h=await setup();h.step(false,true);assert(h.r.s3ChargerCancelSubRemaining>0);
  if(state==='reset')h.r.reset();if(state==='input')h.r.cancelPendingInput();if(state==='death'){h.a.alive=false;h.a.respawnTimer=100;}
  if(state==='jump')assert(h.a.superJump(new h.THREE.Vector3(10,0,0)));
  h.step();assert.equal(h.r.s3ChargerCancelSubRemaining||0,0);assert.equal(h.r.s3SubReady,null);
 }
});
test('released ZR cancellation has the same5F boundary and keeps paid ink',async()=>{
 const h=await setup(),paid=h.a.ink;
 for(let age=0;age<=5;age++){h.step(false,true);assert.equal(h.r.aimingSub,age===5);assert.equal(h.a.ink,paid);}
 assert.equal(h.projectiles._fidelityChargerFlights?.length||0,0);
});
test('actual full-charge keep is not classified as fresh-charge interruption',async()=>{
 const h=await setup(80);h.G.paint.sample=()=>1;h.a.intent.squid=true;
 for(let i=0;i<10;i++)h.step(true,false);
 assert.ok(h.r.s3Stored,'native squid entry stored the full charge');
 h.a.intent.squid=false;h.step(true,true);
 assert.equal(h.r.s3ChargerCancelSubRemaining||0,0);assert.equal(h.projectiles._fidelityChargerFlights?.length||0,0);
});
