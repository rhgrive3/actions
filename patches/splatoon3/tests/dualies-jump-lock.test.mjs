import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {FixedClock,STEP} from '../runtime/clock.mjs';
const jumps=a=>a.character.events.filter(([name])=>name==='jump').length;

test('a failed extra dodge cannot fall through to ordinary jump while its token owns movement',async()=>{
 const f=await fixture(),a=f.make('dualies'),r=a.weaponRunner;
 a.intent.fire=true;a.intent.move.set(0,0,1);
 assert.equal(r.tryDodge(a.intent.move),true);const token=r.dodge,ink=a.ink;
 a.intent.move.set(0,0,0);a.intent.jump=true;f.tick(a);
 assert.equal(r.dodge,token);assert.equal(jumps(a),0);assert.equal(a.vel.y,0);assert.equal(a.ink,ink);
});

for(const hz of [30,60,120])test(`${hz}Hz post-roll lock owns normal jumping until the existing movement boundary`,async()=>{
 const f=await fixture(),a=f.make('dualies'),r=a.weaponRunner,clock=new FixedClock();
 r.lockT=3*STEP;r.rollsLeft=0;a.intent.jump=true;a.intent.move.set(0,0,0);
 const traces=[];
 for(let frame=0;frame<Math.ceil(hz/10);frame++)clock.advance(1/hz,()=>{
  const before=r.lockT,oldJumps=jumps(a);f.tick(a);
  if(before>0)assert.equal(jumps(a),oldJumps,'positive lock cannot admit an ordinary jump');
  traces.push({before,jumps:jumps(a)});
 });
 assert.equal(traces.findIndex(x=>x.jumps>0),3);
 assert.equal(jumps(a),1,'existing short jump buffer may fire once after unlock');
});

test('legal chained dodge retains its independent admission and ink owner',async()=>{
 const f=await fixture(),a=f.make('dualies'),r=a.weaponRunner;
 a.intent.fire=true;a.intent.move.set(0,0,1);assert.equal(r.tryDodge(a.intent.move),true);
 while(r.dodge)r.update(STEP,{fire:true});
 assert.ok(r.lockT>0);const before=a.ink,remaining=r.rollsLeft;
 a.intent.jump=true;f.tick(a);
 assert.ok(r.dodge);assert.equal(r.rollsLeft,remaining-1);assert.equal(jumps(a),0);
 assert.ok(a.ink<before);
});

test('unlocked Dualies and other weapons retain normal jump admission',async()=>{
 for(const weapon of ['dualies','shooter','charger','roller']) {
  const f=await fixture(),a=f.make(weapon);a.intent.jump=true;
  if(weapon!=='dualies')a.weaponRunner.lockT=.4;
  f.tick(a);assert.equal(jumps(a),1,weapon);assert.ok(a.vel.y>0);
 }
});

test('squid ordinary jump stays with its existing form and action owner',async()=>{
 const f=await fixture(),a=f.make('dualies');a.form='squid';a.submerged=true;a.intent.squid=true;a.intent.jump=true;
 f.tick(a);assert.equal(jumps(a),1);assert.ok(a.vel.y>0);
});
