import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../../scripts/weapons-fixture.mjs';
const DT=1/60;
async function setup({x=0,z=.7,charge=1,wall=null}={}) {
 const f=await fixture({fidelity:true}),a=f.make('charger'),b=f.make('shooter',{team:1,x,z,name:'target'});
 f.G.actors=[a,b];a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,40);
 if(wall!==null)f.wall(wall,{height:5});
 f.projectiles.fireCharger(a,a.weapon,charge);
 return {...f,a,b,job:f.projectiles._fidelityChargerFlights[0]};
}
test('finite Charger does not hit a target that reaches its path only after the beam passed',async()=>{
 const f=await setup({x:.8});f.beginActorMotionTick(f.G.actors);f.b.pos.x=0;
 f.projectiles.update(DT);assert.equal(f.hits.length,0);
});
test('finite Charger hits the target at shared contact time even if it ends outside the ray',async()=>{
 const f=await setup();f.beginActorMotionTick(f.G.actors);f.b.pos.x=.8;
 f.projectiles.update(DT);assert.equal(f.hits.length,1);assert.equal(f.hits[0].victim,'target');
 f.projectiles.update(DT);assert.equal(f.hits.length,1,'full-charge piercing still hits each target once');
});
test('finite Charger honors teleport invalidation rather than sweeping the removed position',async()=>{
 const f=await setup();f.beginActorMotionTick(f.G.actors);f.b.pos.x=.8;f.markActorMotionDiscontinuity(f.b);
 f.projectiles.update(DT);assert.equal(f.hits.length,0);
});
test('finite Charger rejects invalid dt before any movement, damage, paint or retirement',async()=>{
 for(const dt of [0,-DT,NaN,Infinity,-Infinity]) {
  const f=await setup({z:.3}),pos=f.job.pos.toArray(),marks=f.paints.length;
  f.projectiles.update(dt);
  assert.deepEqual(Array.from(f.job.pos.toArray()),Array.from(pos),String(dt));
  assert.equal(f.hits.length,0,String(dt));assert.equal(f.paints.length,marks,String(dt));
  assert.equal(f.projectiles._fidelityChargerFlights.length,1,String(dt));
 }
});
for(const charge of [.5,1])test(`finite Charger ${charge} keeps nearest-contact/piercing order with moving targets`,async()=>{
 const f=await setup({z:1.1,charge}),far=f.make('shooter',{team:1,z:3,name:'far'});f.G.actors.push(far);
 f.beginActorMotionTick(f.G.actors);f.b.pos.x=.8;f.projectiles.update(DT);
 assert.deepEqual(f.hits.map(h=>h.victim),charge===1?['target','far']:['target']);
 if(charge<1)assert.equal(f.projectiles._fidelityChargerFlights.length,0);
});
test('finite Charger world contact still wins before a moving capsule',async()=>{
 const f=await setup({z:1.1,wall:.5});f.beginActorMotionTick(f.G.actors);f.b.pos.x=.8;
 f.projectiles.update(DT);assert.equal(f.hits.length,0);assert.equal(f.projectiles._fidelityChargerFlights.length,0);
 assert.ok(f.job.travel<.2);
});
test('partial Charger moving ally can stop a round without friendly damage',async()=>{
 const f=await setup({z:1.1,charge:.5});f.b.team=f.a.team;
 const far=f.make('shooter',{team:1,z:3,name:'far'});f.G.actors.push(far);
 f.beginActorMotionTick(f.G.actors);f.b.pos.x=.8;f.projectiles.update(DT);
 assert.equal(f.hits.length,0);assert.equal(f.projectiles._fidelityChargerFlights.length,0);
});
test('historical ghost catch-up keeps static presentation and no local hit authority',async()=>{
 const f=await setup({z:1.1});f.projectiles.clear();
 f.projectiles.ghostFire(f.a,{weapon:'charger',charge:1,muzzle:new f.THREE.Vector3(0,1.05,.3),dir:new f.THREE.Vector3(0,0,1)});
 f.beginActorMotionTick(f.G.actors);f.b.pos.x=.8;const marks=f.paints.length;
 f.projectiles.update(DT);assert.equal(f.hits.length,0);assert.equal(f.paints.length,marks);
});
test('Charger shared-time contact is identical under 30/60/120 Hz fixed-clock rendering',async()=>{
 const traces=[];
 for(const hz of [30,60,120]){
  const f=await setup({z:1.1}),clock=new f.FixedClock();let ticks=0;
  for(let frame=0;frame<hz/10;frame++)clock.advance(1/hz,dt=>{
   f.beginActorMotionTick(f.G.actors);if(ticks++===0)f.b.pos.x=.8;f.projectiles.update(dt);
  });
  traces.push({hits:JSON.parse(JSON.stringify(f.hits)),travel:f.job.travel});
 }
 assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);assert.equal(traces[0].hits.length,1);
});
test('range-clipped Charger segment cannot borrow target motion after the shot expires',async()=>{
 const f=await setup({x:.8});
 f.job.travel=5*f.job.speed*DT;f.job.pos.copy(f.job.origin).addScaledVector(f.job.dir,f.job.travel);
 f.b.pos.z=f.job.pos.z+.02;
 assert.ok(f.job.range-f.job.travel>0 && f.job.range-f.job.travel<.04,'actual sourced final flight remainder');
 f.beginActorMotionTick(f.G.actors);f.b.pos.x=0;
 f.projectiles.update(DT);assert.equal(f.hits.length,0);
 assert.equal(f.projectiles._fidelityChargerFlights.length,0);
 assert.ok(Math.abs(f.job.travel-f.job.range)<1e-10);
});
