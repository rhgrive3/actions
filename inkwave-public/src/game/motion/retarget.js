// Geometry-aware retargeting. The source helpers are evaluated, never copied as target Euler offsets.
import * as THREE from 'three';
import {clamp} from './source-bank.js';
import {ContactTransition} from './contact-transition.js';
import {HOST_HAIR} from './hair-targets.js';
// Host geometry/transition tuning, deliberately not labeled Nintendo data.
export const HOST_RETARGET=Object.freeze({
 lateralExcursion:0.82, plantSeconds:0.13,
 reachFraction:0.97, reachBlendMeters:0.008, medialBlendMeters:0.018,
 lateralReachFraction:0.22, soleResponse:45,
});
export const BODY_MAP = [
 ['hips','hip'], ['spine','spine1','chest','chest'], ['chest','chest','neck','neck'], ['neck','neck','head','head'], ['head','head'],
 ['clavL','shoulder_L','arm1_L','uArmL'], ['uArmL','arm1_L','arm2_L','fArmL'], ['fArmL','arm2_L','hand_L','handL'], ['handL','hand_L','fingerB1_L','handL_index1'],
 ['clavR','shoulder_R','arm1_R','uArmR'], ['uArmR','arm1_R','arm2_R','fArmR'], ['fArmR','arm2_R','hand_R','handR'], ['handR','hand_R','fingerB1_R','handR_index1'],
 // Toe helpers sit mostly BELOW the source ankle and swing across its vertical
 // axis. Aligning the entire shoe to the foot->toe helper direction therefore
 // adds an artificial yaw/roll as that direction crosses the vertical.
 // Foot orientation comes from the actual foot bone's FK; toes are separate.
 ['thighL','leg1_L','leg2_L','shinL'], ['shinL','leg2_L','foot_L','footL'], ['footL','foot_L'],
 ['thighR','leg1_R','leg2_R','shinR'], ['shinR','leg2_R','foot_R','footR'], ['footR','foot_R'],
];
const UP=new THREE.Vector3(0,1,0), X_AXIS=new THREE.Vector3(1,0,0);
export class HumanRetarget {
 constructor(character, bank) {
  this.character=character;this.bank=bank;this.entries=[];this.byTarget=new Map();
  this.v=new THREE.Vector3();this.v2=new THREE.Vector3();this.v3=new THREE.Vector3();this.p=new THREE.Vector3();this.q=new THREE.Quaternion();this.q2=new THREE.Quaternion();this.q3=new THREE.Quaternion();this.aim=new THREE.Quaternion();this.euler=new THREE.Euler();
  this.worldQ=new Map(character.boneList.map(b=>[b.name,new THREE.Quaternion()]));
  for(const row of BODY_MAP)this.add(...row);
  const R=bank.rest,ix=bank.index;
  const sourceLength=R.wp[ix.leg1_L].distanceTo(R.wp[ix.leg2_L])+R.wp[ix.leg2_L].distanceTo(R.wp[ix.foot_L]);
  this.legScale=(character.limbs.legL.a+character.limbs.legL.b)/sourceLength;
  // Scale translational animation by the skeleton's head-to-ankle stature,
  // not by the isolated three-unit source leg. Otherwise this short-waisted
  // host exaggerates all body bob and step displacement by about 53 percent.
  this.scale=(character.rest.head.y-character.rest.footL.y)/(R.wp[ix.head].y-R.wp[ix.foot_L].y);
  // Reusing the source's vertical scale for lateral steps makes the much
  // narrower target skeleton cross its centreline excessively. The host/source
  // hip widths are measured from the two REST skeletons, not guessed offsets.
  const sourceWidth=Math.abs(R.wp[ix.leg1_L].x-R.wp[ix.leg1_R].x);
  const targetWidth=Math.abs(character.rest.thighL.x-character.rest.thighR.x);
  this.lateralScale=sourceWidth>1e-10?targetWidth/sourceWidth:this.scale;
  this.sourceHipCenter=R.wp[ix.leg1_L].clone().add(R.wp[ix.leg1_R]).multiplyScalar(0.5);
  this.targetHipCenter=character.rest.thighL.clone().add(character.rest.thighR).multiplyScalar(0.5);
  this.targetHipOffset=this.targetHipCenter.clone().sub(character.rest.hips);
  this.laneAxis=new THREE.Vector3(1,0,0);this.laneCenter=new THREE.Vector3();this.laneTemp=new THREE.Vector3();this.laneRotation=new THREE.Quaternion();this.locomotion=false;this.minAnkleHalf=targetWidth/2;this.ankleExcursion=(character.limbs.legL.a+character.limbs.legL.b)*HOST_RETARGET.lateralReachFraction;
  this.accessories=[];
  for(const side of ['L','R']){
   this.addAccessory('toe'+side,'toe_'+side);
   this.addAccessory('ear'+side,'ear_'+side);
  }
  const head=ix.head;
  // Each authored target hair strand retains its shape. Only the source head-relative deformation is transferred.
  for(let strand=0;strand<character.hairMeta.length;strand++){
   const side=character.rest[`hair${strand}_0`].x>=0?'L':'R';
   for(let k=0;k<4;k++){
    const target=k<3?`hair${strand}_${k}`:`hairTip${strand}`;
    let source=`Hair${k+1}_${side}`;
    if(ix[source]===undefined && k===0)source='Hair1';
    if(ix[source]!==undefined){
     let sourceLength=0;for(let j=1;j<4;j++){const a=ix[`Hair${j}_${side}`],b=ix[`Hair${j+1}_${side}`];if(a!==undefined&&b!==undefined)sourceLength+=R.wp[a].distanceTo(R.wp[b]);}
     const meta=character.hairMeta[strand],lengthRatio=sourceLength>1e-6?clamp(meta.len/(sourceLength*this.scale),0,1):1;
     this.addAccessory(target,source,{hair:true,head,hairGain:lengthRatio/Math.sqrt(Math.max(.25,meta.K))});
    }
   }
  }
  this.groundInverse=new THREE.Matrix4();this.groundInvQ=new THREE.Quaternion();this.slopeQ=new THREE.Quaternion();this.pelvisDelta=new THREE.Vector3();this.pelvisCandidate=new THREE.Vector3();
  this.ccdA=new THREE.Vector3();this.ccdB=new THREE.Vector3();this.ccdC=new THREE.Vector3();this.ccdTarget=new THREE.Vector3();this.ccdWorld=new THREE.Quaternion();this.ccdLocal=new THREE.Quaternion();this.ccdParent=new THREE.Quaternion();
  this.contacts=['L','R'].map(side=>({side,limb:character.limbs['leg'+side],bone:character.bones['foot'+side],locked:false,blocked:false,feature:0,
   anchor:new THREE.Vector3(),weight:0,captureError:0,normal:new THREE.Vector3(0,1,0),previous:new THREE.Vector3(),hasPrevious:false,slip:0,reachError:0,release:false,
   ankle:new THREE.Vector3(),worldQ:new THREE.Quaternion(),heel:new THREE.Vector3(),ball:new THREE.Vector3(),offset:new THREE.Vector3(),lastOffset:new THREE.Vector3(),
   support:new THREE.Vector3(),target:new THREE.Vector3(),endQ:new THREE.Quaternion(),pole:new THREE.Vector3(),lastPole:new THREE.Vector3(0,0,1),poleReady:false,sourcePole:new THREE.Vector3(0,0,1),filter:new ContactTransition(),free:new THREE.Vector3(),prevFree:new THREE.Vector3(),freeVelocity:new THREE.Vector3(),goal:new THREE.Vector3(),prevGoal:new THREE.Vector3(),goalVelocity:new THREE.Vector3(),inputReady:false,hip:new THREE.Vector3(),actual:new THREE.Vector3(),lastClearance:0,featureChanged:false,plants:0,anchorDrift:0,airLift:0,airLiftWalk:0,airLiftRun:0,airLiftVelocity:0,plantLane:0,fromWeight:0,orientation:new THREE.Quaternion(),orientationReady:false}));
  this.reset();
 }
 add(target,source,sourceChild,targetChild) {
  const bone=this.character.bones[target],i=this.bank.index[source],j=this.bank.index[sourceChild];
  if(!bone||i===undefined)return;
  const entry={target,source,bone,i,j,correction:new THREE.Quaternion(),restSourceQ:this.bank.rest.wq[i].clone().invert(),dir:null};
  if(j!==undefined&&this.character.rest[targetChild]){
   entry.dir=this.character.rest[targetChild].clone().sub(this.character.rest[target]).normalize();
   const sourceDir=this.bank.rest.wp[j].clone().sub(this.bank.rest.wp[i]).normalize();
   entry.correction.setFromUnitVectors(entry.dir,sourceDir);
  }
  this.entries.push(entry);this.byTarget.set(target,entry);
 }
 addAccessory(target,source,options={}) {
  const bone=this.character.bones[target],i=this.bank.index[source];if(!bone||i===undefined)return;
  this.accessories.push({bone,i,hairReady:false,hairQ:new THREE.Quaternion(),restSourceQ:this.bank.rest.wq[i].clone().invert(),...options});
 }
 reset(){this.onReset?.();for(const f of this.contacts){f.locked=false;f.weight=0;f.hasPrevious=false;f.slip=0;f.captureError=0;f.reachError=0;f.release=false;f.blocked=false;f.plants=0;f.poleReady=false;f.filter.reset();f.inputReady=false;f.orientationReady=false;f.anchorDrift=0;f.airLift=0;f.airLiftWalk=0;f.airLiftRun=0;f.airLiftVelocity=0;f.plantLane=0;f.fromWeight=0;}}
 setBoneWorld(bone,world) {
  const parent=this.worldQ.get(bone.parent?.name);
  if(parent)this.q2.copy(parent).invert().multiply(world);else this.q2.copy(world);
  bone.quaternion.copy(this.q2).normalize();this.worldQ.get(bone.name)?.copy(world);
 }
 apply(pose,{upper=true,aimPitch=0,rootScale=1,trajectory=pose,pelvisTrajectory=null}={}) {
  const c=this.character,B=c.bones,rest=this.bank.rest;this.locomotion=!!pelvisTrajectory;this.pelvisDelta.set(0,0,0);
  // Do not multiply the old procedural gait, lean and squash onto a complete source pose.
  c.kid.position.set(0,0,0);c.kid.quaternion.identity();c.kid.scale.setScalar(Math.max(0.001,rootScale));
  this.aim.setFromAxisAngle(X_AXIS,-clamp(aimPitch,-1,1.15));
  for(const entry of this.entries){
   const {target,bone,i,j,dir}=entry,isUpper=!target.startsWith('thigh')&&!target.startsWith('shin')&&!target.startsWith('foot')&&target!=='hips';
   if(!upper&&isUpper){c._kidXform(bone,this.p,this.q);this.worldQ.get(target).copy(this.q);continue;}
   if(target==='hips'){
    this.v.subVectors(pose.wp[i],rest.wp[i]);
    this.v.x*=this.lateralScale;this.v.y*=this.scale;this.v.z*=this.scale;
    bone.position.copy(c.rest.hips).add(this.v);
   }else{
    const parentName=bone.parent?.name;
    if(c.rest[parentName])bone.position.copy(c.rest[target]).sub(c.rest[parentName]);
   }
   // Swing/twist from the complete source FK, including helper joints and mirrored right bind frames.
   this.q.copy(pose.wq[i]).multiply(entry.restSourceQ).multiply(entry.correction);
   if(dir&&j!==undefined){
    this.v.copy(dir).applyQuaternion(this.q).normalize();this.v2.subVectors(pose.wp[j],pose.wp[i]);
    if(this.v2.lengthSq()>1e-12)this.q.premultiply(this.q3.setFromUnitVectors(this.v,this.v2.normalize()));
   }
   if(isUpper&&upper)this.q.premultiply(this.aim);
   this.setBoneWorld(bone,this.q);bone.scale.set(1,1,1);
  }
  c.kid.updateMatrix();
  this.adaptPelvis(pelvisTrajectory||trajectory);
  this.updateLanes();
  this.adaptLegFootpaths(trajectory);
 }
 /** The source hip bone is NOT the anatomical hip-joint midpoint: it sits
  * 1.7285 source units above it in this bank, versus 0.018 on this host.
  * Transfer the evaluated leg1 midpoint (including all pelvis helpers), then
  * remove the host's rotated hip offset. Copying just the hip translation
  * omitted the source helper lever and manufactured vertical foot motion. */
 adaptPelvis(pose){
  const c=this.character,ix=this.bank.index;
  this.v.copy(pose.wp[ix.leg1_L]).add(pose.wp[ix.leg1_R]).multiplyScalar(0.5).sub(this.sourceHipCenter);
  this.v.x*=this.lateralScale;this.v.y*=this.scale;this.v.z*=this.scale;
  this.v.add(this.targetHipCenter);
  this.v2.copy(this.targetHipOffset).applyQuaternion(this.worldQ.get('hips'));
  c.bones.hips.position.copy(this.v).sub(this.v2);
  if(this.locomotion){
   const leg=c.limbs.legL.a+c.limbs.legL.b;
   const drop=Math.max(0,c.rest.thighL.y-c.rest.footL.y-leg*.94);
   c.bones.hips.position.y-=drop;
  }
 }
 /** Foot lanes are measured from the target hip joints, not a guessed
  * global default stance. Preserve the leading foot's outward travel but
  * prevent a short host leg from crossing through the other shoe. */
 updateLanes(){
  const c=this.character;c._kidXform(c.bones.thighL,this.laneCenter,this.laneRotation);c._kidXform(c.bones.thighR,this.laneTemp,this.laneRotation);
  this.laneAxis.subVectors(this.laneCenter,this.laneTemp);this.laneAxis.y=0;this.laneAxis.normalize();this.laneCenter.add(this.laneTemp).multiplyScalar(.5);
 }
 laneDistance(p,side){return (p.x-this.laneCenter.x)*this.laneAxis.x*(side==='L'?1:-1)+(p.z-this.laneCenter.z)*this.laneAxis.z*(side==='L'?1:-1);}
 keepAnkleInLane(p,side){
  if(!this.locomotion)return p;
  const d=this.laneDistance(p,side)-this.minAnkleHalf,b=HOST_RETARGET.medialBlendMeters;
  const positive=.5*(Math.sqrt(d*d+b*b)+d);
  const shift=this.ankleExcursion*Math.tanh(positive/this.ankleExcursion)-d;
  return p.addScaledVector(this.laneAxis,shift*(side==='L'?1:-1));
 }
 /** Common vertical support frame for pelvis and authored ankle paths.
  * Do not add source root/hip sway again after positioning the target hip.
  * A constant source stance height now remains constant BEFORE ground IK. */
 adaptLegFootpaths(pose){
  const c=this.character,rest=this.bank.rest,ix=this.bank.index;
  for(const f of this.contacts){
   const label=f.side,footIdx=ix['foot_'+label];if(footIdx===undefined)continue;
   this.v3.subVectors(pose.wp[footIdx],rest.wp[footIdx]);
   this.v3.x*=this.lateralScale;this.v3.y*=this.scale;this.v3.z*=this.scale;
   this.v3.add(c.rest['foot'+label]);
   c._kidXform(f.limb.up,this.p,this.q);
   // Keep lateral offsets relative to each host hip, whose width differs from
   // the source's animated helper chain. The explicit host lateral-excursion
   // factor reduces residual splay without rotating knees after solving IK.
   // Vertical/forward motion stays in the
   // common support frame, so an authored floor contact does not acquire bob.
   const legIdx=ix['leg1_'+label];
   this.v3.x=this.p.x+c.rest['foot'+label].x-c.rest['thigh'+label].x+
    ((pose.wp[footIdx].x-pose.wp[legIdx].x)-(rest.wp[footIdx].x-rest.wp[legIdx].x))*this.lateralScale*HOST_RETARGET.lateralExcursion;
   this.keepAnkleInLane(this.v3,label);
   c._kidXform(f.limb.lo,this.v2,this.q);
   this.v.subVectors(this.v3,this.p).normalize();
   this.v2.sub(this.p).addScaledVector(this.v,-this.v2.dot(this.v));
   this.v2.x*=Math.min(1,this.lateralScale/this.scale);this.v2.z=Math.max(0.35,this.v2.z);
   this.v2.addScaledVector(this.v,-this.v2.dot(this.v));
   if(this.v2.lengthSq()<1e-8)this.v2.set(0,0,1);
   this.q.copy(pose.wq[footIdx]).multiply(this.byTarget.get('foot'+label).restSourceQ);
   f.sourcePole.copy(this.v2).normalize();
   c._solveLimb(f.limb,this.v3,this.v2,this.q,1,label==='L'?2:3);
  }
  c.kid.updateWorldMatrix(true,true);
 }
 applyAccessories(pose,{hairTargets=null,shootBlend=0,dt=0}={}) {
  const c=this.character;
  for(const e of this.accessories){
   if(e.hair){
    // Express hair deformation in source HEAD space. This preserves arbitrary target hair rest directions.
    this.q.copy(pose.wq[e.head]).invert().multiply(pose.wq[e.i]);
    this.q3.copy(this.bank.rest.wq[e.head]).invert().multiply(this.bank.rest.wq[e.i]).invert();
    this.q.multiply(this.q3);
    if(hairTargets?.total>0){
     const gain=e.hairGain*(HOST_HAIR.amplitude+(HOST_HAIR.aimAmplitude-HOST_HAIR.amplitude)*clamp(shootBlend,0,1));
     this.q.identity().slerp(hairTargets.q[e.i],gain);
     // Continuous-time response in HEAD space: suppress residual curve/clip
     // cusps on long host strands without making hair lag behind head turns.
     if(!e.hairReady){e.hairQ.copy(this.q);e.hairReady=true;}
     else e.hairQ.slerp(this.q,-Math.expm1(-HOST_HAIR.response*Math.max(0,dt)));
     this.q.copy(e.hairQ);
    }
    c._kidXform(c.bones.head,this.p,this.q3);this.q.premultiply(this.q3);
   }else this.q.copy(pose.wq[e.i]).multiply(e.restSourceQ);
   c._kidXform(e.bone.parent,this.p,this.q2);this.q2.invert().multiply(this.q);e.bone.quaternion.copy(this.q2).normalize();
  }
 }
 /** Correct terrain penetration of a FREE foot without forcing a new knee
  * plane. CCD begins at the authored BFRES rotations, rotating existing joints
  * only as far as the actual height correction requires. This does not enforce
  * an old foot-plant anchor on a swinging leg. */
 liftFreeFoot(f, clearance) {
  const c=this.character;
  if(clearance>=-0.002)return;
  f.limb.end.getWorldPosition(this.ccdTarget);
  this.ccdTarget.y+=-clearance+0.001;
  for(let iteration=0;iteration<8;iteration++){
   for(const joint of [f.limb.lo,f.limb.up]){
    joint.getWorldPosition(this.ccdA);f.limb.end.getWorldPosition(this.ccdB);
    this.ccdB.sub(this.ccdA);this.ccdC.subVectors(this.ccdTarget,this.ccdA);
    if(this.ccdB.lengthSq()<1e-10||this.ccdC.lengthSq()<1e-10)continue;
    this.ccdWorld.setFromUnitVectors(this.ccdB.normalize(),this.ccdC.normalize());
    const angle=2*Math.acos(clamp(this.ccdWorld.w,-1,1));
    if(angle>0.35)this.ccdWorld.identity().slerp(this.ccdLocal.setFromUnitVectors(this.ccdB,this.ccdC),0.35/angle);
    joint.parent.getWorldQuaternion(this.ccdParent);
    this.ccdLocal.copy(this.ccdParent).invert().multiply(this.ccdWorld).multiply(this.ccdParent);
    joint.quaternion.premultiply(this.ccdLocal).normalize();
    c.kid.updateWorldMatrix(true,true);
   }
   f.limb.end.getWorldPosition(this.ccdB);
   if(this.ccdB.distanceToSquared(this.ccdTarget)<1e-8)break;
  }
  // Keep the original sole orientation while lifting the ankle.
  c._kidXform(f.limb.end.parent,this.ccdA,this.ccdParent);
  f.limb.end.quaternion.copy(this.ccdParent.invert().multiply(f.endQ)).normalize();
  c.kid.updateWorldMatrix(true,true);
  // At a near-straight reach limit, CCD cannot fully raise the ankle. Apply a
  // small, FREE-foot-only local translation as a collision safety net instead
  // of snapping the entire thigh/knee plane. This is host collision handling,
  // not a Nintendo animation track.
  f.limb.end.getWorldPosition(this.ccdA);
  this.ccdB.copy(this.ccdA).add(f.offset);
  const residual=this.ccdB.y-c._ground(this.ccdB.x,this.ccdB.z,this.ccdC);
  if(residual<-0.002){
   this.ccdB.set(0,Math.min(0.03,-residual+0.001),0);
   f.limb.end.parent.getWorldQuaternion(this.ccdParent);
   f.limb.end.position.add(this.ccdB.applyQuaternion(this.ccdParent.invert()));
   c.kid.updateWorldMatrix(true,true);
  }
 }
 /** Terrain-only clearance during a pivot. Do NOT create world foot anchors:
  * feet must be free to step while the body rotates, but the underside of a
  * pitched shoe must not pass through the floor when contact IK is disabled. */
 protectTurningFeet(){
  const c=this.character;
  c.root.updateWorldMatrix(true,true);
  for(const f of this.contacts){
   const p=f.bone.getWorldPosition(this.v),q=f.bone.getWorldQuaternion(this.q);
   const ankle=c.rest['foot'+f.side].y,scale=c.kid.scale.x;
   f.heel.set(0,-ankle,-0.065).multiplyScalar(scale).applyQuaternion(q);
   f.ball.set(0,-ankle,0.11).multiplyScalar(scale).applyQuaternion(q);
   const gh=c._ground(p.x+f.heel.x,p.z+f.heel.z,this.v2),gb=c._ground(p.x+f.ball.x,p.z+f.ball.z,this.v2);
   const dh=p.y+f.heel.y-gh,db=p.y+f.ball.y-gb;
   f.offset.copy(db<dh?f.ball:f.heel);
   f.lastClearance=Math.min(dh,db);
   c._kidXform(f.limb.end,this.v2,f.endQ);
   this.liftFreeFoot(f,f.lastClearance);
   f.bone.getWorldPosition(f.actual);
   f.actual.add(f.offset);
   f.lastClearance=f.actual.y-c._ground(f.actual.x,f.actual.z,this.v2);
  }
 }
 /** Post-animation world-space contact. Heel/ball handoff preserves the ankle position;
  * switching the lowest point must never introduce a shoe-length jump. */
 ground(pose,dt,{grounded=true,enabled=true,freeProtect=false,contact=[0,0],speed=0,lateral=0,runWeight=0,turn=0,velocityX=0,velocityZ=0,treadmill=false,unplant=false}={}){
  const c=this.character;
  if(!grounded||!enabled){this.reset();if(grounded&&freeProtect)this.protectTurningFeet();return;}
  c.root.updateWorldMatrix(true,true);
  const inv=this.groundInverse.copy(c.kid.matrixWorld).invert(),invRot=c.kid.getWorldQuaternion(this.groundInvQ).invert();
  for(let side=0;side<2;side++){
   const f=this.contacts[side],{bone,limb}=f,p=bone.getWorldPosition(f.ankle),q=bone.getWorldQuaternion(f.worldQ);
   // Filter orientation in actor space, so root turning is not delayed.
   // Apply BEFORE measuring heel/ball offsets or locking an anchor.
   this.q.copy(invRot).multiply(q);
   if(!f.orientationReady){f.orientation.copy(this.q);f.orientationReady=true;}
   else f.orientation.slerp(this.q,-Math.expm1(-HOST_RETARGET.soleResponse*dt));
   q.copy(this.groundInvQ).invert().multiply(f.orientation);
   c._ground(p.x,p.z,f.normal);if(f.normal.lengthSq()<.5)f.normal.copy(UP);else f.normal.normalize();
   this.slopeQ.setFromUnitVectors(UP,f.normal);q.premultiply(this.slopeQ);
   const ankle=c.rest['foot'+f.side].y,scale=c.kid.scale.x;
   f.heel.set(0,-ankle,-.065).multiplyScalar(scale).applyQuaternion(q);f.ball.set(0,-ankle,.11).multiplyScalar(scale).applyQuaternion(q);
   const gh=c._ground(p.x+f.heel.x,p.z+f.heel.z,this.v),gb=c._ground(p.x+f.ball.x,p.z+f.ball.z,this.v);
   const dh=p.y+f.heel.y-gh,db=p.y+f.ball.y-gb,next=db<dh?1:0;
   f.lastOffset.copy(f.feature?f.ball:f.heel);f.offset.copy(next?f.ball:f.heel);f.featureChanged=next!==f.feature;
   if(f.featureChanged&&f.inputReady){
    // Rebase the support landmark, not the ankle, at heel/ball handoff.
    f.anchor.add(this.v.subVectors(f.offset,f.lastOffset));
    f.anchor.y=c._ground(f.anchor.x,f.anchor.z,this.v);
   }
   f.feature=next;
   // One floor correction; the previous code applied a second thresholded
   // source "lift" and then blended both target AND joint rotations.
   f.free.copy(p);f.free.y+=Math.max(0,-Math.min(dh,db));
   f.freeVelocity.set(0,0,0);
   if(f.inputReady&&dt>0)f.freeVelocity.subVectors(f.free,f.prevFree).divideScalar(dt);
   // World-space support landmarks no longer chase the animated ankle every
   // frame. Feasible source contact is bounded by this host skeleton's actual
   // reach; an impossible high-speed stance becomes an airborne foot swing.
   f.anchorDrift=0;
   // World-space anchors are genuinely fixed until liftoff. The host-space
   // feasibleContact envelope ends a stance before reach is exhausted.
   f.goal.copy(f.locked?f.anchor:f.free);if(f.locked)f.goal.sub(f.offset);
   f.goalVelocity.copy(f.freeVelocity);
   if(f.locked){f.goalVelocity.set(0,0,0);if(f.inputReady&&dt>0)f.goalVelocity.subVectors(f.goal,f.prevGoal).divideScalar(dt);}
   f.filter.advance(f.goal,f.goalVelocity,dt);
   const speedPlantBudget=(limb.a+limb.b)*.45;
   // Reach must be assessed over the necessary minimum stance horizon, not
   // the cosmetic capture blend. A longer, smoother plant interpolation must
   // not arbitrarily disable ALL foot contact.
   const canPlant=speed*.08<speedPlantBudget;
   const wants=contact[side]>(f.locked?.20:.50)&&!treadmill&&!unplant&&canPlant;
   if(!wants)f.blocked=false;
   const hip=limb.up.getWorldPosition(this.v2),reach=(limb.a+limb.b)*scale;
   // Release before a fixed foot drags the entire pelvis sideways or the
   // next stride begins. Never re-latch in the same invalid stance band.
   // A short side-step can plant slightly inside the *host* lane, then move
   // OUTWARD as the actor advances. Rejecting the initial medial pose on the
   // next frame prevented virtually every lateral stance from settling.
   // Release only when the planted ankle crosses further inward than its
   // recorded strike position (with a small tolerance), or crosses the safe
   // lane boundary after it was originally outside it.
   const currentLane=this.laneDistance(this.laneTemp.copy(f.goal).applyMatrix4(inv),f.side);
   const laneBoundary=this.minAnkleHalf+HOST_RETARGET.medialBlendMeters+Math.abs(lateral)*.10;
   const medialRelease=this.locomotion&&f.locked&&currentLane<Math.min(laneBoundary,f.plantLane-.018);
   // The authored walking clips now play close to their actual frame length.
   // A planted shoe must be freed *before* its world-space anchor forces the
   // shorter host leg straight and pulls the pelvis down. The former 102%
   // threshold was only reached after the pelvis had already started bobbing.
   const overreach=f.locked&&(f.goal.distanceTo(hip)>reach*.975||f.goal.distanceTo(f.free)>reach*.45);
   let nextLocked=wants&&!f.blocked;
   if(overreach||medialRelease){nextLocked=false;f.blocked=true;}
   if(nextLocked!==f.locked){
    // Weight is the amount of PLANTED support, not the current filter age.
    // The old expression flipped 0->1 when unlocking and 1->0 when locking,
    // creating a one-frame knee/sole impulse at the exact contact boundary.
    f.fromWeight=f.weight;
    f.locked=nextLocked;f.release=!nextLocked;
    if(nextLocked){
     f.anchor.copy(f.free).add(f.offset);
     // A plant must happen at the *observed* sole position. A pre-shifted
     // anchor is not a physical footstep; it drags the shoe across the floor
     // for the entire capture blend. Release on actual reach limits instead.
     f.anchor.y=c._ground(f.anchor.x,f.anchor.z,this.v);
     f.plantLane=this.laneDistance(this.laneTemp.copy(f.anchor).sub(f.offset).applyMatrix4(inv),f.side);
     f.plants++;
    }
    f.goal.copy(nextLocked?f.anchor:f.free);if(nextLocked)f.goal.sub(f.offset);
    f.goalVelocity.copy(nextLocked?this.v.set(0,0,0):f.freeVelocity);
    // At a rolling plant, offset motion is already represented by the next
    // sampled goal. Preserve the outgoing visible velocity at this edge.
    const catchup=f.filter.position.distanceTo(f.goal);
    // Fast run recoveries need shorter anchor release than a walking step.
    // Never choose less than two simulation frames: one-frame releases at
    // 30Hz visibly teleport the shin even though the filter is C2 in time.
    // A 2-frame fast-run release changes world support by tens of centimetres
    // and creates a visible ankle impulse. Use a time-based quintic liftoff.
    const fast=clamp((speed-2.2)/2,0,1),releaseSeconds=Math.max(
     4*Math.max(0,dt),clamp((fast?0.19:0.27)+catchup*0.14,0.19,0.36));
    f.filter.transition(f.goal,f.goalVelocity,nextLocked?HOST_RETARGET.plantSeconds*Math.min(1,2/Math.max(.01,speed)):releaseSeconds);
    if(nextLocked&&speed>.02&&c.onEvent){c._fsPos.copy(f.anchor);c._fsData.foot=f.side;c._fsData.speed=speed;c.onEvent('footstep',c._fsData);}
   }
   f.prevGoal.copy(f.goal);f.prevFree.copy(f.free);f.inputReady=true;
   const u=clamp(f.filter.age/f.filter.duration,0,1),e=u*u*u*(10+u*(-15+6*u));
   f.weight=f.fromWeight+((f.locked?1:0)-f.fromWeight)*e;
   // A freely swinging shoe should not be dragged across the floor by the
   // source/target leg-length mismatch. Ease a small clearance up in swing
   // and back down around the source's estimated strike. Sprint feet touch
   // down briefly instead of remaining suspended above the ground.
   const contactPhase=clamp((contact[side]-0.12)/0.58,0,1);
   const airWeight=f.locked?0:(f.blocked?1:1-contactPhase*contactPhase*(3-2*contactPhase));
   // Walking needs a real swing arc above the floor; the fast-run source
   // already supplies its own high-clearance motion. Preserve that original
   // high-speed response rather than lifting sprint feet off the ground.
   // Keep two continuous filter states, and smoothly interpolate only in the
   // short transition between their operating speed ranges.
   // Direction-dependent host swing clearance keeps the lateral shoe from
   // scraping the floor without lifting straight-ahead steps excessively.
   // This is a host retarget correction, not a purported source-game value.
   const walkClearance=this.locomotion?Math.min(.052,.008+speed*.013+.003*Math.abs(lateral))*airWeight:0;
   const runClearance=this.locomotion?Math.min(.048,.004+speed*.007)*airWeight:0;
   const h=Math.max(0,dt),omega=walkClearance<f.airLiftWalk?32:26;
   const offset=f.airLiftWalk-walkClearance,impulse=f.airLiftVelocity+omega*offset,decay=Math.exp(-omega*h);
   f.airLiftWalk=walkClearance+(offset+impulse*h)*decay;
   f.airLiftVelocity=(f.airLiftVelocity-omega*impulse*h)*decay;
   if(f.airLiftWalk<0){f.airLiftWalk=0;f.airLiftVelocity=Math.max(0,f.airLiftVelocity);}
   if(f.airLiftWalk>.052){f.airLiftWalk=.052;f.airLiftVelocity=Math.min(0,f.airLiftVelocity);}
   const runResponse=runClearance<f.airLiftRun?50:22;
   f.airLiftRun+=(runClearance-f.airLiftRun)*(-Math.expm1(-runResponse*h));
   const walkMix=clamp((3.5-speed)/1,0,1),walkEase=walkMix*walkMix*(3-2*walkMix);
   f.airLift=f.airLiftWalk*walkEase+f.airLiftRun*(1-walkEase);
   f.support.copy(f.filter.position).add(f.offset);
   const minimumSole=c._ground(f.support.x,f.support.z,this.v)+f.airLift;
   // A C1 floor envelope prevents free-foot velocity from reversing at a
   // hard max() corner on touchdown (most visible at 120 Hz).
   // Smooth swing-foot collision over a wider envelope at walking speed.
   // Planted soles and sprint clips retain the tight original boundary.
   const soleGap=f.support.y-minimumSole, soleSoft=.010+(1-f.weight)*walkEase*.022;
   f.support.y=.5*(f.support.y+minimumSole+Math.sqrt(soleGap*soleGap+soleSoft*soleSoft));
   f.target.copy(f.support).sub(f.offset).applyMatrix4(inv);
   // The release filter can briefly retain a now-medial outgoing target.
   // Apply the same smooth lane boundary to it, never a hard coordinate snap.
   this.v.copy(f.target);this.keepAnkleInLane(this.v,f.side);f.target.lerp(this.v,1-f.weight);
   f.endQ.copy(invRot).multiply(q);f.pole.copy(f.sourcePole);
   c._kidXform(limb.up,f.hip,this.q);
   // A lifted foot may exceed host reach after an inertial transition;
   // keep the pelvis upright by softly shortening only that free swing arc.
   // A genuinely planted support goal is not projected in world space.
   if(this.locomotion&&f.weight<1){
    const swing=1-f.weight;
    const d=this.v.subVectors(f.target,f.hip),length=d.length(),limit=(limb.a+limb.b)*0.966;
    if(length>limit){
     const zone=.025,projected=limit+zone*Math.tanh((length-limit)/zone);
     f.target.addScaledVector(d,(projected/length-1)*swing);
    }
   }
  }
  // Smooth reach reserve prevents the straight-knee acos singularity. Blend
  // the two leg ceilings smoothly, rather than switching the active leg.
  // Continuous VERTICAL pelvis reach correction. No lock-threshold branch,
  // no horizontal root projection, and no delayed return of old offsets.
  let upper=0;
  for(const f of this.contacts){
   const reach=(f.limb.a+f.limb.b)*HOST_RETARGET.reachFraction,dx=f.hip.x-f.target.x,dz=f.hip.z-f.target.z;
   const ceiling=f.target.y+Math.sqrt(Math.max(.0001,reach*reach-dx*dx-dz*dz))-f.hip.y;
   const blend=HOST_RETARGET.reachBlendMeters;
   const support=clamp(f.weight,0,1),limited=Math.min(0,ceiling)*support*support*(3-2*support);
   upper=.5*(upper+limited-Math.sqrt((upper-limited)**2+blend*blend));
  }
  // Smooth negative part gives a small flexion reserve at straight knees.
  const margin=.003,requiredLowering=.5*(upper-Math.sqrt(upper*upper+margin*margin));
  // Suppress unreachable, swing-driven plunges: shorten the air leg's IK arc,
  // never sink the whole character by tens of centimetres for one free ankle.
  const pelvisBudget=(c.limbs.legL.a+c.limbs.legL.b)*.075;
  const lowering=pelvisBudget*Math.tanh(requiredLowering/pelvisBudget);
  this.pelvisDelta.set(0,lowering,0);c.bones.hips.position.add(this.pelvisDelta);c.kid.updateWorldMatrix(true,true);
  for(let side=0;side<2;side++){
   const f=this.contacts[side];
   c._kidXform(f.limb.up,this.v,this.q);this.v2.subVectors(f.target,this.v).normalize();
   f.pole.copy(f.sourcePole).addScaledVector(this.v2,-f.sourcePole.dot(this.v2));
   // Lateral locomotion must not twist the knee outside the thigh-to-ankle
   // plane as the planted ankle passes the short host's hip joint.
   if(this.locomotion&&Math.abs(lateral)>0.01){
    f.pole.x*=1-0.45*Math.min(1,Math.abs(lateral));
    f.pole.addScaledVector(this.v2,-f.pole.dot(this.v2));
   }
   if(f.pole.lengthSq()<1e-8)f.pole.copy(f.lastPole).addScaledVector(this.v2,-f.lastPole.dot(this.v2));
   if(f.pole.lengthSq()>1e-10){f.pole.normalize();f.lastPole.copy(f.pole);}
   c._solveLimb(f.limb,f.target,f.pole,f.endQ,1,side+2);f.reachError=c.ikErr[side+2];
   c.kid.updateWorldMatrix(true,true);f.bone.getWorldPosition(f.actual);f.actual.add(f.offset);
   // The capture filter moves the shoe during the last fraction of its plant.
   // Report this separately from steady-state planted slip: an arbitrary
   // weight>0.999 threshold can misclassify the last submillimetre of a blend.
   f.captureError=f.locked?Math.hypot(f.actual.x-f.anchor.x,f.actual.z-f.anchor.z):0;
   f.slip=f.locked&&f.filter.age>=f.filter.duration?f.captureError:0;
   f.lastClearance=f.actual.y-c._ground(f.actual.x,f.actual.z,this.v);
   if(f.lastClearance<-.002){this.liftFreeFoot(f,f.lastClearance);f.bone.getWorldPosition(f.actual);f.actual.add(f.offset);f.lastClearance=f.actual.y-c._ground(f.actual.x,f.actual.z,this.v);}
   f.previous.copy(f.actual);f.hasPrevious=true;c.feet[side].planted=f.locked;c.feet[side].sw=!f.locked;
  }
 }
}