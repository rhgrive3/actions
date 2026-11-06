import {PLAYER} from '../../../src/config.js';
import {GroundHit,Hit} from '../../../src/game/physics.js';

function hasJumpEdgeTo(node,toId){
 const nb=node?.nb;if(!nb)return false;
 for(let i=0;i<nb.length;i++){const e=nb[i];if(e.to===toId)return e.type==='jump';}
 return false;
}
function cautiousSourceTurnUncached(from,to,next){
 if(hasJumpEdgeTo(from,to.id)||next&&hasJumpEdgeTo(to,next.id))return true;
 if(!next)return true;
 const ax=to.x-from.x,az=to.z-from.z,bx=next.x-to.x,bz=next.z-to.z;
 return ax*bx+az*bz<.85*Math.hypot(ax,az)*Math.hypot(bx,bz);
}
// The answer depends only on the current path segment's nodes, so it is kept
// until the path, index or any node position/edge list changes.
function cautiousSourceTurn(brain,G){
 const N=G.nav,path=brain.path,pi=brain.pi;
 const from=N?.nodes[path?.[Math.max(0,pi-1)]],to=N?.nodes[path?.[pi]],next=N?.nodes[path?.[pi+1]];
 if(!from||!to)return false;
 const m=brain._nativeCautiousTurn;
 if(m&&m.path===path&&m.pi===pi&&m.from===from&&m.to===to&&m.next===next&&m.fx===from.x&&m.fz===from.z&&m.tx===to.x&&m.tz===to.z&&
    m.nx===next?.x&&m.nz===next?.z&&m.fnb===from.nb&&m.fn===from.nb?.length&&m.tnb===to.nb&&m.tn===to.nb?.length)return m.val;
 const val=cautiousSourceTurnUncached(from,to,next);
 brain._nativeCautiousTurn={path,pi,from,to,next,fx:from.x,fz:from.z,tx:to.x,tz:to.z,nx:next?.x,nz:next?.z,fnb:from.nb,fn:from.nb?.length,tnb:to.nb,tn:to.nb?.length,val};
 return val;
}
/** Native source routes require the actual support before a bot turns toward
 * its next waypoint. Legacy stage followers keep their original policy. */
export function nativeSourceWaypointReached(G,actor,node){
 if(!G.level?.native)return !G.level?.manifest?.sourceNavigation?.highDrops;
 const dx=node.x-actor.pos.x,dz=node.z-actor.pos.z;
 // Cheap reject well outside .18 m; Math.hypot keeps the exact boundary.
 if(!actor.grounded||dx*dx+dz*dz>.0325||Math.hypot(dx,dz)>.18)return false;
 if(actor.bot&&!actor.bot.target&&cautiousSourceTurn(actor.bot,G)&&Math.hypot(actor.vel.x,actor.vel.z)>.65)return false;
 return nativeSourceFootSupported(G,actor,node);
}

/** Physical source support, independent of a follower's distance/turn policy.
 * Other opted traversals can reuse the installed foot probe at touchdown. */
export function nativeSourceFootSupported(G,actor,node){
 if(!G.level?.native||!actor.grounded)return false;
 const scratch=actor._nativeFootQuery||(actor._nativeFootQuery={down:actor.pos.clone().set(0,-1,0),origin:actor.pos.clone(),hit:new Hit()});
 const hit=G.physics.raycast(scratch.origin.set(node.x,node.y+.1,node.z),scratch.down,.3,scratch.hit);
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
 const a=brain.a;if(!G.level?.native||brain.target||a.climbing)return;
 const n=G.nav?.nodes[brain.path?.[brain.pi]];if(!n)return;
 const dx=n.x-a.pos.x,dz=n.z-a.pos.z,d=Math.hypot(dx,dz),speed=Math.hypot(a.vel.x,a.vel.z);
 const turning=speed>.5&&d>.01&&(a.vel.x*dx+a.vel.z*dz)<.95*speed*d;
 if(!turning&&!cautiousSourceTurn(brain,G))return;
 a.intent.squid=false;
 const mag=Math.min(.35,Math.max(.03,(d-.09)*.65));
 if(d>1e-6)a.intent.move.set(dx/d*mag,0,dz/d*mag);else a.intent.move.set(0,0,0);
}
