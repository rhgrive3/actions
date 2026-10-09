// #857 was already fixed by the active movement adapter in the supplied base.
// Verify that native owner, paint and wire playback share body yaw, not aim yaw.
import test from 'node:test';
import assert from 'node:assert/strict';
import { batchFixture } from './batch03-fixture.mjs';
const near=(a,b,eps=1e-8)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
async function trace(hz){
 const f=await batchFixture(),a=f.make('roller'),r=a.weaponRunner,clock=new f.FixedClock();
 a.isLocal=true;a.character.update=()=>{};delete a._finishFrame;
 r.rolling=true;r.rollT=1.5;r.flick=-1;r.flickRecover=0;
 const phases=[{x:0,z:1,aim:0},{x:1,z:0,aim:0},{x:1,z:0,aim:Math.PI},{x:-1,z:0,aim:Math.PI}];
 const rows=[],ends=[];
 for(const phase of phases){
  a.vel.set(phase.x*6.48,0,phase.z*6.48);a.intent.move.set(phase.x,0,phase.z);a.intent.fire=true;a.aimYaw=phase.aim;
  for(let render=0;render<hz;render++)clock.advance(1/hz,dt=>{
   a.ink=100; // Heading isolation: do not exhaust ink while repeatedly sampling the same body stamp.
   a._finishFrame(dt);
   near(a.character.root.rotation.y,a.yaw);
   f.paint.length=0;r.lastRollPos=a.pos.clone().add(new f.THREE.Vector3(0,0,-1));r._roller(dt,{fire:true},a.weapon);
   assert.equal(f.paint.length,3);
   for(const p of f.paint){near(p.opts.stretch.x,Math.sin(a.yaw));near(p.opts.stretch.z,Math.cos(a.yaw));}
   rows.push([a.yaw,a.character.root.rotation.y,f.paint[1].point.x,f.paint[1].point.z]);
  });
  near(Math.sin(a.yaw),phase.x,2e-4);near(Math.cos(a.yaw),phase.z,2e-4);ends.push(a.yaw);
 }
 return {rows,ends};
}
test('#857 sustained forward/90 degree/camera-only/turnaround share owner, drum and paint heading at 30/60/120 Hz',async()=>{
 const ref=await trace(120);near(ref.ends[1],ref.ends[2],2e-4);
 for(const hz of [30,60]){const got=await trace(hz);assert.deepEqual(got.rows,ref.rows);}
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
