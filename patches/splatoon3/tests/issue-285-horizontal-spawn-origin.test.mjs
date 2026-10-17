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
   const x=p.start.x-base[0]-Math.cos(yaw)*fan*.4;
   const z=p.start.z-base[2]+Math.sin(yaw)*fan*.4;
   assert.ok(Math.abs(x)<=.1&&Math.abs(z)<=.1&&Math.abs(p.start.y-base[1])<=.1,'source .1 cube about .8 total-width fan');
   return Array.from(p.start.toArray());
  });
  assert.equal(new Set(rows.map(x=>JSON.stringify(x))).size,12,'not one common launch point');
  return rows;
 }
 const first=volley(112);assert.deepEqual(volley(112),first);assert.notDeepEqual(volley(113),first);
 volley(112,.73);f.projectiles.clear();
});

// Community verification: every range line is 5 m. The source field is the
// total width in metres, independently reported as source/5 on four rollers.
// The jitter extends the realised envelope, so it is excluded from the width.
test('#285 pinned horizontal SpawnPositionWidth is a total source span',async()=>{
 const f=await fixture({fidelity:true,floor:false}),a=f.make('roller',{x:1,y:4,z:1});
 a.weaponRunner.s3FlickVertical=false;
 const raw=f.profile.weaponsFidelityCompletion.weapons.roller;
 const units=raw?.WideSwingUnitGroupParam?.Unit;
 assert.equal(units?.[0]?.SpawnPositionWidth,0.8);
 assert.equal(units[0].SpawnPositionWidth/5,0.16);
 assert.equal(units[0].SpawnPositionRandomCube,0.1);
});
