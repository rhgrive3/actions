import * as THREE from 'three';
import {PLAYER} from '../../../src/config.js';
import {Hit} from '../../../src/game/physics.js';
import {stepGroundVelocity} from '../../splatoon3/runtime/movement-physics.mjs';
import {weightSpeedCurve} from '../../splatoon3/runtime/weapon-weight.mjs';

const terrainRadius=squid=>{
 const raw=squid?PLAYER.s3SwimTerrainRadiusRaw:PLAYER.s3HumanoidTerrainRadiusRaw;
 return Number.isFinite(raw)&&Number.isFinite(PLAYER.s3TerrainDistanceScale)?raw*PLAYER.s3TerrainDistanceScale:PLAYER.radius;
};

/** A translated vertical capsule sweeps a parallelogram dilated by its radius.
 * Compare that exact axis surface against source triangles, including edge/face
 * crossings; endpoint fits or an elevated centre ray are insufficient. */
export function nativeDropClearance(level){
 const w=level.triangleWorld,q=Array.from({length:4},()=>new THREE.Vector3()),t0=new THREE.Triangle(),t1=new THREE.Triangle(),box=new THREE.Box3();
 const metrics={queries:0,triangleTests:0,distanceTests:0};
 const clear=(from,to,radius,lift,height,skipGrates=false)=>{
  const low=lift+radius,high=Math.max(low,height-radius);
  q[0].copy(from).setY(from.y+low);q[1].copy(from).setY(from.y+high);
  q[2].copy(to).setY(to.y+low);q[3].copy(to).setY(to.y+high);
  box.min.copy(q[0]).min(q[1]).min(q[2]).min(q[3]).addScalar(-radius);
  box.max.copy(q[0]).max(q[1]).max(q[2]).max(q[3]).addScalar(radius);
  const vertical=Math.hypot(to.x-from.x,to.z-from.z)<1e-10,segment=vertical||high-low<1e-10;
  if(vertical){q[0].setY(Math.min(from.y,to.y)+low);q[3].setY(Math.max(from.y,to.y)+high);}
  else if(segment)q[3].copy(q[2]);
  else {t0.set(q[0],q[1],q[2]);t1.set(q[1],q[3],q[2]);}
  let fits=true;metrics.queries++;
  w.queryBox(box.min,box.max,id=>{
   if(!fits||skipGrates&&(w.flags[id]&4))return;
   const offset=id*9,vertices=w.triangles;
   for(let axis=0;axis<3;axis++){
    const v0=vertices[offset+axis],v1=vertices[offset+3+axis],v2=vertices[offset+6+axis];
    if(Math.max(v0,v1,v2)<box.min.getComponent(axis)||Math.min(v0,v1,v2)>box.max.getComponent(axis))return;
   }
   const tri=w.triangle(id);metrics.triangleTests++;if(!box.intersectsTriangle(tri))return;
   let distance;
   if(segment)distance=w._capsuleDistance(q[0],q[3],tri);
   else{
    distance=Infinity;
    for(const [a,b]of [[tri.a,tri.b],[tri.b,tri.c],[tri.c,tri.a]])distance=Math.min(distance,w._capsuleDistance(a,b,t0),w._capsuleDistance(a,b,t1));
    for(const [a,b]of [[q[0],q[1]],[q[1],q[3]],[q[3],q[2]],[q[2],q[0]]])distance=Math.min(distance,w._capsuleDistance(a,b,tri));
   }
   metrics.distanceTests++;if(distance<radius-.003)fits=false;
  });
  return fits;
 };
 return {clear,metrics};
}

/** Conservatively screen an ordinary no-shot, zero-AP Shooter walk-off.
 * Ground probes and acceleration use existing controller owners. Gravity is
 * integrated after real support ends; no suspended horizontal dogleg is used.
 * The edge requires human form. The wider swim shape is screened separately;
 * a source railing may admit a genuine human departure while blocking swim. */
export function nativeDropTransition(graph,upper,lower){
 const L=graph.level,P=graph.physics;if(!L.manifest.sourceNavigation?.highDrops)return null;
 const dx=lower.x-upper.x,dz=lower.z-upper.z,length=Math.hypot(dx,dz),fall=upper.y-lower.y;
 if(fall<=1.25||lower.y<=PLAYER.fallDeathY+.5||length<.1||length>graph.step*1.01||!lower.nativePaintable)return null;
 const key=upper.id+':'+Math.sign(dx)+':'+Math.sign(dz),cache=graph._nativeDropCache||(graph._nativeDropCache=new Map());
 if(cache.has(key))return cache.get(key);
 cache.set(key,null);
 // A lower layer beneath the interior of an upper floor is not a departure.
 // Ordinary walking edges already carry the actor toward that floor's real
 // boundary. Screen only its supported edge instead of simulating every roof
 // point over a distant lower layer for several seconds.
 const edgeGround=new Hit();
 P.groundProbe(lower.x,upper.y,lower.z,PLAYER.stepUp,PLAYER.stepDown,PLAYER.footRadius,edgeGround,false);
 if(edgeGround.hit&&Math.abs(edgeGround.y-upper.y)<=.5)return null;
 const sweep=graph._nativeDropClearance||(graph._nativeDropClearance=nativeDropClearance(L)),direction=new THREE.Vector3(dx/length,0,dz/length),pos=new THREE.Vector3(upper.x,upper.y,upper.z),previous=pos.clone(),velocity=new THREE.Vector3(),normal=new THREE.Vector3(0,1,0),hit=new Hit();
 const human=terrainRadius(false),squid=terrainRadius(true),step=1/60,groundSpeed=weightSpeedCurve('shooter','run')[0]*60;
 if(!P.bodyFits(pos,human,PLAYER.stepUp,PLAYER.height,false,.003))return null;
 let squidClearance=P.bodyFits(pos,squid,PLAYER.squidBodyLift,PLAYER.squidHeight,true,.003);
 let grounded=true,dropped=false,landed=null,time=0;
 for(let frame=0;frame<180;frame++){
  previous.copy(pos);const wasGrounded=grounded;
  if(grounded)stepGroundVelocity(velocity,direction.x,direction.z,groundSpeed,PLAYER.s3GroundAccel??36,step);
  else stepGroundVelocity(velocity,direction.x,direction.z,Math.max(PLAYER.runSpeed,PLAYER.airMinSpeed),PLAYER.airAccel,step);
  if(wasGrounded)velocity.y=-(velocity.x*normal.x+velocity.z*normal.z)/Math.max(.35,normal.y);
  else{let gravity=PLAYER.gravity;if(velocity.y<0)gravity*=PLAYER.fallGravityMul;if(Math.abs(velocity.y)<PLAYER.apexBand)gravity*=PLAYER.apexGravityMul;velocity.y=Math.max(-PLAYER.maxFall,velocity.y-gravity*step);}
  pos.addScaledVector(velocity,step);time+=step;
  const up=wasGrounded?PLAYER.stepUp:Math.max(previous.y,pos.y)-pos.y+PLAYER.ledgeAssist,down=wasGrounded?PLAYER.stepDown:.02;
  P.groundProbe(pos.x,pos.y,pos.z,up,down,PLAYER.footRadius,hit,false);
  grounded=!!hit.hit&&(wasGrounded||velocity.y<=.5&&hit.y>=pos.y-.02);
  if(grounded){pos.y=hit.y;normal.copy(hit.normal);velocity.y=0;}
  if(pos.y<upper.y-.6)dropped=true;
  if(pos.y<=PLAYER.fallDeathY+.5||!sweep.clear(previous,pos,human,PLAYER.stepUp,PLAYER.height))return null;
  if(squidClearance&&!sweep.clear(previous,pos,squid,PLAYER.squidBodyLift,PLAYER.squidHeight,true))squidClearance=false;
  if(dropped&&grounded){
   const source=L.triangleWorld.ray(pos.clone().setY(pos.y+.1),new THREE.Vector3(0,-1,0),.3,{minNormalY:.68});
   if(source&&Math.abs(source.point.y-pos.y)<.12)landed={point:pos.clone(),face:L.data.triangleFace[source.triangle],triangle:source.triangle};
   break;
  }
 }
 if(!landed||landed.face<0)return null;
 const face=L.faces[landed.face],rel=landed.point.clone().sub(face.origin),u=rel.dot(face.u),v=rel.dot(face.v),iu=Math.min(face.nu-1,Math.max(0,Math.floor(u/face.cu))),iv=Math.min(face.nv-1,Math.max(0,Math.floor(v/face.cv)));
 if(!face.turf||!L.mask[face.grid+iv*face.nu+iu])return null;
 let target=null,score=Infinity;
 for(const n of graph.nodes){if(!n.nativePaintable||Math.abs(n.y-landed.point.y)>.3)continue;const d=Math.hypot(n.x-landed.point.x,n.z-landed.point.z);if(d<=graph.step*.85&&d<score){target=n;score=d;}}
 if(!target||target.id===upper.id)return null;
 const end=new THREE.Vector3(target.x,target.y,target.z);
 for(let i=0,count=Math.max(1,Math.ceil(score/.1));i<=count;i++){
  const point=landed.point.clone().lerp(end,i/count),h=L.triangleWorld.ray(point.clone().setY(point.y+.2),new THREE.Vector3(0,-1,0),.4,{minNormalY:.68});
  if(!h||!(h.flags&2)||Math.abs(h.point.y-point.y)>.15)return null;
 }
 if(!P.bodyFits(end,human,PLAYER.stepUp,PLAYER.height,false,.003)||!sweep.clear(landed.point,end,human,PLAYER.stepUp,PLAYER.height))return null;
 squidClearance&&=P.bodyFits(end,squid,PLAYER.squidBodyLift,PLAYER.squidHeight,true,.003)&&sweep.clear(landed.point,end,squid,PLAYER.squidBodyLift,PLAYER.squidHeight,true);
 const edge={to:target.id,type:'drop',cost:Math.hypot(end.x-upper.x,end.z-upper.z)+time+1,drop:{upper:[upper.x,upper.y,upper.z],landing:end.toArray(),direction:direction.toArray(),seconds:time,sourceTriangle:landed.triangle,form:'kid',squidClearance,assurance:'Local 0AP Shooter human walk/gravity screening with continuous exact source capsule sweeps; swim-shape result recorded separately and retail navigation unverified'}};
 cache.set(key,edge);return edge;
}

/** Execute the screened departure with the existing ordinary human input. */
export function nativeDropTravelForm(brain,G){
 if(!G.level?.manifest?.sourceNavigation?.highDrops)return;
 const N=G.nav,from=N.nodes[brain.path?.[Math.max(0,brain.pi-1)]],to=N.nodes[brain.path?.[brain.pi]];
 if(from?.nb.some(e=>e.to===to?.id&&e.drop)){
  const input=brain.a.intent;input.squid=input.fire=input.jump=input.sub=input.special=false;
 }
}

/** Keep an ordinary departure committed until a real grounded touchdown.
 * The stock follower may advance its waypoint while still 1.8 units above it,
 * turning toward the next source support before gravity completes the drop. */
export function updateNativeDrop(brain,G,dt){
 const a=brain.a,N=G.nav;if(!G.level?.manifest?.sourceNavigation?.highDrops||!brain.path||!a.alive||a.s3?.squidSpawn||a.superJumpState||a.specialActive)return false;
 let index=brain.pi;
 if(index===0&&brain.path.length>1){const first=N.nodes[brain.path[0]];if(Math.hypot(a.pos.x-first.x,a.pos.z-first.z)<.8&&Math.abs(a.pos.y-first.y)<.3)index=1;}
 const from=N.nodes[brain.path[Math.max(0,index-1)]],to=N.nodes[brain.path[index]],edge=from?.nb.find(e=>e.to===to?.id&&e.drop);
 if(!edge){brain._nativeDrop=null;return false;}
 const d=edge.drop,start=new a.pos.constructor(...d.upper),goal=new a.pos.constructor(...d.landing);
 const state=brain._nativeDrop?.edge===edge&&brain._nativeDrop.path===brain.path?brain._nativeDrop:(brain._nativeDrop={edge,path:brain.path,phase:'approach',seconds:0});state.seconds+=dt;
 if(state.seconds>8){brain._nativeDrop=null;brain.path=null;brain.repath=brain.goalTimer=0;return false;}
 brain.pi=index;brain.noProg=0;
 const input=a.intent;input.fire=input.squid=input.jump=input.sub=input.special=false;
 if(state.phase==='approach'){
  const delta=start.sub(a.pos).setY(0);
  if(a.grounded&&delta.length()<.12&&Math.abs(a.pos.y-d.upper[1])<.16)state.phase='depart';
  else {input.move.copy(delta);if(input.move.length()>1)input.move.normalize();return true;}
 }
 if(a.grounded&&Math.abs(a.pos.y-goal.y)<.16){
  const delta=goal.sub(a.pos).setY(0);
  if(delta.length()<.35){brain.pi=index+1;brain._nativeDrop=null;return false;}
  input.move.copy(delta);if(input.move.length()>1)input.move.normalize();return true;
 }
 input.move.fromArray(d.direction);return true;
}
