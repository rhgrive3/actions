import {PLAYER} from '../../../src/config.js';
import {GroundHit} from '../../../src/game/physics.js';

// The installed Trizooka controller consumes the same horizontal move intent
// and resolves real ground support. Flying/kinematic specials keep ownership.
const groundedMoveIntent=a=>!a.specialActive||a.specialActive.id==='trizooka'&&a.specialActive.phase==='charge'&&a.s3Trizooka?.active===true&&a.form==='kid';

/** A lower display hull is not a supported combat walk from an upper deck.
 * Probe successive real foot placements with the installed step dimensions,
 * so continuous ramps remain legal and unqualified cliff drops do not. */
export function nativeCombatWet(brain,G,x,z,y){
 const a=brain.a;
 if(!G.level?.native||G.physics?.level!==G.level||!a?.alive||!a.grounded||!['fight','retreat'].includes(brain.mode)||a.climbing||!groundedMoveIntent(a)||a.superJumpState||a.s3?.squidSpawn)return null;
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

/** A* deliberately excludes the opposing spawn zone. Seeing an opponent
 * there must not replace an already qualified source route with a null path.
 * Replan to the same existing goal; do not create nodes or enter that zone. */
export function nativeCombatPathGoal(brain,G,target,id){
 const N=G.nav,a=brain.a,route=brain._nativeCombatPath;
 if(!G.level?.native||G.physics?.level!==G.level||N?.level!==G.level||N.physics!==G.physics||!a?.alive||!a.grounded||a.climbing||!groundedMoveIntent(a)||a.superJumpState||a.s3?.squidSpawn||brain.mode!=='fight'||!brain.target?.alive||brain.target.team!==1-a.team||target!==brain.target.pos||N.nodes[id]?.zone!==1-a.team)return id;
 if(route?.nav!==N||route.level!==G.level||route.physics!==G.physics||route.path!==brain.path||route.goal!==brain.goal||brain.path?.at(-1)!==route.goal)return id;
 const goal=N.nodes[route.goal];
 return goal&&N.valid[goal.id]&&goal.zone!==1-a.team?goal.id:id;
}
