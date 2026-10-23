// Private native-source driver. The input log supplies requests and witnesses;
// the installed Actor, Physics, resource and weapon owners decide the result.
// No public actor flag enrolls a replay or grants a launch receipt.
import { validNativeChargerInputPacket } from './native-charger-input.mjs';
const actors=new WeakMap(),handles=new WeakMap(),generations=new WeakMap(),launches=new WeakMap();let api=null,executing=null;
const life=a=>Math.max(a?.netLife??0,a?.net?.lastLife??0),MAX_SHOTS=32;
const effective=i=>(i?.fire?1:0)|(i?.firePressed?2:0)|(i?.sub?4:0)|(i?.subReleased?8:0);
export function nativeChargerReplayActor(a){return actors.has(a);}
export function suppressNativeChargerReplayEvent(){return executing!==null;}
export function captureNativeChargerReplayResources(a,dt){
 const r=actors.get(a);if(!r)return;
 if(r!==executing||r.resource||dt!==r.dt)throw Error('Ambiguous native replay resource phase');
 r.resource=true;
 r.body=[a.pos.x,a.pos.y,a.pos.z,a.vel.y,a.form==='squid'?1:0];
}
export function captureNativeChargerReplayShot(system,a,shot){
 const r=actors.get(a);if(!r)return false;
 r.pending=r.pending.filter(s=>api.G.time-s.time<=1.4);
 if(r!==executing||system!==r.system||r.pending.length>=MAX_SHOTS)throw Error('Invalid native replay launch scope or backlog');
 const record=Object.freeze({...shot,frame:r.next,time:api.G.time,body:Object.freeze([a.pos.x,a.pos.y,a.pos.z]),aimYaw:a.aimYaw,aimPitch:a.aimPitch,
  aimPoint:r.aimRequested?Object.freeze(a.aimPoint.toArray()):null,aimDirection:Object.freeze(a.aimDir.toArray())});
 if(r.shots.length>=MAX_SHOTS)r.shots.shift();r.shots.push(record);r.pending.push(record);return true;
}
export function captureNativeChargerReplaySub(system,a){
 const r=actors.get(a);if(!r)return false;
 if(r!==executing||system!==r.system)throw Error('Invalid native replay sub scope');
 r.subs++;return true;
}
export function installNativeChargerReplay(context){
 if(api)return;api=context;
 const update=context.WeaponRunner.prototype.update;
 context.WeaponRunner.prototype.update=function(dt,input,...args){
  const r=actors.get(this.a);if(r&&r===executing){if(r.effective!==null)throw Error('Repeated native replay weapon phase');r.effective=effective(input);}
  return update.call(this,dt,input,...args);
 };
 const clear=context.Projectiles.prototype.clear;
 context.Projectiles.prototype.clear=function(...args){generations.set(this,(generations.get(this)||0)+1);return clear.apply(this,args);};
}
function scope(r,time,fn){
 const G=api.G;if(executing)throw Error('Reentrant native replay');
 const keys=['time','netm','projectiles','fx','audio','input','local','actors'],saved=keys.map(k=>G[k]);
 executing=r;G.time=time;G.netm=null;G.projectiles=r.system;G.fx=null;G.audio=null;G.input=null;G.local=null;G.actors=[r.actor];
 try{return fn();}finally{for(let i=0;i<keys.length;i++)G[keys[i]]=saved[i];executing=null;}
}
// The caller must supply the receiver's trusted spawn state before accepting
// owner snapshots. This function never bootstraps ink or clocks from a row.
export function createNativeChargerReplay(owner,{position,yaw=0,velocity=null,time=0,loadout=owner?.s3?.loadout,initialSpawn=false}={}){
 if(!api||owner?.weapon?.id!=='charger'||owner.weapon.kind!=='charger'||owner.weapon.catalogRecord||owner.weapon.sub!=='bomb'||!position?.isVector3||!Number.isFinite(time))return null;
 const {Actor,Projectiles,THREE,G}=api;
 class Character {
  constructor(){this.root=new THREE.Group();this.color=new THREE.Color(0xffffff);}
  _owner(){return null;}_runner(){return null;}
  trigger(){}setWeapon(){}setVisible(){}setHurt(){}update(){}
 }
 if(initialSpawn&&(G.match?.mode!=='turf'||G.match?.opts?.range))return null;
 const a=new Actor({team:owner.team,name:'native receiver replay',weapon:'charger',slot:owner.slot,isBot:owner.isBot===true,isLocal:false,CharacterClass:Character});
 const token=Object.freeze({}),system=Object.create(Projectiles.prototype),r={owner,weapon:owner.weapon,net:owner.net,life:life(owner),ownerId:owner.owner,match:G.match,generation:generations.get(G.projectiles)||0,actor:a,system,world:G.projectiles,physics:G.physics,level:G.level,next:1,time,shots:[],pending:[],subs:0,effective:null,error:null};
 // Every output method still traverses the final source wrappers; only the
 // actual birth sinks recognize this private actor and suppress world output.
 system.scene={add(){},remove(){}};system.bombs=[];system.beams=[];system.list=[];system.clouds=[];system.sights=new Map();
 actors.set(a,r);handles.set(token,r);a.weapon=owner.weapon;a.weaponId=owner.weaponId;
 a.s3||={};a.s3.loadout=loadout?.map(part=>({...part,subs:[...(part.subs||[])]}));
 a._nearCamera=()=>false;a._finishFrame=()=>{};
 scope(r,time,()=>{a.spawnAt(position,yaw);if(initialSpawn&&!api.beginInitialSquidSpawn?.(a))throw Error('Native initial spawn unavailable');});if(velocity&&!initialSpawn)a.vel.copy(velocity);
 r.initialSpawn=initialSpawn;
 return token;
}
export function advanceNativeChargerReplay(token,rows){
 const r=handles.get(token);if(!live(r))return false;
 if(!validNativeChargerInputPacket([2,[r.owner.nid,r.life,'charger',rows]])){r.error='Invalid native input schema';return false;}
 for(const row of rows){
  const clockEpsilon=Number.EPSILON*Math.max(1,Math.abs(row[2]),Math.abs(r.time))*4;
  if(row[0]!==r.next||Math.abs(row[2]-(r.time+row[1]))>clockEpsilon){r.error='Native input frame gap or clock mismatch';return false;}
  // Special earning/activation and externally owned displacement need their
  // own trusted source inputs before this driver can own those transitions.
  const initial=r.initialSpawn&&r.actor.s3?.squidSpawn?.initial===true;
  if(!initial&&(row[14]!==1||row[4]===null)||initial&&row.length!==20){r.error='Native input requires another action owner';return false;}
  const a=r.actor,i=a.intent,bits=row[3];i.fire=!!(bits&1);i.squid=!!(bits&2);i.sub=!!(bits&4);i.jump=!!(bits&8);i.special=!!(bits&16);i.move.set(row[12],0,row[13]);a.aimYaw=row[10];a.aimPitch=row[11];r.aimRequested=row.length===20;if(r.aimRequested)a.aimPoint.set(row[17],row[18],row[19]);r.effective=null;r.resource=false;r.body=null;r.dt=row[1];
  const shotCount=r.shots.length,subCount=r.subs;
  try{scope(r,row[2],()=>a.update(row[1]));}catch(error){r.shots.length=shotCount;r.pending.length=0;r.subs=subCount;r.error=String(error?.message||error);return false;}
  const body=r.body||[a.pos.x,a.pos.y,a.pos.z,a.vel.y,a.form==='squid'?1:0];
  if(Number(r.resource)!==row[14]||r.effective!==row[4]||body[4]!==row[9]||Math.hypot(body[0]-row[5],body[1]-row[6],body[2]-row[7])>1e-7||Math.abs(body[3]-row[8])>1e-7){r.shots.length=shotCount;r.pending.length=0;r.subs=subCount;r.error='Native source input/body witness mismatch';return false;}
  r.next++;r.time=row[2];
 }
 return true;
}
function live(r){return !!r&&!r.error&&r.world===api.G.projectiles&&r.physics===api.G.physics&&r.level===api.G.level&&r.match===api.G.match&&r.generation===(generations.get(r.world)||0)&&r.owner.weapon===r.weapon&&r.owner.net===r.net&&r.owner.owner===r.ownerId&&life(r.owner)===r.life&&r.owner.alive;}
export function peekNativeChargerReplayLaunch(token,{tick,charge,full}){
 const r=handles.get(token);if(!live(r)||!Number.isSafeInteger(tick)||!Number.isFinite(charge)||typeof full!=='boolean')return null;
 const shot=r.pending.find(s=>Math.round(s.time*60)===tick&&r.time-s.time<=1.4&&Math.abs(s.charge-charge)<=.000500001&&s.full===full);
 if(!shot)return null;const receipt=Object.freeze({...shot});launches.set(receipt,{r,shot,used:false});return receipt;
}
export function commitNativeChargerReplayLaunch(token,receipt){
 const r=handles.get(token),c=launches.get(receipt);if(!live(r)||!c||c.r!==r||c.used||!r.pending.includes(c.shot)||r.time-c.shot.time>1.4)return false;
 c.used=true;r.pending.splice(r.pending.indexOf(c.shot),1);return true;
}
export function nativeChargerReplayAimMatches(token,receipt,muzzle,direction){
 const r=handles.get(token),c=launches.get(receipt);
 if(!live(r)||!c||c.r!==r||c.used||!r.pending.includes(c.shot)||r.time-c.shot.time>1.4||!c.shot.aimPoint||
  ![muzzle,direction].every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)))return false;
 const V=api.THREE.Vector3,shot=c.shot;
 // Native Charger events preserve vector doubles on the wire. Evaluate the
 // actual source aim owner with the launch-time requests, including its close
 // target / rear-hemisphere fallback; do not use the actor's later aim state.
 const expected=api.Projectiles.prototype._aimFrom.call(r.system,
  {aimPoint:new V(...shot.aimPoint),aimDir:new V(...shot.aimDirection)},new V(...muzzle),new V());
 return expected.distanceToSquared(new V(...direction))<=1e-18;
}
export function nativeChargerReplayState(token){
 const r=handles.get(token);if(!r)return null;const a=r.actor,w=a.weaponRunner;
 return {next:r.next,time:r.time,error:r.error,ink:a.ink,lastFire:a.lastFire,kidT:a.kidT,form:a.form,grounded:a.grounded,charge:w.charge,chargeT:w.chargeT,charging:w.charging,kept:!!w.s3Stored,subs:r.subs,shots:r.shots.slice(),position:a.pos.toArray()};
}
export function retireNativeChargerReplay(token){const r=handles.get(token);if(r){r.error='Retired native replay';r.pending.length=0;actors.delete(r.actor);}handles.delete(token);}
