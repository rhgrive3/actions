import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { makePaintWorld } from './paint-authority-fixture.mjs';
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmMathRandom:()=>.5});
for(const [id,radius] of [['s3-brush-mini',.6],['s3-brush-normal',.9],['s3-brush-heavy',1.3]]){
 test(id+' uses its source contact width at 30/60/120 Hz, with real CPU ownership',()=>{
  for(const hz of [30,60,120]){
   const {paint}=makePaintWorld(f,{cell:.05}),a=f.make(id),marks=[];
   a.form='kid';a.pos.set(0,0,0);a.yaw=0;a.aimDir.set(0,0,1);a.intent.move.set(0,0,1);a.vel.set(0,0,12);
   const splat=paint.splat;paint.splat=function(at,r,team,opts){marks.push({at:at.clone(),r});return splat.call(this,at,r,team,opts);};
   for(let i=0;i<hz/2;i++){
    a.pos.z+=12/hz;f.G.time+=1/hz;a.weaponRunner.update(1/hz,{fire:true,firePressed:false});paint.advanceSimulation(1/hz);
   }
   assert.ok(marks.length>0);assert.ok(marks.every(m=>Math.abs(m.r-radius)<1e-12),id+' source half width');
   assert.equal(paint.sampleWorld(0,new f.THREE.Vector3(radius*.7,0,3)),1,'path paints both flanks');
   assert.equal(paint.sampleWorld(0,new f.THREE.Vector3(-radius*.7,0,3)),1);
   assert.equal(paint.sampleWorld(0,new f.THREE.Vector3(radius*1.5,0,3)),0,'width stays bounded');
   const before=marks.length,ink=a.ink;
   a.vel.set(0,0,0);a.intent.move.set(0,0,0);a.weaponRunner.update(1/hz,{fire:true});
   assert.equal(marks.length,before);assert.equal(a.ink,ink,'stationary hold consumes no ink');
   a.grounded=false;a.vel.z=12;a.intent.move.z=1;a.weaponRunner.update(1/hz,{fire:true});
   assert.equal(marks.length,before,'airborne hold paints no lower floor');
  }
 });
}
