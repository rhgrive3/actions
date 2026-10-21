import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
import { makePaintWorld } from './paint-authority-fixture.mjs';
import { ALL_SUB_SPECS } from '../runtime/all-subs.mjs';
const STEP=1/60;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

// S3 11.3.0 GP0. Eight terrain-contact blasts are explicit raw values and
// documented behavior. Kinematics retain the labelled custom gravity; this
// verifies the authoritative runtime and replay, not retail trajectory parity.
// https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/トーピード#r2c63076
async function world(client=null,clock=null){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export {beginReceiverTorpedoObservation,receiverTorpedoObservationState} from './patches/splatoon3/runtime/torpedo-receiver-trajectory.mjs';",...(clock?{vmPerformance:{now:()=>clock.ms}}:{})});
  const {paint}=makePaintWorld(f);f.G.settings={};f.setRandom(()=>.37);
  const owner=f.make(),victim=f.make();
  Object.assign(owner,{nid:1,owner:'a',team:0,netLife:0,remote:client==='b'});owner.pos.set(50,0,50);
  Object.assign(victim,{nid:2,owner:'b',team:1,netLife:0,remote:client==='a',invuln:0});victim.pos.set(0,0,38);
  owner.weapon={...owner.weapon,sub:'torpedo'};owner.weaponRunner.reset();
  let nm=null;const packets=[];
  if(client){
    nm=new f.NetMatch({myId:client,isHost:client==='a',hostId:'a',_members:new Map([['a','A'],['b','B']]),
      tr:{broadcast(p){packets.push({to:'broadcast',p:JSON.parse(JSON.stringify(p))});return true;},sendTo(to,p){packets.push({to,p:JSON.parse(JSON.stringify(p))});return true;}}},{id:'torpedo-detached',map:'map',difficulty:'normal'});
    nm.bind({actors:[owner,victim],state:'playing',time:180,follower:false,playing:()=>true});
    f.G.netm=nm;f.G.match=nm.match;
    for(const a of [owner,victim]){nm.byNid.set(a.nid,a);nm._setupActor(a);}
  }
  const hits=[],stamps=[],events=[];
  const hit=f.G.projectiles.applyHit.bind(f.G.projectiles),splat=paint.splat.bind(paint);
  f.G.projectiles.applyHit=(a,v,n,c,...args)=>{hits.push({victim:v,amount:n,cause:c,time:f.G.time});return hit(a,v,n,c,...args);};
  paint.splat=(p,r,t,o)=>{stamps.push({pos:p.clone(),radius:r,team:t});return splat(p,r,t,o);};
  f.on('all:sub',e=>events.push(e));
  function step(){f.G.time+=STEP;f.G.projectiles.update(STEP);paint.advanceSimulation(STEP);}
  function fire(){
    owner.ink=100;
    for(let i=0;i<8;i++)owner.weaponRunner.update(STEP,{sub:true});
    owner.weaponRunner.update(STEP,{sub:false,subReleased:true});owner.weaponRunner.update(STEP,{sub:false});
    const b=f.G.projectiles._s3SubObjects.find(o=>o.subId==='torpedo');assert.ok(b);assert.equal(owner.ink,35);
    return b;
  }
  function contact(b){
    for(let i=0;i<51;i++)step();assert.equal(b.phase,'chase');
    victim.pos.set(0,0,30);b.pos.set(-1,.7,30);b.prev.copy(b.pos);b.vel.set(120,0,0);step();
    assert.equal(b.dead,true,'the real swept actor contact bursts the launched parent');
    return f.G.projectiles._s3TorpedoSplashes.filter(d=>d.kind==='chase');
  }
  return {f,paint,owner,victim,nm,packets,hits,stamps,events,step,fire,contact};
}
function landing(drop){
  const g=drop.source.spec.gravity,time=(drop.vel.y+Math.sqrt(drop.vel.y**2+2*g*drop.pos.y))/g;
  return drop.pos.clone().addScaledVector(drop.vel,time).setY(0);
}
function wire(e){const r=JSON.parse(JSON.stringify(e));r._netSeq=e._netSeq;r._netTick=e._netTick;return r;}
function play(w,rows){w.nm._peer('a');for(const row of rows)w.nm._play('a',wire(row));}
function settle(w){for(let i=0;i<180;i++)w.paint.advanceSimulation(STEP);}


for(const mode of ['stopped','moving','life','clear','reuse','replacement'])test(`limited Torpedo contact ${mode}`,async()=>{
 const moving=mode==='moving';
 const clock={ms:1000},tx=await world('a',clock),rx=await world('b',clock);
 tx.owner.pos.set(0,0,26);rx.owner.pos.copy(tx.owner.pos);tx.owner.aimDir.set(0,0,1);
 if(moving){tx.owner.vel.set(1,0,0);rx.owner.vel.copy(tx.owner.vel);}
 const parent=tx.fire();assert.equal(tx.nm._sendTick(),true);const tick=tx.packets.find(p=>p.p.k==='t').p;
 rx.nm.onMessage('a',tick);clock.ms+=150;rx.f.G.time+=.15;rx.nm.update(.15);
 const replica=rx.f.G.projectiles._s3SubObjects.find(o=>o.subId==='torpedo');assert.ok(replica);
 assert.equal(rx.f.receiverTorpedoObservationState(rx.f.installedRuntime,rx.f.G.projectiles,replica),'active','accepted birth enrolled automatically');
 const origin=replica.pos.clone(),spawn=tick.e.find(e=>e[1]==='ac'&&e[5]?.phase==='spawn')[5];
 for(const phase of ['torpedoLock','torpedoLaunch','burst']){assert.equal(rx.f.installedRuntime.replaySub({...spawn,phase,actor:rx.owner,x:100,y:20,z:-100,vx:1,vy:0,vz:0}),false);assert.equal(replica.pos.distanceTo(origin),0);}
 rx.nm.onMessage('a',tick);assert.equal(rx.f.G.projectiles._s3SubObjects.filter(o=>o.subId==='torpedo').length,1);
 for(let i=0;i<300&&!parent.dead;i++){tx.step();rx.step();}assert.equal(parent.dead,true);assert.equal(replica.dead,true);
 const drops=tx.f.G.projectiles._s3TorpedoSplashes.filter(d=>d.kind==='chase');assert.equal(drops.length,8);
 const main=tx.packets.find(p=>p.p.k==='hit')?.p;assert.equal(main.d,60);rx.nm.onMessage('a',main);assert.equal(rx.victim.hp,40);
 tx.victim.pos.copy(landing(drops[0]));rx.victim.pos.copy(tx.victim.pos);
 // Native trajectories and terrain contacts continue; do not author a synthetic proof.
 for(let i=0;i<200;i++){tx.step();rx.step();}
 const splash=tx.packets.find(p=>p.p.k==='hit'&&p.p.w==='torpedo-splash')?.p;assert.equal(splash.d,12);
 rx.nm.onMessage('foreign',splash);rx.nm.onMessage('a',{...splash,d:12.1});assert.equal(rx.victim.hp,40);
 if(mode==='replacement'){const replacement=rx.f.make();Object.assign(replacement,{nid:rx.victim.nid,owner:'b',remote:false,team:1,netLife:0,hp:40,alive:true});replacement.pos.copy(rx.victim.pos);rx.nm.byNid.set(replacement.nid,replacement);rx.replacement=replacement;}
 if(mode==='life')rx.owner.netLife++;if(mode==='clear')rx.f.G.projectiles.clear();
 rx.nm.onMessage('a',splash);assert.equal(rx.victim.hp,['life','clear','replacement'].includes(mode)?40:28);
 if(mode==='life')rx.owner.netLife=0;
 rx.nm.onMessage('a',splash);assert.equal(rx.victim.hp,['life','clear','replacement'].includes(mode)?40:28);
 if(mode==='reuse'){rx.nm.onMessage('a',{...splash,h:splash.h+1,seq:splash.seq+1});assert.equal(rx.victim.hp,28,'consumed contact cannot support a fresh hit ID');}
 if(rx.replacement)assert.equal(rx.replacement.hp,40);
 console.log('LIMITED_CONTACT',JSON.stringify({moving,hp:rx.victim.hp,sourceDamage:splash.d}));
 tx.nm.dispose();rx.nm.dispose();tx.f.G.projectiles.clear();rx.f.G.projectiles.clear();
});

test('limited Torpedo rejects impossible700 birth without new contact authority',async()=>{
 const clock={ms:1000},tx=await world('a',clock),rx=await world('b',clock);
 tx.owner.pos.set(0,0,26);rx.owner.pos.copy(tx.owner.pos);tx.owner.aimDir.set(0,0,1);tx.fire();tx.nm._sendTick();
 const tick=tx.packets.find(p=>p.p.k==='t').p,spawn=tick.e.find(e=>e[1]==='ac'&&e[5]?.phase==='spawn')[5];spawn.vx=700;spawn.vy=0;spawn.vz=0;
 rx.nm.onMessage('a',tick);clock.ms+=150;rx.f.G.time+=.15;rx.nm.update(.15);
 const replica=rx.f.G.projectiles._s3SubObjects.find(o=>o.subId==='torpedo');assert.ok(replica,'legacy birth stays separate from restricted contact authority');
 assert.equal(rx.f.receiverTorpedoObservationState(rx.f.installedRuntime,rx.f.G.projectiles,replica),null);assert.equal(rx.victim.hp,100);
 tx.nm.dispose();rx.nm.dispose();tx.f.G.projectiles.clear();rx.f.G.projectiles.clear();
});
