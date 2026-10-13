import * as THREE from 'three';
import { PLAYER } from '../../../src/config.js';
const terrainRadius=squid=>{const raw=squid?PLAYER.s3SwimTerrainRadiusRaw:PLAYER.s3HumanoidTerrainRadiusRaw;return Number.isFinite(raw)&&Number.isFinite(PLAYER.s3TerrainDistanceScale)?raw*PLAYER.s3TerrainDistanceScale:PLAYER.radius;};

/** Opt-in display-derived wall transitions. No collision or paint is changed.
 * Every rise needs an uninterrupted paintable wall, capsule corridor, supported
 * approach and supported landing. Ownership is checked by the live controller. */
export function nativeClimbTransition(graph,lower,upper){
 const {level,physics}=graph;if(!level.manifest.sourceNavigation?.wallClimb)return null;
 const rise=upper.y-lower.y,dx=upper.x-lower.x,dz=upper.z-lower.z,length=Math.hypot(dx,dz);
 if(lower.y<=PLAYER.fallDeathY||upper.y<=PLAYER.fallDeathY||rise<=1.25||length<.1||length>graph.step*1.01)return null;
 const direction=new THREE.Vector3(dx/length,0,dz/length),origin=new THREE.Vector3(lower.x,lower.y+.3,lower.z);
 const first=physics.raycast(origin,direction,length+.25);
 if(!first.hit||first.face<0||Math.abs(first.normal.y)>.15||first.normal.dot(direction)>-.9)return null;
 const humanRadius=terrainRadius(false),swimRadius=terrainRadius(true),normal=first.normal.clone(),wall=first.point.clone(),spine=wall.clone().addScaledVector(normal,swimRadius+.002),samples=[];
 const heights=[];for(let y=lower.y+.3;y<upper.y-.05;y+=.15)heights.push(y);heights.push(upper.y-.015);
 for(const y of heights){
  origin.set(spine.x,y,spine.z);const hit=physics.raycast(origin,direction,PLAYER.radius+.45);
  if(!hit.hit||hit.face<0||Math.abs(hit.normal.y)>.15||hit.normal.dot(normal)<.97)return null;
  const face=level.faces[hit.face];if(!face?.wall||!level.containsOnFace(face,hit.point))return null;
  const i=Math.max(0,Math.min(face.nu-1,Math.floor(hit.u/face.cu))),j=Math.max(0,Math.min(face.nv-1,Math.floor(hit.v/face.cv)));
  if(!level.mask[face.grid+j*face.nu+i])return null;
  samples.push({point:hit.point.toArray(),face:hit.face,u:hit.u,v:hit.v,capOnly:y>upper.y-.05});
 }
 if(samples.length<3)return null;
 for(const sample of samples){const extent=new THREE.Vector3(...sample.point).sub(wall).dot(normal);if(extent>0)spine.addScaledVector(normal,Math.max(0,extent+swimRadius+.002-spine.clone().sub(wall).dot(normal)));}
 // Attachment must reach every original wall plane with the live Actor ray.
 // A recessed display wall behind a protruding lower seam is not climbable
 // merely because a capsule fits alongside its bounding extent.
 if(samples.some(sample=>spine.clone().sub(new THREE.Vector3(...sample.point)).dot(normal)>PLAYER.radius+(sample.capOnly ? .45 : .35)-.001))return null;
 // Paint the whole rise from a supported human firing stance inside the normal
 // bot pitch range. This also prevents paths that require shooting through a
 // ceiling or hovering beside a wall to acquire its upper ink.
 const distance=Math.max(1.1,(rise-.65)/Math.tan(.9)),stance=wall.clone().addScaledVector(normal,distance).setY(lower.y),down=new THREE.Vector3(0,-1,0);
 for(let t=0;t<=1;t+=.2){origin.set(lower.x+(stance.x-lower.x)*t,lower.y+.35,lower.z+(stance.z-lower.z)*t);const ground=physics.raycast(origin,down,.7);if(!ground.hit||ground.normal.y<.68||Math.abs(ground.point.y-lower.y)>.16)return null;origin.y=lower.y+.01;if(!physics.bodyFits(origin,humanRadius,PLAYER.stepUp,PLAYER.height,false,.015))return null;}
 for(const sample of samples){origin.copy(stance).setY(stance.y+1.05);const target=new THREE.Vector3(...sample.point),delta=target.sub(origin),length=delta.length();if(physics.raycast(origin,delta.multiplyScalar(1/length),length-.025).hit)return null;}
 // Human painting stance and entire vertical corridor also reject low ceilings.
 for(let y=lower.y;y<=upper.y+.4;y+=.25){origin.set(spine.x,y,spine.z);if(!physics.bodyFits(origin,swimRadius,PLAYER.squidBodyLift,PLAYER.squidHeight,true,.015))return null;}
 for(let t=0;t<=1;t+=.2){origin.set(spine.x+(upper.x-spine.x)*t,upper.y+.45,spine.z+(upper.z-spine.z)*t);if(!physics.bodyFits(origin,swimRadius,PLAYER.squidBodyLift,PLAYER.squidHeight,true,.015))return null;}
 return {to:upper.id,type:'climb',cost:length+rise*1.8+distance*2+4,climb:{lower:[lower.x,lower.y,lower.z],upper:[upper.x,upper.y,upper.z],normal:normal.toArray(),spine:[spine.x,lower.y,spine.z],paintStance:stance.toArray(),samples,assurance:'Inferred source paintable wall, supported firing stance and live capsule corridor; retail navigation unverified'}};
}

/** Travel routes are sampled for the human body. Keep ordinary squid input only
 * where the live, wider swim capsule also clears the next source support. */
export function nativeClimbTravelForm(brain,G){
 if(!G.level?.manifest?.sourceNavigation?.wallClimb||!brain.a.intent.squid||brain.a.climbing)return;
 const a=brain.a,N=G.nav,from=N.nodes[brain.path?.[Math.max(0,brain.pi-1)]],to=N.nodes[brain.path?.[brain.pi]];
 if(!to)return;
 const edge=from?.nb.find(e=>e.to===to.id),p=a.pos.clone(),radius=terrainRadius(true);
 const clear=point=>G.physics.bodyFits(point,radius,PLAYER.squidBodyLift,PLAYER.squidHeight,true,.015);
 p.set(to.x,to.y+.01,to.z);
 if(edge?.type!=='walk'||!clear(a.pos)||!clear(p))a.intent.squid=false;
}

/** Existing BotBrain selects paths; this owns ordinary input for their current
 * climb edge only. Painting goes through the actor weapon/projectile pipeline,
 * and the Actor alone decides attachment, enemy-ink release and ledge pop. */
export function updateNativeClimb(brain,G,dt){
 const a=brain.a,N=G.nav;if(!G.level?.manifest?.sourceNavigation?.wallClimb||!brain.path||!a.alive||a.s3?.squidSpawn||a.superJumpState||a.specialActive)return false;
 let index=brain.pi;
 if(index===0&&brain.path.length>1&&a.pos.distanceTo(new THREE.Vector3(...[N.nodes[brain.path[0]].x,N.nodes[brain.path[0]].y,N.nodes[brain.path[0]].z]))<.8)index=1;
 const from=N.nodes[brain.path[Math.max(0,index-1)]],to=N.nodes[brain.path[index]],edge=from?.nb.find(e=>e.to===to?.id&&e.type==='climb');
 if(!edge){brain._nativeClimb=null;return false;}
 const c=edge.climb,upper=new THREE.Vector3(...c.upper),lower=new THREE.Vector3(...c.lower),normal=new THREE.Vector3(...c.normal),spine=new THREE.Vector3(...c.spine);
 if(Math.hypot(a.pos.x-upper.x,a.pos.z-upper.z)<.65&&Math.abs(a.pos.y-upper.y)<.16&&a.grounded){brain.pi=index+1;brain._nativeClimb=null;brain.noProg=0;return false;}
 if(Math.hypot(a.pos.x-lower.x,a.pos.z-lower.z)>Math.hypot(...[c.paintStance[0]-lower.x,c.paintStance[2]-lower.z])+2.5&&!a.climbing)return false;
 brain.pi=index;
 const state=brain._nativeClimb?.edge===edge&&brain._nativeClimb.path===brain.path?brain._nativeClimb:(brain._nativeClimb={edge,path:brain.path,seconds:0,lastY:a.pos.y,stalled:0});state.seconds+=dt;
 if(a.pos.y>state.lastY+.12){state.lastY=a.pos.y;state.stalled=0;}else state.stalled+=dt;
 const it=a.intent;it.fire=it.squid=it.jump=it.sub=it.special=false;it.move.set(0,0,0);brain.noProg=0;
 if(state.stalled>12||state.seconds>30){brain.path=null;brain.repath=0;brain.goalTimer=0;brain._nativeClimb=null;it.move.copy(normal);return true;}
 let missing=c.samples.find(s=>s.point[1]>=a.pos.y+.15&&G.paint.sample(s.face,s.u,s.v)!==a.team+1);
 // Sample the exact live attachment and cap probes too. Weapon blot edges can
 // own every coarse route sample while leaving a gap at the Actor's ink line.
 // Pop out through ordinary input to repaint that contact, then reattach.
 if(!missing)for(const lift of [.3,.85]){
  const hit=G.physics.raycast(a.pos.clone().add(new THREE.Vector3(0,lift,0)),normal.clone().negate(),PLAYER.radius+.45);
  if(hit.hit&&hit.face>=0&&Math.abs(hit.normal.y)<.15&&hit.point.y<=upper.y+.05&&G.paint.sample(hit.face,hit.u,hit.v)!==a.team+1){missing={point:hit.point.toArray(),face:hit.face,u:hit.u,v:hit.v};break;}
 }
 if(missing){
  // Use a normal firing stance on the source lower support; replenish through
  // ordinary squid input when necessary, without mutating ink or ownership.
  const delta=new THREE.Vector3(...c.paintStance).sub(a.pos);delta.y=0;if(delta.length()>.2)it.move.copy(delta).normalize();
  const point=new THREE.Vector3(...missing.point),aim=point.clone().sub(a.pos).add(new THREE.Vector3(0,-1.1,0));
  const yaw=Math.atan2(aim.x,aim.z),pitch=Math.max(-1.1,Math.min(1,Math.atan2(aim.y,Math.hypot(aim.x,aim.z))));
  const turn=(target,current)=>{let d=target-current;while(d>Math.PI)d-=Math.PI*2;while(d< -Math.PI)d+=Math.PI*2;return current+Math.max(-6*dt,Math.min(6*dt,d));};
  brain.aimYaw=turn(yaw,brain.aimYaw);brain.aimPitch=turn(pitch,brain.aimPitch);a.aimYaw=brain.aimYaw;a.aimPitch=brain.aimPitch;
  const cp=Math.cos(a.aimPitch);a.aimPoint.copy(a.pos).add(new THREE.Vector3(Math.sin(a.aimYaw)*cp*6,1.1+Math.sin(a.aimPitch)*6,Math.cos(a.aimYaw)*cp*6));
  it.fire=a.ink>PLAYER.inkMax*.15;it.squid=!it.fire;state.phase=it.fire?'paint':'refill';
 }else{
  // The painted route is a source wall line, not the whole facade. Keep
  // ordinary sideways swim input aimed at that line after attachment too.
  const side=spine.clone().sub(a.pos).setY(0);side.addScaledVector(normal,-side.dot(normal));
  it.squid=true;it.move.copy(normal).negate().addScaledVector(side,3).normalize();
  if(!a.climbing&&(a.pos.y>=upper.y-.3||(a.climbExit>0&&a.pos.y>lower.y+.5)))it.move.copy(upper).sub(a.pos).setY(0).normalize();
  else if(!a.climbing&&a.pos.y<upper.y-.3){const delta=spine.clone().sub(a.pos).setY(0);if(delta.length()>.15)it.move.copy(delta).normalize();}
  state.phase='swim';
 }
 return true;
}
