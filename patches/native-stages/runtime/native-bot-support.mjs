import {PLAYER} from '../../../src/config.js';
import {GroundHit} from '../../../src/game/physics.js';

function cautiousSourceTurn(brain,G){
 const N=G.nav,from=N?.nodes[brain.path?.[Math.max(0,brain.pi-1)]],to=N?.nodes[brain.path?.[brain.pi]],next=N?.nodes[brain.path?.[brain.pi+1]];
 if(!from||!to)return false;
 if(from.nb.find(e=>e.to===to.id)?.type==='jump'||next&&to.nb.find(e=>e.to===next.id)?.type==='jump')return true;
 if(!next)return true;
 const ax=to.x-from.x,az=to.z-from.z,bx=next.x-to.x,bz=next.z-to.z;
 return ax*bx+az*bz<.85*Math.hypot(ax,az)*Math.hypot(bx,bz);
}
/** Source-drop routes require the actual raised support before a bot turns
 * toward its next waypoint. Ordinary stage followers keep their old policy. */
export function nativeSourceWaypointReached(G,actor,node){
 if(!G.level?.manifest?.sourceNavigation?.highDrops)return true;
 if(!G.level.native)return false;
 if(!actor.grounded||Math.hypot(node.x-actor.pos.x,node.z-actor.pos.z)>.18)return false;
 if(actor.bot&&!actor.bot.target&&cautiousSourceTurn(actor.bot,G)&&Math.hypot(actor.vel.x,actor.vel.z)>.65)return false;
 return nativeSourceFootSupported(G,actor,node);
}

/** Physical source support, independent of a follower's distance/turn policy.
 * Other opted traversals can reuse the installed foot probe at touchdown. */
export function nativeSourceFootSupported(G,actor,node){
 if(!G.level?.native||!actor.grounded)return false;
 const down=actor.pos.clone().set(0,-1,0),origin=actor.pos.clone().set(node.x,node.y+.1,node.z),hit=G.physics.raycast(origin,down,.3);
 if(!hit.hit||hit.triangle<0||hit.normal.y<=.68||Math.abs(hit.point.y-node.y)>=.16)return false;
 // Graph heights describe the centre triangle. The installed controller can
 // stand higher when its real foot ring reaches a curb or a sloping triangle.
 // Derive that support with the same probe, retaining the arrival tolerance
 // and rejecting dynamic boxes or a missing source surface at the waypoint.
 const support=actor._nativeWaypointGround||(actor._nativeWaypointGround=new GroundHit());
 const isSquid=actor.form==='squid';
 G.physics.groundProbe(actor.pos.x,node.y,actor.pos.z,isSquid?PLAYER.squidStepUp:PLAYER.stepUp,PLAYER.stepDown,PLAYER.footRadius,support,isSquid);
 return !!(support.hit&&support.normal.y>.68&&support.block>=0&&support.block<G.level.staticBlockCount&&Math.abs(actor.pos.y-support.y)<=.16);
}

/** Slow and plant through ordinary humanoid input before a source jump or
 * corner. The Actor retains its acceleration, braking and heading physics. */
export function nativeSourceTravelInput(brain,G){
 const a=brain.a;if(!G.level?.native||!G.level.manifest?.sourceNavigation?.highDrops||brain.target||a.climbing)return;
 const n=G.nav?.nodes[brain.path?.[brain.pi]];if(!n)return;
 const dx=n.x-a.pos.x,dz=n.z-a.pos.z,d=Math.hypot(dx,dz),speed=Math.hypot(a.vel.x,a.vel.z);
 const turning=speed>.5&&d>.01&&(a.vel.x*dx+a.vel.z*dz)<.95*speed*d;
 if(!turning&&!cautiousSourceTurn(brain,G))return;
 a.intent.squid=false;
 const mag=Math.min(.35,Math.max(.03,(d-.09)*.65));
 if(d>1e-6)a.intent.move.set(dx/d*mag,0,dz/d*mag);else a.intent.move.set(0,0,0);
}
