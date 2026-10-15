// Keep the authoritative runner's release/interval and all existing pose owners.
// Only repair the artificial zero angular velocity at the release boundary.
import {VERTICAL_SWING} from '../splatoon3/runtime/roller.mjs';
const INSTALLED=Symbol.for('inkwave.local-quality.roller-motion.v1');
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x);};
const mix=(a,b,t)=>a+(b-a)*t;
function hermite(a,b,va,vb,t,duration){const u=clamp(t/duration),u2=u*u,u3=u2*u;return (2*u3-3*u2+1)*a+(u3-2*u2+u)*duration*va+(-2*u3+3*u2)*b+(u3-u2)*duration*vb;}
export function verticalSwingAngle(elapsed,windup){
  const begin=windup*.76,first=windup-begin,follow=.12;
  const {coil,release,follow:end}=VERTICAL_SWING;
  if(elapsed<begin)return mix(-2.95,coil,ease(elapsed/(windup*.68)));
  const releaseSpeed=Math.min(2*(release-coil)/first,2*(end-release)/follow);
  if(elapsed<=windup)return hermite(coil,release,0,releaseSpeed,elapsed-begin,first);
  return hermite(release,end,releaseSpeed,0,elapsed-windup,follow);
}
export function verticalSwingCorrection(elapsed,windup,interval){
  if(!(windup>0&&interval>windup)||!Number.isFinite(elapsed))return 0;
  const coil=ease(elapsed/(windup*.68)),whip=ease((elapsed-windup*.76)/(windup*.24)),follow=ease((elapsed-windup)/.12);
  const old=mix(mix(mix(-2.95,VERTICAL_SWING.coil,coil),VERTICAL_SWING.release,whip),VERTICAL_SWING.follow,follow);
  const recover=ease((elapsed-windup-.12)/Math.max(.01,interval-windup-.12));
  return (verticalSwingAngle(elapsed,windup)-old)*ease(elapsed/(2/60))*(1-recover);
}
export function installRollerMotionQuality({Character}, _detailSnapshot){
  // roller.mjs now poses every Roller swing with its own release velocity (one
  // S3 swing order: overhead hold -> slam -> floor rest, roller-heavy-swing.mjs).
  // This correction repaired the zero velocity of the former stretched spline;
  // layering it on the new curve would bend the slam. It stays a no-op install.
  const P=Character?.prototype;if(!P||Object.hasOwn(P,INSTALLED))return;
  Object.defineProperty(P,INSTALLED,{value:true});
}
