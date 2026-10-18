import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

test('hard-cancelled Splatana and added Dualies never resume stale main recovery after a special or jump',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 for(const id of ['s3-saber-normal','s3-saber-lite','s3-saber-heavy','s3-maneuver-long','s3-maneuver-stepper']){
  for(const reason of ['special','jump','sub','death']){
   const a=f.make(id),r=a.weaponRunner;a.form='kid';a.intent.fire=true;
   if(a.weapon.catalogRecord.family==='dualies')assert.ok(r.tryDodge(new f.THREE.Vector3(1,0,0)));
   else{r.update(1/60,{fire:true});r.update(1/60,{fire:false});}
   const state=r.catalogState;assert.ok(state.stop>0,id+' starts with a real source lock');
   if(reason==='special')a.specialActive={id:'inkArmor'};
   if(reason==='jump')a.superJumpState={};
   if(reason==='death')a.alive=false;
   for(let i=0;i<120;i++)r.update(1/60,{fire:false,sub:reason==='sub'});
   a.specialActive=null;a.superJumpState=null;a.alive=true;r.aimingSub=false;a.intent.fire=false;a.intent.squid=true;
   assert.equal(state.stop,0,id+' '+reason+' clears cancelled recovery');
   assert.equal(state.roll,null);assert.equal(state.lunge,null);assert.equal(state.melee,null);
   assert.equal(r.busy(),false,id+' '+reason+' cannot resurrect a cancelled main lock');
  }
 }
});
