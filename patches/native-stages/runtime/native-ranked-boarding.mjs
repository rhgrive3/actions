import * as THREE from 'three';
import {nativeTowerBoarding} from './native-tower-boarding.mjs';
import {nativeSourceFootSupported} from './native-bot-support.mjs';

/** Use the source-screened static supports already selected with the vehicle
 * route. A generic radial node is not a proof of a legal human boarding arc. */
export function nativeRankedTowerApproach(brain,target,engine,G){
 const N=G.nav,proofs=engine.stage?.tower?.boarding?.approaches;
 if(!G.level?.native||!Array.isArray(proofs))return null;
 const start=N.nearest(brain.a.pos,1.2);if(start<0)return false;
 const screen=nativeTowerBoarding(G,N.validIds,G.physics.actorBody,engine.stage.tower.halfSize);
 let best=null;
 for(const id of new Set(proofs.map(p=>p.sourceNode))){
  if(!N.valid[id])continue;
  const proof=screen.find(id,[target.x,target.y,target.z]);if(!proof)continue;
  if(!N.valid[proof.sourceNode])continue;
  const path=N.path(start,proof.sourceNode,brain.a.team,Math.max(6000,N.nodes.length*4));if(!path)continue;
  let cost=0;for(let i=1;i<path.length;i++)cost+=N.nodes[path[i-1]].nb.find(e=>e.to===path[i])?.cost??1;
  if(!best||cost<best.cost)best={path,proof,cost};
 }
 if(!best){brain._nativeTowerBoarding=null;return false;}
 brain.path=best.path;brain.pi=Math.min(1,best.path.length-1);brain.goal=best.proof.sourceNode;brain.bestD=Infinity;brain.noProg=0;
 brain._rankedApproachGoal={...target};brain._rankedApproachNode=best.proof.sourceNode;
 brain._nativeTowerBoarding={proof:best.proof,target:{...target},phase:'approach',seconds:0,level:G.level,nav:G.nav,world:G.match?.rankedWorld,engine};
 return true;
}

/** The existing Actor performs the jump and the existing RankedWorld counts
 * and carries the rider. This supplies ordinary human move/jump input only. */
export function updateNativeTowerBoarding(brain,G,engine,dt){
 const state=brain._nativeTowerBoarding,a=brain.a,w=G.match?.rankedWorld;
 if(!state)return false;
 if(!G.level?.native||engine?.mode!=='tower'||!w||!a.alive||a.specialActive||a.superJumpState||a.s3?.squidSpawn||state.level!==G.level||state.nav!==G.nav||state.world!==w||state.engine!==engine){brain._nativeTowerBoarding=null;return false;}
 if(nativeTowerRider(G,a)){brain._nativeTowerBoarding=null;return false;}
 const deck=w.towerBlock?.center;
 if(!deck||Math.hypot(deck.x-state.target.x,deck.z-state.target.z)>.15||Math.abs(w._towerDeckTop-state.target.y)>.1){brain._nativeTowerBoarding=null;brain.repath=0;return false;}
 const p=state.proof,start=new THREE.Vector3(...p.start),end=new THREE.Vector3(...p.end),it=a.intent;
 if(state.phase==='approach'){
  const node=G.nav.nodes[p.sourceNode];
  if(!nativeSourceFootSupported(G,a,node)||Math.hypot(a.pos.x-start.x,a.pos.z-start.z)>.18||Math.hypot(a.vel.x,a.vel.z)>.65)return false;
  state.phase='hop';state.seconds=0;
 }
 state.seconds+=dt;
 if(state.seconds>2){brain._nativeTowerBoarding=null;brain.repath=0;return false;}
 it.fire=it.squid=it.jump=it.sub=it.special=false;it.move.set(0,0,0);brain.noProg=0;
 // Enemy ink changes the real jump height. Repaint the actual supported
 // launch floor through the installed weapon before requesting the arc.
 if(a.grounded&&a.groundTeam===2){
  state.seconds=0;
  const direction=start.clone().sub(end).setY(0).normalize(),point=a.pos.clone().addScaledVector(direction,.5),down=new THREE.Vector3(0,-1,0);
  const hit=G.physics.raycast(point.clone().setY(a.pos.y+.2),down,.5);
  if(!hit.hit||hit.face<0){brain._nativeTowerBoarding=null;brain.repath=0;return false;}
  const aim=hit.point.clone().sub(a.pos).add(new THREE.Vector3(0,-1.05,0));a.aimYaw=brain.aimYaw=Math.atan2(aim.x,aim.z);a.aimPitch=brain.aimPitch=Math.atan2(aim.y,Math.hypot(aim.x,aim.z));a.aimPoint.copy(hit.point);
  it.fire=a.ink>15&&!a.weaponRunner?.s3ShooterCancelMain;return true;
 }
 it.move.copy(end).sub(a.pos).setY(0);if(it.move.length()<.1)it.move.set(0,0,0);else it.move.normalize();
 it.jump=p.jumping&&state.seconds<1.1;brain.mode='ranked';
 return true;
}

/** Static waypoint steering cannot own an actually supported moving rider. */
export function nativeTowerRider(G,actor){
 const match=G.match,w=match?.rankedWorld;
 return !!(G.level?.native&&match?.mode==='tower'&&match.ranked?.stage?.tower?.boarding?.approaches?.length&&w?.towerBlockId>=0&&actor?.grounded&&actor.ground?.hit&&actor.ground.block===w.towerBlockId);
}
