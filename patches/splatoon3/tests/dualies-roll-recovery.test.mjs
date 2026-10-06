import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {FixedClock,STEP} from '../runtime/clock.mjs';

async function twoRolls(){
 const f=await fixture(),a=f.make('dualies'),r=a.weaponRunner;
 a.intent.fire=true;a.intent.move.set(0,0,1);
 assert.equal(r.tryDodge(a.intent.move),true);
 while(r.dodge)r.update(STEP,{fire:true});
 assert.equal(r.rollsLeft,1);assert.equal(r.tryDodge(a.intent.move),true);assert.equal(r.rollsLeft,0);
 return {...f,a,r};
}
for(const hz of [30,60,120])test(`${hz}Hz held fire restores rolls exactly when the existing movement recovery ends`,async()=>{
 const h=await twoRolls(),clock=new FixedClock();let restoredAt=null,ticks=0;
 for(let frame=0;frame<hz*2;frame++)clock.advance(1/hz,()=>{
  h.r.update(STEP,{fire:true});ticks++;
  if(h.r.dodge||h.r.lockT>0)assert.equal(h.r.rollsLeft,0);
  else if(restoredAt===null){restoredAt=ticks;assert.equal(h.r.rollsLeft,h.a.weapon.rolls);}
 });
 assert.equal(restoredAt,Math.round((h.a.weapon.rollTime+h.a.weapon.lockTime)/STEP));
 assert.equal(h.r.rollsLeft,h.a.weapon.rolls);
 const before=h.a.ink;assert.equal(h.r.tryDodge(h.a.intent.move),true);
 assert.equal(h.r.rollsLeft,h.a.weapon.rolls-1);assert.ok(Math.abs(before-h.a.ink-h.a.weapon.rollInk)<1e-10);
 assert.equal(h.r.tryDodge(h.a.intent.move),false,'one request cannot consume another active roll');
});

test('releasing fire cannot replenish early and recovery does not exit held turret pose',async()=>{
 const h=await twoRolls();while(h.r.dodge)h.r.update(STEP,{fire:true});
 h.a.intent.move.set(0,0,0);assert.equal(h.r.s3Turret,true);
 h.r.update(STEP,{fire:false});assert.equal(h.r.rollsLeft,0);
 const held=await twoRolls();while(held.r.dodge)held.r.update(STEP,{fire:true});
 held.a.intent.move.set(0,0,0);assert.equal(held.r.s3Turret,true);
 while(held.r.lockT>0)held.r.update(STEP,{fire:true});
 assert.equal(held.r.rollsLeft,held.a.weapon.rolls);assert.equal(held.r.s3Turret,true);
 held.r.update(STEP,{fire:true});assert.equal(held.r.s3Turret,true);
});

test('positive recovery still rejects a third consecutive dodge',async()=>{
 const h=await twoRolls();while(h.r.dodge)h.r.update(STEP,{fire:true});
 assert.ok(h.r.lockT>0);const ink=h.a.ink;
 assert.equal(h.r.tryDodge(h.a.intent.move),false);assert.equal(h.a.ink,ink);assert.equal(h.r.rollsLeft,0);
});
