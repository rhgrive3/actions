import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './weapon-edgecases-fixture.mjs';
import {FixedClock} from '../runtime/clock.mjs';
async function trace({vertical=true,squid=false,tap=false,hz=60,kind='roller'}={}){
 const f=await fixture(),a=f.make(kind),clock=new FixedClock(),shots=[],states=[];a.grounded=!vertical;a._surface=()=>{};a._horizontal=()=>{};a._updateClimb=()=>{};
 if(squid){a.form='squid';a.intent.squid=true;a._prevIntent.squid=true;a._squidPressT=-1;}
 let tick=0;const fire=f.G.projectiles.fireFlick;f.G.projectiles.fireFlick=(...args)=>{shots.push(tick);fire(...args);};
 for(let frame=0;frame<2*hz;frame++)clock.advance(1/hz,dt=>{
  a.intent.fire=tap?tick===0:tick<60;a.intent.squid=squid;a.grounded=!vertical;f.G.time+=dt;a.update(dt);
  states.push({tick,flick:a.weaponRunner.flick,kidT:a.kidT,form:a.form,buffer:a.fireBuffer,elapsed:a.weaponRunner.s3RollerAttack?.elapsed??null});tick++;
 });return {f,a,shots,states};
}
test('#527 actual Actor distinguishes 21/31F kid and 34/44F squid startup, including buffered taps',async()=>{
 for(const vertical of [false,true])for(const squid of [false,true])for(const tap of [false,true]){
  const r=await trace({vertical,squid,tap});assert.equal(r.shots[0],(vertical?31:21)+(squid?13:0),JSON.stringify({vertical,squid,tap}));assert.equal(r.shots.length,1);assert.equal(r.states[r.shots[0]].elapsed,(vertical?31:21)/60);
 }
});
test('#527 actual fixed-step input/release traces are identical at 30/60/120/144Hz renders',async()=>{
 const first=await trace({squid:true,tap:true});for(const hz of [30,120,144]){const next=await trace({squid:true,tap:true,hz});assert.deepEqual(next.shots,first.shots);assert.deepEqual(next.states,first.states);}
});
test('#527 repeated legal vertical edges release 56F apart; horizontal remains 42F',async()=>{
 for(const vertical of [false,true]){const f=await fixture(),a=f.make('roller'),r=a.weaponRunner,interval=vertical?56:42,shots=[];a.grounded=!vertical;let tick=0;f.G.projectiles.fireFlick=()=>shots.push(tick);
  for(;tick<interval*3;tick++){r.update(1/60,{fire:tick%interval===0,firePressed:tick%interval===0});}
  assert.deepEqual(shots,[vertical?31:21,interval+(vertical?31:21),2*interval+(vertical?31:21)]);assert.equal(a.ink,74.5);
 }
});
test('#527 a later explicit squid press cancels buffered emergence and death/reset creates no release',async()=>{
 const f=await fixture(),a=f.make('roller');a._surface=()=>{};a.form='squid';a.intent.squid=true;a._prevIntent.squid=true;a._squidPressT=-1;a.intent.fire=true;f.tick(a);a.intent.fire=false;a.intent.squid=false;f.tick(a);a.intent.squid=true;f.tick(a);f.tick(a,70);assert.equal(f.shots.length,0);assert.equal(a.form,'squid');
 a.intent.squid=false;a.intent.fire=true;f.tick(a);a.splat(null,'water');f.tick(a,70);assert.equal(f.shots.length,0);assert.equal(a.weaponRunner.s3RollerAttack,null);
});
test('#527 non-Roller pop-out admission retains native five elapsed ticks',async()=>{
 const f=await fixture(),a=f.make('shooter');a._surface=()=>{};a.form='squid';a.intent.squid=true;a._prevIntent.squid=true;a._squidPressT=-1;a.intent.fire=true;
 for(let tick=0;tick<5;tick++){f.tick(a);assert.equal(f.shots.length,0);}f.tick(a);assert.equal(f.shots.length,1);assert.equal(a.weaponRunner.s3RollerAttack,null);
});
test('#527 records mode at runner admission, including land/leave during the 13F squid wait',async()=>{
 for(const [initialGround,changeAt,expectedVertical,release] of [[false,8,false,34],[true,8,true,44],[false,20,true,44],[true,20,false,34]]){
  const f=await fixture(),a=f.make('roller');a._surface=()=>{};a._horizontal=()=>{};a._updateClimb=()=>{};a.form='squid';a.intent.squid=true;a._prevIntent.squid=true;a._squidPressT=-1;let emitted=-1,selectedAt=-1;f.G.projectiles.fireFlick=()=>{emitted=tick;};let tick=0;
  for(;tick<60;tick++){a.grounded=tick<changeAt?initialGround:!initialGround;a.intent.fire=tick===0;f.tick(a);if(a.weaponRunner.s3RollerAttack&&selectedAt<0){selectedAt=tick;assert.equal(a.weaponRunner.s3RollerAttack.vertical,expectedVertical);}}
  assert.equal(selectedAt,13);assert.equal(emitted,release);
 }
});
