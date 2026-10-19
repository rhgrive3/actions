// Held rolling turns the body and drum toward the Left Stick at the ordinary
// walking face spring; travel runs along that heading, never square to the drum
// (owner report 2026-10-19). Camera turns alone leave the heading unchanged.
// Body yaw remains the shared owner for physical paint and remote presentation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { batchFixture } from './batch03-fixture.mjs';
const near=(a,b,eps=1e-8)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
async function trace(hz){
 const f=await batchFixture(),a=f.make('roller'),r=a.weaponRunner,clock=new f.FixedClock();
 a.isLocal=true;a.character.update=()=>{};delete a._finishFrame;a.grounded=true;
 r.rolling=true;r.rollT=1.5;r.flick=-1;r.flickRecover=0;a.yaw=0;
 const phases=[{x:0,z:1,aim:0},{x:Math.SQRT1_2,z:Math.SQRT1_2,aim:0},{x:1,z:0,aim:0},{x:1,z:0,aim:Math.PI/2},{x:-1,z:0,aim:Math.PI/2}];
 const rows=[],ends=[];let worstLateral=0;
 for(const phase of phases){
  a.intent.move.set(phase.x,0,phase.z);a.intent.fire=true;a.aimYaw=phase.aim;
  for(let render=0;render<hz;render++)clock.advance(1/hz,dt=>{
   a.ink=100; // Heading isolation: do not exhaust ink while repeatedly sampling the same body stamp.
   a.grounded=true;a._horizontal(dt,false,false);
   // Travel this tick uses the heading the body had when it moved.
   const sp=Math.hypot(a.vel.x,a.vel.z);
   if(sp>1e-6)worstLateral=Math.max(worstLateral,Math.abs(a.vel.x*Math.cos(a.yaw)-a.vel.z*Math.sin(a.yaw))/sp);
   a._finishFrame(dt);
   near(a.character.root.rotation.y,a.yaw);
   f.paint.length=0;r.lastRollPos=a.pos.clone().add(new f.THREE.Vector3(0,0,-1));r._roller(dt,{fire:true},a.weapon);
   assert.equal(f.paint.length,5,'3 body bands + 2 speed-scaled floor bands (#649)');
   for(const p of f.paint){near(p.opts.stretch.x,Math.sin(a.yaw));near(p.opts.stretch.z,Math.cos(a.yaw));}
   rows.push([a.yaw,a.character.root.rotation.y]);
  });
  const stick=Math.atan2(phase.x,phase.z);
  near(Math.sin(a.yaw),Math.sin(stick),2e-3);near(Math.cos(a.yaw),Math.cos(stick),2e-3);ends.push(a.yaw);
 }
 return {rows,ends,worstLateral};
}
test('#857 rolling heading follows the stick, ignores camera-only turns, and never travels square to the drum at 30/60/120 Hz',async()=>{
 for(const hz of [30,60,120]){
  const got=await trace(hz);
  near(got.ends[2],got.ends[3],1e-4); // camera-only 90 degree turn: heading unchanged
  assert.ok(got.worstLateral<1e-9,`lateral share ${got.worstLateral} at ${hz} Hz`);
 }
});
test('#857 releasing the stick holds the last rolling heading while the camera turns',async()=>{
 const f=await batchFixture(),a=f.make('roller'),r=a.weaponRunner;
 a.isLocal=true;a.character.update=()=>{};delete a._finishFrame;a.grounded=true;
 r.rolling=true;r.rollT=1.5;r.flick=-1;a.yaw=.7;a.aimYaw=-1.2;a.intent.move.set(0,0,0);a.intent.fire=true;a.vel.set(0,0,0);
 for(let i=0;i<60;i++){a._horizontal(1/60,false,false);a._face(1/60,false);}
 near(a.yaw,.7,1e-9);
});
test('#857 native remote playback retains independent body yaw and camera aim yaw; shooter aiming is unchanged',async()=>{
 const f=await batchFixture(),a=f.make('roller');a.remote=true;a.character.update=()=>{};delete a._finishFrame;
 const sample={x:3,y:0,z:-2,vx:6.48,vy:0,vz:0,yaw:Math.PI/2,aimYaw:Math.PI,aimPitch:0,
  f:1|16|256,hp:100,ink:100,sp:0,turf:0,ch:0,lock:0,tp:0};
 a.net={ready:true,cur:sample,err:new f.THREE.Vector3(),prevGrounded:true,prevVy:0};
 f.NetMatch.prototype.applyRemote.call({},a,1/60);
 near(a.yaw,Math.PI/2);near(a.aimYaw,Math.PI);near(a.character.root.rotation.y,a.yaw);assert.equal(a.weaponRunner.rolling,true);
 const s=f.make('shooter');s.character.update=()=>{};s.aimYaw=1;s.vel.set(6,0,0);s.intent.fire=true;s.weaponRunner.firingT=1;
 for(let i=0;i<60;i++)s._face(1/60,false);near(s.yaw,1,2e-4);
});
