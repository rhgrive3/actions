import * as THREE from 'three';
import {SourcePose,clamp} from './source-bank.js';
/** HOST presentation choices for this non-Nintendo body. These gains do not
 * purport to be extracted original-game parameters. The original curves and
 * their phase remain available in the source pose / manual-clip viewer. */
export const HOST_BALANCE=Object.freeze({vertical:.38,lateral:.38,forward:.75,
 pelvisRotation:.65,torsoRotation:.50,headRotation:.38,runVertical:.36,
 reachCompensation:.80,reachMeanResponse:4,torsoTravelLimit:.035});
export class BodyBalance {
 constructor(bank){
  this.bank=bank;this.pose=new SourcePose(bank);this.center=new SourcePose(bank);
  this.targets={wp:bank.bones.map(()=>new THREE.Vector3())};this.centerTargets={wp:bank.bones.map(()=>new THREE.Vector3())};
  this.total=0;this.world=bank.bones.map(()=>new THREE.Quaternion());this.q=new THREE.Quaternion();this.v=new THREE.Vector3();this.p=new THREE.Vector3();this.parent=new THREE.Quaternion();
  this.rotationGain=new Map([['hip',HOST_BALANCE.pelvisRotation],['spine1',HOST_BALANCE.torsoRotation],['spine2',HOST_BALANCE.torsoRotation],['chest',HOST_BALANCE.torsoRotation],['neck',HOST_BALANCE.headRotation],['head',HOST_BALANCE.headRotation]]);
  this.reset();
 }
 reset(){this.reachReady=false;this.meanReach=0;this.reachCorrection=0;}
 clear(){this.total=0;}
 add(profile,weight){
  if(weight<=0)return;const a=weight/(this.total+weight);
  if(!this.total)this.center.copy(profile.centerPose);else this.center.mix(profile.centerPose,a);
  for(const n of ['leg1_L','leg1_R']){const i=this.bank.index[n];if(!this.total)this.centerTargets.wp[i].copy(profile.centers[i]);else this.centerTargets.wp[i].lerp(profile.centers[i],a);}
  this.total+=weight;
 }
 apply(source,trajectory,{run=0,weight=1,pivot=0,strafe=0}={}){
  this.center.fk();const gainX=HOST_BALANCE.lateral*(1-.75*pivot)*(1-.8*clamp(strafe,0,1));const gainY=HOST_BALANCE.vertical+(HOST_BALANCE.runVertical-HOST_BALANCE.vertical)*clamp(run,0,1);
  this.pose.copy(source);const root=this.bank.index.joint_root;
  if(root!==undefined){const p=this.pose.p[root],m=this.center.p[root];p.set(m.x+(p.x-m.x)*(1-weight+weight*gainX),m.y+(p.y-m.y)*(1-weight+weight*gainY),m.z+(p.z-m.z)*(1-weight+weight*HOST_BALANCE.forward));}
  // Preserve the source's global counter-rotation. Scaling LOCAL rotations
  // independently destroys the head's counter-motion to its parent chest.
  for(let i=0;i<this.bank.bones.length;i++){
   const b=this.bank.bones[i],rawGain=this.rotationGain.get(b.name),gain=rawGain===undefined?undefined:rawGain*(b.name==='hip'?1-.85*pivot:1)*(1-.78*clamp(strafe,0,1)),parent=b.parent;
   if(gain!==undefined){this.world[i].copy(this.center.wq[i]).slerp(source.wq[i],1-weight+weight*gain);this.pose.q[i].copy(this.world[i]);if(parent>=0)this.pose.q[i].premultiply(this.q.copy(this.world[parent]).invert());}
   else{this.world[i].copy(this.pose.q[i]);if(parent>=0)this.world[i].premultiply(this.world[parent]);}
  }
  this.pose.fk();
  // Pelvis and feet must NOT use the same narrowed pose: feet keep their
  // authored world trajectories, pelvis oscillation is shortened about its
  // measured cycle centre. Neither foot is dragged sideways with the head.
  for(const n of ['leg1_L','leg1_R']){const i=this.bank.index[n],p=this.targets.wp[i],m=this.centerTargets.wp[i];p.copy(trajectory.wp[i]).sub(m);p.x*=1-weight+weight*gainX;p.y*=1-weight+weight*gainY;p.z*=1-weight+weight*HOST_BALANCE.forward;p.add(m);}
  return this.pose;
 }
 compensateReach(character,lowering,dt,enabled){
  if(!enabled){this.reset();return;}
  if(!this.reachReady){this.meanReach=lowering;this.reachReady=true;}
  if(dt>0)this.meanReach+=(lowering-this.meanReach)*(-Math.expm1(-HOST_BALANCE.reachMeanResponse*dt));
  // IK reach reserve is a leg constraint, not a head animation. Remove only
  // its fast component, not terrain height or the actor's world movement.
  this.reachCorrection=HOST_BALANCE.torsoTravelLimit*Math.tanh((this.meanReach-lowering)*HOST_BALANCE.reachCompensation/HOST_BALANCE.torsoTravelLimit);
  const chain=['spine','chest','neck'];let length=0;
  for(const n of chain)length+=character.rest[n].distanceTo(character.rest[character.bones[n].parent.name]);
  for(const n of chain){const b=character.bones[n],share=character.rest[n].distanceTo(character.rest[b.parent.name])/length;
   character._kidXform(b.parent,this.p,this.parent);this.v.set(0,this.reachCorrection*share,0).applyQuaternion(this.parent.invert());b.position.add(this.v);
  }
 }
}