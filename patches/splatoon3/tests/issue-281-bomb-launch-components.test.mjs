import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {gearCurve} from '../runtime/gear.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function equip(a,ap){
 a.s3.loadout=Array.from({length:3},(_,i)=>({main:ap===57||(ap===10&&i===0)?'subPower':'none',subs:Array(3).fill(ap===57?'subPower':'none')}));
 a.setWeapon(a.weaponId);
}
test('#281 native throw and preview preserve separate14.4Y/67.2Z components at0/10/57AP',async()=>{
 for(const ap of [0,10,57]){
  const f=await fixture();f.installSubSpecialFidelity(f,f.profile);
  const a=f.make(),p=new f.Projectiles(new f.THREE.Scene());f.G.projectiles=p;equip(a,ap);
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};a.aimYaw=a.aimPitch=0;a.vel.set(0,0,0);
  near(a.s3.modifiers.subPower,gearCurve(ap,1,1.25,1.5));
  for(const [vy,inherit] of [[0,0],[2,8],[8,19.2],[-8,0]]){
   a.vel.y=vy;p.updateArc(a,true);
   a.weaponRunner.update(1/60,{sub:true});for(let i=0;i<5;i++)a.weaponRunner.update(1/60,{sub:true});
   a.weaponRunner.update(1/60,{subReleased:true});
   const b=p.bombs.at(-1);assert.ok(b);near(b.vel.x,0);near(b.vel.y,14.4+inherit);near(b.vel.z,67.2*gearCurve(ap,1,1.25,1.5));
   near(b.vel.x,p._arcCache.vx);near(b.vel.y,p._arcCache.vy);near(b.vel.z,p._arcCache.vz);
   near(f.SUB.bomb.gravity,57.6);
   for(let i=1;i<=20;i++){
    p._updateBombs(1/60);
    if(i%2===0){const predicted=new f.THREE.Vector3().fromBufferAttribute(p.arcGeo.attributes.position,i/2);assert.ok(b.pos.distanceTo(predicted)<3e-5);}
   }
   p.clear();a.weaponRunner.reset();a.ink=100;
  }
 }
});
