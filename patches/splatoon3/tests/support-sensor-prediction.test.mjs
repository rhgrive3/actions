// The actual shared Sensor flight step and native Physics geometry, without
// rendering/network hooks. Run with node --experimental-vm-modules --test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { pointSensorLaunch, predictPointSensor, stepPointSensorFlight } from '../runtime/support-sensor-flight.mjs';
import { snapshotThrowCollisionSystem } from '../runtime/throw-prediction-record.mjs';

const context=vm.createContext({});
const threeModule=new vm.SyntheticModule(Object.keys(THREE),function(){
  for(const [key,value] of Object.entries(THREE))this.setExport(key,value);
},{context});
const physicsModule=new vm.SourceTextModule(fs.readFileSync(new URL('../../../inkwave-public/src/game/physics.js',import.meta.url),'utf8'),{context});
await physicsModule.link(spec=>{assert.equal(spec,'three');return threeModule;});
await physicsModule.evaluate();
const {Physics,Hit}=physicsModule.namespace;
const V=THREE.Vector3,near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-9,`${label}: ${a} != ${b}`);

function world({wall=null,floor=true,actors=[]}={}){
  const blocks=[];
  function box(center,half){blocks.push({id:blocks.length,solid:true,center:new V(...center),half:new V(...half),
    axes:[new V(1,0,0),new V(0,1,0),new V(0,0,1)],faces:[-1,-1,-1,-1,-1,-1]});}
  if(floor)box([0,-2,0],[1000,2,1000]);
  if(wall!==null)box([0,0,wall+.5],[1000,1000,.5]);
  const level={blocks,faces:[],queryBlocks(_a,_b,_c,_d,out){out.length=0;for(let i=0;i<blocks.length;i++)out.push(i);return out;}};
  return {THREE,Physics,Hit,PLAYER:{radius:.32,height:1.8,squidHeight:.7},G:{actors,physics:new Physics(level)}};
}
function owner(ap=0){return {team:0,pos:new V(0,0,0),vel:new V(),aimYaw:0,aimPitch:0,
  weapon:{sub:'pointSensor'},weaponRunner:{s3SubHold:0},s3:{abilityPoints:{subPower:ap}}};}
function fly(api,actor,intervals){
  const {origin,velocity}=pointSensorLaunch(actor,THREE);
  const sensor={owner:actor,team:actor.team,pos:origin.clone(),prev:origin.clone(),vel:velocity,age:0,hit:new Hit()};
  let contact=null,frames=0;
  while(!contact&&frames<1000){contact=stepPointSensorFlight(sensor,api,intervals[frames%intervals.length]);frames++;}
  assert.ok(contact,'Sensor reaches a contact or its airborne timeout');
  return {sensor,contact};
}

test('Sensor launch uses its own 11.3.0 speed at both gear extremes',()=>{
  const low=pointSensorLaunch(owner(0),THREE),high=pointSensorLaunch(owner(57),THREE);
  near(low.velocity.z,1.38*60,'base forward speed');
  near(high.velocity.z,1.87*60,'maximum sub power speed');
  near(low.velocity.y,.24*60,'upward speed');
  assert.ok(low.velocity.z>1.12*60,'does not silently use the generic Splat Bomb speed');
});

test('Sensor guide and live flight agree on floor, wall and air timeout at multiple render intervals',()=>{
  for(const ap of [0,57])for(const scene of [{},{wall:18},{floor:false}]){
    const api=world(scene),actor=owner(ap);
    actor.aimYaw=.12;actor.aimPitch=.08;actor.vel.set(-3,2,4);
    const prediction=predictPointSensor(api,actor);
    assert.equal(prediction.complete,true);
    for(const intervals of [[1/30],[1/60],[1/90],[1/120],[1/144],[1/120,1/40,1/90]]){
      const {sensor,contact}=fly(api,actor,intervals);
      near(sensor.pos.distanceTo(prediction.endpoint),0,`AP ${ap}, ${JSON.stringify(scene)}, dt ${intervals}`);
      near(sensor.age,prediction.time,'same 60 Hz terminal tick');
      assert.equal(contact.outcome,prediction.outcome);
      if(scene.wall!==undefined){
        near(prediction.endpoint.z,scene.wall-.03,'center is clamped outside the wall');
        near(prediction.firstImpact.point.z,scene.wall,'first impact retains the struck surface');
      }
    }
  }
});

test('Sensor actor and terrain sweeps select the nearest eligible contact',()=>{
  const actor=owner();actor.aimPitch=-.15;
  const foe=z=>({alive:true,team:1,pos:new V(0,0,z),form:'human',smoothY:0});
  const close=world({wall:5,actors:[foe(3)]}),behind=world({wall:5,actors:[foe(6)]});
  const ally=world({wall:5,actors:[{...foe(3),team:0}]});
  const before=predictPointSensor(close,actor),after=predictPointSensor(behind,actor),sameTeam=predictPointSensor(ally,actor);
  assert.equal(before.firstImpact.kind,'actor');assert.ok(before.endpoint.z<5);
  assert.equal(after.firstImpact.kind,'world');near(after.endpoint.z,4.97,'wall blocks later foe');
  assert.equal(sameTeam.firstImpact.kind,'world');near(sameTeam.endpoint.z,4.97,'friendly actor is not an impact');
  for(const api of [close,behind,ally]){
    const guide=predictPointSensor(api,actor),{sensor}=fly(api,actor,[1/30]);
    near(sensor.pos.distanceTo(guide.endpoint),0,'contact arbitration matches the guide');
  }
});

test('forecast world snapshots isolate moving attachment records, meshes and collider caches',()=>{
  const attachment={position:[1,2,3],heading:[0,0,1]},mesh={position:new V(4,5,6)};
  const object={pos:new V(1,2,3),prev:new V(0,2,3),vel:new V(5,0,0),mesh,s3SurfaceAttachment:attachment};
  const collider={center:new V(7,8,9)},stand={pos:new V(3,2,1),mesh,s3CoolerCollision:collider,towerLocal:[1,2,3]};
  const live={_s3SubObjects:[object],_s3SupportCoolers:[stand],_s3BombDefenseProbe:{owner:{}},_s3CoolerCollisionLevel:{blocks:[collider]}};
  const preview=snapshotThrowCollisionSystem(live);
  preview._s3SubObjects[0].pos.set(90,90,90);preview._s3SupportCoolers[0].pos.set(80,80,80);
  assert.deepEqual(object.pos.toArray(),[1,2,3]);assert.deepEqual(stand.pos.toArray(),[3,2,1]);
  assert.deepEqual(mesh.position.toArray(),[4,5,6]);assert.deepEqual(collider.center.toArray(),[7,8,9]);
  assert.notEqual(preview._s3SubObjects[0].s3SurfaceAttachment,attachment);
  assert.equal(preview._s3SubObjects[0].mesh,null);assert.equal(preview._s3SupportCoolers[0].mesh,null);
  assert.equal(preview._s3BombDefenseProbe,null);assert.equal(preview._s3CoolerCollisionLevel,null);
});
