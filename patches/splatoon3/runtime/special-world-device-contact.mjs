import {gearCurve} from './gear.mjs';
import {specialDeviceFlight,stepSpecialDeviceFlight,deviceBelowWorld} from './special-device-flight.mjs';
import {inkVacAbsorbCandidate} from './kit-ink-vac.mjs';

// Only the receiver's completed native use/action receipts can reach this
// module through the catalogue bridge. A deployment is sealed once per native
// use slot, before a target claim is examined. Later land/move/active rows are
// presentation, never a replacement trajectory or damage authority.
const births=new WeakMap(),finite=Number.isFinite,FPS=60,DT=1/FPS;
const owned=new Set(['waveBreaker','splattercolorScreen','tripleInkstrike']);
const vec=v=>Array.isArray(v)&&v.length===3&&v.every(finite);
const finite3=v=>v&&[v.x,v.y,v.z].every(finite);
const life=a=>Math.max(a?.netLife||0,a?.net?.lastLife||0);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const close=(a,b,e=1e-8)=>finite(a)&&finite(b)&&Math.abs(a-b)<=e;
const birthFields=['id','action','activation','object','index','seed','pos','target','kind','phase','age','landedAt','specialPowerAP','width','height','radius','duration','waveFrame','vx','vy','vz','gravity','airResist','hp','pulse','tick'];
const signature=p=>JSON.stringify(birthFields.map(k=>p[k]??null));
// Wave and Screen publish a complete second envelope synchronously on the
// same native source frame. Canonicalize only those exact constructor pairs.
// Triple's `marker` companion omits the flight fields and is not a birth.
function canonicalBirth(payload){
 if(!owned.has(payload?.id))return null;
 if(payload.action==='deploy')return payload;
 if((payload.id==='waveBreaker'&&payload.action==='device'||payload.id==='splattercolorScreen'&&payload.action==='screen')&&payload.tick===2)
  return {...payload,action:'deploy',tick:1};
 return null;
}
function sameBirthReceipt(a,b){
 // Native _rec samples/quantizes performance time for each synchronous emit.
 // Allow one source frame of work, while keeping the original sealed time and
 // every constructor field immutable. A sibling cannot select another tick.
 return a.life===b.life&&Number.isSafeInteger(a.tick)&&a.tick===b.tick&&
  Math.abs(a.time-b.time)<=DT+.002;
}

function receiptContext(api,system,actor,receipt,use){
 const nm=receipt?.nm;
 return !!(nm&&api?.G?.netm===nm&&api.G.projectiles===system&&!nm._disposed&&actor?.remote&&
  receipt.actor===actor&&use?.actor===actor&&receipt.net===actor.net&&use.net===actor.net&&
  receipt.from===actor.owner&&use.from===actor.owner&&receipt.peer===nm.peers?.get(actor.owner)&&use.peer===receipt.peer&&
  receipt.session===nm.s&&use.session===nm.s&&receipt.match===nm.match&&use.match===nm.match&&
  nm.byNid?.get(actor.nid)===actor&&nm.s?._members?.has(actor.owner));
}

// The pose at the end of a 20 Hz packet may follow a legitimate aim change.
// First use that pose directly; otherwise recover a legal launch yaw/pitch
// from the birth velocity and the accepted movement inheritance, and reproduce
// it with the SAME source throw function. This permits a native birth heading,
// not an arbitrary speed, gravity or sender-selected terminal position.
function nativeVelocity(api,actor,id,ap,snap,payload){
 const proxy=Object.create(actor),V=api.THREE.Vector3;
 proxy.vel=new V(snap.vx,snap.vy,snap.vz);proxy.aimYaw=snap.aimYaw;proxy.aimPitch=snap.aimPitch;
 const native=specialDeviceFlight(api,proxy,id,ap),wire=new V(payload.vx,payload.vy,payload.vz);
 if(!close(payload.gravity,native.gravity)||!close(payload.airResist,native.airResist))return null;
 // Actor velocity is packed at .01; inherited vertical speed has rate 4.
 const tolerance=.08;
 if(native.vel.distanceTo(wire)<=tolerance)return {...native,vel:wire};
 const sonar=id==='waveBreaker',triple=id==='tripleInkstrike',inherit=sonar?0:1.6;
 const speed=(sonar?.3:triple?gearCurve(ap,2,2.3,2.6):gearCurve(ap,1.3,1.5,1.7))*FPS;
 const kick=(sonar?.07:triple?.276:.24)*FPS;
 const x=wire.x-snap.vx*inherit,z=wire.z-snap.vz*inherit,h=Math.hypot(x,z);
 const addY=sonar?0:Math.min(Math.max(0,snap.vy)*4,.16*FPS);
 const phi=Math.atan2(kick,speed),norm=Math.hypot(speed,kick);
 const candidates=[Math.atan2(wire.y-addY,h)-phi];
 if(h<=norm+tolerance){const angle=Math.acos(clamp(h/norm,-1,1));candidates.push(angle-phi,-angle-phi);}
 proxy.aimYaw=Math.atan2(x,z);
 for(const p of candidates){
  if(p< -1.05-.002||p>1.15+.002)continue;
  proxy.aimPitch=clamp(p,-1.05,1.15);
  if(specialDeviceFlight(api,proxy,id,ap).vel.distanceTo(wire)<=tolerance)return {...native,vel:wire};
 }
 return null;
}

/** false: invalid owned birth; true: sealed birth; null: another action. */
export function sealNativeSpecialWorldDeviceBirth({api,system,actor,payload,receipt,use}){
 const incoming=payload;payload=canonicalBirth(payload);
 if(!payload)return owned.has(incoming?.id)&&['device','screen'].includes(incoming.action)?false:null;
 if(!receiptContext(api,system,actor,receipt,use)||use.specialId!==payload.id||
  use.life!==receipt.life||receipt.life!==life(actor)||!Number.isSafeInteger(receipt.tick)||receipt.tick<0||!finite(receipt.time)||!finite(receipt.packetTime)||
  !finite(use.time)||receipt.time<use.time-.002||receipt.time-use.time>40||
  receipt.packetTime<receipt.time||receipt.packetTime-receipt.time>1.4)return false;
 const {id}=payload,snap=receipt.snapshot,ap=use.specialPowerAP;
 if(!snap||![snap.x,snap.y,snap.z,snap.vx,snap.vy,snap.vz,snap.aimYaw,snap.aimPitch].every(finite)||
  !finite(ap)||ap<0||ap>57||payload.specialPowerAP!==ap||
  !vec(payload.pos)||![payload.vx,payload.vy,payload.vz].every(finite)||
  !Number.isSafeInteger(payload.activation)||payload.activation<1||!Number.isSafeInteger(payload.seed)||payload.seed<0||payload.seed>0xffffffff||
  payload.phase!=='flight'||payload.age!==0||payload.landedAt!==-1||payload.tick!==1||payload.pulse!==0)return false;
 const triple=id==='tripleInkstrike',screen=id==='splattercolorScreen',wave=id==='waveBreaker';
 const slot=payload.index;
 if(!Number.isSafeInteger(slot)||slot<0||slot>(triple?2:0)||payload.object!==slot+1||
  payload.kind!==(triple?'marker':screen?'screen':'wave'))return false;
 // Source constructor constants and cardinality, including the initial
 // packet sent before deployWave/deployScreen adds any later state.
 if(payload.width!==(screen?15:8)||payload.height!==(screen?9:4.5)||
  payload.hp!==(wave?480:0)||!close(payload.radius,wave?Math.round(gearCurve(ap,20,24,27)*100)/100:screen?15:7.7,.000001)||
  !close(payload.duration,wave?390/FPS:screen?680/FPS:133/FPS,.00051)||
  !close(payload.waveFrame,wave?gearCurve(ap,160,192,216)/FPS:0))return false;
 const elapsed=receipt.time-use.time;
 // A native use and birth can share a coarse outer-frame timestamp. One
 // source frame is allowed at the timestamp boundary, not a full warmup skip.
 const earliest=triple?(34+slot*33)/FPS:screen?13/FPS:(use.sourceWeapon?.sub==='inkMine'?16:5)/FPS;
 if(elapsed+DT+.002<earliest||triple&&elapsed>6+DT+.002)return false;
 const at=new api.THREE.Vector3(...payload.pos),anchor=new api.THREE.Vector3(snap.x,snap.y+1.1,snap.z);
 const lag=receipt.packetTime-receipt.time,movement=Math.hypot(snap.vx,snap.vy,snap.vz);
 if(at.distanceTo(anchor)>1.5+movement*lag+.06||api.G.physics?.los&&!api.G.physics.los(anchor,at))return false;
 const flight=nativeVelocity(api,actor,id,ap,snap,payload);if(!flight)return false;
 let normal=null;
 if(screen){
  if(!vec(payload.target))return false;
  normal=new api.THREE.Vector3(...payload.target).sub(at);
  if(Math.abs(normal.y)>.011||Math.abs(normal.length()-1)>.025)return false;
  normal.y=0;normal.normalize();
 }else if(payload.target!=null)return false;
 const token=signature(payload);let slots=births.get(use);
 if(!slots){slots=new Map();births.set(use,slots);}
 const old=slots.get(slot);
 if(old)return old.signature===token&&sameBirthReceipt(old.receipt,receipt);
 // Triple's later slots cannot move earlier than the previous native throw.
 for(const [other,r]of slots)if(triple&&((slot>other&&receipt.time-r.receipt.time<(slot-other)*33/FPS-DT-.002)||
  (slot<other&&r.receipt.time-receipt.time<(other-slot)*33/FPS-DT-.002)))return false;
 slots.set(slot,{api,system,actor,receipt,use,signature:token,id,slot,ap,
  pos:at,vel:flight.vel,gravity:flight.gravity,airResist:flight.airResist,normal,
  team:actor.team,time:receipt.time,seed:payload.seed,activation:payload.activation});
 return true;
}

function localSpecialTarget(system,actor,target){
 return !!(system._s3AllSpecialObjects?.includes(target)&&!target.dead&&target.hp>0&&!target.owner?.remote&&target.owner?.team!==actor.team);
}
function area(system,actor,target,center,radius,damageAt,pierceLOS=false){
 return system.nativeSubDeviceAreaContact?.(actor,target,center,radius,damageAt,{pierceLOS})??
  system.nativeSpecialDeviceAreaContact?.(actor,target,center,radius,damageAt,{pierceLOS});
}

/** Pure source flight/contact probe: no live roster, HP, paint or gauge writes. */
export function nativeSpecialWorldDeviceContact({api,system,actor,payload,target,receipt,use,claimTime,options={},screenContact}){
 payload=canonicalBirth(payload);
 if(!payload||!finite(claimTime)||!finite3(target?.pos)||
  target.dead||target.owner?.remote||target.owner?.team===actor?.team)return null;
 const r=births.get(use)?.get(payload.index);
 if(!r||!receipt||!sameBirthReceipt(r.receipt,receipt)||r.signature!==signature(payload)||r.system!==system||r.actor!==actor||
  !receiptContext(api,system,actor,receipt,use)||actor.team!==r.team||claimTime<r.time-.002)return null;
 // A deployed device survives its owner's death/respawn, while owner, peer,
 // session, match, net object and sealed source use must remain the same.
 const age=claimTime-r.time;if(age>40)return null;
 const wave=r.id==='waveBreaker',screen=r.id==='splattercolorScreen',triple=r.id==='tripleInkstrike';
 const damage=wave?45:screen?40:37.5,cause=wave?'ShockSonar_Wave':screen?'Chimney':'TripleTornado';
 if(options.damage!==undefined&&!close(options.damage,damage,.011)||options.cause&&options.cause!==cause)return null;
 if(screen&&typeof screenContact!=='function')return null;
 const prefix=`world:${use.seq}:${r.id}:${r.slot}:`,consumed=options.consumedKeys;
 let previousScreen=-Infinity;
 if(screen)for(const key of consumed||[])if(typeof key==='string'&&key.startsWith(prefix)){
  const frame=Number(key.slice(prefix.length));if(Number.isSafeInteger(frame))previousScreen=Math.max(previousScreen,frame);
 }
 const o={id:r.id,owner:actor,team:r.team,ghost:true,pos:r.pos.clone(),vel:r.vel.clone(),gravity:r.gravity,airResist:r.airResist,
  age:0,phase:'flight',normal:r.normal?.clone(),width:15,height:9};
 if(screen){o.direction=o.normal.clone();o.tangent=new api.THREE.Vector3(o.normal.z,0,-o.normal.x);}
 const hit=new api.Hit(),from=o.pos.clone(),maxFrame=Math.min(2400,Math.floor((age+DT+.002)*FPS));
 const recent=Math.max(0,age-.15),maxRadius=wave?gearCurve(r.ap,20,24,27):7.7;
 const maxWaveFrames=wave?gearCurve(r.ap,160,192,216):0;
 let landing=r.landing||null,landed=landing?.frame??-1,best=null;
 if(landing){o.pos.copy(landing.pos);o.vel=null;o.phase=triple?'warning':'active';}
 const offer=(frame,key,amount)=>{
  if(!(amount>0)||frame/FPS<recent)return;
  best={damage:amount,projectile:actor,cause,contactKey:key};
 };
 try{
  for(let frame=landing?landing.frame+1:1;frame<=maxFrame;frame++){
   o.age=frame/FPS;
   if(o.phase==='flight'){
    from.copy(o.pos);const contact=stepSpecialDeviceFlight(api,o,DT,hit,from);
    if(!finite3(o.pos)||!finite3(o.vel))return null;
    if(wave||screen)for(const absorber of api.G.actors||[])
     if(inkVacAbsorbCandidate(absorber,from,o.pos,o))return null;
    if(deviceBelowWorld(api,o))return null;
    if(!contact)continue;
    if(!finite3(contact.point)||!finite3(contact.normal))return null;
    if(wave&&contact.normal.y<=.5){const vn=o.vel.dot(contact.normal);if(vn<0)o.vel.addScaledVector(contact.normal,-vn);o.pos.addScaledVector(contact.normal,.08);continue;}
    landed=frame;o.vel=null;o.pos.addScaledVector(contact.normal,.08);o.phase=triple?'warning':'active';
    landing={frame,pos:o.pos.clone()};continue;
   }
   const deviceFrame=frame-landed;
   if(wave){
    for(let pulse=0;pulse<3;pulse++){
     const sourceFrame=deviceFrame-[90,240,390][pulse];
     if(sourceFrame<=0||sourceFrame>Math.ceil(maxWaveFrames))continue;
     const key=prefix+pulse;
     const radius=maxRadius*clamp(sourceFrame/maxWaveFrames,0,1),previous=maxRadius*clamp((sourceFrame-1)/maxWaveFrames,0,1);
     let amount;
     if(localSpecialTarget(system,actor,target)){
      const d=Math.hypot(target.pos.x-o.pos.x,target.pos.z-o.pos.z),rr=target.collisionRadius||.72;
      amount=d+rr<previous||d-rr>radius||api.G.physics?.los&&!api.G.physics.los(o.pos,target.pos)?0:45;
     }else amount=system.nativeSubDeviceAreaContact?.(actor,target,o.pos,radius,(d,object)=>{
      const rr=object.collisionRadius||.72;return d+rr<previous||d-rr>radius?0:45;
     });
     offer(frame,key,amount);
    }
    if(deviceFrame>=390+Math.ceil(maxWaveFrames))break;
   }else if(triple){
    const active=deviceFrame-82;
    if(active<0||active%5!==0)continue;
    if(active>50)break;
    const radius=.5+(7.7-.5)*clamp(active/50,0,1);
    const inside=pos=>Math.hypot(pos.x-o.pos.x,pos.z-o.pos.z)<=radius&&pos.y-o.pos.y>=-10&&pos.y-o.pos.y<=20;
    const amount=localSpecialTarget(system,actor,target)?(inside(target.pos)?37.5:0):
     area(system,actor,target,o.pos,Math.hypot(radius,20),(_d,object)=>inside(object.pos)?37.5:0,true);
    offer(frame,prefix+(active/5),amount);
   }else{
    from.copy(o.pos);const deviceAge=deviceFrame/FPS,runEnd=1+560/FPS;
    const moving=Math.max(0,Math.min(deviceAge,runEnd)-Math.max(deviceAge-DT,1));
    if(moving>0)o.pos.addScaledVector(o.direction,gearCurve(r.ap,.04,.053,.06)*FPS*moving);
    if(frame-previousScreen>=60&&frame/FPS>=recent){
     const intersects=()=>screenContact(o,from,o.pos,target)?40:0;
     const amount=localSpecialTarget(system,actor,target)?intersects():
      area(system,actor,target,from.clone().lerp(o.pos,.5),15/2+3,intersects,true);
     offer(frame,prefix+frame,amount);
    }
    if(deviceFrame>=680)break;
   }
  }
 }catch{return null;}
 // A duplicate current claim cannot fall back to spending an older missed
 // tick. Reordered genuine claims retain their own native timestamp/key.
 if(!best||!landing||consumed?.has(best.contactKey))return null;
 return {...best,commit(){
  if(!receiptContext(api,system,actor,receipt,use)||actor.team!==r.team)return false;
  // A later claim must not fly through a blocker which disappeared after the
  // first accepted contact. Reject racing probes with a different endpoint.
  if(r.landing)return r.landing.frame===landing.frame&&r.landing.pos.equals(landing.pos);
  r.landing={frame:landing.frame,pos:landing.pos.clone()};return true;
 }};
}
