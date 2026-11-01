import test from 'node:test';
import assert from 'node:assert/strict';
import {peer,equip,time,send,receive,drain} from './storm-native-peer-fixture.mjs';
import {objectDamageScale} from '../../splatoon3/runtime/sub-resistance.mjs';

const DT=1/60,HP=10000;
const json=value=>JSON.parse(JSON.stringify(value));
const near=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-7,message||`${actual} != ${expected}`);
const stormBirth=row=>row[1]==='b'&&row[3]==='storm';
const stormUse=row=>row[1]==='ev'&&row[2]==='special:use'&&row[3]?.id==='storm';
const objectHit=row=>row[1]==='ac'&&(row[5]?.phase==='objectHit'||row[5]?.action==='objectHit');

// Two independent native module graphs. The only fixture boundaries are a
// flat scene, stationary actor motion and an already-deployed durable target.
// The source's real Actor.update press/release, canister integration, cloud
// creation, damage producer, native tick packer and JSON receiver all run.
async function setup(t,{targetKind='sub',ap=0,holdFrames=6,frames=180,respawnFrame=null,turnAfterThrow=false}={}){
 const source=await peer('a','bomb',0),remote=await peer('b','bomb',0);
 t.after(()=>{source.close();remote.close();});
 const targets=[];
 for(const p of [source,remote]){
  const actor=p.o,owner=p.v,system=p.f.G.projectiles;
  // Both isolated native target constructors represent the same replicated
  // device. Match its source random seed as well as owner/serial/activation.
  p.f.setRandom(()=>.25);
  // The shared actor fixture has no terrain blocks. Supply the same flat
  // y=0 scene intersection on both sides, while retaining native flight.
  p.f.G.physics.segment=(a,b,hit)=>{
   hit.hit=b.y<=0&&a.y>0;
   if(hit.hit){const fraction=a.y/(a.y-b.y);hit.point.copy(a).lerp(b,fraction);hit.normal.set(0,1,0);hit.face=0;hit.block=0;hit.dist=a.distanceTo(hit.point);}
   return hit;
  };
  p.f.G.physics.raycast=(origin,direction,length,hit)=>{
   const distance=direction.y<0?-origin.y/direction.y:Infinity;hit.hit=distance>=0&&distance<=length;
   if(hit.hit){hit.point.copy(origin).addScaledVector(direction,distance);hit.normal.set(0,1,0);hit.face=0;hit.block=0;hit.dist=distance;}
   return hit;
  };
  equip(actor,ap,'specialPower');actor.weapon={...actor.weapon,special:'storm',specialCost:190};actor.special=190;
  actor.aimYaw=0;actor.aimPitch=-.6;actor.aimDir.set(0,Math.sin(-.6),Math.cos(-.6));actor.aimPoint.set(0,-10,20);
  actor._horizontal=()=>{};actor._resolve=()=>{};
  // Use the real local creation path on both sides; source-side ownership is
  // then remote so its real damage route emits a proposal for the recipient.
  const wasRemote=owner.remote;owner.remote=false;owner.pos.set(0,0,6);owner.weapon={...owner.weapon,sub:'beakon'};
  let target;
  if(targetKind==='sub'){
   target=system.throwBomb(owner);assert.ok(target,'native local Beakon creation');
   target.activeAt=Infinity;target.expireAt=Infinity;
  }else{
   owner.weapon={...owner.weapon,special:'waveBreaker',specialCost:100};owner.special=100;owner._startSpecial();
   owner.intent.sub=true;owner._updateSpecial(DT);owner.intent.sub=false;
   for(let frame=0;frame<24&&owner.specialActive;frame++)owner._updateSpecial(DT);
   target=system._s3AllSpecialObjects.find(o=>o.owner===owner&&o.kind==='wave');assert.ok(target,'native local Wave Breaker creation');
   Object.assign(target,{phase:'active',vel:null,landedAt:0,dur:Infinity,pulse:3});target.pos.set(0,.08,6);
  }
  target.hp=HP;target.maxHp=HP;owner.remote=wasRemote;owner.pos.set(40,0,40);owner.invuln=Infinity;
  targets.push(target);p.nm.out.length=0;p.packets.length=0;
 }
 if(targetKind==='special')for(const field of ['id','activation','serial','index','seed'])assert.equal(targets[0][field],targets[1][field],`native target ${field} agrees across peers`);
 const target=targets[1],writes=[];let hp=HP;
 Object.defineProperty(target,'hp',{configurable:true,enumerable:true,get:()=>hp,set:value=>{
  if(value<hp){
   const cloud=remote.f.G.projectiles.clouds.find(c=>c.ghost&&c.owner===remote.o);
   writes.push({damage:hp-value,tick:remote.nm.peers.get('a')?.sim,life:remote.o.netLife,
    sourceTick:cloud?._netBornTick+cloud?._netSteps-1});
  }
  hp=value;
 }});
 const packets=[],sendSource=()=>{const packet=send(source,[]);packets.push(json(packet));return packet;};
 sendSource();
 time(source,DT);source.o._startSpecial();assert.equal(source.o.specialActive?.phase,'hold','native activation holds without throwing');
 assert.equal(source.f.G.projectiles.bombs.filter(b=>b.kind==='storm').length,0,'activation alone creates no canister');
 let nativeBirth,cloud,cloudBornFrame,respawnLife;
 const releaseFrame=holdFrames+3,lastFrame=releaseFrame+frames;
 for(let frame=2;frame<=lastFrame;frame++){
  time(source,frame*DT);
  if(frame===respawnFrame){
   const previous=source.o.netLife;source.o.splat(null,'water');source.o.respawn();
   assert.ok(source.o.netLife>previous,'actual native respawn advances the owner life');respawnLife=source.o.netLife;
   source.o.weapon={...source.o.weapon,special:'storm',specialCost:190};
   equip(source.o,57,'specialPower');source.o.pos.set(0,0,0);source.o.invuln=0;
  }
  source.o.intent.sub=frame===releaseFrame-1;
  source.o.update(DT);
  const row=source.nm.out.find(stormBirth);
  if(row&&!nativeBirth){
   nativeBirth=json(row);
   if(turnAfterThrow){source.o.aimYaw=1.2;source.o.aimPitch=.7;source.o.aimDir.set(Math.sin(1.2)*Math.cos(.7),Math.sin(.7),Math.cos(1.2)*Math.cos(.7));}
  }
  source.f.G.projectiles.update(DT);
  if(!cloud&&source.f.G.projectiles.clouds.length){cloud=source.f.G.projectiles.clouds[0];cloudBornFrame=frame;}
  if(frame%3===0)sendSource();
 }
 if(source.nm.out.length||packets.at(-1)?.u!==lastFrame)sendSource();
 const rows=packets.flatMap(p=>p.e||[]),use=rows.find(stormUse),birth=rows.find(stormBirth),claims=rows.filter(objectHit);
 assert.ok(use,'native activation publishes special:use');
 assert.ok(birth,`native held release publishes a canister: ${JSON.stringify({active:source.o.specialActive,alive:source.o.alive,pos:source.o.pos,rows:rows.slice(0,4)})}`);
 assert.ok(cloud,`native canister reaches flat terrain: ${JSON.stringify({birth,bombs:source.f.G.projectiles.bombs.map(b=>({kind:b.kind,pos:b.pos,vel:b.vel,age:b.age}))})}`);
 assert.ok(birth.at(-2)>use.at(-2),'real throw is on a later source tick than paid activation');
 assert.equal(rows.filter(stormBirth).length,1,'one native held release produces one birth');
 assert.ok(claims.length>30,'actual source cloud emits continuous native device contacts');
 for(const row of claims){near(row[5].damage,.4,'native 24 damage/second source emits .4 per fixed step');assert.equal(row[5].cause,'InkStorm');}
 const scale=objectDamageScale(remote.o,targetKind==='sub'?'beakon':'waveBreaker','InkStorm');
 let transportSeq=0,played=0;const created=[];
 const spawn=remote.f.G.projectiles._spawnCloud;
 remote.f.G.projectiles._spawnCloud=function(...args){const count=this.clouds.length,result=spawn.apply(this,args);if(this.clouds.length>count)created.push(this.clouds.at(-1));return result;};
 function deliver(packet,{map=null,freshSequences=false,advance=true}={}){
  const p=json(packet);if(map)p.e=map(p.e||[],p);
  if(freshSequences)for(const row of p.e||[])row[row.length-1]=++transportSeq;
  time(remote,p.ts-100);receive(remote,'a',p);played++;
  if(advance)remote.f.G.projectiles.update(DT);
  return p;
 }
 function replay(options={}){for(const packet of packets)deliver(packet,options);drain(remote);return HP-target.hp;}
 return{source,remote,target,targets,packets,use,birth,claims,cloud,cloudBornFrame,respawnLife,created,writes,scale,deliver,replay,
  expected:claims.length*.4*scale,get played(){return played;}};
}

for(const targetKind of ['sub','special'])test(`Storm native ${targetKind} device: held press/release, natural cloud and exact receiver frames`,async t=>{
 const x=await setup(t,{targetKind});near(x.replay(),x.expected);
 assert.equal(x.writes.length,x.claims.length,'every real source contact is applied once');
 assert.equal(x.created.length,1,'recipient creates exactly one natural ghost cloud');assert.equal(x.created[0].ghost,true);
 assert.equal(x.created[0]._netBornTick,x.cloudBornFrame,'cloud inherits its actual source landing frame');
 assert.equal(x.created[0].dur,x.cloud.dur,'recipient preserves the native frozen AP duration');
});

test('Storm AP57: legal aim changes after release retain the native throw and duration',async t=>{
 const x=await setup(t,{ap:57,turnAfterThrow:true});near(x.replay(),x.expected);assert.equal(x.created.length,1);
 assert.equal(x.created[0].dur,x.cloud.dur);assert.ok(x.cloud.dur>8,'actual source AP increases the cloud lifetime');
});

test('Storm: paid use rejects forged origin, velocity, duration and a second birth without poisoning the native throw',async t=>{
 const x=await setup(t);let mutations=0;
 x.replay({freshSequences:true,map:rows=>rows.flatMap(row=>{
  if(!stormBirth(row))return[row];
  const origin=json(row);origin[4]+=500;
  const velocity=json(row);velocity[7]+=500;
  const duration=json(row);duration[10].stormDuration+=5;
  mutations+=3;return[origin,velocity,duration,row,json(row)];
 })});
 assert.equal(mutations,3);near(HP-x.target.hp,x.expected);assert.equal(x.created.length,1);
 assert.equal(x.writes.length,x.claims.length,'invalid constructors cannot spend the paid use or add another cloud');
});

test('Storm: a paid activation without the native throw cannot authorize cloud object hits',async t=>{
 const x=await setup(t);x.replay({map:rows=>rows.filter(row=>!stormBirth(row))});
 assert.equal(x.target.hp,HP);assert.equal(x.created.length,0);assert.equal(x.writes.length,0);
});

test('Storm: oversized, wrong-cause, wrong-frame and fresh-sequence duplicate claims never add a native damage tick',async t=>{
 const x=await setup(t);let eventSeq=100000;
 x.replay({freshSequences:true,map:rows=>rows.flatMap(row=>{
  if(!objectHit(row))return[row];
  const copy=changes=>{const next=json(row);Object.assign(next[5],changes,{eventSeq:eventSeq++});return next;};
  const early=copy({});early[early.length-2]=x.birth.at(-2)-1;
  return[copy({damage:10000}),copy({cause:'Bomb'}),early,row,copy({})];
 })});
 near(HP-x.target.hp,x.expected);assert.equal(x.writes.length,x.claims.length,'one exact native contact pays once even with new outer/inner sequence IDs');
});

for(const boundary of ['range','vertical-los'])test(`Storm: receiver-owned ${boundary} rejects otherwise genuine source claims`,async t=>{
 const x=await setup(t);
 if(boundary==='range')x.target.pos.x=500;
 else x.remote.f.G.physics.los=()=>false;
 x.replay({map:rows=>rows.map(row=>{
  // Preserve the outer target-coordinate envelope in the far-target probe.
  // The private cloud contact must reject it on receiver geometry alone.
  if(boundary==='range'&&objectHit(row))Object.assign(row[5],{x:x.target.pos.x,y:x.target.pos.y,z:x.target.pos.z});
  return row;
 })});
 assert.equal(x.created.length,1,'the valid native source cloud still exists');assert.equal(x.target.hp,HP);assert.equal(x.writes.length,0);
});

test('Storm: a live cloud retains its paid birth across real owner respawn and source AP changes',async t=>{
 // Change life just after an actual 20 Hz send, so no obsolete-life claim is
 // deliberately mixed into the new-life snapshot envelope.
 const x=await setup(t,{respawnFrame:91});assert.equal(x.respawnLife,1);
 const sourceOld=x.claims.filter(row=>row[4]===0).map(row=>row.at(-2));
 const sourceNew=x.claims.filter(row=>row[4]===1).map(row=>row.at(-2));
 assert.deepEqual(sourceOld,Array.from({length:79},(_,i)=>12+i));
 assert.deepEqual(sourceNew,Array.from({length:99},(_,i)=>91+i),'the actual old cloud produces every new-life contact');
 const playback=[],play=x.remote.nm._play;
 x.remote.nm._play=function(from,row,...args){
  if(objectHit(row)){
   const packet=x.packets.find(p=>p.e?.some(e=>e.at(-1)===row.at(-1)));
   playback.push({tick:row.at(-2),life:row[4],packetLife:packet.l[1],renderLife:x.remote.o.netLife,
    acceptedLife:Math.max(x.remote.o.netLife||0,x.remote.o.net?.lastLife||0)});
  }
  return play.call(this,from,row,...args);
 };
 let damage;try{damage=x.replay();}finally{x.remote.nm._play=play;}
 // The ordinary jitter buffer leaves these genuine old-life rows pending when
 // the next life is admitted. Keep their retirement; the native cloud survives.
 const retired=playback.filter(row=>row.life!==row.acceptedLife);
 assert.deepEqual(retired.map(row=>row.tick),[88,89,90]);
 assert.ok(retired.every(row=>row.life===0&&row.packetLife===0&&row.acceptedLife===1),
  'old rows belonged to accepted old-life packets, then retired at the newer life');
 assert.deepEqual(playback.filter(row=>row.life===1&&row.renderLife===0).map(row=>row.tick),[91,92,93],
  'new native epoch precedes its delayed presentation counter');
 const receivedOld=x.writes.filter(row=>row.life===0).map(row=>row.sourceTick);
 const receivedNew=x.writes.filter(row=>row.life===1).map(row=>row.sourceTick);
 const retiredTicks=new Set(retired.map(row=>row.tick));
 assert.deepEqual(receivedOld,sourceOld.filter(tick=>!retiredTicks.has(tick)),'every unretired old-life contact applies once');
 assert.deepEqual(receivedNew,sourceNew,'all 99 new-life native contacts apply once, including the three before presentation catches up');
 assert.equal(x.writes.length,175);near(damage,(sourceOld.length-retiredTicks.size+sourceNew.length)*.4*x.scale);
 console.log(JSON.stringify({scope:'Storm native respawn boundary',sourceOld:[sourceOld[0],sourceOld.at(-1)],
  retiredOld:[...retiredTicks],receivedOld:[receivedOld[0],receivedOld.at(-1)],sourceNew:[sourceNew[0],sourceNew.at(-1)],
  receivedNew:[receivedNew[0],receivedNew.at(-1)],newLifeContacts:receivedNew.length}));
 assert.equal(x.created.length,1);assert.equal(x.created[0].dur,x.cloud.dur);
});

test('Storm: an unseen old-life birth cannot be introduced after real owner respawn',async t=>{
 const x=await setup(t,{respawnFrame:31});let injected=false;
 x.replay({freshSequences:true,map:(rows,p)=>{
  const kept=rows.filter(row=>!stormBirth(row));
  if(!injected&&p.l?.[1]===1){injected=true;kept.unshift(json(x.birth));}
  return kept;
 }});
 assert.ok(injected,'old birth is retried in the first actual new-life owner snapshot');
 assert.equal(x.created.length,0);assert.equal(x.target.hp,HP);
});

test('Storm: a legitimate hold longer than 40 seconds still admits only its native cloud contacts',async t=>{
 const x=await setup(t,{holdFrames:42*60});assert.ok(x.birth[0]-x.use[0]>40);
 near(x.replay(),x.expected);assert.equal(x.created.length,1);assert.equal(x.writes.length,x.claims.length);
});
