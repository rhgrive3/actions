import { SPRINKLER } from './kit-sprinkler.mjs';
import { objectGearRate, objectShredderEquipped, withObjectHitGear } from './object-gear.mjs';
const installed=Symbol.for('inkwave.native-sprinkler-damage.v1');
const safe=n=>Number.isSafeInteger(n)&&n>=0;
const life=a=>Math.max(safe(a?.netLife)?a.netLife:0,safe(a?.net?.lastLife)?a.net.lastLife:0);
const epoch=nm=>typeof nm?.cfg?.id==='string'?nm.cfg.id:'';
const spec=b=>b?.s3Resolved?.spec||b?.s3GhostResolved?.spec;
const sprinkler=b=>spec(b)?.id==='sprinkler';
const counters=new WeakMap(),seen=new WeakMap();
const next=nm=>{const n=Math.max(counters.get(nm)||0,nm._eventSeq||0,nm.s?._inkwaveEventSeq||0)+1;counters.set(nm,n);return n;};
function initialize(b){if(!Number.isFinite(b.s3DeviceHP))b.s3DeviceHP=SPRINKLER.hp;return b.s3DeviceHP;}
function birth(b,nm,seq){
 if(!sprinkler(b)||!safe(seq)||seq<1||!safe(b.owner?.nid)||!epoch(nm))return;
 b.s3DeviceBirth={match:epoch(nm),owner:b.owner.owner,nid:b.owner.nid,life:life(b.owner),seq};initialize(b);
}
function sameBirth(b,e,nm){const p=b?.s3DeviceBirth;return !!p&&p.match===epoch(nm)&&p.match===e.match&&p.owner===b.owner?.owner&&nm.byNid?.get(p.nid)===b.owner&&p.nid===b.owner.nid&&p.nid===e.targetOwnerId&&p.life===e.targetLife&&p.seq===e.targetSeq;}
function emitState(api,b){
 const p=b.s3DeviceBirth,a=b.owner,nm=api.G.netm;
 if(!p||!a||a.remote||!sameBirth(b,{...p,targetOwnerId:p.nid,targetLife:p.life,targetSeq:p.seq},nm))return;
 api.emit?.('all:sub',{v:1,phase:'nativeObjectState',subId:'sprinkler',actor:a,life:life(a),eventSeq:next(nm),
  match:p.match,targetOwnerId:p.nid,targetLife:p.life,targetSeq:p.seq,hp:b.s3DeviceHP,destroyed:b.s3Destroyed===true});
}
function damage(api,b,amount,attacker,identity){
 if(!sprinkler(b)||b.ghost||b.owner?.remote||b.s3Destroyed||!Number.isFinite(amount)||amount<=0||amount>2200)return false;
 const rate=identity===undefined?objectGearRate(attacker,'sprinkler'):withObjectHitGear(attacker,identity,()=>objectGearRate(attacker,'sprinkler'));
 b.s3DeviceHP=Math.max(0,initialize(b)-amount*rate);if(b.s3DeviceHP===0)b.s3Destroyed=true;emitState(api,b);return true;
}
function proposal(api,b,p,point,amount=p.damage){
 const a=p.owner,nm=api.G.netm,proof=b.s3DeviceBirth;
 if(!proof||!a||a.remote||p.ghost||a.owner!==nm?.myId||proof.match!==epoch(nm)||!safe(a.nid))return false;
 api.emit?.('all:sub',{v:1,phase:'nativeObjectHit',subId:'sprinkler',actor:a,life:life(a),eventSeq:next(nm),
  match:proof.match,targetOwnerId:proof.nid,targetLife:proof.life,targetSeq:proof.seq,
  damage:amount,objectShredder:objectShredderEquipped(a),x:point.x,y:point.y,z:point.z});return true;
}
function admitOnce(nm,actor,event){
 if(!safe(event.eventSeq)||event.eventSeq<1||event.match!==epoch(nm))return false;
 let state=seen.get(nm);if(!state||state.match!==event.match){state={match:event.match,actors:new Map()};seen.set(nm,state);}
 const key=JSON.stringify([actor.owner,actor.nid]),previous=state.actors.get(key);
 if(previous&&(event.life<previous.life||event.life===previous.life&&event.eventSeq<=previous.seq))return false;
 if(!previous&&state.actors.size>=4096)return false; // fail closed; never evict replay protection
 // The transport is ordered. Retain a high-water mark rather than evicting
 // old ids: a new envelope must never revive an already-applied hit payload.
 state.actors.set(key,{life:event.life,seq:event.eventSeq});return true;
}
// Called only after catalogue transport resolves the accepted sender Actor and
// checks its owner and life. Target authority and native birth are checked again.
export function replayNativeSprinklerDamage(api,event){
 const nm=api.G.netm,a=event.actor;
 if(!nm||!a?.remote||nm.byNid?.get(a.nid)!==a||life(a)!==event.life||event.subId!=='sprinkler'||!safe(event.targetSeq)||event.targetSeq<1)return false;
 const b=(api.G.projectiles?.bombs||[]).find(b=>sprinkler(b)&&sameBirth(b,event,nm));if(!b)return false;
 if(event.phase==='nativeObjectHit'){
  if(b.owner.remote||b.ghost||b.owner.owner!==nm.myId||a.team===b.team||!Number.isFinite(event.damage)||event.damage<=0||event.damage>2200
    ||![event.x,event.y,event.z].every(Number.isFinite)||Math.hypot(event.x-b.pos.x,event.y-b.pos.y,event.z-b.pos.z)>1.5)return false;
  if(!admitOnce(nm,a,event))return false;return damage(api,b,event.damage,a,event.objectShredder===true);
 }
 if(event.phase==='nativeObjectState'){
  if(!b.ghost||b.owner!==a||!Number.isFinite(event.hp)||event.hp<0||event.hp>SPRINKLER.hp||event.destroyed!==(event.hp===0))return false;
  if(!admitOnce(nm,a,event))return false;
  // Accepted owner updates cannot resurrect a retired device or heal damage.
  b.s3DeviceHP=Math.min(initialize(b),event.hp);if(event.destroyed)b.s3Destroyed=true;return true;
 }
 return false;
}
export function installNativeSprinklerDamage(api){
 const {NetMatch,Projectiles,G}=api;if(Projectiles.prototype[installed])return;
 Object.defineProperty(Projectiles.prototype,installed,{value:true});
 const record=NetMatch.prototype.recBomb;
 NetMatch.prototype.recBomb=function(b,...args){
  if(!sprinkler(b)||b.ghost||b.owner?.remote)return record.call(this,b,...args);
  const rec=this._rec;this._rec=function(payload){const e=rec.call(this,payload);if(payload?.[0]==='b'&&payload[1]===b.owner.nid)birth(b,this,e?._netSeq);return e;};
  try{return record.call(this,b,...args);}finally{this._rec=rec;}
 };
 const play=NetMatch.prototype._play;
 NetMatch.prototype._play=function(from,event){
  if(event?.[1]!=='b')return play.call(this,from,event);
  const before=new Set(G.projectiles?.bombs||[]),result=play.call(this,from,event);
  const a=this.byNid?.get(event[2]);
  if(a?.remote&&a.owner===from)for(const b of G.projectiles?.bombs||[])if(!before.has(b)&&b.owner===a&&b.ghost&&sprinkler(b))birth(b,this,event._netSeq);
  return result;
 };
 const candidate=Projectiles.prototype.kitBarrierCandidate;
 Projectiles.prototype.kitBarrierCandidate=function(p,start,end){
  return this.nativeSprinklerCandidate(p,start,end,candidate?.call(this,p,start,end));
 };
 // Profile-guided heads query this device lane alongside their native terrain,
 // actor and ranked-shield contacts, without changing other kit barriers.
 Projectiles.prototype.nativeSprinklerCandidate=function(p,start,end,best=null){
  if(!p||!start||!end||!this.bombs?.length)return best;
  const d=end.clone().sub(start),length=d.length();if(!(length>1e-8))return best;
  for(const b of this.bombs||[]){
   if(!sprinkler(b)||b.s3Mode!=='sprinkling'||b.s3Destroyed||b.owner===p.owner||b.team===p.team)continue;
   // Physical hitbox is INKWAVE calibration, separate from the existing 120-HP profile.
   const radius=.42+Math.max(0,p.size||0),m=start.clone().sub(b.pos),c=m.lengthSq()-radius*radius,dot=m.dot(d),disc=dot*dot-length*length*c;
   if(c>0&&disc<0)continue;const t=c<=0?0:(-dot-Math.sqrt(disc))/(length*length);
   if(t<0||t>1||best&&best.distance<=t*length)continue;const point=start.clone().addScaledVector(d,t);
   let settled=false;best={distance:t*length,point,normal:point.clone().sub(b.pos).normalize(),kind:'native-sprinkler',onHit:(actualDamage)=>{
    const amount=Number.isFinite(actualDamage)?actualDamage:p.damage;
    if(settled||p.ghost||!p.owner||p.owner.remote||!Number.isFinite(amount)||amount<=0||amount>2200)return false;settled=true;
    return b.ghost||b.owner?.remote?proposal(api,b,p,point,amount):damage(api,b,amount,p.owner);
   }};
  }
  return best;
 };
}
