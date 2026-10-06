import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../network-replication/tests/robustness-fixture.mjs';

async function volley(vertical=false,draw=.5){
 const f=await fixture(),nm=f.makeNetMatch(f.makeSession()),a=f.makeActor({nid:0,owner:'me',remote:false,vertical});f.bind(nm,[a]);
 let seed=13;f.Projectiles.constructor('return globalThis')().Math.random=draw==='seed13'?()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}:()=>draw;
 f.projectiles.fireFlick(a,a.weapon);const local=[...f.projectiles.list],packets=JSON.parse(JSON.stringify(nm.out));f.projectiles.list.length=0;
 const remote=f.makeActor({nid:1,owner:'other',remote:true,vertical});for(const e of packets)f.projectiles.ghostProjectile(remote,e);
 return{f,nm,local,ghosts:[...f.projectiles.list],packets};
}

function wallStates(f,p,q){
 f.G.paint.splat=()=>0;const hit=new f.Hit();hit.hit=true;hit.block=-1;hit.face=-1;hit.point.set(0,3,2);hit.normal.set(0,0,-1);
 assert(f.beginFidelityWallDrop(f.projectiles,p,hit));assert(f.beginFidelityWallDrop(f.projectiles,q,hit));
 for(const key of ['firstFrames','secondFrames','lastFrames','firstSpeed','secondSpeed','shockRadius','fallRadius','groundRadius'])assert.equal(q.fidelityWallDrop[key],p.fidelityWallDrop[key],key);
 for(let tick=0;tick<10;tick++){f.advanceFidelityWallDrop(f.projectiles,p,1/60);f.advanceFidelityWallDrop(f.projectiles,q,1/60);assert.deepEqual(q.pos.toArray(),p.pos.toArray());}
}

test('seed13 actual32-field horizontal replay retains main/near wall state and ten-frame motion',async()=>{
 const {f,nm,local,ghosts,packets}=await volley(false,'seed13');
 const units=f.profile.weaponsFidelityCompletion.weapons.roller.WideSwingUnitGroupParam.Unit;
 assert.equal(local.length,13);assert(packets.every(e=>e.length===32));
 // The old nominal-distance policy chooses near for this ordinary low-speed main glob.
 const speed=ghosts[8].vel.length();assert(Math.abs(speed-units[1].SpawnSpeedBase*60)<Math.abs(speed-units[0].SpawnSpeedBase*60));
 assert.equal(local[8].fidelityRollerUnit,units[0]);assert.equal(ghosts[8].fidelityRollerUnit,units[0]);
 for(let i=0;i<local.length;i++){assert.equal(ghosts[i].fidelityRollerUnit,local[i].fidelityRollerUnit);wallStates(f,local[i],ghosts[i]);}
 nm.dispose();
});

test('source lower/upper launch bounds survive component rounding for both horizontal units',async()=>{
 for(const draw of [0,.5,1-Number.EPSILON]){
  const {f,nm,local,ghosts,packets}=await volley(false,draw);assert(packets.every(e=>e.length===32));
  for(let i=0;i<local.length;i++){assert.equal(ghosts[i].fidelityRollerUnit,local[i].fidelityRollerUnit);wallStates(f,local[i],ghosts[i]);}
  const units=f.profile.weaponsFidelityCompletion.weapons.roller.WideSwingUnitGroupParam.Unit;
  for(const unit of units)for(const sign of [-1,1])for(const yaw of [0,.7,1.3]){
   const speed=(unit.SpawnSpeedBase+sign*unit.SpawnSpeedRandom)*60;
   const y=.1,cp=Math.cos(y);const v=[Math.sin(yaw)*cp*speed,Math.sin(y)*speed,Math.cos(yaw)*cp*speed].map(x=>Math.round(x*100)/100);
   assert.equal(f.horizontalRollerReplayUnit(units,Math.hypot(...v)),unit);
  }
  nm.dispose();
 }
});

test('vertical reconstruction and collision source records retain their existing owner',async()=>{
 const {f,nm,local,ghosts}=await volley(true,'seed13');assert.equal(local.length,5);
 for(let i=0;i<local.length;i++){
  assert.equal(ghosts[i].fidelityRollerUnit,local[i].fidelityRollerUnit);
  for(const key of ['fidelityPlayerCollision','fidelityFieldCollision'])assert.deepEqual(ghosts[i][key],local[i][key]);
  wallStates(f,local[i],ghosts[i]);
 }
 nm.dispose();
});

test('the envelope helper declines overlapping, offset or unsupported source layouts',async()=>{
 const {f,nm}=await volley();const source=f.profile.weaponsFidelityCompletion.weapons.roller;
 assert.equal(f.horizontalRollerReplayUnit(source.VerticalSwingUnitGroupParam.Unit,70),null);
 for(const change of [u=>u[1].SpawnSpeedBase=u[0].SpawnSpeedBase,u=>u[0].AfterOffsetSpawnSpeed=.1,u=>delete u[0].SpawnSpeedRandom]){
  const units=JSON.parse(JSON.stringify(source.WideSwingUnitGroupParam.Unit));change(units);assert.equal(f.horizontalRollerReplayUnit(units,44),null);
 }
 assert.equal(f.horizontalRollerReplayUnit(source.WideSwingUnitGroupParam.Unit,NaN),null);nm.dispose();
});
