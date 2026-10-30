import {gearCurve} from './gear.mjs';
import {wailSpeakerOrigin} from './wail-speakers.mjs';
import {nativeInkVacObjectContact} from './kit-ink-vac.mjs';
const finite=Number.isFinite,life=a=>Math.max(a?.netLife||0,a?.net?.lastLife||0);
const vec=(V,a)=>Array.isArray(a)&&a.length===3&&a.every(finite)?new V(...a):null;
function atSnapshot(V,actor,s){
 const a=Object.create(actor);a.pos=new V(s.x,s.y,s.z);a.vel=new V(s.vx||0,s.vy||0,s.vz||0);a.aimYaw=s.aimYaw;a.aimPitch=s.aimPitch;
 a.aimDir=new V(Math.sin(s.aimYaw)*Math.cos(s.aimPitch),Math.sin(s.aimPitch),Math.cos(s.aimYaw)*Math.cos(s.aimPitch));
 a.aimPoint=a.pos.clone().addScaledVector(a.aimDir,1000);return a;
}
function nearPose(point,receipt,height=0){
 const s=receipt.snapshot,lag=Math.max(0,receipt.packetTime-receipt.time),slack=.04+Math.hypot(s.vx||0,s.vy||0,s.vz||0)*lag;
 return Math.hypot(point.x-s.x,point.y-s.y-height,point.z-s.z)<=slack;
}
const frame=(receipt,use)=>Number.isSafeInteger(receipt.tick)&&Number.isSafeInteger(use.tick)?receipt.tick-use.tick:Math.round((receipt.time-use.time)*60);
function area(system,attack,target,center,radius,fn,options){return system.nativeSubDeviceAreaContact?.(attack,target,center,radius,fn,options)??system.nativeSpecialDeviceAreaContact?.(attack,target,center,radius,fn,options);}
function result(actor,damage,cause,key){return damage>0?{projectile:actor,damage,cause,contactKey:key}:null;}
function sourceRows(options,id,action){return (options.actions||[]).filter(r=>r.payload.id===id&&r.payload.action===action);}
function targetKnownAt(api,nid,targetLife){const a=api.G.netm?.byNid?.get(nid);return a?.alive&&life(a)===targetLife?a:null;}
function knownTargetSamples(api,target){
 const samples=[target.pos];
 for(const p of target.net?.buf||[])if([p.x,p.y,p.z].every(finite))samples.push(p);
 const history=api.G.netm?._combatProvenance?.history?.get(target);
 if(history)for(let i=0;i<history.n;i++){const index=((history.i+history.buf.length/4-history.n+i)%(history.buf.length/4))*4;samples.push({x:history.buf[index+1],y:history.buf[index+2],z:history.buf[index+3]});}
 return samples;
}
export function nativeSpecialActionDeviceContact({api,system,actor,payload:p,target,receipt,use,claimTime,options={},source}){
 const V=api.THREE.Vector3,id=p.id,ap=use.specialPowerAP??actor.s3?.abilityPoints?.specialPower??0;
 if(!finite(claimTime)||claimTime+.002<receipt.time||receipt.time+.002<use.time)return null;
 const instant=p.action==='swing'||p.action==='jumpSwing'||p.action==='hookImpact'||p.action==='laser'||p.action==='impact';
 if(instant&&options.receipt?.tick!==receipt.tick)return null;
 const pos=vec(V,p.pos);if(!pos)return null;
 const key='special:'+use.seq+':'+id+':'+p.action+':'+(p.index||0),age=frame(receipt,use);
 if(id==='tripleSplashdown')return system.nativeSpecialSplashdownDeviceContact?.(actor,p,target,receipt,use,claimTime,options)||null;
 if(id==='ultraStamp'&&(p.action==='swing'||p.action==='jumpSwing')){
  const jump=p.action==='jumpSwing',center=vec(V,p.target),height=jump?1.45:.65,length=jump?1.5:1.25;
  if(!center||!nearPose(pos,receipt)||!Number.isSafeInteger(p.index)||p.index<0||p.index>80||age<(jump?7:45)||age>600)return null;
  const offset=center.clone().sub(pos);offset.y-=height;if(Math.abs(offset.length()-length)>.025)return null;
  // The native aim may change after this source frame and before the snapshot;
  // bind its one source-length offset to the admitted body, then query local geometry.
  const prior=sourceRows(options,id,p.action).filter(r=>r.payload.index<p.index);
  if(prior.some(r=>receipt.tick-r.receipt.tick<7))return null;
  return result(actor,area(system,actor,target,center,4,()=>40),'UltraStamp_Swing',key);
 }
 if(id==='reefslider'&&p.action==='impact'){
  if(age<75||age>600||!nearPose(pos,receipt,.08))return null;
  const center=new V(receipt.snapshot.x,receipt.snapshot.y,receipt.snapshot.z),desc=source.description(id,ap);
  return result(actor,area(system,actor,target,center,desc.radius,d=>desc.splashBands.find(([r])=>d<=r)?.[1]||0),'Skewer','special:'+use.seq+':reef-impact');
 }
 if(id==='zipcaster'&&p.action==='hookImpact'){
  if(!nearPose(pos,receipt)||!Number.isSafeInteger(p.index)||p.index<1||p.index>40)return null;
  const zip=sourceRows(options,id,'zip').findLast(r=>r.receipt.time<=receipt.time&&vec(V,r.payload.target)?.distanceTo(pos)<.03);
  if(!zip)return null;
  const origin=vec(V,zip.payload.pos),to=vec(V,zip.payload.target);if(!origin||!to||!nearPose(origin,zip.receipt))return null;
  const chest=origin.clone();chest.y+=1.05;const direction=to.clone().sub(chest),distance=direction.length();if(!(distance>0)||distance>35.03)return null;
  const hit=api.G.physics?.raycast?.(chest,direction.multiplyScalar(1/distance),distance+.04,api.Hit?new api.Hit():{hit:false,point:new V(),normal:new V(),dist:0},true);
  if(!hit?.hit||hit.point.distanceTo(to)>.04||hit.normal?.y>.5&&distance<3-.03)return null;
  const flight=origin.distanceTo(to),minFrames=(flight/(3.36*60)+Math.min(Math.max(0,flight-.7)/19,1.35))*60;
  if(receipt.tick-zip.receipt.tick+2<minFrames)return null;
  const desc=source.description(id,ap);
  return result(actor,area(system,actor,target,to,desc.radius,d=>desc.splashBands.find(([r])=>d<=r)?.[1]||0),'SuperHook',key);
 }
 if(id==='killerWail'&&p.action==='laser'){
  if(!Number.isSafeInteger(p.index)||p.index<0||p.index>5||!Number.isSafeInteger(p.tick)||p.tick<0||p.tick>=Math.ceil(gearCurve(ap,180,220,240)/5))return null;
  const lock=sourceRows(options,id,'target').find(r=>r.payload.index===Math.floor(p.index/2));if(!lock)return null;
  const nativeActor=atSnapshot(V,actor,lock.receipt.snapshot),anchor=vec(V,lock.payload.pos);if(!anchor||!nearPose(anchor,lock.receipt))return null;
  // Pair origins are fixed once at native lock, even while the owner moves.
  nativeActor.pos.copy(anchor);const origin=wailSpeakerOrigin(api.THREE,nativeActor,p.index),end=vec(V,p.target);
  if(!end||origin.distanceTo(pos)>.04||Math.abs(end.distanceTo(origin)-1000)>.03)return null;
  const expectedTick=lock.receipt.tick+p.tick*5;if(Math.abs(receipt.tick-expectedTick)>2)return null;
  const named=targetKnownAt(api,lock.payload.targetNid,lock.payload.targetLife),direction=end.clone().sub(origin).normalize();
  let aligned=false;
  if(named&&named.team!==actor.team){
   for(const sample of knownTargetSamples(api,named)){const v=new V(sample.x,sample.y+.75,sample.z).sub(origin),d=v.length();if(d>0&&v.multiplyScalar(1/d).distanceTo(direction)<=Math.min(.15,1.5/d)){aligned=true;break;}}
  }else if(lock.payload.targetNid===-1){const to=vec(V,lock.payload.target);if(to){const d=to.sub(anchor).normalize();aligned=d.distanceTo(direction)<.025;}}
  if(!aligned||!source.beamContact(origin,end,target))return null;
  const isSub=system._s3SubObjects?.includes(target)||system.isNativeSprinklerDeviceTarget?.(target),isSpecial=system._s3AllSpecialObjects?.includes(target);
  if(!isSub&&!isSpecial||target.dead||target.ghost||target.owner?.remote||target.owner?.team===actor.team)return null;
  return result(actor,3.5,'MicroLaser','special:'+use.seq+':wail:'+p.index+':'+p.tick);
 }
 if(id==='superChump'&&p.action==='deploy'&&p.kind==='decoy'){
  // Simultaneous native decoys can share the same damage band and target.
  // A fresh proposal sequence must not spend a different unused decoy slot.
  // These labels only select an already-admitted paid-use birth; the native
  // constructor, landing geometry and source frame are still required below.
  const claim=options.payload;
  if(!claim||claim.sourceSpecial!==id||claim.sourceActivation!==p.activation||claim.sourceObject!==p.object||claim.sourceIndex!==p.index||claim.sourceSeed!==p.seed)return null;
  if(!Number.isSafeInteger(p.index)||p.index<0||p.index>=12||p.object!==p.index+1||p.tick!==1||!nearPose(pos,receipt,1.2)||p.age!==0||Math.abs(p.duration-318/60)>.001)return null;
  const plan=sourceRows(options,id,'target').find(r=>r.payload.count===12);if(!plan)return null;
  const origin=vec(V,plan.payload.pos),center=vec(V,plan.payload.target);if(!origin||!center||!nearPose(origin,plan.receipt)||origin.distanceTo(pos.clone().add(new V(0,-1.2,0)))>.05)return null;
  const distance=Math.hypot(center.x-origin.x,center.z-origin.z);if(distance<17.97||distance>35.03||source.ground(center).distanceTo(center)>.03)return null;
  const nativeActor=atSnapshot(V,actor,plan.receipt.snapshot);nativeActor.pos.copy(origin);
  const locations=source.chumpPositions(nativeActor,{seed:plan.payload.seed},center),at=locations[p.index],wire=vec(V,p.target);
  if(!wire||!at||wire.distanceTo(at)>.04)return null;
  // Birth is advanced by the world owner on its publication source tick.
  // One adjacent frame covers outer-step boundaries; an old explosion cannot
  // be reused minutes later against a newly arrived local device.
  if(!Number.isSafeInteger(options.receipt?.tick)||Math.abs(options.receipt.tick-receipt.tick-317)>1)return null;
  const desc=source.description(id,ap);
  return result(actor,area(system,actor,target,at,desc.radius,d=>desc.splashBands.find(([r])=>d<=r)?.[1]||0),'Bomb','special:'+use.seq+':chump:'+p.index);
 }
 return null;
}
export function nativeSpecialPassiveDeviceContact({api,system,actor,target,use,claimTime,options,source}){
 const receipt=options.receipt;if(!receipt||receipt.life!==use.life||receipt.actor!==actor)return null;
 const s=receipt.snapshot,id=use.specialId,V=api.THREE.Vector3,age=frame(receipt,use),nativeActor=atSnapshot(V,actor,s);
 if(!(s.f&8192)||!(s.f&1)||age<0)return null;
 const frameKey='special:'+use.seq+':'+id+':frame:'+receipt.tick;
 if(options.consumedKeys?.has(frameKey))return null;
 if(id==='inkVac'&&(s.f&4096)&&!(s.f&2)&&age>=30&&age<=390){
  const inhaleFrames=Math.max(0,age-30);
  const center=nativeActor.pos.clone();center.y+=1;
  const amount=area(system,nativeActor,target,center,Math.hypot(15,4.3),(_d,o)=>nativeInkVacObjectContact(nativeActor,o,inhaleFrames,use.specialPower||0)?2:0);
  return result(actor,amount,'BlowerInhale',frameKey);
 }
 if(id==='inkjet'&&!(s.f&2)&&age<=Math.ceil(gearCurve(use.specialPowerAP||0,450,480,510))){
  const center=nativeActor.pos.clone();center.y-=1.1;
  const amount=area(system,nativeActor,target,center,2,(_d,o)=>source.inkjetExhaust(nativeActor,s.y-2.4,s.y+.2,o));
  return result(actor,amount,'Jetpack_Jet',frameKey);
 }
 if(id==='crabTank'&&age<=Math.ceil(gearCurve(use.specialPowerAP||0,480,570,660))){
  const roll=sourceRows(options,id,'roll').findLast(r=>r.receipt.time<=claimTime);if(!roll?.payload.rolling||age<12)return null;
  const prefix='special:'+use.seq+':crab-body:';
  for(const key of options.consumedKeys||[])if(key.startsWith(prefix)&&receipt.tick-Number(key.slice(prefix.length))<27)return null;
  const center=nativeActor.pos.clone();center.y+=.75;
  return result(actor,area(system,nativeActor,target,center,1.45,()=>40),'Chariot_Body',prefix+receipt.tick);
 }
 if(id==='krakenRoyale'&&age>=59&&age<=Math.ceil(gearCurve(use.specialPowerAP||0,480,540,600))+1){
  const jump=sourceRows(options,id,'jump').findLast(r=>r.receipt.time<=claimTime);
  if(!jump||receipt.tick-jump.receipt.tick>120||!Number.isSafeInteger(jump.payload.index)||jump.payload.index<0)return null;
  const end=[...sourceRows(options,id,'jumpEnd'),...(options.futureActions||[]).filter(r=>r.payload.id===id&&r.payload.action==='jumpEnd')]
    .find(r=>r.payload.index===jump.payload.index&&r.receipt.tick>=jump.receipt.tick);
  if(end&&receipt.tick>end.receipt.tick||s.f&16&&(!end||end.receipt.packetTime!==receipt.packetTime||receipt.tick>end.receipt.tick))return null;
  const center=nativeActor.pos.clone();center.y+=.65;
  return result(actor,area(system,nativeActor,target,center,2.65,()=>60),'Castle',frameKey);
 }
 return null;
}
