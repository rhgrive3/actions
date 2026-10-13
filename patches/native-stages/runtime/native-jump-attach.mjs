import * as THREE from 'three';
import {PLAYER} from '../../../src/config.js';
import {STEP} from '../../splatoon3/runtime/clock.mjs';
import {Hit,makeContacts} from '../../../src/game/physics.js';
import {stepGroundVelocity} from '../../splatoon3/runtime/movement-physics.mjs';
import {weightSpeedCurve} from '../../splatoon3/runtime/weapon-weight.mjs';
import {nativeDropClearance} from './native-drop.mjs';
import {nativeSourceFootSupported} from './native-bot-support.mjs';
const radius=squid=>{const raw=squid?PLAYER.s3SwimTerrainRadiusRaw:PLAYER.s3HumanoidTerrainRadiusRaw;return Number.isFinite(raw)&&Number.isFinite(PLAYER.s3TerrainDistanceScale)?raw*PLAYER.s3TerrainDistanceScale:PLAYER.radius;};
function paintableWall(L,h,normal){
 if(!h.hit||h.triangle<0||h.face<0||Math.abs(h.normal.y)>.15||h.normal.dot(normal)<.97)return false;
 const f=L.faces[h.face];if(!f?.wall||!L.containsOnFace(f,h.point))return false;
 const i=Math.max(0,Math.min(f.nu-1,Math.floor(h.u/f.cu))),j=Math.max(0,Math.min(f.nv-1,Math.floor(h.v/f.cv)));
 return !!L.mask[f.grid+j*f.nu+i];
}
function supported(P,L,p){
 const h=P.raycast(p.clone().setY(p.y+.1),new THREE.Vector3(0,-1,0),.3);
 return h.hit&&h.triangle>=0&&h.normal.y>.68&&Math.abs(h.point.y-p.y)<.15&&h.face>=0&&L.faces[h.face].turf&&L.containsOnFace(L.faces[h.face],h.point);
}
// Sample positive-height source intervals, including every original wall
// triangle boundary. A mathematical shared edge is not a finite NoPaint gap;
// a thin actual NoPaint strip still contributes an interval and rejects.
function wallHeights(L,wall,normal,tangent,lo,hi){
 const events=[lo,hi],box=new THREE.Box3(),p=new THREE.Vector3();
 for(const x of [-.025,.225])for(const side of [-.06,.06])for(const y of [lo,hi])box.expandByPoint(p.copy(wall).addScaledVector(normal,x).addScaledVector(tangent,side).setY(y));
 for(let y=lo+.05;y<hi;y+=.05)events.push(y);
 L.triangleWorld.queryBox(box.min,box.max,id=>{
  if(Math.abs(L.triangleWorld.normals[id*3+1])>.15)return;
  const tri=L.triangleWorld.triangle(id),vertices=[tri.a,tri.b,tri.c],side=vertices.map(v=>p.copy(v).sub(wall).dot(tangent));
  if(Math.min(...side)>.06||Math.max(...side)<-.06)return;
  for(const v of vertices)if(v.y>lo&&v.y<hi)events.push(v.y);
  for(const cut of [-.05,0,.05])for(let i=0;i<3;i++){const j=(i+1)%3,delta=side[j]-side[i];if(Math.abs(delta)<1e-12)continue;const t=(cut-side[i])/delta;if(t<0||t>1)continue;const y=vertices[i].y+(vertices[j].y-vertices[i].y)*t;if(y>lo&&y<hi)events.push(y);}
 });
 events.sort((a,b)=>a-b);const distinct=events.filter((y,i)=>!i||y-events[i-1]>1e-9),heights=[];for(let i=1;i<distinct.length;i++)if(distinct[i]-distinct[i-1]>1e-9)heights.push((distinct[i]+distinct[i-1])*.5);return heights;
}

/** Conservative ordinary-input forecast; source collision resolution remains
 * active and every translated capsule segment is checked against original
 * triangles. No charged movement, unpaintable wall or suspended departure. */
function jumpFlight(graph,start,normal,upper,sweep){
 const {physics:P,level:L}=graph,dt=STEP,dir=normal.clone().negate(),pos=start.clone(),velocity=new THREE.Vector3(),previous=pos.clone(),contacts=makeContacts(),hit=new Hit();
 let grounded=true,climbing=false,climbV=0,exit=0,attached=false;
 for(let frame=0;frame<Math.ceil(6/STEP);frame++){
  const squid=frame>0,wasGrounded=grounded;exit=Math.max(0,exit-dt);previous.copy(pos);
  if(squid&&exit<=0){
   const h=P.raycast(pos.clone().setY(pos.y+.3),dir,PLAYER.radius+.35),inked=paintableWall(L,h,normal);
   if(h.hit&&!inked)return null;
   if(climbing&&!h.hit){
    const topHit=P.raycast(pos.clone().addScaledVector(dir,PLAYER.radius+.32).setY(pos.y+1.4),new THREE.Vector3(0,-1,0),2,new Hit(),true),top=topHit.hit&&topHit.normal.y>.68?topHit.point.y:pos.y+.3;
    velocity.y=Math.max(Math.sqrt(2*PLAYER.gravity*PLAYER.apexGravityMul*Math.max(.25,top+PLAYER.ledgePopClear-pos.y)),Math.min(climbV,6.5));velocity.x=dir.x*PLAYER.ledgePopCarry;velocity.z=dir.z*PLAYER.ledgePopCarry;climbing=false;exit=.3;
   }else if(inked){
    if(!climbing){climbing=true;attached=true;climbV=Math.max(0,velocity.y);}
    const cap=P.raycast(pos.clone().setY(pos.y+.85),dir,PLAYER.radius+.45);
    if(cap.hit&&Math.abs(cap.normal.y)<.5&&!paintableWall(L,cap,normal))return null;
    const want=cap.hit?PLAYER.climbSpeed:Math.min(PLAYER.climbSpeed,Math.sqrt(2*PLAYER.gravity*PLAYER.apexGravityMul*(PLAYER.ledgePopClear+.3))),accel=PLAYER.climbAccel*dt*(want>climbV?1:1.6);
    climbV=climbV<want?Math.min(want,climbV+accel):Math.max(want,climbV-accel);velocity.y=climbV;velocity.x=dir.x*1.2;velocity.z=dir.z*1.2;
   }
  }
  if(!climbing){
   const speed=squid?Math.max(PLAYER.squidDrySpeed,Math.hypot(velocity.x,velocity.z)):Math.max(weightSpeedCurve('shooter','run')[0]*60,PLAYER.airMinSpeed);
   stepGroundVelocity(velocity,dir.x,dir.z,speed,squid?PLAYER.squidAirAccel:PLAYER.airAccel,dt);
   if(frame===0){velocity.y=PLAYER.jumpVel;grounded=false;}
   if(wasGrounded&&frame>0)velocity.y=0;else{let gravity=PLAYER.gravity;if(velocity.y<0)gravity*=PLAYER.fallGravityMul;if(Math.abs(velocity.y)<PLAYER.apexBand)gravity*=PLAYER.apexGravityMul;velocity.y=Math.max(-PLAYER.maxFall,velocity.y-gravity*dt);}
  }
  const r=radius(squid),lift=squid?PLAYER.squidBodyLift:PLAYER.stepUp,height=squid?PLAYER.squidHeight:PLAYER.height;
  pos.addScaledVector(velocity,dt);P.collideBody(pos,r,lift,height,contacts,wasGrounded&&frame>0,squid);
  if(contacts.ceiling&&velocity.y>0)velocity.y=0;
  if(!climbing&&contacts.wall){const vn=velocity.x*contacts.wallNormal.x+velocity.z*contacts.wallNormal.z;if(vn<0){velocity.x-=contacts.wallNormal.x*vn;velocity.z-=contacts.wallNormal.z*vn;}}
  if(!sweep.clear(previous,pos,r,lift,height,squid)||!P.bodyFits(pos,r,lift,height,squid,.003))return null;
  grounded=false;
  if(!climbing&&velocity.y<=.5){
   const stick=wasGrounded&&frame>0;
   P.groundProbe(pos.x,pos.y,pos.z,stick?(squid?PLAYER.squidStepUp:PLAYER.stepUp):Math.max(previous.y,pos.y)-pos.y+(squid?PLAYER.squidStepUp:PLAYER.ledgeAssist),stick?PLAYER.stepDown:.02,PLAYER.footRadius,hit,squid);
   if(hit.hit&&(stick||hit.y>=pos.y-.02)){pos.y=hit.y;grounded=true;velocity.y=0;if(!attached||Math.abs(pos.y-upper.y)>=.16||hit.block<0||hit.block>=L.staticBlockCount)return null;if(supported(P,L,pos))return {point:pos.clone(),seconds:(frame+1)*STEP};}
  }
  if(pos.y<start.y-.3||pos.y>upper.y+2)return null;
 }
 return null;
}
/** Explicit opt-in for a supported normal jump into an uninterrupted source
 * paintable facade. Plain climb's fixed-spine attachment check stays intact. */
export function nativeJumpAttachTransition(graph,lower,upper){
 const {level:L,physics:P}=graph;if(!L.manifest.sourceNavigation?.wallJumpAttach||!L.manifest.sourceNavigation?.wallClimb)return null;
 const rise=upper.y-lower.y,dx=upper.x-lower.x,dz=upper.z-lower.z,length=Math.hypot(dx,dz);
 if(rise<=1.25||rise>6.1||length<.1||length>graph.step*1.01||!lower.nativePaintable||!upper.nativePaintable||lower.y<=PLAYER.fallDeathY)return null;
 const key=lower.id+':'+upper.id,cache=graph._nativeJumpAttachCache||(graph._nativeJumpAttachCache=new Map());if(cache.has(key))return cache.get(key);cache.set(key,null);
 const direction=new THREE.Vector3(dx/length,0,dz/length),first=P.raycast(new THREE.Vector3(lower.x,lower.y+.3,lower.z),direction,length+.25);
 if(!first.hit||first.face<0||Math.abs(first.normal.y)>.15||first.normal.dot(direction)>-.9)return null;
 const normal=first.normal.clone(),tangent=new THREE.Vector3(normal.z,0,-normal.x),wall=first.point.clone(),samples=[];let extent=0;
 for(const y of wallHeights(L,wall,normal,tangent,lower.y+.3,upper.y-.015)){
  const h=P.raycast(wall.clone().addScaledVector(normal,1).setY(Math.min(y,upper.y-.015)),direction,1.25);
  if(!paintableWall(L,h,normal))return null;
  for(const side of [-.05,.05])if(!paintableWall(L,P.raycast(wall.clone().addScaledVector(normal,1).addScaledVector(tangent,side).setY(h.point.y),direction,1.25),normal))return null;
  extent=Math.max(extent,h.point.clone().sub(wall).dot(normal));samples.push({point:h.point.toArray(),face:h.face,u:h.u,v:h.v});
 }
 if(samples.length<4||extent>.2)return null;
 const start=wall.clone().addScaledVector(normal,extent+radius(true)+.025).setY(lower.y),paintDistance=Math.max(3,(rise-.65)/Math.tan(.9)),stance=wall.clone().addScaledVector(normal,paintDistance).setY(lower.y),human=radius(false),sweep=graph._nativeJumpAttachClearance||(graph._nativeJumpAttachClearance=nativeDropClearance(L));
 for(const endpoint of [start,stance])for(let t=0;t<=1.001;t+=.1){const p=new THREE.Vector3(lower.x,lower.y,lower.z).lerp(endpoint,Math.min(1,t));if(!supported(P,L,p)||!P.bodyFits(p,human,PLAYER.stepUp,PLAYER.height,false,.003))return null;}
 if(!P.bodyFits(start,radius(true),PLAYER.squidBodyLift,PLAYER.squidHeight,true,.003))return null;
 for(const s of samples){
  const eye=stance.clone().setY(stance.y+1.05);let visible=null;
  for(const lift of [0,-.05,.05,-.1,.1]){const h=P.raycast(wall.clone().addScaledVector(normal,1).setY(s.point[1]+lift),direction,1.25);if(!paintableWall(L,h,normal)||h.point.distanceTo(new THREE.Vector3(...s.point))>.19)continue;const delta=h.point.clone().sub(eye),distance=delta.length();if(!P.raycast(eye,delta.multiplyScalar(1/distance),distance-.025).hit){visible=h.point.toArray();break;}}
  if(!visible)return null;s.paintPoint=visible;
 }
 const landing=jumpFlight(graph,start,normal,upper,sweep);if(!landing)return null;
 const goal=new THREE.Vector3(upper.x,upper.y,upper.z);if(!supported(P,L,goal)||!P.bodyFits(goal,human,PLAYER.stepUp,PLAYER.height,false,.003))return null;
 if(landing.point.distanceTo(goal)>graph.step*1.2||!sweep.clear(landing.point,goal,human,PLAYER.stepUp,PLAYER.height))return null;for(let t=0;t<=1.001;t+=.1)if(!supported(P,L,landing.point.clone().lerp(goal,Math.min(1,t))))return null;
 const edge={to:upper.id,type:'climb',cost:rise*1.8+paintDistance*2+8,climb:{kind:'jump-attach',lower:[lower.x,lower.y,lower.z],upper:goal.toArray(),normal:normal.toArray(),spine:start.toArray(),paintStance:stance.toArray(),samples,jumpFrom:start.toArray(),fixedStepForecast:{simulationStep:STEP,seconds:landing.seconds,landing:landing.point.toArray()},assurance:'Original supported zero-AP Shooter normal jump, source paintable wall and continuous original capsule screening at the installed fixed STEP; render cadence validation remains separate; retail navigation unverified'}};cache.set(key,edge);return edge;
}
/** Own only this explicit edge kind, using existing ordinary actor inputs. */
export function updateNativeJumpAttach(brain,G,dt){
 const a=brain.a,N=G.nav;if(!G.level?.manifest?.sourceNavigation?.wallJumpAttach||!brain.path||!a.alive||a.s3?.squidSpawn||a.superJumpState||a.specialActive)return false;
 let index=brain.pi;if(index===0&&brain.path.length>1){const n=N.nodes[brain.path[0]];if(Math.hypot(a.pos.x-n.x,a.pos.z-n.z)<.8&&Math.abs(a.pos.y-n.y)<.3)index=1;}
 const from=N.nodes[brain.path[Math.max(0,index-1)]],to=N.nodes[brain.path[index]],edge=from?.nb.find(e=>e.to===to?.id&&e.climb?.kind==='jump-attach');if(!edge){brain._nativeJumpAttach=null;return false;}
 const c=edge.climb,normal=new THREE.Vector3(...c.normal),goal=new THREE.Vector3(...c.upper),start=new THREE.Vector3(...c.jumpFrom),input=a.intent,state=brain._nativeJumpAttach?.edge===edge&&brain._nativeJumpAttach.path===brain.path?brain._nativeJumpAttach:(brain._nativeJumpAttach={edge,path:brain.path,phase:'paint',seconds:0});state.seconds+=dt;brain.pi=index;brain.noProg=0;input.fire=input.squid=input.jump=input.sub=input.special=false;input.move.set(0,0,0);
 if(state.seconds>30){brain.path=null;brain.repath=brain.goalTimer=0;brain._nativeJumpAttach=null;return false;}
 if(a.grounded&&nativeSourceFootSupported(G,a,to)){const delta=goal.sub(a.pos).setY(0);if(delta.length()<.35){brain.pi=index+1;brain._nativeJumpAttach=null;return false;}input.move.copy(delta);if(input.move.length()>1)input.move.normalize();return true;}
 const missing=c.samples.find(s=>G.paint.sample(s.face,s.u,s.v)!==a.team+1);
 if(missing&&a.grounded&&Math.abs(a.pos.y-c.lower[1])<.2){state.phase='paint';const delta=new THREE.Vector3(...c.paintStance).sub(a.pos).setY(0);if(delta.length()>.15)input.move.copy(delta).normalize();const aim=new THREE.Vector3(...(missing.paintPoint||missing.point)).sub(a.pos).add(new THREE.Vector3(0,-1.05,0));a.aimYaw=brain.aimYaw=Math.atan2(aim.x,aim.z);a.aimPitch=brain.aimPitch=Math.max(-1.1,Math.min(1,Math.atan2(aim.y,Math.hypot(aim.x,aim.z))));a.aimPoint.fromArray(missing.paintPoint||missing.point);if(a.ink<=PLAYER.inkMax*.15)state.refilling=true;if(state.refilling&&a.ink>=PLAYER.inkMax*.9)state.refilling=false;input.squid=!!state.refilling;input.fire=!input.squid&&!a.weaponRunner?.s3ShooterCancelMain;return true;}
 const side=start.clone().sub(a.pos).setY(0);side.addScaledVector(normal,-side.dot(normal));input.move.copy(normal).negate().addScaledVector(side,3).normalize();input.squid=true;
 if(state.phase==='paint')state.phase='approach';
 if(state.phase==='approach'){
  input.squid=false;const delta=start.clone().sub(a.pos).setY(0),distance=delta.length();input.move.set(0,0,0);
  if(distance>.045)input.move.copy(delta).multiplyScalar(Math.min(.35,Math.max(.03,(distance-.02)*.65))/distance);
  if(a.grounded&&Math.abs(a.pos.y-start.y)<.16&&distance<.07&&Math.hypot(a.vel.x,a.vel.z)<.1&&nativeSourceFootSupported(G,a,{x:start.x,y:start.y,z:start.z})){input.jump=true;state.phase='flight';state.jumpSerial=a.s3JumpSerial||0;}
 }
 if(state.phase==='flight'&&a.grounded&&Math.abs(a.pos.y-c.lower[1])<.2&&(a.s3JumpSerial||0)>state.jumpSerial){state.phase='approach';}
 return true;
}

// Reuse the unchanged original-triangle interval screen for opted approaches.
export {wallHeights as nativeSourceWallHeights};
