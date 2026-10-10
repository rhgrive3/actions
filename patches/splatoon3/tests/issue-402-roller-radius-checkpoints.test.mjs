import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../../scripts/weapons-fixture.mjs';
const near=(x,y)=>assert.ok(Math.abs(x-y)<1e-10,`${x} != ${y}`);
const grow=(init,end,frames,at)=>init+(end-init)*Math.min(1,at/frames);

test('#402 emitted Roller units retain distinct 0..4F field/player growth',async()=>{
 const f=await fixture({fidelity:true,floor:false}),a=f.make('roller',{y:30});
 for(const vertical of [false,true]){
  a.weaponRunner.s3FlickVertical=vertical;f.projectiles.fireFlick(a,a.weapon);
  const cases=vertical?[[0,.1,.75,3,.116,.87],[1,.1,.75,3,.116,.87],[2,.1,.55,2,.116,.82]]:
   [[0,.1,.6,2,.12,1.02]];
  for(const [unit,fi,fe,ff,pi,pe] of cases){
   const p=f.projectiles.list.find(p=>p.fidelityRollerUnitIndex===unit);
   assert.ok(p,`emitted unit ${unit}`);
   near(p.fidelityFieldCollision.initRadius,fi);near(p.fidelityFieldCollision.endRadius,fe);
   near(p.fidelityFieldCollision.changeTime,ff/60);
   for(const frame of [0,1,2,3,4,20]){
    p.age=frame/60;near(f.fidelityPlayerCollisionRadius(p),grow(pi,pe,4,frame));
   }
  }
  f.projectiles.clear();
 }
});

test('#402 actual field sweep catches mature near-wall glob without centerline crossing',async()=>{
 const f=await fixture({fidelity:true,floor:false}),a=f.make('roller');
 f.wall(5);a.weaponRunner.s3FlickVertical=false;f.projectiles.fireFlick(a,a.weapon);
 const p=f.projectiles.list.find(p=>p.fidelityRollerUnitIndex===0);
 p.prev.set(0,1,3.7);p.pos.set(0,1,4.6);
 p.age=0;p.fidelityPrevAge=0;f.projectiles._fidelityCollision=null;
 assert.equal(f.fidelityWorldHit(f.projectiles,p).hit,false,'initial .1 misses wall at4.95');
 p.age=2/60;p.fidelityPrevAge=2/60;f.projectiles._fidelityCollision=null;
 const hit=f.fidelityWorldHit(f.projectiles,p);assert.equal(hit.hit,true);
 near(hit.point.z,4.95);assert.ok(p.pos.z<4.95,'centerline has not crossed terrain');
 f.projectiles.clear();
});
