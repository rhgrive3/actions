import * as THREE from 'three';
import {sampleRunFoot} from './run-foot-path.js';
/** Blend evaluated end-effectors, rather than FK of blended joint rotations.
 * FK is nonlinear: FK(blend(q)) is NOT blend(FK(q)), notably for back/side
 * combinations. Body quaternions still use the unchanged authored tracks. */
export class GaitTargets {
 constructor(bank){this.bank=bank;this.indices=['leg1_L','leg1_R','leg2_L','leg2_R','foot_L','foot_R'].map(n=>bank.index[n]);this.wp=bank.bones.map(()=>new THREE.Vector3());this.wq=bank.bones.map(()=>new THREE.Quaternion());this.total=0;this.filtered=new THREE.Vector3();}
 clear(){this.total=0;return this;}
 add(pose,weight,profile=null,framePhase=0){
  const a=weight/(this.total+weight);
  for(const i of this.indices){
   const side=i===this.bank.index.foot_L?0:i===this.bank.index.foot_R?1:-1;
   let pos=pose.wp[i];
   if(side>=0&&profile?.runFootPaths&&sampleRunFoot(profile,side,framePhase,this.filtered)){
    this.filtered.lerp(pos,1-.85);pos=this.filtered;
   }
   if(!this.total){this.wp[i].copy(pos);this.wq[i].copy(pose.wq[i]);}
   else{this.wp[i].lerp(pos,a);this.wq[i].slerp(pose.wq[i],a);}
  }
  this.total+=weight;return this;
 }
 copy(pose){for(const i of this.indices){this.wp[i].copy(pose.wp[i]);this.wq[i].copy(pose.wq[i]);}this.total=1;return this;}
 mix(pose,weight){for(const i of this.indices){this.wp[i].lerp(pose.wp[i],weight);this.wq[i].slerp(pose.wq[i],weight);}return this;}
}