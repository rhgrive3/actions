import {PLAYER} from '../../../src/config.js';
import {GroundHit} from '../../../src/game/physics.js';

/** A lower display hull is not a supported combat walk from an upper deck.
 * Probe successive real foot placements with the installed step dimensions,
 * so continuous ramps remain legal and unqualified cliff drops do not. */
export function nativeCombatWet(brain,G,x,z,y){
 const a=brain.a;
 if(!G.level?.native||G.physics?.level!==G.level||!a?.alive||!a.grounded||!['fight','retreat'].includes(brain.mode)||a.climbing||a.specialActive||a.superJumpState||a.s3?.squidSpawn)return null;
 const distance=Math.hypot(x-a.pos.x,z-a.pos.z);
 if(!Number.isFinite(distance)||!Number.isFinite(y))return true;
 const hit=brain._nativeCombatGround||(brain._nativeCombatGround=new GroundHit());
 const squid=a.form==='squid',up=squid?PLAYER.squidStepUp:PLAYER.stepUp;
 const count=Math.max(1,Math.ceil(distance/PLAYER.footRadius));let height=y;
 for(let i=0;i<=count;i++){
  const t=i/count;
  G.physics.groundProbe(a.pos.x+(x-a.pos.x)*t,height,a.pos.z+(z-a.pos.z)*t,up,PLAYER.stepDown,PLAYER.footRadius,hit,squid);
  if(!hit.hit||hit.block<0||!G.level.blocks[hit.block]?.solid||!Number.isFinite(hit.y))return true;
  height=hit.y;
 }
 return false;
}
