import * as THREE from 'three';
import {PLAYER,WEAPONS} from '../../../src/config.js';
import {Hit,makeContacts} from '../../../src/game/physics.js';
import {squidSurgeParameters} from '../../splatoon3/runtime/movement.mjs';
import {stepGroundVelocity} from '../../splatoon3/runtime/movement-physics.mjs';
import {weightSpeedCurve} from '../../splatoon3/runtime/weapon-weight.mjs';
import {nativeDropClearance} from './native-drop.mjs';

const radius=sq=>(sq?PLAYER.s3SwimTerrainRadiusRaw:PLAYER.s3HumanoidTerrainRadiusRaw)*PLAYER.s3TerrainDistanceScale;
function sourceCell(L,h,wall=false){
 if(!h?.hit||h.face<0)return false;const f=L.faces[h.face];if(!(wall?f?.wall:f?.turf)||!L.containsOnFace(f,h.point))return false;
 const i=Math.max(0,Math.min(f.nu-1,Math.floor(h.u/f.cu))),j=Math.max(0,Math.min(f.nv-1,Math.floor(h.v/f.cv)));return !!L.mask[f.grid+j*f.nu+i];
}
const runwaySupport=(h,y)=>!!(h?.hit&&h.triangle>=0&&h.normal.y>.98&&Math.abs(h.point.y-y)<=PLAYER.stepUp);

/** Separate from an adjacent jump attachment: this requires a supported
 * runway, a genuine unsupported gap and ordinary running-jump air attachment.
 * Full installed Surge charge then human pop happens below the intact crest. */
export function nativeWallApproachTransition(graph,lower,direction){
 const L=graph.level,P=graph.physics,cfg=squidSurgeParameters();if(!L.manifest.sourceNavigation?.wallApproach||!cfg||!lower.nativePaintable)return null;
 const dir=new THREE.Vector3(...direction).setY(0).normalize(),normal=dir.clone().negate(),down=new THREE.Vector3(0,-1,0),start=new THREE.Vector3(lower.x,lower.y,lower.z),human=radius(false),sq=radius(true),first=P.raycast(start.clone().setY(lower.y+.4),dir,8.5);
 const wallDistance=Math.hypot(first.point.x-start.x,first.point.z-start.z);
 if(!sourceCell(L,first,true)||Math.abs(first.normal.y)>.01||first.normal.dot(normal)<.999||wallDistance<5)return null;
 const roof=P.raycast(first.point.clone().addScaledVector(dir,5).setY(lower.y+9),down,9);
 if(!sourceCell(L,roof)||roof.normal.y<.98||roof.point.y-lower.y<3||roof.point.y-lower.y>8)return null;
 const wallTop=roof.point.y,holdY=wallTop-1.8,spine=first.point.clone().addScaledVector(normal,sq+.002).setY(lower.y),tangent=new THREE.Vector3(-dir.z,0,dir.x),samples=[];
 for(let y=lower.y+.25;y<wallTop-.015;y+=.15)for(const offset of [0,-.05,.05]){
  const h=P.raycast(spine.clone().setY(y).addScaledVector(tangent,offset),dir,PLAYER.radius+.45);
  if(!sourceCell(L,h,true)||Math.abs(h.normal.y)>.01||h.normal.dot(normal)<.999)return null;
  if(offset===0)samples.push({point:h.point.toArray(),face:h.face,u:h.u,v:h.v});
 }
 let edgeDistance=0;const floors=[];
 for(let distance=0;distance<wallDistance;distance+=.05){
  const point=start.clone().addScaledVector(dir,distance),h=P.raycast(point.setY(lower.y+.4),down,.75);
  if(!runwaySupport(h,lower.y))break;
  edgeDistance=distance;
 }
 if(edgeDistance<2.5||wallDistance-edgeDistance<2||wallDistance-edgeDistance>4.2)return null;
 const takeoff=start.clone().addScaledVector(dir,edgeDistance-.3),takeoffSupport=P.raycast(takeoff.clone().setY(lower.y+.4),down,.75);if(!runwaySupport(takeoffSupport,lower.y))return null;takeoff.y=takeoffSupport.point.y;
 const sweep=graph._nativeApproachClearance||(graph._nativeApproachClearance=nativeDropClearance(L));
 for(let distance=0;distance<edgeDistance-.4;distance+=.5){
  const h=P.raycast(start.clone().addScaledVector(dir,distance).setY(lower.y+.4),down,.75);if(!runwaySupport(h,lower.y))return null;if(!sourceCell(L,h))continue;floors.push({point:h.point.toArray(),face:h.face,u:h.u,v:h.v});
 }
 const visible=s=>{const eye=start.clone().setY(lower.y+1.05),delta=new THREE.Vector3(...s.point).sub(eye),length=delta.length();return length<=WEAPONS.shooter.range&&!P.raycast(eye,delta.multiplyScalar(1/length),length-.025).hit;};
 // A preserved NoPaint sheet can occlude a neighbouring paintable runway
 // patch. Human travel needs its support, not ownership of that hidden patch.
 for(let i=floors.length-1;i>=0;i--)if(!visible(floors[i]))floors.splice(i,1);
 if(!floors.length||samples.some(s=>!visible(s)))return null;
 for(let t=0;t<=1;t+=.025){const point=start.clone().lerp(takeoff,t),h=P.raycast(point.clone().setY(point.y+.4),down,.75);if(!runwaySupport(h,lower.y)||!P.bodyFits(h.point,human,PLAYER.stepUp,PLAYER.height,false,.003))return null;}
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
