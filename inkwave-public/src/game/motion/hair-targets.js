import * as THREE from 'three';
import {clamp} from './source-bank.js';
/** Geometry-aware transfer of DYNAMIC hair bending, not the long source
 * hairstyle's baked curl on top of an already authored host hairstyle.
 * We blend head-relative swing deltas from individual clips BEFORE joint
 * interpolation. This avoids a 180-degree quaternion-path switch when two
 * directional hair poses have very different static orientations. */
export const HOST_HAIR=Object.freeze({amplitude:.65,aimAmplitude:.48,maxDelta:1.05,response:24});
export class HairTargets {
 constructor(bank){
  this.bank=bank;this.indices=bank.bones.map((b,i)=>/^Hair/.test(b.name)?i:-1).filter(i=>i>=0);
  this.q=bank.bones.map(()=>new THREE.Quaternion());this.total=0;
  this.identity=new THREE.Quaternion();this.headInverse=new THREE.Quaternion();this.swing=new THREE.Quaternion();this.axis=new THREE.Vector3();this.mean=new THREE.Vector3();
  this.entries=this.indices.map(i=>({i,child:bank.bones.findIndex(b=>b.parent===i&&/^Hair/.test(b.name)),restAxis:bank.rest.wp[i].clone().sub(bank.rest.wp[bank.bones[i].parent]).applyQuaternion(bank.rest.wq[i].clone().invert()).normalize()}));
 }
 copy(other){this.total=other.total;for(const i of this.indices)this.q[i].copy(other.q[i]);return this;}
 mix(other,weight){if(other.total>0)for(const i of this.indices)this.q[i].slerp(other.q[i],weight);return this;}
 clear(){this.total=0;return this;}
 add(pose,profile,weight){
  if(!(weight>0))return;const a=weight/(this.total+weight);this.headInverse.copy(pose.wq[this.bank.index.head]).invert();
  for(const e of this.entries){
   if(e.child>=0)this.axis.subVectors(pose.wp[e.child],pose.wp[e.i]);else this.axis.copy(e.restAxis).applyQuaternion(pose.wq[e.i]);
   if(this.axis.lengthSq()<1e-12){this.swing.identity();}else{
    this.axis.normalize().applyQuaternion(this.headInverse);this.mean.copy(profile.hairMean[e.i]);
    this.swing.setFromUnitVectors(this.mean,this.axis);
    // A swing delta about the cycle mean normally lies in the identity
    // hemisphere. Limit antipodal degeneracy without changing bank samples.
    const angle=2*Math.acos(clamp(Math.abs(this.swing.w),0,1));if(angle>HOST_HAIR.maxDelta)this.swing.slerp(this.identity,1-HOST_HAIR.maxDelta/angle);
   }
   if(!this.total)this.q[e.i].copy(this.swing);else this.q[e.i].slerp(this.swing,a);
  }
  this.total+=weight;return this;
 }
}