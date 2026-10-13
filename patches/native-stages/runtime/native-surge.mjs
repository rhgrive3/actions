import * as THREE from 'three';
import {PLAYER} from '../../../src/config.js';
import {Hit,makeContacts} from '../../../src/game/physics.js';
import {squidSurgeParameters} from '../../splatoon3/runtime/movement.mjs';
import {stepGroundVelocity} from '../../splatoon3/runtime/movement-physics.mjs';
import {weightSpeedCurve} from '../../splatoon3/runtime/weapon-weight.mjs';
import {nativeDropClearance} from './native-drop.mjs';

const radius=squid=>(squid?PLAYER.s3SwimTerrainRadiusRaw:PLAYER.s3HumanoidTerrainRadiusRaw)*PLAYER.s3TerrainDistanceScale;
const ownedCell=(L,h)=>{
 const f=L.faces[h.face];if(!f?.wall||!L.containsOnFace(f,h.point))return false;
 const i=Math.max(0,Math.min(f.nu-1,Math.floor(h.u/f.cu))),j=Math.max(0,Math.min(f.nv-1,Math.floor(h.v/f.cv)));
 return !!L.mask[f.grid+j*f.nu+i];
};

/** An optional ordinary Surge followed by human pop-out crosses a narrow
 * nonpaintable rim without painting it. All wall samples below the rim remain
 * paintable; the complete capsule flight needs actual supported touchdown. */
export function nativeSurgeTransition(graph,lower,upper){
 const L=graph.level,P=graph.physics,cfg=squidSurgeParameters();
 if(!L.manifest.sourceNavigation?.wallSurge||!cfg)return null;
 const rise=upper.y-lower.y,dx=upper.x-lower.x,dz=upper.z-lower.z,distance=Math.hypot(dx,dz);
 if(rise<=1.25||rise>6.1||distance<.1||distance>graph.step*2.01||lower.y<=PLAYER.fallDeathY)return null;
 const key=lower.id+':'+upper.id,cache=graph._nativeSurgeCache||(graph._nativeSurgeCache=new Map());if(cache.has(key))return cache.get(key);cache.set(key,null);
 const direction=new THREE.Vector3(dx/distance,0,dz/distance),tangent=new THREE.Vector3(-direction.z,0,direction.x),first=P.raycast(new THREE.Vector3(lower.x,lower.y+.3,lower.z),direction,distance+.25);
 if(!first.hit||first.face<0||Math.abs(first.normal.y)>.15)return null;
 const normal=first.normal.clone().setY(0).normalize(),flightDirection=normal.clone().negate(),human=radius(false),squid=radius(true),down=new THREE.Vector3(0,-1,0),sweep=graph._nativeSurgeClearance||(graph._nativeSurgeClearance=nativeDropClearance(L));
 for(const offset of [0,-.2,.2]){
  const wall=first.point.clone().addScaledVector(tangent,offset),probe=wall.clone().addScaledVector(normal,.9).setY(upper.y-.015),cap=P.raycast(probe,direction,1.25);
  if(!cap.hit||cap.triangle<0||cap.face>=0||Math.abs(cap.normal.y)>.15||cap.normal.dot(normal)<.98)continue;
  let capBase=null;
  for(let y=upper.y-.35;y<=upper.y-.015;y+=.01){const h=P.raycast(probe.clone().setY(y),direction,1.25);if(h.hit&&h.face<0){capBase=y;break;}}
  if(capBase===null)continue;
  const spine=cap.point.clone().addScaledVector(normal,squid+.002).setY(lower.y),samples=[];
  let valid=true;
  for(let y=lower.y+.3;y<capBase-.025;y+=.05){
   const h=P.raycast(spine.clone().setY(y),direction,PLAYER.radius+.35);
   if(!h.hit||h.face<0||Math.abs(h.normal.y)>.15||h.normal.dot(normal)<.97||!ownedCell(L,h)){valid=false;break;}
   samples.push({point:h.point.toArray(),face:h.face,u:h.u,v:h.v});
  }
  if(!valid||samples.length<4)continue;
  const paintDistance=Math.max(3,(rise-.65)/Math.tan(.9)),stance=wall.clone().addScaledVector(normal,paintDistance).setY(lower.y);
  for(let i=0;i<=10;i++){
   const point=new THREE.Vector3(lower.x,lower.y,lower.z).lerp(stance,i/10),h=L.triangleWorld.ray(point.clone().setY(point.y+.25),down,.5,{minNormalY:.68});
   if(!h||Math.abs(h.point.y-point.y)>.15||!P.bodyFits(point,human,PLAYER.stepUp,PLAYER.height,false,.003)){valid=false;break;}
  }
  if(!valid)continue;
  for(const sample of samples){const eye=stance.clone().add(new THREE.Vector3(0,1.05,0)),delta=new THREE.Vector3(...sample.point).sub(eye),length=delta.length();if(P.raycast(eye,delta.multiplyScalar(1/length),length-.025).hit){valid=false;break;}}
  if(!valid)continue;
  const holdY=capBase-1.8;
  if(holdY<lower.y+.3)continue;
  for(let y=lower.y;y<=holdY+.04;y+=.025)if(!P.bodyFits(spine.clone().setY(y),squid,PLAYER.squidBodyLift,PLAYER.squidHeight,true,.003)){valid=false;break;}
  if(!valid)continue;
  const touchdowns=[];
  for(const hz of [30,60,120])for(const slack of [0,.15]){
   const dt=1/hz,pos=spine.clone().setY(holdY+slack),previous=pos.clone(),contacts=makeContacts();
   // Neutral charging removes wall-normal bias. The ordinary release tick
   // restores that 1.2-unit bias and the installed full-charge upward speed;
   // the next tick selects human form before the capsule meets the NP rim.
   previous.copy(pos);pos.addScaledVector(flightDirection,1.2*dt);pos.y+=cfg.velocity*dt;P.collideBody(pos,squid,PLAYER.squidBodyLift,PLAYER.squidHeight,contacts,false,true);
   if(!sweep.clear(previous,pos,squid,PLAYER.squidBodyLift,PLAYER.squidHeight,true)){valid=false;}
   if(!valid)break;
   const velocity=flightDirection.clone().multiplyScalar(1.2);velocity.y=cfg.velocity;const hit=new Hit();let touchdown=null;
   for(let frame=0;frame<hz*3;frame++){
    previous.copy(pos);stepGroundVelocity(velocity,flightDirection.x,flightDirection.z,Math.max(weightSpeedCurve('shooter','run')[0]*60,PLAYER.airMinSpeed),PLAYER.airAccel,dt);
    let gravity=PLAYER.gravity;if(velocity.y<0)gravity*=PLAYER.fallGravityMul;if(Math.abs(velocity.y)<PLAYER.apexBand)gravity*=PLAYER.apexGravityMul;velocity.y=Math.max(-PLAYER.maxFall,velocity.y-gravity*dt);pos.addScaledVector(velocity,dt);
    if(!sweep.clear(previous,pos,human,PLAYER.stepUp,PLAYER.height)){valid=false;break;}
    if(velocity.y<=.5){P.groundProbe(pos.x,pos.y,pos.z,Math.max(previous.y,pos.y)-pos.y+PLAYER.ledgeAssist,.02,PLAYER.footRadius,hit,false);if(hit.hit&&hit.y>=pos.y-.02){pos.y=hit.y;touchdown=pos.clone();break;}}
    if(velocity.y<0&&pos.y<upper.y-1.5){valid=false;break;}
   }
   if(!touchdown||Math.abs(touchdown.y-upper.y)>.15){valid=false;break;}
   const support=L.triangleWorld.ray(touchdown.clone().setY(touchdown.y+.1),down,.3,{minNormalY:.68});if(!support||!(support.flags&2)||L.data.triangleFace[support.triangle]<0){valid=false;break;}
   touchdowns.push(touchdown);
  }
  if(!valid||touchdowns.length!==6)continue;
  const middle=touchdowns[2];let target=null,score=Infinity;
  for(const n of graph.nodes){if(!n.nativePaintable||Math.abs(n.y-upper.y)>.15)continue;const d=Math.hypot(n.x-middle.x,n.z-middle.z);if(d<score&&d<graph.step*.85){target=n;score=d;}}
  if(!target)continue;
  const goal=new THREE.Vector3(target.x,target.y,target.z);
  for(const point of touchdowns){
   if(!sweep.clear(point,goal,human,PLAYER.stepUp,PLAYER.height)){valid=false;break;}
   const count=Math.max(1,Math.ceil(point.distanceTo(goal)/.1));
   for(let i=0;i<=count;i++){
    const p=point.clone().lerp(goal,i/count),h=L.triangleWorld.ray(p.clone().setY(p.y+.2),down,.4,{minNormalY:.68});
    if(!h||!(h.flags&2)||Math.abs(h.point.y-p.y)>.15||L.data.triangleFace[h.triangle]<0){valid=false;break;}
    const f=L.faces[L.data.triangleFace[h.triangle]],rel=h.point.clone().sub(f.origin),u=rel.dot(f.u),v=rel.dot(f.v),iu=Math.max(0,Math.min(f.nu-1,Math.floor(u/f.cu))),iv=Math.max(0,Math.min(f.nv-1,Math.floor(v/f.cv)));
    if(!f.turf||!L.containsOnFace(f,h.point)||!L.mask[f.grid+iv*f.nu+iu]){valid=false;break;}
   }
   if(!valid)break;
  }
  if(!valid||!P.bodyFits(goal,human,PLAYER.stepUp,PLAYER.height,false,.003))continue;
  const edge={to:target.id,type:'climb',cost:rise*1.8+paintDistance*2+12,climb:{kind:'surge',lower:[lower.x,lower.y,lower.z],upper:goal.toArray(),wallTop:upper.y,normal:normal.toArray(),spine:spine.toArray(),paintStance:stance.toArray(),samples,capBase,holdY,popOutY:holdY,assurance:'Inferred source paintable wall below a preserved narrow NoPaint rim; existing full-charge Surge and ordinary human pop-out; six exact source capsule/ground screenings, retail navigation unverified'}};
  cache.set(key,edge);return edge;
 }
 return null;
}

/** Select existing weapon, swim, jump-hold/release and human inputs only. */
export function updateNativeSurge(brain,G,dt){
 const a=brain.a,N=G.nav;if(!G.level?.manifest?.sourceNavigation?.wallSurge||!brain.path||!a.alive||a.s3?.squidSpawn||a.superJumpState||a.specialActive)return false;
 let index=brain.pi;
 if(index===0&&brain.path.length>1){const n=N.nodes[brain.path[0]];if(Math.hypot(a.pos.x-n.x,a.pos.z-n.z)<.8&&Math.abs(a.pos.y-n.y)<.3)index=1;}
 const from=N.nodes[brain.path[Math.max(0,index-1)]],to=N.nodes[brain.path[index]],edge=from?.nb.find(e=>e.to===to?.id&&e.climb?.kind==='surge');
 if(!edge){brain._nativeSurge=null;return false;}
 const c=edge.climb,goal=new THREE.Vector3(...c.upper),spine=new THREE.Vector3(...c.spine),normal=new THREE.Vector3(...c.normal),input=a.intent;
 const state=brain._nativeSurge?.edge===edge&&brain._nativeSurge.path===brain.path?brain._nativeSurge:(brain._nativeSurge={edge,path:brain.path,phase:'paint',seconds:0});state.seconds+=dt;
 if(state.seconds>35){brain.path=null;brain.repath=brain.goalTimer=0;brain._nativeSurge=null;return false;}
 brain.pi=index;brain.noProg=0;input.fire=input.squid=input.jump=input.sub=input.special=false;input.move.set(0,0,0);
 if(a.grounded&&Math.abs(a.pos.y-goal.y)<.15){
  const delta=goal.sub(a.pos).setY(0);if(delta.length()<.5){brain.pi=index+1;brain._nativeSurge=null;return false;}input.move.copy(delta);if(input.move.length()>1)input.move.normalize();return true;
 }
 if(state.phase==='human'){
  input.move.copy(normal).negate();return true;
 }
 const missing=c.samples.find(s=>G.paint.sample(s.face,s.u,s.v)!==a.team+1);
 if(missing){
  state.phase='paint';const delta=new THREE.Vector3(...c.paintStance).sub(a.pos).setY(0);if(delta.length()>.15)input.move.copy(delta).normalize();
  const aim=new THREE.Vector3(...missing.point).sub(a.pos).add(new THREE.Vector3(0,-1.05,0));a.aimYaw=brain.aimYaw=Math.atan2(aim.x,aim.z);a.aimPitch=brain.aimPitch=Math.max(-1.1,Math.min(1,Math.atan2(aim.y,Math.hypot(aim.x,aim.z))));a.aimPoint.fromArray(missing.point);
  input.fire=a.ink>15;input.squid=!input.fire;return true;
 }
 const side=spine.clone().sub(a.pos).setY(0);side.addScaledVector(normal,-side.dot(normal));input.squid=true;input.move.copy(normal).negate().addScaledVector(side,3).normalize();if(a.climbing&&state.phase==='swim'&&a.pos.y>=c.holdY-.7)input.move.multiplyScalar(.25);
 if(!a.climbing&&a.pos.y<c.wallTop-1.8){const delta=spine.clone().sub(a.pos).setY(0);if(delta.length()>.15)input.move.copy(delta).normalize();}
 if(state.phase==='paint')state.phase='swim';
 if(state.phase==='swim'&&a.climbing&&a.pos.y>=c.holdY)state.phase='charge';
 if(state.phase==='charge'){
  input.move.set(0,0,0);input.jump=true;if(a.s3.surge?.phase==='charge'&&a.s3.surge.charge>=1){state.phase='release';input.jump=false;}
 }
 if(state.phase==='release'&&a.s3.surge?.phase==='burst'){state.phase='human';input.squid=false;input.move.copy(normal).negate();}
 return true;
}
