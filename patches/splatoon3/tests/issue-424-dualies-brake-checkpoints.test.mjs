import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../../scripts/weapons-fixture.mjs';
const near=(x,y)=>assert.ok(Math.abs(x-y)<1e-9,`${x} != ${y}`);

test('#424 native stationary Dualies shot has 3F straight, capped brake, then free phase',async()=>{
 const f=await fixture({fidelity:true,floor:false}),a=f.make('dualies',{y:30});
 a.vel.set(0,0,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,31.05,1000);
 f.projectiles._aimFrom=(_a,_from,out)=>out.set(0,0,1);
 f.projectiles.fireDualies(a,a.weapon,0,0);const p=f.projectiles.list[0],start=p.pos.clone();
 near(p.vel.length()/60,2.37);near(p.fidelityMove.endSpeed/60,2.3425);
 for(let frame=1;frame<=3;frame++){
  f.projectiles.update(1/60);near(p.vel.z/60,2.37);assert.equal(p.inkPhase,0);
 }
 near(p.pos.z-start.z,7.11);
 f.projectiles.update(1/60);near(p.vel.z/60,1.4992);assert.equal(p.inkPhase,1);
 near(p.vel.y/60,-.07);
 f.projectiles.update(1/60);assert.equal(p.inkPhase,1);
 f.projectiles.update(1/60);assert.equal(p.inkPhase,1);
 f.projectiles.update(1/60);assert.equal(p.inkPhase,2,'7F enters free after crossing -0.15 u/F');
 const z=p.vel.z,y=p.vel.y;
 f.projectiles.update(1/60);near(p.vel.z,z*.98);near(p.vel.y,y*.98-.016*60);
 near(p.damage,30);near(a.weapon.damageMin,15);near(a.weapon.fireInterval,5/60);
 f.projectiles.clear();
});
