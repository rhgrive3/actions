// Receiver-owned native motion and terrain, not a ray to the crab's centre.
// No client path/visibility field can populate this store. Native birth
// decoding remains independent of the cosmetic ghost allocation budget.
import { NETWORK_BOSS_CRABLET_SCENE_LIMIT } from './snapshot-guard.mjs';

const AGE=3.5, HISTORY_AGE=1.2, HISTORY_SIZE=64, SPACING=1/40, MAX_BIRTHS=160;
const DIRECT=new Set(['shooter','dualies','splatling','charger']);
const finite=Number.isFinite, now=()=>performance.now()/1000;
const family=a=>a?.weapon?.catalogRecord?.family||a?.weapon?.behaviorKind||a?.weapon?.kind;
const weapon=a=>a?.weapon?.catalogRecord?.id||a?.weapon?.id;
export const crabletProofKey=(id,time,source,cause,origin,projectileId)=>
  Number.isSafeInteger(projectileId)&&projectileId>0
    ?[id,'projectile-main',cause,projectileId].join(':')
    :[id,time,source,'main',cause,...origin.map(n=>Math.round(n*10))].join(':');

function store(nm,t) {
  const boss=nm.match?.boss;
  let s=nm._crabletTrajectories;
  if(!s||s.boss!==boss||s.match!==nm.match||s.id!==nm.cfg?.id)
    s=nm._crabletTrajectories={boss,match:nm.match,id:nm.cfg?.id,births:new Map(),history:new Map()};
  for(const [peer,rows] of s.births){
    for(const [key,b] of rows)if(t-b.at<0||t-b.at>AGE)rows.delete(key);
    if(!rows.size)s.births.delete(peer);
  }
  return s;
}

export function sampleCrabletHistory(nm,t=now()) {
  const boss=nm.match?.boss;
  if(!nm.isHost||!boss?.sim||!boss.crabs)return;
  const s=store(nm,t);
  for(const c of s.history.keys())if(c.dead||boss.crabs.get(c.id)!==c)s.history.delete(c);
  for(const c of boss.crabs.values()){
    if(c.dead||![c.x,c.y,c.z].every(finite))continue;
    let ring=s.history.get(c);
    if(!ring){
      if(s.history.size>=NETWORK_BOSS_CRABLET_SCENE_LIMIT)continue;
      ring={buf:new Float64Array(HISTORY_SIZE*4),i:0,n:0};s.history.set(c,ring);
    }
    const last=ring.n?ring.buf[((ring.i+HISTORY_SIZE-1)%HISTORY_SIZE)*4]:-Infinity;
    if(t>=last&&t-last<SPACING)continue;
    const o=ring.i*4;ring.buf[o]=t;ring.buf[o+1]=c.x;ring.buf[o+2]=c.y;ring.buf[o+3]=c.z;
    ring.i=(ring.i+1)%HISTORY_SIZE;ring.n=Math.min(HISTORY_SIZE,ring.n+1);
  }
}

export function recordCrabletBirth(nm,from,event,t=now()) {
  const system=nm._combatCrabletSystem,actor=nm.byNid?.get(event?.[2]);
  if(!nm.isHost||!nm.match?.boss?.sim||event?.[1]!=='p'||!DIRECT.has(family(actor))||
    actor?.owner!==from||!actor.remote||actor.alive===false||
    typeof system?.makeCrabletCombatProbe!=='function')return;
  const cause=weapon(actor),wire=event[4];
  if(wire&&wire!==cause&&wire!==actor.weapon.id)return;
  let probe;
  try{probe=system.makeCrabletCombatProbe(actor,event);}catch{return;}
  if(!probe)return;
  const origin=event.slice(5,8);
  if(origin.length!==3||!origin.every(finite))return;
  const s=store(nm,t),key=crabletProofKey(actor.nid,event[0],'p',cause,origin,probe.combatProjectileId);
  let rows=s.births.get(from);if(!rows){rows=new Map();s.births.set(from,rows);}
  // Replay cannot replace an accepted birth's immutable motion inputs.
  if(rows.has(key))return;
  while(rows.size>=MAX_BIRTHS)rows.delete(rows.keys().next().value);
  rows.set(key,{actor,life:Math.max(actor.netLife??0,actor.net?.lastLife??0),at:t,system,probe,path:null});
}

function nativePath(birth) {
  if(birth.path!==null)return birth.path;
  const p=birth.probe,system=birth.system,path=[];
  if(!p||!finite(p.life)||p.life<=0||typeof system.stepCrabletCombatProbe!=='function')return birth.path=false;
  try{
    // Existing proofs expire at 3.5 s. Never replay a longer owner lifetime.
    for(let i=0;i<210&&p.age+1e-9<Math.min(p.life,AGE);i++){
      const radii=system.stepCrabletCombatProbe(p);
      if(!radii||![p.prev.x,p.prev.y,p.prev.z,p.pos.x,p.pos.y,p.pos.z,
        radii.field0,radii.field1,radii.pad].every(finite)||
        Math.min(radii.field0,radii.field1,radii.pad)<0||
        Math.max(radii.field0,radii.field1,radii.pad)>10)throw Error('Invalid native trace');
      path.push([p.prev.x,p.prev.y,p.prev.z,p.pos.x,p.pos.y,p.pos.z,radii.field0,radii.field1,radii.pad]);
      if(radii.done||(p.catalog&&p.catalog.travel+1e-9>=p.catalog.range))break;
    }
    birth.path=path.length?path:false;
  }catch{birth.path=false;}
  birth.probe=null;
  return birth.path;
}

// Native Boss._segCrabs reports the closest point on each fixed-step segment
// inside its sphere (not the analytic sphere-entry point). Keep its terrain
// ordering and pad, with the endpoint on the actual projectile segment.
function entry(row,x,y,z) {
  const ox=row[0]-x,oy=row[1]-(y+.35),oz=row[2]-z;
  const dx=row[3]-row[0],dy=row[4]-row[1],dz=row[5]-row[2],r=.55+row[8];
  const length=dx*dx+dy*dy+dz*dz||1e-9;
  const t=Math.max(0,Math.min(1,-(ox*dx+oy*dy+oz*dz)/length));
  const px=ox+dx*t,py=oy+dy*t,pz=oz+dz*t;
  return px*px+py*py+pz*pz<=r*r?t:null;
}

export function crabletTrajectoryVisible(nm,proof,crab,t=now()) {
  const system=nm._combatCrabletSystem,physics=nm._combatProvenancePhysics;
  const V=nm._combatProvenanceTHREE?.Vector3;
  if(!physics?.los||!V)return true;
  const s=store(nm,t),native=!!system;
  let path,birth;
  if(native&&proof.src==='p'){
    birth=s.births.get(nm.byNid.get(proof.actor)?.owner)?.get(proof.key);
    if(!birth||birth.actor!==nm.byNid.get(proof.actor)||
      birth.life!==Math.max(birth.actor.netLife??0,birth.actor.net?.lastLife??0)||birth.system!==system)return false;
    path=nativePath(birth);if(!path)return false;
  }else{
    // Native legacy Charger's actual finite flight. Catalogued Charger's actual
    // projectile birth owns its radius/flight, not its nominal cosmetic event.
    if(native&&(proof.src!=='ev'||family(nm.byNid.get(proof.actor))!=='charger'||
      (nm.byNid.get(proof.actor)?.weapon?.catalogRecord&&!nm.byNid.get(proof.actor).weapon.catalogRecord.legacy)))return false;
    if(native){
      const actor=nm.byNid.get(proof.actor);
      if(proof.fireLife!==Math.max(actor.netLife??0,actor.net?.lastLife??0))return false;
      path=system.makeCrabletChargerPath?.(proof);
      if(!path?.length)return false;
    }else{
      const n=finite(proof.beamLength)?Math.min(proof.reach+8,proof.beamLength):proof.reach+8;
      path=[[...proof.origin,...proof.origin.map((v,i)=>v+proof.unit[i]*n),0,0,0]];
    }
  }
  const scratch=nm._crabletTraceScratch||(nm._crabletTraceScratch={from:new V(),to:new V(),hit:{}});
  const ring=s.history.get(crab);
  // Find the first possible crab contact before querying terrain. Off-path
  // claims must not trigger an entire lifetime of world sweeps.
  let contactIndex=-1,contactFraction=null;
  for(let i=0;i<path.length;i++){
    const row=path[i];
    let contact=entry(row,crab.x,crab.y,crab.z);
    // Only receiver-sampled positions of this same live crab object count.
    // No claimed target position or a previous crab with a recycled ID enters.
    if(ring)for(let k=1;k<=ring.n;k++){
      const o=((ring.i-k+HISTORY_SIZE*2)%HISTORY_SIZE)*4,age=t-ring.buf[o];
      if(age<0||age>HISTORY_AGE)continue;
      const old=entry(row,ring.buf[o+1],ring.buf[o+2],ring.buf[o+3]);
      if(old!==null&&(contact===null||old<contact))contact=old;
    }
    if(contact===null)continue;
    const x=row[0]+(row[3]-row[0])*contact-proof.origin[0],
      y=row[1]+(row[4]-row[1])*contact-proof.origin[1],
      z=row[2]+(row[5]-row[2])*contact-proof.origin[2];
    const along=x*proof.unit[0]+y*proof.unit[1]+z*proof.unit[2];
    if(along>=-2&&along<=proof.reach+8){contactIndex=i;contactFraction=contact;break;}
  }
  if(contactIndex<0)return false;
  for(let i=0;i<=contactIndex;i++){
    const row=path[i],contact=i===contactIndex?contactFraction:null;
    scratch.from.set(row[0],row[1],row[2]);scratch.to.set(row[3],row[4],row[5]);
    let wall=Infinity;
    try{
      if(native){
        const hit=system.worldCrabletCombatProbe(scratch.from,scratch.to,row[6],row[7]);
        if(!hit||typeof hit.hit!=='boolean')return false;
        if(hit?.hit){
          const length=scratch.from.distanceTo(scratch.to);
          if(!finite(hit.dist)||hit.dist<0||hit.dist>length+1e-7)return false;
          wall=length>1e-12?hit.dist/length:0;
        }
      }else if(contact!==null){
        scratch.to.set(row[0]+(row[3]-row[0])*contact,row[1]+(row[4]-row[1])*contact,row[2]+(row[5]-row[2])*contact);
        return physics.los(scratch.from,scratch.to)===true;
      }
    }catch{return false;}
    if(contact!==null){
      return contact<wall-1e-9;
    }
    // Terrain wins ties and retires the entire path. A later exposed centre
    // cannot authorize a round that already collided with the wall.
    if(wall<=1+1e-9)return false;
  }
  return false;
}

export function forgetCrabletTraces(nm,peer,all=false) {
  if(all){nm._crabletTrajectories=null;nm._crabletTraceScratch=null;return;}
  nm._crabletTrajectories?.births.delete(peer);
}
