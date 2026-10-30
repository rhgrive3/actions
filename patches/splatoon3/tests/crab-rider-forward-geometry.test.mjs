import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';

// Measured from the displayed source-loaded skeleton, not configured P slots.
// The Crab reference shows shoulders leaning toward the handles and bent legs
// beneath the rider. Thresholds below are INKWAVE-rig review bounds, not retail
// frame or joint-angle claims.
const f=await sourceLoadedActorFixture({random:()=>.5}),{G,THREE:T}=f;
after(()=>f.reset());
for(const yaw of [0,Math.PI/2]) test(`Crab rider faces and bends toward the controls at yaw ${yaw}`,async()=>{
 f.reset();G.time=0;const a=await f.make(),ch=a.character;
 a.yaw=yaw;a.aimYaw=yaw;a.aimDir.set(Math.sin(yaw),0,Math.cos(yaw));a.aimPoint.copy(a.pos).addScaledVector(a.aimDir,20);
 for(let i=0;i<60;i++)f.tick(a,1/60);
 a.weapon={...a.weapon,special:'crabTank'};a.special=a.specialCost();a._startSpecial();
 for(let i=0;i<30;i++)f.tick(a,1/60);
 assert.equal(a.specialActive?.id,'crabTank');ch.root.updateMatrixWorld(true);ch.skeleton.update();
 const forward=new T.Vector3(Math.sin(a.yaw),0,Math.cos(a.yaw));
 const at=name=>ch.bones[name].getWorldPosition(new T.Vector3());
 const hip=at('hips'),head=at('head'),shoulder=at('clavL').add(at('clavR')).multiplyScalar(.5);
 const F=(p,q)=>p.clone().sub(q).dot(forward), rows=[],failures=[];
 if(!(F(shoulder,hip)>.07))failures.push(`shoulders must lean toward controls: ${F(shoulder,hip)}`);
 if(!(F(head,hip)>.1))failures.push(`head must be ahead of pelvis: ${F(head,hip)}`);
 for(const side of ['L','R']){
  const thigh=at('thigh'+side),knee=at('shin'+side),foot=at('foot'+side),hand=at('hand'+side);
  rows.push({side,kneeAhead:F(knee,thigh),hipAboveFoot:thigh.y-foot.y,kneeAboveFoot:knee.y-foot.y,handAhead:F(hand,hip)});
  if(!(F(knee,thigh)>.02))failures.push(`${side} knee must bend ahead of hip: ${F(knee,thigh)}`);
  if(!(thigh.y-foot.y>.08))failures.push(`${side} foot must be below the hip: ${thigh.y-foot.y}`);
  if(!(knee.y-foot.y>.04))failures.push(`${side} knee must be above the foot: ${knee.y-foot.y}`);
  if(!(F(hand,hip)>.1))failures.push(`${side} hand must be in front of pelvis: ${F(hand,hip)}`);
 }
 console.log(JSON.stringify({yaw,shoulderAhead:F(shoulder,hip),headAhead:F(head,hip),rows}));
 assert.deepEqual(failures,[],failures.join('; '));
});
