import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,ROOT} from '../../../scripts/weapons-fixture.mjs';
import {FixedClock,STEP} from '../runtime/clock.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function setup(vertical=false){
 const f=await fixture({site:process.env.INKWAVE_ROLL_REFILL_SITE||`${ROOT}.roll-refill-source`,fidelity:true}),a=f.make('roller');f.G.actors=[a];a.ink=50;a.lastFire=10;
 if(vertical){
  // #479 keeps a new natural fall horizontal for25F. Use an actually accepted
  // jump for this vertical-shot fixture, without bypassing its selection owner.
  a.intent.jump=true;f.G.time+=STEP;a.update(STEP);
  assert.equal(a.grounded,false,'the native jump was admitted');
  a.intent.jump=false;a.ink=50;a.lastFire=10;
 }
 let tick=0;const releases=[],fire=f.projectiles.fireFlick;
 f.projectiles.fireFlick=function(...args){const before=this.list.length,result=fire.apply(this,args);releases.push({tick,count:this.list.length-before});return result;};
 const rows=[];
 const step=(fireInput=tick===0)=>{tick++;a.intent.fire=fireInput;f.G.time+=STEP;a.update(STEP);rows.push({tick,ink:a.ink,lastFire:a.lastFire,remaining:a.s3.recoverStopRemaining,sub:a.weaponRunner.s3FlickPostSub,squid:a.weaponRunner.s3FlickPostSquid});};
 return {...f,a,r:a.weaponRunner,releases,rows,step,get tick(){return tick;}};
}
for(const hz of [30,60,120])for(const vertical of [false,true])test(`${hz}Hz ${vertical?'vertical':'horizontal'} refill starts after the full release-owned stop`,async()=>{
 const h=await setup(vertical),clock=new FixedClock();
 for(let frame=0;frame<3*hz;frame++)clock.advance(1/hz,()=>h.step());
 assert.deepEqual(h.releases,[{tick:vertical?32:22,count:vertical?5:13}]);
 const release=h.releases[0].tick,at=h.rows[release-1],paid=h.rows[0].ink;
 near(at.lastFire,0);near(at.remaining,(vertical?58:43)*STEP);
 near(at.sub,(vertical?17:13)*STEP);near(at.squid,(vertical?18:14)*STEP);
 const refill=h.rows.find(row=>row.tick>1&&row.ink>paid+1e-8);
 assert.equal(refill.tick-release,vertical?58:43);
 for(const row of h.rows.slice(1,refill.tick-1))near(row.ink,paid);
 near(h.a.weapon.flickInk,8.5);near(h.a.weapon.verticalInk,8.5);
});
test('reset or insufficient ink without a release does not stamp a post-shot clock',async()=>{
 for(const cancel of ['reset','dry']){
  const h=await setup();if(cancel==='dry')h.a.ink=0;
  h.step();for(let i=0;i<3;i++)h.step(false);
  if(cancel==='reset')h.r.reset();
  const last=h.a.lastFire;for(let i=0;i<10;i++)h.step(false);
  assert.equal(h.releases.length,0);near(h.a.lastFire,last+10*STEP);
 }
});
test('a longer existing stop remains owned by its original action and a remote actor gets no new local stamp',async()=>{
 for(const remote of [false,true]){
  const h=await setup();h.a.remote=remote;
  for(let i=0;i<21;i++)h.step();
  h.a.s3.recoverStopRemaining=3;const before=h.a.lastFire;h.step(false);
  assert.equal(h.releases.length,1);near(h.a.s3.recoverStopRemaining,3-STEP);
  near(h.a.lastFire,remote?before+STEP:0);
 }
});

test('each admitted tap restarts the existing stop at its own release',async()=>{
 const h=await setup();for(let i=0;i<140;i++)h.step(i===0||i===43);
 assert.deepEqual(h.releases.map(x=>x.tick),[22,65]);
 for(const {tick} of h.releases){near(h.rows[tick-1].lastFire,0);near(h.rows[tick-1].remaining,43*STEP);}
 const paid=h.rows[64].ink;
 const refill=h.rows.find(row=>row.tick>65&&row.ink>paid+1e-8);
 assert.equal(refill.tick,108);
});
