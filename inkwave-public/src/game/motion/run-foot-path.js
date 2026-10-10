import * as THREE from 'three';
import {mod} from './source-bank.js';

// Presentation-only, symmetric cyclic swing smoothing. Run source clips have
// deliberately quick foot recoveries, but the converted short target leg and
// high host playback cadence magnify them. A symmetric kernel mostly
// preserves the near-linear stance path, without special frame-boundary gates.
// Nintendo's curves in the bank remain byte-for-byte unchanged.
export function prepareRunFootPaths(bank,clip,samples){
 if(!clip.name.startsWith('Run'))return null;
 const count=samples.length,n=count,span=Math.max(1,Math.round(n/clip.frames*3.2));
 const taps=[[-1,.14],[-.5,.22],[0,.28],[.5,.22],[1,.14]];
 return [0,1].map(side=>{
  const points=samples.map(pair=>pair[side]);
  return points.map((_,i)=>{
   const out=new THREE.Vector3();
   for(const [offset,weight] of taps){
    const x=mod(i+offset*span,n),k=Math.floor(x),a=x-k;
    out.addScaledVector(points[k],weight*(1-a)).addScaledVector(points[(k+1)%n],weight*a);
   }
   return out;
  });
 });
}
/** Periodic Hermite interpolation of lowpass source FK ankle paths. */
export function sampleRunFoot(profile,side,phase,out){
 const values=profile.runFootPaths?.[side];if(!values)return false;
 const n=values.length,x=mod(phase,1)*n,i=Math.floor(x),t=x-i,a=values[i],b=values[(i+1)%n],before=values[mod(i-1,n)],after=values[(i+2)%n];
 const t2=t*t,t3=t2*t;
 const h0=2*t3-3*t2+1,h1=-2*t3+3*t2,k0=.5*(t3-2*t2+t),k1=.5*(t3-t2);
 out.copy(a).multiplyScalar(h0-k1).addScaledVector(b,h1+k0)
    .addScaledVector(before,-k0).addScaledVector(after,k1);
 return true;
}