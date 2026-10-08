// #870: actual finite Charger flight + Physics + continuous capsule chronology.
// #840 moved the full-charge boundary to the authoritative ding-aligned
// predicate (charge 1); near-full partials stay partial here too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';
import { isChargerFullCharge } from '../runtime/weapons.mjs';

async function trace({charge=.5, allyX=0, allyZ=3, enemyZ=6, ghost=false, wallZ=null, reverse=false, hz=60}={}) {
  const f=await fixture(), a=f.make('charger'), ally=f.make('shooter'), enemy=f.make('shooter'), V=f.THREE.Vector3;
  a.name='owner'; ally.name='ally'; enemy.name='enemy'; enemy.team=1;
  ally.pos.set(allyX,0,allyZ); enemy.pos.set(0,0,enemyZ);
  f.G.camera={position:new V(0,20,0)};
  f.G.actors=reverse?[enemy,ally,a]:[a,ally,enemy];
  const blocks=wallZ===null?[]:[{id:0,solid:true,center:new V(0,1,wallZ),half:new V(2,2,.05),axes:[new V(1,0,0),new V(0,1,0),new V(0,0,1)],faces:[-1,-1,-1,-1,-1,-1]}];
  f.G.physics=new f.Physics({blocks,queryBlocks:(_x,_z,_xx,_zz,out)=>{out.length=0;for(let i=0;i<blocks.length;i++)out.push(i);return out;}});
  a.aimDir.set(0,0,1); a.aimPoint.set(0,1.05,20);
  const ps=new f.Projectiles(new f.THREE.Scene());f.G.projectiles=ps;
  const hits=[], impacts=[]; ps.applyHit=(_owner,victim,damage)=>hits.push({victim:victim.name,damage});
  const off=f.on('weapon:impact',e=>impacts.push({victim:e.victim?.name??null,pos:[e.pos.x,e.pos.y,e.pos.z]}));
  if(ghost) ps.ghostFire(a,{weapon:a.weapon.id,charge,muzzle:new V(0,1.05,.3),dir:new V(0,0,1),len:24});
  else ps.fireCharger(a,a.weapon,charge);
  assert.equal(ps._fidelityChargerFlights.length,1,'actual accepted flight');
  const job=ps._fidelityChargerFlights[0], clock=new FixedClock();
  for(let frame=0;frame<hz && ps._fidelityChargerFlights.length;frame++)clock.advance(1/hz,dt=>{f.G.time+=dt;ps.update(dt);});
  off(); assert.equal(ps._fidelityChargerFlights.length,0,'flight retires once');
  assert.ok(hits.every(h=>h.victim!=='ally'&&h.victim!=='owner'),'no allied or owner damage call');
  return {hits,impacts,travel:job.travel,radius:f.PLAYER.radius,full:job.full};
}

test('partial ally contact stops before the enemy and emits no enemy-hit victim',async()=>{
  const row=await trace(); assert.deepEqual(row.hits,[]); assert.equal(row.impacts.length,1); assert.equal(row.impacts[0].victim,null); assert.ok(row.travel<3);
});
test('off-ray ally permits partial enemy damage and the shooter never obstructs itself',async()=>{
  const row=await trace({allyX:2}); assert.equal(row.hits.length,1); assert.equal(row.hits[0].victim,'enemy'); assert.ok(row.hits[0].damage>0);
});
test('authoritative full-charge boundary preserves teammate pass-through',async()=>{
  for(const charge of [.998,.999,1]){const row=await trace({charge});assert.equal(row.full,isChargerFullCharge(charge));assert.equal(row.hits.length,isChargerFullCharge(charge)?1:0);}
  for (const charge of [.9999, 1 - 5e-10]) {
    const near=await trace({charge});assert.equal(near.full,false,`charge ${charge} has not reached the native ding`);assert.equal(near.hits.length,0);
  }
});
test('ally obstruction uses the same pinned .125 player radius as enemy contacts',async()=>{
  const f=await fixture();assert.equal(f.profile.weaponsFidelityCompletion.weapons.charger.CollisionParam.InitRadiusForPlayer,.125);
  const inside=await trace({allyX:f.PLAYER.radius+.125-.01}),outside=await trace({allyX:f.PLAYER.radius+.125+.01});
  assert.equal(inside.hits.length,0);assert.equal(outside.hits.length,1);
});
test('world and actor contacts retain earliest-contact ordering independent of actor enumeration',async()=>{
  const wall=await trace({wallZ:2});assert.equal(wall.hits.length,0);assert.ok(wall.travel<2);
  for(const reverse of [false,true]){const row=await trace({allyZ:6,enemyZ:3,reverse});assert.equal(row.hits[0].victim,'enemy');}
  const first=await trace({reverse:false}),second=await trace({reverse:true});assert.deepEqual(second,first);
});
test('ghost ally obstruction remains visual only and never emits gameplay impact',async()=>{
  const row=await trace({ghost:true});assert.deepEqual(row.hits,[]);assert.deepEqual(row.impacts,[]);assert.ok(row.travel<3);
  const full=await trace({ghost:true,charge:1});assert.deepEqual(full.hits,[]);assert.deepEqual(full.impacts,[]);assert.ok(full.travel>6);
});
test('30/60/120Hz rendering gives the same fixed-step obstruction',async()=>{
  const rows=[];for(const hz of [30,60,120])rows.push(await trace({hz}));assert.deepEqual(rows[1],rows[0]);assert.deepEqual(rows[2],rows[0]);
});
