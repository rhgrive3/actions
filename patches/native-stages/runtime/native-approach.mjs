import * as THREE from 'three';
import {PLAYER,WEAPONS} from '../../../src/config.js';
import {Hit,makeContacts} from '../../../src/game/physics.js';
import {squidSurgeParameters} from '../../splatoon3/runtime/movement.mjs';
import {stepGroundVelocity} from '../../splatoon3/runtime/movement-physics.mjs';
import {weightSpeedCurve} from '../../splatoon3/runtime/weapon-weight.mjs';
import {nativeDropClearance} from './native-drop.mjs';
import {nativeSourceFootSupported} from './native-bot-support.mjs';
import {nativeTowerRider} from './native-ranked-boarding.mjs';
import {nativeSourceWallHeights} from './native-jump-attach.mjs';
import {LEGACY_JUMP_FEEL} from '../../splatoon3/runtime/normal-jump-hold.mjs';

const radius=sq=>(sq?PLAYER.s3SwimTerrainRadiusRaw:PLAYER.s3HumanoidTerrainRadiusRaw)*PLAYER.s3TerrainDistanceScale;
function sourceCell(L,h,wall=false){
 if(!h?.hit||h.face<0||h.triangle<0||h.block<0||h.block>=L.staticBlockCount)return false;const f=L.faces[h.face];if(!(wall?f?.wall:f?.turf)||!L.containsOnFace(f,h.point))return false;
 const i=Math.max(0,Math.min(f.nu-1,Math.floor(h.u/f.cu))),j=Math.max(0,Math.min(f.nv-1,Math.floor(h.v/f.cv)));return !!L.mask[f.grid+j*f.nu+i];
}
const runwaySupport=(L,h,y)=>!!(h?.hit&&h.triangle>=0&&h.block>=0&&h.block<L.staticBlockCount&&h.normal.y>.98&&Math.abs(h.point.y-y)<=PLAYER.stepUp);

/** Separate from an adjacent jump attachment: this requires a supported
 * runway, a genuine unsupported gap and ordinary running-jump air attachment.
 * Full installed Surge charge then human pop happens below the intact crest. */
export function nativeWallApproachTransition(graph,lower,direction){
 const L=graph.level,P=graph.physics,cfg=squidSurgeParameters();if(!L.native||!L.manifest.sourceNavigation?.wallApproach||!cfg||!lower.nativePaintable)return null;
 const dir=new THREE.Vector3(...direction).setY(0).normalize(),normal=dir.clone().negate(),down=new THREE.Vector3(0,-1,0),start=new THREE.Vector3(lower.x,lower.y,lower.z),human=radius(false),sq=radius(true),first=P.raycast(start.clone().setY(lower.y+.4),dir,8.5);
 const wallDistance=Math.hypot(first.point.x-start.x,first.point.z-start.z);
 if(!sourceCell(L,first,true)||Math.abs(first.normal.y)>.01||first.normal.dot(normal)<.999||wallDistance<5)return null;
 const roof=P.raycast(first.point.clone().addScaledVector(dir,5).setY(lower.y+9),down,9);
 if(!sourceCell(L,roof)||roof.normal.y<.98||roof.point.y-lower.y<3||roof.point.y-lower.y>8)return null;
 const wallTop=roof.point.y,holdY=wallTop-1.8,spine=first.point.clone().addScaledVector(normal,sq+.002).setY(lower.y),tangent=new THREE.Vector3(-dir.z,0,dir.x),samples=[];
 for(const y of nativeSourceWallHeights(L,first.point,normal,tangent,lower.y+.25,holdY+(PLAYER.climbSpeed*cfg.chargeMoveScale+cfg.velocity)/30+.85))for(const offset of [0,-.05,.05]){
  const h=P.raycast(spine.clone().setY(y).addScaledVector(tangent,offset),dir,PLAYER.radius+.45);
  if(!sourceCell(L,h,true)||Math.abs(h.normal.y)>.01||h.normal.dot(normal)<.999)return null;
  if(offset===0)samples.push({point:h.point.toArray(),face:h.face,u:h.u,v:h.v});
 }
 let edgeDistance=0;const floors=[];
 for(let distance=0;distance<wallDistance;distance+=.05){
  const point=start.clone().addScaledVector(dir,distance),h=P.raycast(point.setY(lower.y+.4),down,.75);
  if(!runwaySupport(L,h,lower.y))break;
  edgeDistance=distance;
 }
 if(edgeDistance<2.5||wallDistance-edgeDistance<2||wallDistance-edgeDistance>4.2)return null;
 const takeoff=start.clone().addScaledVector(dir,edgeDistance-.3),takeoffSupport=P.raycast(takeoff.clone().setY(lower.y+.4),down,.75);if(!runwaySupport(L,takeoffSupport,lower.y))return null;takeoff.y=takeoffSupport.point.y;
 const sweep=graph._nativeApproachClearance||(graph._nativeApproachClearance=nativeDropClearance(L));
 for(let distance=.5;distance<edgeDistance-.4;distance+=.5){
  const h=P.raycast(start.clone().addScaledVector(dir,distance).setY(lower.y+.4),down,.75);if(!runwaySupport(L,h,lower.y))return null;if(!sourceCell(L,h))continue;floors.push({point:h.point.toArray(),face:h.face,u:h.u,v:h.v});
 }
 const visible=s=>{const eye=start.clone().setY(lower.y+1.05),delta=new THREE.Vector3(...s.point).sub(eye),length=delta.length();return length<=WEAPONS.shooter.range&&!P.raycast(eye,delta.multiplyScalar(1/length),length-.025).hit;};
 // A preserved NoPaint sheet can occlude a neighbouring paintable runway
 // patch. Human travel needs its support, not ownership of that hidden patch.
 for(let i=floors.length-1;i>=0;i--)if(!visible(floors[i]))floors.splice(i,1);
 if(!floors.length||samples.some(s=>!visible(s)))return null;
 for(let t=0;t<=1;t+=.025){const point=start.clone().lerp(takeoff,t),h=P.raycast(point.clone().setY(point.y+.4),down,.75);if(!runwaySupport(L,h,lower.y)||!P.bodyFits(h.point,human,PLAYER.stepUp,PLAYER.height,false,.003))return null;}
 const minSpeed=weightSpeedCurve('shooter','run')[0]*60,maxSpeed=weightSpeedCurve('shooter','swim')[0]*60,contacts=makeContacts(),touchdowns=[];
 for(const hz of [30,60,120])for(const speed of [minSpeed,(minSpeed+maxSpeed)/2,maxSpeed])for(const slack of [-.05,.05]){
  const dt=1/hz,pos=takeoff.clone().addScaledVector(dir,slack),previous=pos.clone(),velocity=dir.clone().multiplyScalar(speed);velocity.y=PLAYER.jumpVel;
  let attached=false;
  for(let i=0;i<hz*1.2;i++){
   previous.copy(pos);stepGroundVelocity(velocity,dir.x,dir.z,Math.max(PLAYER.squidDrySpeed,Math.hypot(velocity.x,velocity.z)),PLAYER.squidAirAccel,dt);let gravity=PLAYER.gravity;if(velocity.y<0)gravity*=PLAYER.fallGravityMul;if(Math.abs(velocity.y)<PLAYER.apexBand)gravity*=PLAYER.apexGravityMul;velocity.y-=gravity*dt;pos.addScaledVector(velocity,dt);
   contacts.ground=contacts.wall=contacts.ceiling=false;P.collideBody(pos,sq,PLAYER.squidBodyLift,PLAYER.squidHeight,contacts,false,true);
   if(!sweep.clear(previous,pos,sq,PLAYER.squidBodyLift,PLAYER.squidHeight,true))return null;
   const h=P.raycast(pos.clone().setY(pos.y+.3),dir,PLAYER.radius+.35);
   if(sourceCell(L,h,true)&&h.normal.dot(normal)>.999){attached=true;break;}if(pos.y<lower.y-.3)return null;
  }
  if(!attached||pos.y>holdY)return null;
  const attach=spine.clone().setY(pos.y);if(!sweep.clear(pos,attach,sq,PLAYER.squidBodyLift,PLAYER.squidHeight,true))return null;
  for(let y=pos.y;y<=holdY+.07;y+=.025)if(!P.bodyFits(spine.clone().setY(y),sq,PLAYER.squidBodyLift,PLAYER.squidHeight,true,.003))return null;
  pos.copy(spine).setY(holdY+PLAYER.climbSpeed*cfg.chargeMoveScale*dt);previous.copy(pos);pos.addScaledVector(dir,1.2*dt);pos.y+=cfg.velocity*dt;P.collideBody(pos,sq,PLAYER.squidBodyLift,PLAYER.squidHeight,contacts,false,true);if(!sweep.clear(previous,pos,sq,PLAYER.squidBodyLift,PLAYER.squidHeight,true))return null;
  velocity.copy(dir).multiplyScalar(1.2);velocity.y=cfg.velocity;const hit=new Hit();let touchdown=null;
  for(let i=0;i<hz*3;i++){
   previous.copy(pos);stepGroundVelocity(velocity,dir.x,dir.z,minSpeed,PLAYER.airAccel,dt);let gravity=PLAYER.gravity;if(velocity.y<0)gravity*=PLAYER.fallGravityMul;if(Math.abs(velocity.y)<PLAYER.apexBand)gravity*=PLAYER.apexGravityMul;velocity.y-=gravity*dt;pos.addScaledVector(velocity,dt);
   if(!sweep.clear(previous,pos,human,PLAYER.stepUp,PLAYER.height))return null;
   if(velocity.y<=.5){P.groundProbe(pos.x,pos.y,pos.z,Math.max(previous.y,pos.y)-pos.y+PLAYER.ledgeAssist,.02,PLAYER.footRadius,hit,false);if(hit.hit&&hit.y>=pos.y-.02){pos.y=hit.y;touchdown=pos.clone();break;}}
  }
  if(!touchdown||Math.abs(touchdown.y-wallTop)>.15)return null;touchdowns.push(touchdown);
 }
 const middle=touchdowns[Math.floor(touchdowns.length/2)];let target=null,score=Infinity;
 for(const n of graph.nodes){if(!n.nativePaintable||Math.abs(n.y-wallTop)>.15)continue;const distance=Math.hypot(n.x-middle.x,n.z-middle.z);if(distance<.85&&distance<score){target=n;score=distance;}}
 if(!target)return null;const goal=new THREE.Vector3(target.x,target.y,target.z);
 for(const p of touchdowns){if(!sweep.clear(p,goal,human,PLAYER.stepUp,PLAYER.height))return null;for(let i=0,count=Math.max(1,Math.ceil(p.distanceTo(goal)/.1));i<=count;i++){const point=p.clone().lerp(goal,i/count),h=P.raycast(point.clone().setY(point.y+.2),down,.4);if(!sourceCell(L,h)||Math.abs(h.point.y-point.y)>.15)return null;}}
 return{to:target.id,type:'climb',cost:wallDistance*2+wallTop-lower.y+16,climb:{kind:'approach',lower:start.toArray(),upper:goal.toArray(),paintStance:start.toArray(),normal:normal.toArray(),spine:spine.toArray(),takeoff:takeoff.toArray(),holdY,wallTop,minSpeed,maxSpeed,samples,floors,assurance:'Supported human runway (preserved NoPaint floor allowed) and unsupported gap, 18 ordinary jump/attachment and charged human-pop capsule forecasts; local canonical zero-AP Shooter inference, retail navigation unverified'}};
}


/** A missing centre cell can be a real source obstruction. Admit only a
 * cardinal, supported normal jump whose installed short press and full-stick
 * steering reach the actual far support with every capsule continuously clear.
 * NoPaint floors remain collision supports and are never ownership targets. */
export function nativeApproachJumpTransition(graph,lower,upper){
 const L=graph.level,P=graph.physics,st=graph.step;
 if(!L.native||!L.manifest.sourceNavigation?.wallApproach)return null;
 const dx=upper.x-lower.x,dz=upper.z-lower.z,dy=upper.y-lower.y;
 if(Math.abs(dy)>PLAYER.stepUp||!((Math.abs(dx-st*2)<1e-6||Math.abs(dx+st*2)<1e-6)&&Math.abs(dz)<1e-6||(Math.abs(dz-st*2)<1e-6||Math.abs(dz+st*2)<1e-6)&&Math.abs(dx)<1e-6))return null;
 const mid=graph.cells[(lower.iz+upper.iz)/2*graph.nx+(lower.ix+upper.ix)/2];
 if(mid?.some(id=>Math.abs(graph.nodes[id].y-lower.y)<.5))return null;
 const cache=graph._nativeApproachJumpCache||(graph._nativeApproachJumpCache=new Map()),key=lower.id+':'+upper.id;if(cache.has(key))return cache.get(key);cache.set(key,null);
 const down=new THREE.Vector3(0,-1,0),start=new THREE.Vector3(lower.x,lower.y,lower.z),goal=new THREE.Vector3(upper.x,upper.y,upper.z),r=radius(false),sweep=graph._nativeApproachClearance||(graph._nativeApproachClearance=nativeDropClearance(L));
 for(const point of [start,goal]){const h=P.raycast(point.clone().setY(point.y+.1),down,.3);if(!h.hit||h.triangle<0||h.block<0||h.block>=L.staticBlockCount||h.normal.y<=.68||Math.abs(h.point.y-point.y)>.16||!P.bodyFits(point,r,PLAYER.stepUp,PLAYER.height,false,.003))return null;}
 const trials=[];
 for(const hz of [30,60,120])for(const slack of [-.025,0,.025]){
  const dt=1/hz,pos=start.clone(),velocity=new THREE.Vector3(),previous=pos.clone(),contact=makeContacts(),hit=new Hit();pos.x+=Math.abs(dz)>1e-6?slack:0;pos.z+=Math.abs(dx)>1e-6?slack:0;
  let landed=false,grounded=true;
  for(let frame=0;frame<hz*4;frame++){
   const vx=goal.x-pos.x,vz=goal.z-pos.z,length=Math.hypot(vx,vz),mx=length>1e-6?vx/length:0,mz=length>1e-6?vz/length:0;previous.copy(pos);
   if(frame===1&&LEGACY_JUMP_FEEL.enabled&&60*dt<=LEGACY_JUMP_FEEL.holdFrames&&velocity.y>0)velocity.y*=LEGACY_JUMP_FEEL.releaseRate;
   stepGroundVelocity(velocity,mx,mz,Math.max(weightSpeedCurve('shooter','run')[0]*60,PLAYER.airMinSpeed),frame===0?(PLAYER.s3GroundAccel??36):PLAYER.airAccel,dt);
   if(frame===0)velocity.y=PLAYER.jumpVel;
   let gravity=PLAYER.gravity;if(velocity.y<0)gravity*=PLAYER.fallGravityMul;if(Math.abs(velocity.y)<PLAYER.apexBand)gravity*=PLAYER.apexGravityMul;velocity.y=Math.max(-PLAYER.maxFall,velocity.y-gravity*dt);pos.addScaledVector(velocity,dt);
   contact.ground=contact.wall=contact.ceiling=false;P.collideBody(pos,r,PLAYER.stepUp,PLAYER.height,contact,false,false);if(contact.ceiling&&velocity.y>0)velocity.y=0;
   if(contact.wall){const vn=velocity.x*contact.wallNormal.x+velocity.z*contact.wallNormal.z;if(vn<0){velocity.x-=contact.wallNormal.x*vn;velocity.z-=contact.wallNormal.z*vn;}}
   grounded=false;
   if(velocity.y<=.5){P.groundProbe(pos.x,pos.y,pos.z,Math.max(previous.y,pos.y)-pos.y+PLAYER.ledgeAssist,.02,PLAYER.footRadius,hit,false);if(hit.hit&&hit.y>=pos.y-.02){pos.y=hit.y;grounded=true;velocity.y=0;}}
   if(!sweep.clear(previous,pos,r,PLAYER.stepUp,PLAYER.height)||!P.bodyFits(pos,r,PLAYER.stepUp,PLAYER.height,false,.003))return null;
   if(grounded){if(Math.abs(pos.y-goal.y)>.16||Math.hypot(pos.x-goal.x,pos.z-goal.z)>.25||hit.block<0||hit.block>=L.staticBlockCount)return null;landed=true;trials.push({hz,slack,seconds:(frame+1)*dt,touchdown:pos.toArray()});break;}
   if(pos.y<Math.min(start.y,goal.y)-.3)return null;
  }
  if(!landed)return null;
 }
 const edge={to:upper.id,type:'climb',cost:st*2+4,climb:{kind:'gap-jump',lower:start.toArray(),upper:goal.toArray(),trials,assurance:'Original static support, nine continuous human-capsule ordinary short-press jump forecasts with full-stick target steering; retained NoPaint collision; player-only edge excluded from Tower'}};cache.set(key,edge);return edge;
}

function approachAim(brain,a,point,dt){
 const aim=new THREE.Vector3(...point).sub(a.pos).add(new THREE.Vector3(0,-1.05,0)),yaw=Math.atan2(aim.x,aim.z),pitch=Math.max(-1.1,Math.min(1,Math.atan2(aim.y,Math.hypot(aim.x,aim.z)))),turn=6*dt;
 const delta=Math.atan2(Math.sin(yaw-a.aimYaw),Math.cos(yaw-a.aimYaw));a.aimYaw=brain.aimYaw=a.aimYaw+Math.max(-turn,Math.min(turn,delta));a.aimPitch=brain.aimPitch=a.aimPitch+Math.max(-turn,Math.min(turn,pitch-a.aimPitch));a.aimPoint.fromArray(point);
 return Math.abs(delta)<.08&&Math.abs(pitch-a.aimPitch)<.08;
}
/** Execute the qualified edge using only ordinary existing inputs. The Actor
 * alone owns launch, wall attachment, charge/burst, form and source collision. */
export function updateNativeApproach(brain,G,dt){
 const a=brain.a,N=G.nav;
 if(!G.level?.native||!G.level?.manifest?.sourceNavigation?.wallApproach){if(brain._nativeApproach)brain._nativeApproach=null;return false;}
 if(!brain.path||!a.alive||a.s3?.squidSpawn||a.superJumpState||a.specialActive||nativeTowerRider(G,a)||brain._nativeTowerBoarding){brain._nativeApproach=null;return false;}
 let index=brain.pi;if(index===0&&brain.path.length>1){const n=N.nodes[brain.path[0]];if(Math.hypot(a.pos.x-n.x,a.pos.z-n.z)<.8&&Math.abs(a.pos.y-n.y)<.3)index=1;}
 const from=N.nodes[brain.path[Math.max(0,index-1)]],to=N.nodes[brain.path[index]],edge=from?.nb.find(e=>e.to===to?.id&&['approach','gap-jump'].includes(e.climb?.kind));
 if(!edge){brain._nativeApproach=null;return false;}
 if(!nativeApproachEdgeAllowed(a,edge)){brain.path=null;brain.repath=brain.goalTimer=0;brain._nativeApproach=null;return false;}
 const c=edge.climb,goal=new THREE.Vector3(...c.upper),start=new THREE.Vector3(...c.lower),input=a.intent,state=brain._nativeApproach?.edge===edge&&brain._nativeApproach.path===brain.path&&brain._nativeApproach.match===G.match&&brain._nativeApproach.mode===brain.mode&&brain._nativeApproach.actor===a&&brain._nativeApproach.life===(a.netLife||0)?brain._nativeApproach:(brain._nativeApproach={edge,path:brain.path,level:G.level,nav:N,match:G.match,mode:brain.mode,actor:a,life:a.netLife||0,phase:c.kind==='gap-jump'?'plant':'paint',seconds:0});
 if(state.level!==G.level||state.nav!==N){brain._nativeApproach=null;return false;}
 state.seconds+=dt;if(state.seconds>55){brain.path=null;brain.repath=brain.goalTimer=0;brain._nativeApproach=null;return false;}
 brain.pi=index;brain.noProg=0;input.fire=input.squid=input.jump=input.sub=input.special=input.throw=false;input.move.set(0,0,0);
 if(a.grounded&&nativeSourceFootSupported(G,a,to)){
  const delta=goal.clone().sub(a.pos).setY(0);if(delta.length()<.18&&Math.hypot(a.vel.x,a.vel.z)<.65){brain.pi=index+1;brain._nativeApproach=null;return false;}
  if(state.phase==='human'||state.phase==='flight'){const length=delta.length();if(length>1e-6)input.move.copy(delta).multiplyScalar(Math.min(.35,Math.max(.03,(length-.09)*.65))/length);return true;}
 }
 if(c.kind==='gap-jump'){
  if(state.phase==='flight'&&(a.s3JumpSerial||0)===state.jumpSerial&&a.grounded)state.phase='plant';
  const delta=(state.phase==='plant'?start:goal).clone().sub(a.pos).setY(0),d=delta.length();
  if(state.phase==='plant'){
   if(d>.025||Math.hypot(a.vel.x,a.vel.z)>.08||!nativeSourceFootSupported(G,a,from)){if(d>.015)input.move.copy(delta).multiplyScalar(Math.min(.25,Math.max(.03,(d-.015)*.65))/d);return true;}
   state.phase='flight';state.jumpSerial=a.s3JumpSerial||0;input.jump=true;
  }
  const direction=goal.clone().sub(a.pos).setY(0);if(direction.lengthSq()>1e-12)input.move.copy(direction).normalize();return true;
 }
 const normal=new THREE.Vector3(...c.normal),direction=normal.clone().negate(),stance=new THREE.Vector3(...c.paintStance),takeoff=new THREE.Vector3(...c.takeoff),spine=new THREE.Vector3(...c.spine);
 if(state.phase==='human'){input.move.copy(direction);return true;}
 if(state.phase==='paint'){
  const delta=stance.sub(a.pos).setY(0),distance=delta.length();if(distance>.08||Math.hypot(a.vel.x,a.vel.z)>.1){if(distance>.04)input.move.copy(delta).multiplyScalar(Math.min(.35,Math.max(.03,(distance-.04)*.65))/distance);return true;}
  const missing=[...c.floors,...c.samples].find(s=>G.paint.sample(s.face,s.u,s.v)!==a.team+1);
  if(a.ink<=PLAYER.inkMax*.15)state.refilling=true;if(state.refilling&&a.ink>=PLAYER.inkMax*.9)state.refilling=false;
  if(state.refilling){input.squid=true;return true;}
  if(missing){const aimed=approachAim(brain,a,missing.point,dt);input.fire=aimed&&!a.weaponRunner?.s3ShooterCancelMain;return true;}
  if(a.ink<PLAYER.inkMax*.9){state.refilling=true;input.squid=true;return true;}
  state.phase='run';state.jumpSerial=a.s3JumpSerial||0;
 }
 input.squid=true;input.move.copy(direction);
 if(state.phase==='run'){
  const lateral=takeoff.clone().sub(a.pos).setY(0);lateral.addScaledVector(direction,-lateral.dot(direction));input.move.addScaledVector(lateral,3).normalize();
  if(a.pos.clone().sub(takeoff).dot(direction)>=0){input.jump=true;state.phase='attach';}
 }
 if(state.phase==='attach'){
  input.jump=true;
  if(a.climbing&&a.pos.y>=c.holdY)state.phase='charge';
  else if((a.s3JumpSerial||0)>state.jumpSerial&&a.grounded&&a.pos.y<c.wallTop-1.8){state.phase='paint';}
 }
 if(state.phase==='charge'){input.move.set(0,0,0);input.jump=true;if(a.s3?.surge?.phase==='charge'&&a.s3.surge.charge>=1){state.phase='release';input.jump=false;}}
 if(state.phase==='release'){input.move.set(0,0,0);input.jump=false;if(a.s3?.surge?.phase==='burst'){state.phase='human';input.squid=false;input.move.copy(direction);}}
 return true;
}

/** Forecasts intentionally qualify the zero-AP canonical Shooter only. Other
 * loadouts retain their existing source routes until independently measured. */
export function nativeApproachEdgeAllowed(actor,edge){
 if(!['approach','gap-jump'].includes(edge.climb?.kind))return true;
 return actor?.weaponId==='shooter'&&Object.values(actor.s3?.abilityPoints||{}).every(value=>value===0);
}
