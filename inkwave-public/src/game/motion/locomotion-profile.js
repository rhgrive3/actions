// Host-derived gait landmarks. This neither rewrites BFRES keys nor claims
// original-game contact flags/locomotion state-machine parameters.
import * as THREE from 'three';
import {SourcePose,mod,clamp} from './source-bank.js';
import {prepareRunFootPaths} from './run-foot-path.js';
const caches=new WeakMap();
export const smooth5=t=>{t=clamp(t,0,1);return t*t*t*(10+t*(-15+6*t));};
/** Longest circular low-height interval with opposing ankle travel. This
 * rejects swing islands which a height-only threshold can mislabel as stance. */
export function locomotionProfile(bank,name){
 let cache=caches.get(bank);if(!cache)caches.set(bank,cache=new Map());
 if(cache.has(name))return cache.get(name);
 const source=bank.profile(name),clip=bank.clips.get(name),n=source.samples,pose=new SourcePose(bank),tracks=[[],[]];
 const indices=['leg1_L','leg1_R','leg2_L','leg2_R','foot_L','foot_R'].map(n=>bank.index[n]);
 const centers=bank.bones.map(()=>new THREE.Vector3()),lowest=[Infinity,Infinity],centerPose=new SourcePose(bank),runSamples=[];
 const hairIndices=bank.bones.map((b,i)=>/^Hair/.test(b.name)?i:-1).filter(i=>i>=0);
 const hairMean=bank.bones.map(()=>new THREE.Vector3()),headInverse=new THREE.Quaternion(),hairAxis=new THREE.Vector3();
 for(let i=0;i<n;i++){
  bank.sample(clip,i/n*clip.frames,pose,true);
  // The cycle centre, not an unrelated idle clock, is the neutral pose for
  // shortened steps. Full FK centres also retain independent torso helpers.
  for(let k=0;k<bank.bones.length;k++)centers[k].addScaledVector(pose.wp[k],1/n);
  if(!i)centerPose.copy(pose);else centerPose.mix(pose,1/(i+1));
  headInverse.copy(pose.wq[bank.index.head]).invert();
  for(const k of hairIndices){
   const child=bank.bones.findIndex(b=>b.parent===k&&/^Hair/.test(b.name));
   if(child>=0)hairAxis.subVectors(pose.wp[child],pose.wp[k]);
   else {const parent=bank.bones[k].parent;hairAxis.subVectors(bank.rest.wp[k],bank.rest.wp[parent]);hairAxis.applyQuaternion(bank.rest.wq[k].clone().invert()).applyQuaternion(pose.wq[k]);}
   if(hairAxis.lengthSq()>1e-12)hairMean[k].add(hairAxis.normalize().applyQuaternion(headInverse));
  }
  if(clip.name.startsWith('Run'))runSamples.push([pose.wp[bank.index.foot_L].clone(),pose.wp[bank.index.foot_R].clone()]);
  for(let j=0;j<2;j++)lowest[j]=Math.min(lowest[j],pose.wp[bank.index[j?'foot_R':'foot_L']].y);
  for(let j=0;j<2;j++){const p=pose.wp[bank.index['foot_'+(j?'R':'L')]];tracks[j].push(p.x*source.axis[0]+p.z*source.axis[2]);}
 }
 const feet=source.feet.map((original,side)=>{
  const x=tracks[side];let mask=original.contact.map((c,i)=>c&&x[mod(i+1,n)]<x[mod(i-1,n)]);
  const before=mask.slice();for(let i=0;i<n;i++)if(!before[i]&&before[mod(i-1,n)]&&before[mod(i+1,n)])mask[i]=true;
  let start=0,length=0;
  for(let i=0;i<n;i++)if(mask[i]&&!mask[mod(i-1,n)]){let len=0;while(len<n&&mask[mod(i+len,n)])len++;if(len>length){start=i;length=len;}}
  if(length<3)return {...original,duty:original.contact.filter(Boolean).length/n,fittedStride:original.stride};
  let mt=(length-1)/(2*n),mx=0;for(let i=0;i<length;i++)mx+=x[mod(start+i,n)]/length;
  let num=0,den=0;for(let i=0;i<length;i++){let t=i/n-mt;num+=t*(x[mod(start+i,n)]-mx);den+=t*t;}
  const stride=-num/Math.max(1e-12,den);
  mask=mask.map((_,i)=>mod(i-start,n)<length);
  return {...original,contact:mask,strike:start/n,duty:length/n,fittedStride:stride>1e-6?stride:original.stride};
 });
 const positive=feet.map(f=>f.fittedStride).filter(v=>v>1e-6);
 for(let j=0;j<2;j++)centers[bank.index[j?'foot_R':'foot_L']].y=lowest[j];
 centerPose.fk();for(const k of hairIndices)hairMean[k].normalize();
 const p={...source,feet,centers,centerPose,hairMean,runFootPaths:prepareRunFootPaths(bank,clip,runSamples),stride:positive.length?positive.reduce((a,b)=>a+b,0)/positive.length:source.stride,
  method:'host estimator: longest low-height/opposing-ankle interval; least-squares stance travel; continuous contact envelope'};
 cache.set(name,p);return p;
}
/** Smooth periodic contact signal, rather than floor(frame*4) boolean jumps. */
export function sampleContact(profile,side,phase){
 const foot=profile.feet[side],n=profile.samples;
 // Quarter-frame periodic interpolation retains the data-derived boundaries.
 const x=mod(phase,1)*n,i=Math.floor(x),u=smooth5(x-i);
 return Number(foot.contact[i%n])*(1-u)+Number(foot.contact[(i+1)%n])*u;
}

/** Host-space stance window: a short-legged target cannot keep a shoe planted
 * for the original clip's whole stance while moving faster than that clip's
 * native root displacement. Preserve the 40/32f swing timing, narrow only the
 * ground-contact eligibility to a reachable arc of the target skeleton.
 * Values here are host geometry rules, not contact keys extracted from game code. */
export function feasibleContact(profile,side,phase,{speed,cadenceHz,legReach}){
 const foot=profile.feet[side],worldCycle=Math.max(0,speed)/Math.max(1e-6,cadenceHz);
 const duty=Math.min(foot.duty,legReach*0.62/Math.max(1e-6,worldCycle));
 const start=foot.strike+(foot.duty-duty)*0.27;
 const u=mod(phase-start,1)/Math.max(1e-6,duty);
 if(u<0||u>1)return 0;
 const edge=0.13;
 return smooth5(Math.min(1,u/edge))*smooth5(Math.min(1,(1-u)/edge));
}