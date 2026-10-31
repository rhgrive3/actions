import {exportNativeActorPacker} from './native-packer-export-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './robustness-fixture.mjs';
import {stepSpecialDeviceFlight} from '../../splatoon3/runtime/special-device-flight.mjs';

// Native actor special state machine, world-device fixed step, catalogue event
// producer, native tick packer and receiver. Only the scene/flat terrain and
// stationary actor movement are fixture boundaries.
async function setup(t,id,{hz=60,targetZ=6,markers=1,ap=0,turnAfterBirth=false,targetKind='sub'}={}){
 const f=await fixture({productionComposition:true,transformSource:exportNativeActorPacker});
 class Display{constructor(){this.root=new f.THREE.Group();}_owner(){return this.actor;}trigger(){}setVisible(){}setHurt(){}setWeapon(){}getMuzzle(out){return out.copy(this.actor.pos);}}
 const make=(nid,owner,remote,team)=>{const a=new f.Actor({team,name:owner,weapon:'shooter',CharacterClass:Display});a.character.actor=a;Object.assign(a,{nid,owner,remote,netLife:0,isLocal:!remote,grounded:true});
  a.pos.set(0,0,0);a.aimYaw=0;a.aimPitch=-.6;a.aimDir.set(0,Math.sin(-.6),Math.cos(-.6));a.aimPoint.set(0,-10,20);a._integrate=()=>{};a._horizontal=()=>{};a._resolve=()=>{};return a;};
 const attacker=make(17,'peer',true,1),owner=make(7,'me',false,0);
 attacker.s3.abilityPoints={...attacker.s3.abilityPoints,specialPower:ap};
 attacker.weapon={...attacker.weapon,special:id,specialCost:190};attacker.special=190;
 const nm=f.makeNetMatch(f.makeSession('me','me',[['me','Me'],['peer','Peer']])),match=f.bind(nm,[owner,attacker]);nm.match=null;nm.bind(match);Object.assign(f.G,{match,actors:[owner,attacker]});t.after(()=>nm.dispose());
 const initial=f.nativePackActor(attacker);initial[13]=190;initial[22]=0;
 nm.onMessage('peer',{k:'t',r:2,ts:1000,u:0,a:[initial],l:{17:0},e:[]});
 owner.pos.set(0,0,targetZ);owner.weapon={...owner.weapon,sub:'beakon'};
 let target;
 if(targetKind==='sub'){target=f.projectiles.throwBomb(owner);assert.ok(target,'actual native receiver-owned Beakon');target.phase='deployed';target.activeAt=Infinity;target.expireAt=Infinity;}
 else {
  owner.weapon={...owner.weapon,special:'waveBreaker',specialCost:100};owner.special=100;owner._startSpecial();owner.intent.sub=true;owner._updateSpecial(1/60);owner.intent.sub=false;
  for(let i=0;i<20&&owner.specialActive;i++)owner._updateSpecial(1/60);
  target=f.projectiles._s3AllSpecialObjects.find(o=>o.owner===owner&&o.kind==='wave');assert.ok(target,'actual native receiver-owned special device');
  // A stationary deployed target isolates its native collision/HP consumer.
  target.pos.set(0,.08,targetZ);target.phase='active';target.vel=null;target.landedAt=0;target.dur=Infinity;
 }
 target.hp=10000;target.maxHp=10000;
 // Produce real outgoing events from a local owner, against a remote device.
 const packets=[];nm.s.tr.broadcast=p=>{if(p.k==='t')packets.push(JSON.parse(JSON.stringify(p)));return true;};
 attacker.remote=false;owner.remote=true;nm.myId='peer';nm.out.length=0;
 f.clock.set(1000.001);attacker._startSpecial();assert.ok(attacker.specialActive,`${id} native use`);
 const steps=(id==='waveBreaker'?11:6)*60;let elapsed=0,worldCarry=0,worldBorn=false;
 for(let i=0;i<steps;i++){
  elapsed=(i+1)/60;f.clock.set(1000+elapsed);f.G.time=elapsed;attacker.intent.sub=i===0||markers>1&&i===40||markers>2&&i===80;
  if(attacker.specialActive)attacker._updateSpecial(1/60);
  // Fixed simulation is 60 Hz; the real world accumulator receives the
  // selected outer rendering cadence, including zero/one/two source steps.
  if(hz===30&&worldBorn){worldCarry+=1/60;if(worldCarry+1e-9>=1/30){f.projectiles.update(1/30);worldCarry-=1/30;}}
  else if(hz===120){f.projectiles.update(1/120);f.projectiles.update(1/120);}
  else f.projectiles.update(1/60);
  // Birth belongs to its own fixed source step; never retroactively advance
  // a just-born object for a coarse step that preceded that birth.
  if(!worldBorn){
   worldBorn=!!f.projectiles._s3AllSpecialObjects?.some(o=>o.owner===attacker&&o.id===id);
   if(worldBorn&&turnAfterBirth){attacker.aimYaw=1.2;attacker.aimPitch=.7;attacker.aimDir.set(Math.sin(1.2)*Math.cos(.7),Math.sin(.7),Math.cos(1.2)*Math.cos(.7));attacker.aimPoint.copy(attacker.pos).addScaledVector(attacker.aimDir,20);}
  }
  if(i%3===2)nm._sendTick();
 }
 if(nm.out.length)nm._sendTick();
 const events=packets.flatMap(p=>p.e||[]),birth=events.find(e=>e[1]==='ac'&&e[5]?.id===id&&e[5]?.action==='deploy'),claims=events.filter(e=>e[1]==='ac'&&(targetKind==='sub'?e[5]?.phase==='objectHit'&&e[5]?.targetSeq===target.seq:e[5]?.action==='objectHit'&&e[5]?.ownerNid===owner.nid&&e[5]?.object===target.serial));
 assert.ok(birth,`${id} native flight birth`);assert.ok(claims.length,`${id} native world contact producer`);
 attacker.remote=true;owner.remote=false;nm.myId='me';nm.out.length=0;target.hp=10000;target.dead=false;target.ghost=false;
 f.projectiles._s3AllSpecialObjects=targetKind==='sub'?[]:[target];
 const captures=[],capture=f.projectiles.captureNativeSpecialWorldDeviceBirth;
 assert.equal(typeof capture,'function','production world proof bridge is installed');
 f.projectiles.captureNativeSpecialWorldDeviceBirth=function(...args){const result=capture.apply(this,args);captures.push({args:[args[0],JSON.parse(JSON.stringify({...args[1],actor:undefined})),args[2],args[3]],result});return result;};
 const accepted=[],probe=f.projectiles.nativeSpecialWorldDeviceContact;
 f.projectiles.nativeSpecialWorldDeviceContact=function(...args){const result=probe.apply(this,args);if(result)accepted.push({args,result});return result;};
 // Replay the real native tick envelopes, with fresh sequence values only
 // when injecting malicious duplicates into the same authenticated stream.
 let seq=1;
 function deliver(packet,mutate=null){
  const p=structuredClone(packet);p.e=mutate?mutate(p.e||[]):p.e||[];
  for(const e of p.e)e[e.length-1]=seq++;
  f.clock.set(p.ts);f.G.time=p.ts-1000;
  nm.onMessage('peer',p);
  const outcomes=[];
  for(const e of nm.peers.get('peer').events.splice(0)){
   const before=target.hp;nm._play('peer',e);outcomes.push({event:e,damage:before-target.hp});
  }
  return outcomes;
 }
 return {f,nm,attacker,owner,target,birth,claims,packets,deliver,captures,accepted};
}

for(const id of ['waveBreaker','splattercolorScreen','tripleInkstrike'])for(const hz of [30,60,120])test(`${id} ${hz} Hz: actual native world births, contact claims and receiver proof agree`,async t=>{
 const x=await setup(t,id,{hz}),out=[];
 for(const p of x.packets)out.push(...x.deliver(p));
 const applied=out.filter(o=>o.damage>0);
 assert.equal(applied.length,x.claims.length,`${id}: every actual native device hit is admitted exactly once`);
 assert.ok(x.target.hp<10000);
});

for(const id of ['waveBreaker','splattercolorScreen'])for(const route of ['companion-first','companion-only'])test(`${id}: ${route} retains one native world birth and exact paid contacts`,async t=>{
 const x=await setup(t,id),out=[];let seen=false;
 for(const packet of x.packets)out.push(...x.deliver(packet,events=>{
  const belongs=e=>e[1]==='ac'&&e[5]?.id===id&&e[5]?.object===1&&e[5]?.phase==='flight'&&['deploy','device','screen'].includes(e[5]?.action);
  const pair=events.filter(belongs);if(!pair.length)return events;
  assert.equal(pair.length,2,'source emits one complete canonical/companion pair');seen=true;
  const canonical=pair.find(e=>e[5].action==='deploy'),companion=pair.find(e=>e!==canonical);assert.ok(canonical&&companion);
  // A different seed or velocity under a genuine use cannot redefine the
  // native slot, even with a new outer sequence and an identical source frame.
  const wrong=structuredClone(companion);wrong[5].seed=(wrong[5].seed+1)>>>0;
  const speed=structuredClone(companion);speed[5].vx+=100;
  const nextTick=structuredClone(canonical);nextTick[nextTick.length-2]++;
  const replacement=route==='companion-first'?[companion,canonical,wrong,speed,nextTick]:[companion,wrong,speed];
  const first=events.indexOf(pair[0]);return [...events.slice(0,first),...replacement,...events.slice(first).filter(e=>!belongs(e))];
 }));
 assert.ok(seen);assert.equal(out.filter(o=>o.damage>0).length,x.claims.length,'every original source claim is paid exactly once');
 assert.ok(x.captures.some(c=>c.result===false),'changed constructor/frame does not replace the sealed native birth');
});

for(const id of ['waveBreaker','splattercolorScreen','tripleInkstrike'])test(`${id}: invalid births, early/oversized claims and fresh-sequence duplicates do not spend native contacts`,async t=>{
 const x=await setup(t,id),out=[];let fake=1000000;
 const claimCopy=(event,changes={})=>{const e=structuredClone(event);Object.assign(e[5],changes,{eventSeq:fake++});return e;};
 for(const p of x.packets)out.push(...x.deliver(p,rows=>rows.flatMap(e=>{
  if(e[1]==='ac'&&e[5]?.id===id&&e[5]?.action==='deploy'&&e[5]?.phase==='flight'){
   const forged=[];
   for(const changes of [{pos:[500,1.1,500],target:[500,1.1,501]},{vx:500},{specialPowerAP:57},{phase:'active',age:3,landedAt:1},{object:99,index:98}]){
    const f=structuredClone(e);Object.assign(f[5],changes);forged.push(f);
   }
   const relocated=structuredClone(e);relocated[5].pos[0]+=.5;if(relocated[5].target)relocated[5].target[0]+=.5;
   const early=claimCopy(x.claims[0]);early[0]=e[0];early[early.length-2]=e[e.length-2];
   return [...forged,e,relocated,early];
  }
  if(e[1]==='ac'&&e[5]?.phase==='objectHit')return [claimCopy(e,{damage:10000}),claimCopy(e,{cause:'Bomb'}),e,claimCopy(e)];
  return [e];
 })));
 assert.ok(x.captures.filter(c=>c.result===false).length>=6,'malformed/unbound births never acquire the sealed slot');
 assert.ok(x.captures.some(c=>c.result===true),'a later genuine birth can still seal its original slot');
 for(const o of out)if(o.event[5]?.eventSeq>=1000000)assert.equal(o.damage,0,'malicious native-row claim remains unpaid');
 assert.equal(out.filter(o=>o.damage>0).length,x.claims.length,'all original claims and no duplicate damage');
});

test('sealed world birth retains its source AP after respawn but rejects a replaced owner/net/session',async t=>{
 const x=await setup(t,'waveBreaker');for(const p of x.packets){x.deliver(p);if(x.target.hp<10000)break;}
 const first=x.accepted[0];assert.ok(first);const [actor,payload,target,receipt,use,time]=first.args;
 const event=x.claims[0],read=()=>x.f.projectiles.nativeSpecialWorldDeviceContact(actor,payload,target,receipt,use,time,{damage:event[5].damage,cause:event[5].cause});
 const state=()=>({hp:x.target.hp,actorHP:actor.hp,ink:actor.ink,special:actor.special,
  objects:x.f.projectiles._s3AllSpecialObjects.map(o=>[o.pos.x,o.pos.y,o.pos.z,o.age,o.dead,o.hp]),
  subs:x.f.projectiles._s3SubObjects.map(o=>[o.pos.x,o.pos.y,o.pos.z,o.dead,o.hp]),out:x.nm.out.length});
 const before=state();assert.ok(read());assert.deepEqual(state(),before,'pure probe invokes no HP/paint/live-world mutation');
 actor.netLife++;actor.weapon={...actor.weapon,special:'inkjet'};actor.s3.abilityPoints={...actor.s3.abilityPoints,specialPower:57};
 assert.ok(read(),'already-deployed source outlives the owner life with frozen original AP');
 const net=actor.net;actor.net={...net};assert.equal(read(),null);actor.net=net;
 const owner=actor.owner;actor.owner='other-peer';assert.equal(read(),null);actor.owner=owner;
 const session=x.nm.s;x.nm.s={...session};assert.equal(read(),null);x.nm.s=session;
});

test('accepted first landing stays fixed when terrain disappears before a later target claim',async t=>{
 const x=await setup(t,'tripleInkstrike');
 for(const p of x.packets){x.deliver(p);if(x.target.hp<10000)break;}
 assert.ok(x.target.hp<10000,'first actual native contact commits its endpoint');
 const accepted=x.accepted[0];assert.ok(accepted);const [actor,payload,originalTarget,receipt,use,time]=accepted.args;
 assert.ok(x.f.projectiles.nativeSpecialWorldDeviceContact(actor,payload,originalTarget,receipt,use,time,{damage:37.5,cause:'TripleTornado'}),'exact accepted source still contacts its original target before the terrain change');
 const original=x.target.pos.clone();
 x.f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};x.f.G.level.groundHeight=()=>-10;
 const q={pos:new x.f.THREE.Vector3(...payload.pos),vel:new x.f.THREE.Vector3(payload.vx,payload.vy,payload.vz),gravity:payload.gravity,airResist:payload.airResist};
 let landingFrame=0;const hit=new x.f.Hit();
 for(let i=1;i<=600;i++){const h=stepSpecialDeviceFlight(x.f,q,1/60,hit);if(h){q.pos.addScaledVector(h.normal,.08);landingFrame=i;break;}}
 assert.ok(landingFrame);assert.ok(q.pos.distanceTo(original)>20,'a fresh uncommitted trajectory would land elsewhere');
 x.owner.pos.copy(q.pos);const other=x.f.projectiles.throwBomb(x.owner);assert.ok(other);other.phase='deployed';other.hp=10000;
 const result=x.f.projectiles.nativeSpecialWorldDeviceContact(actor,payload,other,receipt,use,receipt.time+(landingFrame+92)/60,{damage:37.5,cause:'TripleTornado'});
 assert.equal(result,null,'same birth cannot be re-flown through vanished terrain to another device');
});

test('Screen keeps its target-relative 60-source-frame repeat interval across second damage and duplicate claims',async t=>{
 const x=await setup(t,'splattercolorScreen',{targetZ:3.1}),out=[];
 assert.ok(x.claims.length>=2,'native source remains over the device through its first repeat interval');
 for(const p of x.packets)out.push(...x.deliver(p));
 assert.equal(out.filter(o=>o.damage>0).length,x.claims.length,'all actual source repeats reach the receiver');
 const first=x.accepted[0],args=first.args.slice(0,6),key=first.result.contactKey;
 // The full stream can retire a target; the cooldown itself is tested using
 // a fresh real local device at the original contact position.
 x.owner.pos.set(0,0,3.1);const target=x.f.projectiles.throwBomb(x.owner);target.phase='deployed';target.hp=10000;args[2]=target;
 const read=frames=>x.f.projectiles.nativeSpecialWorldDeviceContact(...args.slice(0,5),args[5]+frames/60,{damage:40,cause:'Chimney',consumedKeys:new Set([key])});
 assert.equal(read(59),null,'a fresh event sequence does not shorten the native target cooldown');
 assert.ok(read(60),'the next actual source frame after the full interval remains eligible');
});

test('source world geometry keeps Wave LOS and Triple column height/radius with intentional terrain piercing',async t=>{
 for(const id of ['waveBreaker','tripleInkstrike']){
  const x=await setup(t,id);for(const p of x.packets){x.deliver(p);if(x.target.hp<10000)break;}
  const first=x.accepted[0],args=first.args.slice(0,6),damage=id==='waveBreaker'?45:37.5,cause=id==='waveBreaker'?'ShockSonar_Wave':'TripleTornado';
  const read=()=>x.f.projectiles.nativeSpecialWorldDeviceContact(...args,{damage,cause});
  assert.ok(read(),'actual source geometry initially contacts the device');
  x.f.G.physics.los=()=>false;
  if(id==='waveBreaker'){assert.equal(read(),null,'terrain blocks native device wave contact');continue;}
  assert.ok(read(),'native Triple column intentionally pierces solid terrain');
  const land=x.packets.flatMap(p=>p.e||[]).find(e=>e[1]==='ac'&&e[5]?.id===id&&e[5]?.action==='land')[5].pos;
  args[5]=x.claims.at(-1)[0];
  for(const [dy,wanted]of [[19.8,true],[20.2,false],[-9.8,true],[-10.2,false]]){
   x.target.pos.set(land[0],land[1]+dy,land[2]);assert.equal(!!read(),wanted,`native column vertical offset ${dy}`);
  }
  x.target.pos.set(land[0]+8,land[1],land[2]);assert.equal(read(),null,'native 7.7 maximum damage radius remains bounded');
 }
});

test('all three native Triple markers each retain eleven source damage ticks and the use-wide maximum',async t=>{
 const x=await setup(t,'tripleInkstrike',{targetZ:4.63,markers:3}),out=[];
 assert.equal(x.claims.length,33,'actual source: three markers × eleven native column contacts');
 x.target.hp=1e9; // Keep the same native target alive through its source damage rate.
 for(const p of x.packets)out.push(...x.deliver(p));
 assert.equal(out.filter(o=>o.damage>0).length,33,'every source marker/tick is represented once');
 const slots=new Set(x.accepted.map(a=>a.result.contactKey.split(':')[3]));assert.deepEqual([...slots].sort(),['0','1','2']);
 const last=x.packets.at(-1),copy=structuredClone(x.claims.at(-1));copy[5].eventSeq=999999;copy[0]=last.ts-.001;
 assert.equal(x.deliver({...last,e:[copy]}).some(o=>o.damage>0),false,'an extra sender row cannot add a fourth column or twelfth pulse');
});

for(const id of ['waveBreaker','splattercolorScreen','tripleInkstrike'])test(`${id}: native AP 57 birth survives a legitimate aim change before the next owner snapshot`,async t=>{
 const x=await setup(t,id,{ap:57,turnAfterBirth:true}),out=[];x.target.hp=1e9;
 for(const p of x.packets)out.push(...x.deliver(p));
 assert.equal(out.filter(o=>o.damage>0).length,x.claims.length,'source velocity is reproduced from its legal launch, not the later displayed aim');
 assert.ok(x.captures.some(c=>c.result===true&&c.args[3].specialPowerAP===57),'native use retains the actual AP at activation');
});

for(const id of ['waveBreaker','splattercolorScreen','tripleInkstrike'])test(`${id}: the native special-device HP consumer uses the same sealed source contacts`,async t=>{
 const x=await setup(t,id,{targetKind:'special'}),out=[];x.target.hp=1e9;
 for(const p of x.packets)out.push(...x.deliver(p));
 assert.equal(out.filter(o=>o.damage>0).length,x.claims.length,'native catalogue objectHit and sub-device consumers agree on source admission');
});
