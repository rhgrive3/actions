import {PLAYER} from '../../../src/config.js';
import {nativeDropClearance} from './native-drop.mjs';
import {nativeSourceFootSupported} from './native-bot-support.mjs';

function liveSourceFloor(L,hit){
 if(!hit||!(hit.flags&2))return false;
 const face=L.faces[L.data.triangleFace[hit.triangle]];if(!face?.turf||!L.containsOnFace(face,hit.point))return false;
 const local=hit.point.clone().sub(face.origin),u=local.dot(face.u),v=local.dot(face.v),i=Math.max(0,Math.min(face.nu-1,Math.floor(u/face.cu))),j=Math.max(0,Math.min(face.nv-1,Math.floor(v/face.cv)));
 return !!L.mask[face.grid+j*face.nu+i];
}

/** A bot can walk around an occluding source wall. This is an objective-route
 * policy; source rays, pickup checks and throw/projectile collision stay owned
 * by RankedWorld. Opted physical transitions have only been qualified with the
 * ordinary zero-AP Shooter, so other weapon states retain direct-LOS policy. */
export function nativeRankedBotGoalReachable(G,row,target){
 const N=G.nav,L=G.level;if(!L?.native||!N||!Array.isArray(target)||target.length<3)return false;
 const a=G.actors.find(a=>String(a.nid??`${a.team??0}:${a.slot??0}`)===String(row.id));
 if(!a?.alive||a.team!==row.team||!a.bot||a.weaponId!=='shooter'||a.specialActive||a.superJumpState||a.s3?.squidSpawn||Object.values(a.s3?.abilityPoints||{}).some(n=>n>0))return false;
 const start=N.nearest(a.pos,.6);if(start<0||!nativeSourceFootSupported(G,a,N.nodes[start])||Math.hypot(N.nodes[start].x-a.pos.x,N.nodes[start].z-a.pos.z)>.85)return false;
 const point=a.pos.clone().fromArray(target),goal=N.nearest(point,.6),n=N.nodes[goal];
 if(!n?.nativePaintable||!N.valid[goal]||n.zone===1-a.team||Math.hypot(n.x-point.x,n.z-point.z)>.85)return false;
 const down=point.clone().set(0,-1,0),support=L.triangleWorld.ray(point.clone().setY(point.y+.25),down,2,{minNormalY:.68});
 if(!liveSourceFloor(L,support)||Math.abs(support.point.y-n.y)>PLAYER.stepUp||point.y-support.point.y>1.75)return false;
 const goalFeet=support.point,startFeet=point.clone().set(n.x,n.y,n.z),sweep=G.physics._nativeGoalClearance||(G.physics._nativeGoalClearance=nativeDropClearance(L));
 if(!sweep.clear(startFeet,goalFeet,PLAYER.s3HumanoidTerrainRadiusRaw*PLAYER.s3TerrainDistanceScale,PLAYER.stepUp,PLAYER.height))return false;
 for(let i=0,count=Math.max(1,Math.ceil(startFeet.distanceTo(goalFeet)/.1));i<=count;i++){
  const p=startFeet.clone().lerp(goalFeet,i/count),h=L.triangleWorld.ray(p.clone().setY(p.y+.25),down,.5,{minNormalY:.68});
  if(!liveSourceFloor(L,h)||Math.abs(h.point.y-p.y)>.16)return false;
 }
 const cached=a.bot._nativeRankedGoalRoutes;
 const cache=cached?.nav===N&&cached.start===start&&cached.team===a.team?cached:{nav:N,start,team:a.team,results:new Map()};a.bot._nativeRankedGoalRoutes=cache;
 if(cache.results.has(goal))return cache.results.get(goal);
 const path=N.path(start,goal,a.team,Math.max(6000,N.nodes.length*4));
 const eligible=!!path&&path.every((id,i)=>N.valid[id]&&(i===0||N.nodes[path[i-1]].nb.some(edge=>edge.to===id)));
 cache.results.set(goal,eligible);return eligible;
}
