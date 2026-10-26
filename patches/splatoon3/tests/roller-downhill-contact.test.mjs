import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';

// Real Actor integration + held drum pose + collision polygons + CPU ownership.
// The older runner-only slope tests do not execute the standard roller's
// support gate or its deferred post-pose paint emitter.
for(const hz of [30,60,120])test(`downhill roller keeps real contact and claims slope turf at ${hz}Hz`,async()=>{
 const baseline=process.env.INKWAVE_ROLLER_DOWNHILL_BASELINE;
 const f=await sourceLoadedActorFixture({random:()=>.4,moduleTransform:baseline?(rel,code)=>rel==='patches/splatoon3/runtime/roller.mjs'?fs.readFileSync(baseline,'utf8'):code:null});
 const {G,THREE}=f,V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
 try{
  G.level=new f.Level({bounds:{minX:-20,maxX:20,minZ:-20,maxZ:40},half:[],single:[{kind:'ramp',low:[0,0,0],high:[0,30,30],width:16,thickness:.5}],spawnPads:[[0,0,0],[0,12,12]],spawnBarrier:0});
  G.physics=new f.Physics(G.level);
  class CpuPaint extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){this.quads=0;}}
  const paint=G.paint=new CpuPaint(null,G.level,{atlasSize:1024,maxDensity:20,cell:.25});
  const a=await f.make();a.setWeapon('roller');a.pos.set(0,25,25);a.yaw=a.aimYaw=Math.PI;a.aimPitch=0;a.aimDir.set(0,0,-1);
  a.intent.move.set(0,0,-1);a.intent.fire=true;a._prevIntent.fire=false;a.kidT=10;a.invuln=0;
  // Enter through the normal held-fire flick, then observe established rolling.
  for(let i=0;i<60;i++){G.time+=1/60;a.update(1/60);paint.advanceSimulation(1/60);}
  let contactTicks=0,paintTicks=0,lastCount=0;
  const totalTicks=60;
  // Production simulation remains 60Hz at all three render schedules.
  const {FixedClock}=await import('../runtime/clock.mjs');const clock=new FixedClock();
  for(let frame=0;frame<hz;frame++)clock.advance(1/hz,dt=>{
   G.time+=dt;a.update(dt);paint.advanceSimulation(dt);
   assert(a.grounded,'actual actor stays on the ramp');
   if(a.weaponRunner.rolling)contactTicks++;
   if(paint.counts[0]>lastCount)paintTicks++;
   lastCount=paint.counts[0];
  });
  assert.equal(contactTicks,totalTicks,'held roll never re-enters flick/release');
  assert(paintTicks>10,`continued scored paint, not only a rolling pose: ${paintTicks}`);
  assert(paint.counts[0]>100,'actual CPU-owned slope cells');assert(a.stats.turf>0);assert(a.ink<100);
  assert(a.pos.z<24,'real downhill displacement');
 }finally{f.reset();}
});
