// QA-only prediction of the already installed swim equations. No model edits.
export const BANK_PRECISION=1e-8;
const INSTALL=Symbol.for('inkwave.s3.swim-motion.install.v1');
const angle=x=>Math.atan2(Math.sin(x),Math.cos(x)),wrap=x=>((x%(2*Math.PI))+2*Math.PI)%(2*Math.PI),clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const near=(actual,expected,name)=>{if(!Number.isFinite(actual)||!Number.isFinite(expected)||Math.abs(actual-expected)>BANK_PRECISION)throw Error('existing bank response '+name);};
const arrayNear=(a,b,name)=>{if(a.length!==b.length)throw Error('existing bank response '+name);a.forEach((x,i)=>near(x,b[i],name));};
export function validateDrawnQuaternion(actual,expected){
 if(actual.length!==4||expected.length!==4)throw Error('existing bank response drawn pivot dimensions');
 near(Math.hypot(...actual),1,'drawn pivot unit quaternion');near(Math.hypot(...expected),1,'predicted unit quaternion');
 // Matrix decomposition may choose -q; it represents exactly the same rotation.
 const sign=actual.reduce((sum,x,i)=>sum+x*expected[i],0)<0?-1:1;
 const residual=Math.max(...actual.map((x,i)=>Math.abs(sign*x-expected[i])));
 arrayNear(actual.map(x=>sign*x),expected,'drawn pivot');return residual;
}
export function predictBankAdvance(THREE,before,motion,dt){
 const speed=Number.isFinite(motion.speed)?Math.max(0,motion.speed):motion.gv,target=clamp(speed/11),k=-Math.expm1(-16*dt),integral=target*dt+(before.power-target)*k/16,power=before.power+(target-before.power)*k;
 const bodyPhase=wrap(before.bodyPhase+5*dt+9*integral),swayPhase=wrap(before.swayPhase+4*dt+7*integral);
 let heading=before.yaw;const move=motion.localMove;if(speed>.3){if(move&&Math.hypot(move.x,move.z)>.05)heading=motion.yaw+Math.atan2(-move.x,move.z);else if(motion.gv>.3)heading=Math.atan2(motion.gvx,motion.gvz);}
 const turn=angle(heading-before.yaw)*-Math.expm1(-10*dt),yaw=angle(before.yaw+turn),targetBank=clamp(-turn/dt*.08,-.5,.5),bank=before.bank+(targetBank-before.bank)*-Math.expm1(-6*dt),und=Math.sin(bodyPhase);
 const euler=new THREE.Euler(Math.PI/2+.06*und*power,yaw+.1*Math.sin(swayPhase+1)*power,bank+und*.12*Math.min(1,power*11/4),'YXZ');
 const worldQuaternion=new THREE.Quaternion().fromArray(before.worldQuaternion).slerp(new THREE.Quaternion().setFromEuler(euler),-Math.expm1(-26*dt));
 return {yaw,bank,power,bodyPhase,swayPhase,worldQuaternion:worldQuaternion.toArray()};
}
export function validateBankAdvance(actual,expected){for(const k of ['yaw','bank','power','bodyPhase','swayPhase'])near(actual[k],expected[k],k);arrayNear(actual.worldQuaternion,expected.worldQuaternion,'world quaternion');return true;}
const copy=m=>({yaw:m.yaw,bank:m.bank,power:m.power,bodyPhase:m.bodyPhase,swayPhase:m.swayPhase,worldQuaternion:m.worldQuaternion.toArray()});
export function observeExistingBank(THREE,Character){
 const C=Character.prototype,original=C._updateSquid,expected=new WeakMap();let advances=0;
 const state=ch=>Object.getPrototypeOf(ch)[INSTALL]?.states.get(ch);
 C._updateSquid=function(...args){const dt=args[0],s=args[1]||{},old=state(this),before=old&&copy(old),age=old?.age,motion={yaw:this.yaw,gv:this.gv,gvx:this.gvx,gvz:this.gvz,speed:s.speed,localMove:s.localMove&&{x:s.localMove.x,z:s.localMove.z}};
  const result=original.apply(this,args),next=state(this);if(next){if(old===next&&dt>0&&next.age>age){for(const k of ['yaw','gv','gvx','gvz'])near(this[k],motion[k],'unchanged input '+k);const predicted=predictBankAdvance(THREE,before,motion,dt);validateBankAdvance(copy(next),predicted);expected.set(this,predicted);advances++;}else expected.set(this,copy(next));}else expected.delete(this);return result;};
 return {capture(ch,skinned){const m=state(ch);if(!m)return{active:false};const prediction=expected.get(ch);if(!prediction)throw Error('missing existing bank prediction');const actual=ch.squid.pivot.getWorldQuaternion(new THREE.Quaternion()).toArray();const worldRotationResidual=validateDrawnQuaternion(actual,prediction.worldQuaternion);const inverse=new THREE.Quaternion().fromArray(prediction.worldQuaternion).invert();return{active:true,worldRotationResidual,worldQuaternion:prediction.worldQuaternion,bank:prediction.bank,yaw:prediction.yaw,localMantle:new THREE.Vector3().fromArray(skinned.mantle).applyQuaternion(inverse).toArray(),localWidth:new THREE.Vector3().fromArray(skinned.width).applyQuaternion(inverse).toArray()};},summary(){return{status:'existing-bank-response-verified',advances,precision:BANK_PRECISION};},restore(){C._updateSquid=original;}};
}
export function predictPairedAxis(axis,fromQuaternion,toQuaternion){
 // Unit quaternion vector rotation without relying on a separate Three import.
 const rotate=(v,q)=>{const[x,y,z]=v,[qx,qy,qz,qw]=q,ix=qw*x+qy*z-qz*y,iy=qw*y+qz*x-qx*z,iz=qw*z+qx*y-qy*x,iw=-qx*x-qy*y-qz*z;return[ix*qw+iw*-qx+iy*-qz-iz*-qy,iy*qw+iw*-qy+iz*-qx-ix*-qz,iz*qw+iw*-qz+ix*-qy-iy*-qx];};
 return rotate(rotate(axis,[-fromQuaternion[0],-fromQuaternion[1],-fromQuaternion[2],fromQuaternion[3]]),toQuaternion);
}
export function validatePredictedPair(before,after){
 for(const row of [before,after]){near(row.skinned.pitch,Math.asin(row.skinned.mantle[1]),'reported surface pitch');near(row.skinned.roll,Math.asin(row.skinned.width[1]),'reported surface roll');near(angle(row.skinned.heading-Math.atan2(row.skinned.mantle[0],row.skinned.mantle[2])),0,'reported surface heading');}
 if(before.bankPrediction?.active!==after.bankPrediction?.active)throw Error('bank owner mismatch');
 if(before.bankPrediction?.active){for(const[key,local]of [['mantle','localMantle'],['width','localWidth']]){arrayNear(before.bankPrediction[local],after.bankPrediction[local],'canonical skinned '+key);arrayNear(before.skinned[key],predictPairedAxis(after.skinned[key],after.bankPrediction.worldQuaternion,before.bankPrediction.worldQuaternion),'predicted skinned '+key);}}
 else for(const k of ['pitch','roll'])near(before.skinned[k],after.skinned[k],'inactive surface '+k);
 return true;
}
