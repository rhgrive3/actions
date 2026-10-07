import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,ROOT} from '../../../scripts/weapons-fixture.mjs';
import {FixedClock,STEP} from '../runtime/clock.mjs';
async function setup(boss=false){
 const f=await fixture({site:process.env.INKWAVE_ROLL_CADENCE_SITE||`${ROOT}.roll-contact-source`,fidelity:true});
 const a=f.make('roller'),v=f.make('shooter',{team:1,z:.8}),ticks=[];let tick=0;
 f.G.actors=boss?[a]:[a,v];a.grounded=true;a.intent.move.set(0,0,1);a.vel.z=2;
 if(boss){f.G.boss={rollHit:()=>({boss:true,target:v,point:v.pos}),hit:()=>{ticks.push(tick);return false;}};}
 else {const hit=f.projectiles.applyHit;f.projectiles.applyHit=function(...args){ticks.push(tick);return hit.apply(this,args);};}
 const step=()=>{f.G.time=tick*STEP;a.weaponRunner._roller(STEP,{fire:true,firePressed:false},a.weapon);tick++;};
 return {...f,a,v,ticks,step};
}
for(const hz of [30,60,120])for(const boss of [false,true])test(`${hz}Hz ${boss?'Boss':'Actor'} repeated contact is24F including a timestamp of zero`,async()=>{
 const f=await setup(boss),clock=new FixedClock();assert.equal(f.a.weapon.rollContactInterval,24/60);
 for(let frame=0;frame<2*hz;frame++)clock.advance(1/hz,()=>f.step());
 assert.deepEqual(f.ticks,[0,24,48,72,96]);
 assert.equal(f.a.weapon.rollDamage,125);
});
test('changing the explicit weapon interval controls both contact paths without changing the first hit',async()=>{
 for(const boss of [false,true]){
  const f=await setup(boss);f.a.weapon={...f.a.weapon,rollContactInterval:12/60};
  for(let i=0;i<25;i++)f.step();assert.deepEqual(f.ticks,[0,12,24]);
 }
});
