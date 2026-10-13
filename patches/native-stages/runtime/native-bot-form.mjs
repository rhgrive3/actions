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
 const from=N?.nodes[brain.path?.[Math.max(0,brain.pi-1)]],node=N?.nodes[brain.path?.[brain.pi]],edge=from?.nb.find(e=>e.to===node?.id);
 if(!node||edge?.type!=='walk'||edge.climb||edge.drop||Math.abs(node.y-a.pos.y)>.5||Math.hypot(node.x-a.pos.x,node.z-a.pos.z)>Math.max(.25,N.step??1)*2.01)return false;
 let screen=screens.get(L);
 if(!screen){screen={clearance:nativeDropClearance(L),origin:new THREE.Vector3(),down:new THREE.Vector3(0,-1,0),hit:new Hit(),ground:new GroundHit(),previous:new THREE.Vector3(),point:new THREE.Vector3(),goal:new THREE.Vector3()};screens.set(L,screen);}
 const hit=G.physics.raycast(screen.origin.set(node.x,node.y+.1,node.z),screen.down,.3,screen.hit);
 if(!hit.hit||hit.triangle<0||hit.normal.y<=.68||Math.abs(hit.point.y-node.y)>=.16||hit.block<0||hit.block>=L.staticBlockCount)return false;
 const goal=screen.goal.copy(hit.point),distance=Math.hypot(goal.x-a.pos.x,goal.z-a.pos.z),count=Math.max(1,Math.ceil(distance/.1));
 const walk=squid=>{
  const r=radius(squid),lift=squid?PLAYER.squidBodyLift:PLAYER.stepUp,height=squid?PLAYER.squidHeight:PLAYER.height,previous=screen.previous.copy(a.pos),point=screen.point,ground=screen.ground;
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
 if(walk(true)!==false||walk(false)!==true)return false;
 it.squid=false;
 return true;
}
