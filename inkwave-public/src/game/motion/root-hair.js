import * as THREE from 'three';
import {clamp} from './source-bank.js';
/** Exact constant-input solution. x'=v-input, v'=-K*x-D*v.
 * The coefficients below are INKWAVE's existing hair-style spring coefficients, NOT Nintendo data.
 * Damping/gain are host settling controls (0.85 damping ratio, 0.35 gain).
 * Only external root turning is added: authored head/gait movement is already in the source hair curves. */
export function springStep(x,v,input,K,D,dt,out,offset=0){
 const xe=-D*input/K,ve=input,a=x-xe,b=v-ve,alpha=D/2,w=Math.sqrt(Math.max(1e-12,K-alpha*alpha));
 const e=Math.exp(-alpha*dt),c=Math.cos(w*dt),s=Math.sin(w*dt)/w;
 out[offset]=xe+e*(a*c+(b+alpha*a)*s);
 out[offset+1]=ve+e*(b*c-(alpha*b+K*a)*s);
}
export class RootHairInertia {
 constructor(character){
  this.c=character;this.chains=[];this.state=new Float64Array(character.hairMeta.length*4*6);this.v=new THREE.Vector3();this.p=new THREE.Vector3();this.axis=new THREE.Vector3();this.q=new THREE.Quaternion();this.head=new THREE.Quaternion();this.parent=new THREE.Quaternion();this.delta=new THREE.Quaternion();this.result=new Float64Array(2);
  character.hairMeta.forEach((m,si)=>{for(let k=0;k<4;k++){
   const bone=k<3?character.bones[`hair${si}_${k}`]:character.bones[`hairTip${si}`];if(!bone)return;
   const K=(k===3?95*0.7:170*0.62*[1,0.75,0.55][k])*m.K/clamp(m.len/0.22,0.6,1.6),D=2*0.85*Math.sqrt(K);
   const gain=(k===3?0.12:[0.55,0.3,0.15][k]*clamp(1.2-m.K*0.3,0.3,1)*1.15);
   this.chains.push({bone,K,D,gain:gain*0.35,offset:(si*4+k)*6,limit:k===3?0.4:0.68});
  }});
 }
 reset(){this.state.fill(0);}
 update(dt,rootTurnRate){
  if(!(dt>=0)||!Number.isFinite(rootTurnRate))return;
  const c=this.c;c._kidXform(c.bones.head,this.p,this.head);this.q.copy(this.head).invert();this.axis.set(0,rootTurnRate,0).applyQuaternion(this.q);
  for(const e of this.chains){
   const j=e.offset;for(let k=0;k<3;k++){
    springStep(this.state[j+2*k],this.state[j+2*k+1],this.axis.getComponent(k)*e.gain,e.K,e.D,dt,this.result);
    this.state[j+2*k]=clamp(this.result[0],-e.limit,e.limit);this.state[j+2*k+1]=this.result[1];
    // Saturation must not store outward velocity for the next frame.
    const input=this.axis.getComponent(k)*e.gain;
    if(this.result[0]!==this.state[j+2*k]&&Math.sign(this.result[1]-input)===Math.sign(this.result[0]))this.state[j+2*k+1]=input;
   }
   this.v.set(this.state[j],this.state[j+2],this.state[j+4]);const angle=this.v.length();
   if(angle<1e-8)continue;
   this.delta.setFromAxisAngle(this.v.multiplyScalar(1/angle),angle);
   this.q.copy(this.head).multiply(this.delta).multiply(this.delta.copy(this.head).invert());
   c._kidXform(e.bone.parent,this.p,this.parent);
   this.delta.copy(this.parent).invert().multiply(this.q).multiply(this.parent);
   e.bone.quaternion.premultiply(this.delta).normalize();
  }
 }
}