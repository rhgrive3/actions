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
 // Edge steering calls this repeatedly for the same actor position and form.
 // The starting foot-ring is identical in every direction. Reuse only inside
 // one synchronous _edgeGuard call (see native-stages/adapter.mjs), never for
 // another tick, move, world, form or physics owner. Every subsequent sample
 // retains the original installed 9-ray groundProbe, order and thresholds.
 const cache=brain._nativeCombatEdgeProbe;
 for(let i=0;i<=count;i++){
  if(i===0&&cache?.active&&cache.ready&&cache.actor===a&&
      cache.level===G.level&&cache.physics===G.physics&&
      cache.x===a.pos.x&&cache.y===y&&cache.z===a.pos.z&&cache.squid===squid){
   if(!cache.safe)return true;
   height=cache.height;
   continue;
  }
  const t=i/count;
  G.physics.groundProbe(a.pos.x+(x-a.pos.x)*t,height,a.pos.z+(z-a.pos.z)*t,up,PLAYER.stepDown,PLAYER.footRadius,hit,squid);
  const safe=!!(hit.hit&&hit.block>=0&&G.level.blocks[hit.block]?.solid&&Number.isFinite(hit.y));
  if(i===0&&cache?.active){
   cache.actor=a;cache.level=G.level;cache.physics=G.physics;
   cache.x=a.pos.x;cache.y=y;cache.z=a.pos.z;cache.squid=squid;
   cache.height=hit.y;cache.safe=safe;cache.ready=true;
  }
  if(!safe)return true;
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
