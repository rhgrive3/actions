import test from 'node:test';
import assert from 'node:assert/strict';
import {specialNativeProducer} from './special-native-producer-fixture.mjs';

const fields=['sourceSpecial','sourceActivation','sourceObject','sourceIndex','sourceSeed'];
const isClaim=e=>e?.[1]==='ac'&&(e[5]?.phase==='objectHit'||e[5]?.action==='objectHit');
async function chumps(t,targetKind='sub'){
 return specialNativeProducer(t,'superChump',{frames:400,targetZ:25,targetKind,randomSeed:7,
  step:x=>{x.attacker.intent.fire=true;},
  afterStep:x=>{const o=x.f.projectiles._s3AllSpecialObjects?.find(o=>o.owner===x.attacker&&o.kind==='decoy');if(o)x.target.pos.copy(o.target);}});
}
function assertSources(x){
 const born=x.events.filter(e=>e[5]?.id==='superChump'&&e[5]?.action==='deploy'),ids=new Set();
 assert.equal(born.length,12,'one paid native use generates all twelve decoys');
 for(const e of x.claims){const p=e[5];
  assert.equal(p.sourceSpecial,'superChump');
  const b=born.find(e=>e[5].activation===p.sourceActivation&&e[5].object===p.sourceObject)?.[5];
  assert.ok(b,'claim selects a real emitted constructor');
  assert.equal(p.sourceIndex,b.index);assert.equal(p.sourceSeed,b.seed);assert.equal(b.tick,1);
  ids.add(p.sourceIndex);
 }
 assert.equal(ids.size,x.claims.length,'one native blast per contacted decoy');
 return born;
}
for(const targetKind of ['sub','special'])test(`Chump ${targetKind}: overlapping native decoys keep distinct source slots and reject relabelled or repeated proposals`,async t=>{
 const x=await chumps(t,targetKind),at=x.target.pos.clone();assertSources(x);
 assert.ok(x.claims.length>=3,'fixed seed must retain the overlapping native contact arrangement');
 assert.ok(x.claims.filter(e=>e[5].damage===35).length>=2,'two distinct native decoys share the 35-damage band');
 const ordinal=targetKind==='sub'?'eventSeq':'tick',out=[];let serial=1000000;
 const bad=(e,change)=>{const p=structuredClone(e);p[5][ordinal]=serial++;change?.(p[5]);return p;};
 const variants=p=>[
  bad(p,e=>{for(const key of fields)delete e[key];}),
  ...fields.map(key=>bad(p,e=>{delete e[key];})),
  bad(p,e=>{e.sourceSpecial='waveBreaker';}),
  bad(p,e=>{e.sourceActivation++;}),
  bad(p,e=>{e.sourceObject=e.sourceObject%12+1;}),
  bad(p,e=>{e.sourceIndex=(e.sourceIndex+1)%12;}),
  bad(p,e=>{e.sourceSeed=(e.sourceSeed^1)>>>0;}),
  bad(p,e=>{e.sourceObject=13;e.sourceIndex=12;}),
  bad(p,e=>{e.damage=10000;}),p,bad(p),
 ];
 for(const packet of x.packets)out.push(...x.deliver(packet,rows=>rows.flatMap(e=>isClaim(e)?variants(e):[e]),null,()=>x.target.pos.copy(at)));
 const applied=out.filter(o=>o.damage>0);
 assert.ok(applied.every(o=>o.event[5][ordinal]<1000000),'no absent/foreign source identity, inflated claim or fresh-sequence replay can spend another decoy slot');
 assert.equal(applied.length,x.claims.length,'every distinct native contact still reaches the actual device HP consumer');
 assert.deepEqual(applied.map(o=>o.event[5].sourceIndex).sort((a,b)=>a-b),x.claims.map(e=>e[5].sourceIndex).sort((a,b)=>a-b));
 t.diagnostic(JSON.stringify({targetKind,fixtureSeed:7,sourceSeed:x.events.find(e=>e[5]?.id==='superChump'&&e[5]?.action==='target')[5].seed,
  native:x.claims.map(e=>({index:e[5].sourceIndex,object:e[5].sourceObject,seed:e[5].sourceSeed,damage:e[5].damage})),accepted:applied.length,rejected:out.filter(o=>isClaim(o.event)&&!o.damage).length}));
});
test('Chump: a source label cannot replace a missing private native birth',async t=>{
 const x=await chumps(t),at=x.target.pos.clone(),born=assertSources(x),missing=x.claims[0][5].sourceIndex,out=[];
 for(const packet of x.packets)out.push(...x.deliver(packet,rows=>rows.filter(e=>!(e[5]?.id==='superChump'&&e[5]?.action==='deploy'&&e[5]?.index===missing)),null,()=>x.target.pos.copy(at)));
 const applied=out.filter(o=>o.damage>0);
 assert.ok(born.some(e=>e[5].index===missing));
 assert.ok(applied.every(o=>o.event[5].sourceIndex!==missing));
 assert.equal(applied.length,x.claims.length-1,'other independently received native births retain their contacts');
});
test('Chump: a paid-use label and decoy constructors without the resource-backed use grant no contacts',async t=>{
 const x=await chumps(t),at=x.target.pos.clone();assertSources(x);const initial=x.target.hp;
 for(const packet of x.packets)x.deliver(packet,rows=>rows.filter(e=>!(e[1]==='ev'&&e[2]==='special:use')),null,()=>x.target.pos.copy(at));
 assert.equal(x.target.hp,initial);
});
test('Chump: a second native paid use keeps its own birth labels and cannot spend an earlier use again',async t=>{
 const x=await specialNativeProducer(t,'superChump',{frames:1181,targetZ:25,randomSeed:7,
  step:(x,i)=>{if(i===780){assert.ok(!x.attacker.specialActive);assert.equal(x.f.projectiles._s3AllSpecialObjects.filter(o=>o.owner===x.attacker).length,0);x.attacker.special=190;x.attacker._startSpecial();assert.ok(x.attacker.specialActive);}x.attacker.intent.fire=true;},
  afterStep:x=>{const o=x.f.projectiles._s3AllSpecialObjects?.find(o=>o.owner===x.attacker&&o.kind==='decoy');if(o)x.target.pos.copy(o.target);}});
 const uses=x.events.filter(e=>e[1]==='ev'&&e[2]==='special:use');assert.equal(uses.length,2,'two real resource-debit producers');
 const groups=new Map();for(const e of x.claims){const key=e[5].sourceActivation;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);}
 assert.equal(groups.size,2,'both actual uses make native contacts');
 const [first,second]=[...groups.values()],oldByIndex=new Map(first.map(e=>[e[5].sourceIndex,e[5]])),out=[];
 let serial=1000000;
 for(const packet of x.packets)out.push(...x.deliver(packet,rows=>rows.flatMap(e=>{
  if(!isClaim(e))return[e];const replay=structuredClone(e);replay[5].eventSeq=serial++;
  if(e[5].sourceActivation!==second[0][5].sourceActivation)return[e,replay];
  const foreign=structuredClone(e);foreign[5].eventSeq=serial++;foreign[5].sourceActivation=first[0][5].sourceActivation;
  const old=oldByIndex.get(e[5].sourceIndex);if(!old)return[foreign,e,replay];
  const stale=structuredClone(e);stale[5].eventSeq=serial++;for(const key of fields)stale[5][key]=old[key];
  return[foreign,stale,e,replay];
 }),e=>{if(isClaim(e))x.target.pos.set(e[5].x,e[5].y-.7,e[5].z);}));
 const applied=out.filter(o=>o.damage>0);
 assert.ok(applied.every(o=>o.event[5].eventSeq<1000000),'neither same-use repeats nor old-use labels spend a new source contact');
 assert.equal(applied.length,x.claims.length,'all contacts from both independent native paid uses survive');
 assert.deepEqual([...new Set(applied.map(o=>o.event[5].sourceActivation))].sort(),[...groups.keys()].sort());
 t.diagnostic(JSON.stringify({fixtureSeed:7,paidUses:uses.length,nativeContacts:x.claims.length,accepted:applied.length,activations:[...groups.keys()]}));
});
test('Chump: native blast has no fist producer and a forged fist proposal gains no contact authority',async t=>{
 let fists=[],nearAtBlast=false,observations=[];
 const x=await specialNativeProducer(t,'superChump',{frames:400,targetZ:25,randomSeed:7,
  configure:x=>{const off=x.f.on('all:sub',e=>{if(e.actor!==x.attacker||e.phase!=='objectHit')return;const center=x.f.projectiles._s3AllSpecialObjects?.find(o=>o.owner===x.attacker&&o.kind==='decoy'&&o.index===e.sourceIndex)?.pos;
   observations.push({center:center?.toArray(),fists:fists.map(f=>({age:f.age,pos:f.pos.toArray(),distance:center?f.pos.distanceTo(center):null,hp:f.hp}))});if(center&&fists.some(f=>!f.dead&&f.age-.25<55/60&&f.pos.distanceTo(center)<3.6))nearAtBlast=true;});t.after(off);},
  step:x=>{x.attacker.intent.fire=true;const decoy=x.f.projectiles._s3AllSpecialObjects?.find(o=>o.owner===x.attacker&&o.kind==='decoy'&&o.index===0);if(!fists.length&&decoy&&decoy.dur-decoy.age<=.15){
   x.owner.remote=false;x.owner.pos.copy(decoy.target);x.owner.weapon={...x.owner.weapon,special:'tripleSplashdown',specialCost:190};x.owner.special=190;x.owner._startSpecial();
   fists=x.f.projectiles._catalogueFists.filter(f=>f.owner===x.owner);assert.equal(fists.length,2);x.owner.remote=true;}},
  afterStep:x=>{const o=x.f.projectiles._s3AllSpecialObjects?.find(o=>o.owner===x.attacker&&o.kind==='decoy');if(o)x.target.pos.copy(o.target);},
  stopWhen:()=>observations.length>0});
 assertSources(x);assert.ok(x.claims.length>=3,'observe the actual native blast before stopping the producer');assert.ok(nearAtBlast,'a real live native fist overlaps the Chump blast while vulnerable: '+JSON.stringify(observations));
 assert.ok(fists.every(f=>!f.dead&&f.age-.25<55/60&&f.hp===100),'the actual native blast does not damage either fist');
 assert.equal(x.events.filter(e=>e[5]?.id==='tripleSplashdown'&&e[5]?.action==='objectHit').length,0,'native producer emits no Chump-to-fist proposal');
 const at=x.target.pos.clone(),out=[];let ordinal=1000000;
 for(const packet of x.packets)out.push(...x.deliver(packet,rows=>rows.flatMap(e=>{
  if(!isClaim(e))return[e];const f=fists[0],payload={id:'tripleSplashdown',action:'objectHit',activation:f.activation,index:f.index,
   pos:f.pos.toArray(),ownerNid:x.owner.nid,ownerLife:x.owner.netLife,damage:e[5].damage,tick:ordinal++};
  for(const key of fields)payload[key]=e[5][key];
  return[e,[e[0],'ac','special',x.attacker.nid,x.attacker.netLife,payload,e.at(-2),e.at(-1)]];
 }),null,()=>x.target.pos.copy(at)));
 assert.equal(out.filter(o=>o.damage>0).length,x.claims.length,'the same accepted paid use still pays its real Sub contacts');
 assert.ok(fists.every(f=>f.hp===100),'accepted native source labels do not invent a fist contact the source never produces');
});
