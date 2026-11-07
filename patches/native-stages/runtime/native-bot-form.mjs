import * as THREE from 'three';
import {PLAYER} from '../../../src/config.js';
import {Hit,GroundHit} from '../../../src/game/physics.js';
import {nativeDropClearance} from './native-drop.mjs';
import {nativeTowerRider} from './native-ranked-boarding.mjs';

const screens=new WeakMap();
const radius=squid=>{
 const raw=squid?PLAYER.s3SwimTerrainRadiusRaw:PLAYER.s3HumanoidTerrainRadiusRaw;
 return Number.isFinite(raw)&&Number.isFinite(PLAYER.s3TerrainDistanceScale)?raw*PLAYER.s3TerrainDistanceScale:PLAYER.radius;
};

/** A source walk can fit the human capsule while its wider swim shape meets
 * a real floor contour. Select ordinary human input only after continuously
 * screening that actual grounded position to the current source waypoint.
 * Actor acceleration, support snapping and collision remain authoritative. */
export function nativeSourceGroundedForm(brain,G){
 const L=G.level,a=brain.a,it=a?.intent,N=G.nav;
 if(!L?.native||!a?.alive||!a.grounded||a.climbing||a.specialActive||a.superJumpState||a.s3?.squidSpawn||brain.target||!it?.squid||it.jump||it.sub||it.special||it.throw||!it.move?.lengthSq()||nativeTowerRider(G,a)||brain._nativeTowerBoarding)return false;
 if(!a.ground?.hit||a.ground.block<0||a.ground.block>=L.staticBlockCount||a.ground.normal.y<=.68)return false;
 const from=N?.nodes[brain.path?.[Math.max(0,brain.pi-1)]],node=N?.nodes[brain.path?.[brain.pi]],nb=from?.nb;
 let edge;if(nb&&node)for(let i=0;i<nb.length;i++)if(nb[i].to===node.id){edge=nb[i];break;}
 if(!node||edge?.type!=='walk'||edge.climb||edge.drop||Math.abs(node.y-a.pos.y)>.5||Math.hypot(node.x-a.pos.x,node.z-a.pos.z)>Math.max(.25,N.step??1)*2.01)return false;
 let screen=screens.get(L);
 if(!screen){screen={clearance:nativeDropClearance(L),origin:new THREE.Vector3(),down:new THREE.Vector3(0,-1,0),hit:new Hit(),ground:new GroundHit(),previous:new THREE.Vector3(),point:new THREE.Vector3(),goal:new THREE.Vector3(),nodeGoal:new THREE.Vector3()};screens.set(L,screen);}
 const canonicalStatic=L.blocks.length===L.staticBlockCount&&G.physics?.level===L&&
  G.physics.raycast===G.physics.constructor.prototype.raycast&&
  G.physics.groundProbe===G.physics.constructor.prototype.groundProbe&&
  L.triangleWorld?.hasCanonicalRay?.();
 const sqR=radius(true),kidR=radius(false);
 const memo=brain._groundedFormMemo;
 if(canonicalStatic&&memo&&memo.level===L&&memo.rev===L.collisionRevision&&memo.physics===G.physics&&
  Object.is(memo.nx,node.x)&&Object.is(memo.ny,node.y)&&Object.is(memo.nz,node.z)&&
  Object.is(memo.px,a.pos.x)&&Object.is(memo.py,a.pos.y)&&Object.is(memo.pz,a.pos.z)&&
  Object.is(memo.sqR,sqR)&&Object.is(memo.kidR,kidR)&&
  Object.is(memo.stepUp,PLAYER.stepUp)&&Object.is(memo.sqStepUp,PLAYER.squidStepUp)&&
  Object.is(memo.stepDown,PLAYER.stepDown)&&Object.is(memo.foot,PLAYER.footRadius)&&
  Object.is(memo.sqLift,PLAYER.squidBodyLift)&&Object.is(memo.sqH,PLAYER.squidHeight)&&Object.is(memo.h,PLAYER.height)){
  if(!memo.result)return false;
  it.squid=false;
  return true;
 }
 let goalOk=false;
 if(canonicalStatic&&screen.nodeRev===L.collisionRevision&&screen.nodePhysics===G.physics&&
  Object.is(screen.nx,node.x)&&Object.is(screen.ny,node.y)&&Object.is(screen.nz,node.z)){
  goalOk=screen.nodeOk;
  if(goalOk)screen.goal.copy(screen.nodeGoal);
 }else{
  const hit=G.physics.raycast(screen.origin.set(node.x,node.y+.1,node.z),screen.down,.3,screen.hit);
  goalOk=!!(hit.hit&&hit.triangle>=0&&hit.normal.y>.68&&Math.abs(hit.point.y-node.y)<.16&&hit.block>=0&&hit.block<L.staticBlockCount);
  if(goalOk)screen.goal.copy(hit.point);
  if(canonicalStatic){
   screen.nodeRev=L.collisionRevision;screen.nodePhysics=G.physics;
   screen.nx=node.x;screen.ny=node.y;screen.nz=node.z;screen.nodeOk=goalOk;
   if(goalOk)screen.nodeGoal.copy(hit.point);
  }
 }
 if(!goalOk)return false;
 const goal=screen.goal,distance=Math.hypot(goal.x-a.pos.x,goal.z-a.pos.z),count=Math.max(1,Math.ceil(distance/.1));
 const walk=squid=>{
  const r=squid?sqR:kidR,lift=squid?PLAYER.squidBodyLift:PLAYER.stepUp,height=squid?PLAYER.squidHeight:PLAYER.height,previous=screen.previous.copy(a.pos),point=screen.point,ground=screen.ground;
  for(let i=1;i<=count;i++){
   const t=i/count;point.set(a.pos.x+(goal.x-a.pos.x)*t,previous.y,a.pos.z+(goal.z-a.pos.z)*t);
   G.physics.groundProbe(point.x,point.y,point.z,squid?PLAYER.squidStepUp:PLAYER.stepUp,PLAYER.stepDown,PLAYER.footRadius,ground,squid);
   if(!ground.hit||ground.block<0||ground.block>=L.staticBlockCount||ground.normal.y<=.68)return null;
   point.y=ground.y;
   if(!screen.clearance.clear(previous,point,r,lift,height,squid))return false;
   previous.copy(point);
  }
  return true;
 };
 // Straight interpolation can float over the contour: the real controller
 // snaps to each installed foot support, which must be part of the sweep.
 const admitted=walk(true)===false&&walk(false)===true;
 if(canonicalStatic){
  const m=memo||(brain._groundedFormMemo={});
  m.level=L;m.rev=L.collisionRevision;m.physics=G.physics;
  m.nx=node.x;m.ny=node.y;m.nz=node.z;
  m.px=a.pos.x;m.py=a.pos.y;m.pz=a.pos.z;
  m.sqR=sqR;m.kidR=kidR;m.stepUp=PLAYER.stepUp;m.sqStepUp=PLAYER.squidStepUp;
  m.stepDown=PLAYER.stepDown;m.foot=PLAYER.footRadius;
  m.sqLift=PLAYER.squidBodyLift;m.sqH=PLAYER.squidHeight;m.h=PLAYER.height;
  m.result=admitted;
 }
 if(!admitted)return false;
 it.squid=false;
 return true;
}
