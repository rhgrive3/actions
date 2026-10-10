import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../../scripts/weapons-fixture.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('#285 twelve main horizontal globs have seeded spatial width before integration',async()=>{
 const f=await fixture({fidelity:true,floor:false}),a=f.make('roller',{x:2,y:10,z:3});
 a.weaponRunner.s3FlickVertical=false;
 function volley(seed,yaw=0){
  f.projectiles.clear();f.reseed(seed);a.yaw=yaw;f.projectiles.fireFlick(a,a.weapon);
  const all=[...f.projectiles.list];assert.equal(all.length,13,'12 main plus existing nearest unit');
  const main=all.filter(p=>p.fidelityRollerUnitIndex===0);assert.equal(main.length,12);
  const rows=main.map((p,i)=>{
   assert.equal(p.age,0);close(p.prev.distanceTo(p.start),0);close(p.pos.distanceTo(p.start),0);
   const fan=2*i/11-1,base=[a.pos.x+Math.sin(yaw)*.6,a.pos.y+1.3,a.pos.z+Math.cos(yaw)*.6];
   const x=p.start.x-base[0]-Math.cos(yaw)*fan*.8;
   const z=p.start.z-base[2]+Math.sin(yaw)*fan*.8;
   assert.ok(Math.abs(x)<=.1&&Math.abs(z)<=.1&&Math.abs(p.start.y-base[1])<=.1,'source .1 cube about .8 half-width fan');
   return Array.from(p.start.toArray());
  });
  assert.equal(new Set(rows.map(x=>JSON.stringify(x))).size,12,'not one common launch point');
  return rows;
 }
 const first=volley(112);assert.deepEqual(volley(112),first);assert.notDeepEqual(volley(113),first);
 volley(112,.73);f.projectiles.clear();
});
