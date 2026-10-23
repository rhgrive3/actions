import * as THREE from 'three';
import {mod} from './source-bank.js';

// Presentation-only, symmetric cyclic swing smoothing. Run source clips have
// deliberately quick foot recoveries, but the converted short target leg and
// high host playback cadence magnify them. A symmetric kernel mostly
// preserves the near-linear stance path, without special frame-boundary gates.
// This smoothing leaves the loaded source-bank curve coefficients unchanged.
export function prepareRunFootPaths(bank,clip,samples){
 if(!clip.name.startsWith('Run'))return null;
 const count=samples.length,n=count,span=Math.max(1,Math.round(n/clip.frames*3.2));
 const taps=[[-1,.14],[-.5,.22],[0,.28],[.5,.22],[1,.14]];
 const paths=[samples.map(()=>new THREE.Vector3()),samples.map(()=>new THREE.Vector3())];
 for(let i=0;i<n;i++){
  if(!(i in samples))continue;
  const left=paths[0][i],right=paths[1][i];
  for(const [offset,weight] of taps){
   const x=mod(i+offset*span,n),k=Math.floor(x),a=x-k,wa=weight*(1-a),wb=weight*a,next=(k+1)%n;
   left.addScaledVector(samples[k][0],wa).addScaledVector(samples[next][0],wb);
   right.addScaledVector(samples[k][1],wa).addScaledVector(samples[next][1],wb);
  }
 }
 return paths;
}
/** One invocation's basis for the normal equal-length left/right paths. */
export function prepareRunFootBasis(profile,phase,out){
 const paths=profile?.runFootPaths,n=paths?.[0]?.length;
 if(!(n>0)||paths[1]?.length!==n)return false;
 const x=mod(phase,1)*n,i=Math.floor(x),t=x-i,t2=t*t,t3=t2*t;
 const h0=2*t3-3*t2+1,h1=-2*t3+3*t2,k0=.5*(t3-2*t2+t),k1=.5*(t3-t2);
 out.n=n;out.i=i;out.next=(i+1)%n;out.before=mod(i-1,n);out.after=(i+2)%n;
 out.a=h0-k1;out.b=h1+k0;out.c=-k0;out.d=k1;return true;
}
/** Periodic Hermite interpolation of lowpass source FK ankle paths. */
export function sampleRunFoot(profile,side,phase,out,basis=null){
 const values=profile.runFootPaths?.[side];if(!values)return false;
 if(basis&&basis.n===values.length){
  out.copy(values[basis.i]).multiplyScalar(basis.a).addScaledVector(values[basis.next],basis.b).addScaledVector(values[basis.before],basis.c).addScaledVector(values[basis.after],basis.d);return true;
 }
 const n=values.length,x=mod(phase,1)*n,i=Math.floor(x),t=x-i,a=values[i],b=values[(i+1)%n],before=values[mod(i-1,n)],after=values[(i+2)%n];
 const t2=t*t,t3=t2*t;
 const h0=2*t3-3*t2+1,h1=-2*t3+3*t2,k0=.5*(t3-2*t2+t),k1=.5*(t3-t2);
 out.copy(a).multiplyScalar(h0-k1).addScaledVector(b,h1+k0)
    .addScaledVector(before,-k0).addScaledVector(after,k1);
 return true;
}
