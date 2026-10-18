import test from 'node:test';
import assert from 'node:assert/strict';
import {MAIN_WEAPON_CATALOG as catalog} from '../runtime/main-weapon-catalog-data.mjs';
import {recordSaberStick,saberStepRequested,createSaberStep,saberStepSpeed} from '../runtime/saber-step.mjs';
import {fixture} from './source-fixture.mjs';
const direction=()=>({x:0,y:0,z:1,clone(){return {setY(){return this;},normalize(){return this;}};}});
const actor=()=>({aimDir:direction(),intent:{move:{x:0,y:0,z:0}}});
for(const r of catalog.records.filter(r=>r.family==='splatana')){
 const swing=r.parameters.spl__WeaponSaberParam.SwingParam;
 test(r.id+' step preserves source startup and distance at 30/60/120 Hz with a nonconstant source-Kd envelope',()=>{
  for(const hz of [30,60,120]){
   const step=createSaberStep(actor(),swing),p=swing.SideStepParam;let distance=0,speeds=[];
   for(let i=0;i<Math.ceil((p.ChargeFrame+p.MoveFrame)*hz/60)+1;i++){
    const speed=saberStepSpeed(step,1/hz,true);distance+=speed/hz;speeds.push(speed);
    if((i+1)*60/hz<=p.ChargeFrame)assert.equal(speed,0);
   }
   assert.ok(Math.abs(distance-p.MoveDist)<1e-8,`${hz}: ${distance} != ${p.MoveDist}`);
   assert.ok(new Set(speeds.filter(v=>v>0).map(v=>v.toFixed(8))).size>1);
  }
 });
 test(r.id+' step input retains five actual frames and rejects a normalized micro-input',()=>{
  const s={},a=actor();a.intent.move.z=.01;recordSaberStick(s,a,1,5);assert.equal(saberStepRequested(s,swing),false);
  a.intent.move.z=1;recordSaberStick(s,a,1,5);a.intent.move.z=0;
  recordSaberStick(s,a,4,5);assert.equal(saberStepRequested(s,swing),true);
  recordSaberStick(s,a,1,5);assert.equal(saberStepRequested(s,swing),false);
 });
}
test('live charged Dental step uses history, waits the exported 10F startup and slows over its 15F travel',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 const a=f.make('s3-saber-heavy');a.form='kid';a.aimDir.set(0,0,1);a.intent.move.set(0,0,1);
 for(let i=0;i<20;i++)a.weaponRunner.update(1/60,{fire:true});
 a.intent.move.set(0,0,0);a.weaponRunner.update(1/60,{fire:false});assert.ok(a.weaponRunner.catalogState.lunge);
 let distance=0,speeds=[];
 for(let i=0;i<25;i++){a._horizontal(1/60,false,false);distance+=a.vel.z/60;speeds.push(a.vel.z);a.weaponRunner.update(1/60,{fire:false});}
 assert.ok(speeds.slice(0,10).every(v=>v===0));assert.ok(speeds[10]>speeds[24]);assert.ok(Math.abs(distance-5.5)<1e-8);
 assert.equal(a.weaponRunner.catalogState.lunge,null);
});

test('live source post-swing lock lasts beyond the slash lifetime and releases on the exact exported frame',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 const a=f.make('s3-saber-normal');a.form='kid';
 a.weaponRunner.update(1/60,{fire:true});a.weaponRunner.update(1/60,{fire:false});
 for(let i=0;i<21;i++)a.weaponRunner.update(1/60,{fire:false});
 assert.equal(a.weaponRunner.busy(),true,'22F PostDelay still has one frame');
 a.weaponRunner.update(1/60,{fire:false});assert.equal(a.weaponRunner.busy(),false);
});
