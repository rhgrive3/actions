import {nativeSourceFootSupported} from './native-bot-support.mjs';
import {nativeTowerRider} from './native-ranked-boarding.mjs';
import {PLAYER} from '../../../src/config.js';
const pending=new WeakMap();

function staticDestination(G,node){
 const P=G.physics,L=G.level;if(!node||!P?.raycast||!P.groundProbe||!P.bodyFits||P.level!==L)return null;
 const goal=L.spawnPads[0].clone().set(node.x,node.y,node.z),probe={pos:goal,grounded:true,form:'kid'};
 if(!nativeSourceFootSupported(G,probe,node))return null;
 const support=probe._nativeWaypointGround;
 const hit=P.raycast(goal.clone().setY(node.y+.1),goal.clone().set(0,-1,0),.3);
 if(!hit.hit||hit.triangle<0||hit.block<0||hit.block>=L.staticBlockCount)return null;
 goal.y=support.y;
 const radius=PLAYER.s3HumanoidTerrainRadiusRaw*PLAYER.s3TerrainDistanceScale;
 return P.bodyFits(goal,radius,PLAYER.stepUp,PLAYER.height,false,.01)?{goal,block:support.block,triangle:hit.triangle}:null;
}

function combatContext(brain,G,state){
 const a=brain.a,N=G.nav,path=brain.path;
 return !!(state.combat&&G.level?.native&&a.alive&&!a.grounded&&a.form==='kid'&&!a.climbing&&!a.superJumpState&&!a.specialActive&&!a.s3?.squidSpawn&&!a.intent.sub&&!a.intent.special&&!a.intent.throw&&!nativeTowerRider(G,a)&&!brain._nativeTowerBoarding&&!brain._nativeClimb&&!brain._nativeDrop&&!brain._nativeSurge&&!brain._nativeJumpAttach&&
  state.path===path&&state.node===path?.[brain.pi]&&state.mode===brain.mode&&brain.mode==='fight'&&state.target===brain.target&&brain.target?.alive&&brain.target.team!==a.team&&state.goal===brain.goal&&
  state.level===G.level&&state.nav===N&&state.physics===G.physics&&state.match===G.match&&state.matchMode===G.match?.mode&&N.level===G.level&&N.physics===G.physics&&G.physics.level===G.level&&
  (a.s3JumpSerial||0)===state.serial+1&&N.valid[state.node]&&N.nodes[state.node].zone!==1-a.team&&N.edgeType(path[brain.pi-1],state.node)==='jump'&&Number.isFinite(G.time)&&G.time>=state.started&&G.time-state.started<state.maxFlight&&staticDestination(G,N.nodes[state.node]));
}

/** An actually admitted source jump keeps its current route until touchdown;
 * target perception and firing remain with combat, then ordinary replanning
 * resumes. This never creates a jump or chooses another goal. */
export function nativeOrdinaryJumpCommitted(brain,G){
 const state=pending.get(brain);return !!(state&&combatContext(brain,G,state));
}

function combatSourceReady(brain,G){
 const a=brain.a,N=G.nav,L=G.level,P=G.physics;
 if(!N?.nodes||!P?.raycast||!P.groundProbe||!P.bodyFits||N.level!==L||N.physics!==P||P.level!==L||a.s3?.squidSpawn)return false;
 const from=N.nodes[brain.path[brain.pi-1]],to=N.nodes[brain.path[brain.pi]],edge=from?.nb.find(e=>e.to===to?.id);
 if(brain.mode!=='fight'||!brain.target?.alive||brain.target.team===a.team||!N.valid?.[from?.id]||!N.valid?.[to?.id]||to.zone===1-a.team||edge?.type!=='jump'||edge.climb||edge.drop||!Number.isFinite(G.time))return false;
 const destination=staticDestination(G,to);if(!destination)return false;
 const r=PLAYER.s3HumanoidTerrainRadiusRaw*PLAYER.s3TerrainDistanceScale,rise=destination.goal.y-a.pos.y,peak=PLAYER.jumpVel**2/(2*PLAYER.gravity)+Math.min(PLAYER.ledgeAssist,.22);
 return rise>0&&rise<=peak&&P.bodyFits(a.pos,r,PLAYER.stepUp,PLAYER.height,false,.01);
}

function combatMove(brain,G,state){
 const a=brain.a,n=G.nav.nodes[state.node],dx=n.x-a.pos.x,dz=n.z-a.pos.z,d=Math.hypot(dx,dz),mag=Math.min(.35,Math.max(.03,(d-.09)*.65));
 a.intent.squid=false;
 if(d>1e-6)a.intent.move.set(dx/d*mag,0,dz/d*mag);else a.intent.move.set(0,0,0);
}

/** Keep an admitted ordinary source jump held through ascent. The existing
 * Actor owns launch, the hold/release profile, collision and landing. */
export function nativeOrdinaryJumpInput(brain,G){
 const a=brain.a,it=a.intent,N=G.nav,path=brain.path,node=path?.[brain.pi];
 if(!G.level?.native||!a.alive||brain.target&&brain.mode!=='fight'||a.form!=='kid'||a.climbing||a.superJumpState||a.specialActive||nativeTowerRider(G,a)||!path||brain.pi<=0||N?.edgeType(path[brain.pi-1],node)!=='jump'){
  pending.delete(brain);return;
 }
 const serial=a.s3JumpSerial||0,state=pending.get(brain);
 if(state){
  if(state.combat){
   if(!it.sub&&!it.special&&!it.throw&&combatContext(brain,G,state)){combatMove(brain,G,state);if(a.vel.y>0)it.jump=true;return;}
   pending.delete(brain);
  }else{
  if(brain.target||state.path!==path||state.node!==node||state.mode!==brain.mode||state.level!==G.level||state.nav!==N||state.match!==G.match||serial!==state.serial+1||a.grounded||!(a.vel.y>0))pending.delete(brain);
  else {it.jump=true;return;}
  }
 }
 // Observe a press the normal BotBrain already requested. Never create a
 // launch, extend an unrelated airborne impulse or hold a failed admission.
 if(it.jump&&a.grounded){
  if(brain.target){
   if(!it.sub&&!it.special&&!it.throw&&combatSourceReady(brain,G)&&nativeSourceFootSupported(G,a,N.nodes[path[brain.pi-1]]))pending.set(brain,{path,node,serial,mode:brain.mode,target:brain.target,goal:brain.goal,level:G.level,nav:N,physics:G.physics,match:G.match,matchMode:G.match?.mode,combat:true,started:G.time,maxFlight:Math.min(2,2*PLAYER.jumpVel/(PLAYER.gravity*Math.min(1,PLAYER.apexGravityMul||1))+.1)});
  }else if(nativeSourceFootSupported(G,a,N.nodes[path[brain.pi-1]]))pending.set(brain,{path,node,serial,mode:brain.mode,level:G.level,nav:N,match:G.match});
 }
}
