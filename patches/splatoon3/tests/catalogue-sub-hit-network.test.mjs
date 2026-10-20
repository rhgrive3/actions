import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import crypto from 'node:crypto';
import {fixture} from './source-fixture.mjs';
import {emptyLoadout,gearCurve} from '../runtime/gear.mjs';
import {LOW_SUB_RESISTANCE_CURVE,subResistanceBand} from '../runtime/sub-resistance.mjs';
import {CATALOGUE_SUB_HIT_MAX,isHitPayloadValid} from '../../reliability/net-hit-payload-adapter.mjs';
function equip(a,ap){a.s3.loadout=emptyLoadout();for(const p of a.s3.loadout)if(ap>=10){p.main='subResistance';ap-=10;}for(const p of a.s3.loadout)for(let i=0;i<3&&ap>=3;i++){p.subs[i]='subResistance';ap-=3;}a.s3RefreshGear();}
function close(a,b){assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);}
const expected=(n,ap,low)=>Math.floor(n*gearCurve(ap,1,.75,low?.6:.5)*10+1e-9)/10;
async function world(sub='burst',clock){const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmPerformance:{now:()=>clock.ms}});f.G.match={state:'playing',playing:()=>true};f.G.level={...f.G.level,blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};f.G.physics=new f.installedRuntime.Physics(f.G.level);const o=f.make(),v=f.make();o.team=0;v.team=1;v.invuln=0;o.pos.set(0,0,0);v.pos.set(0,0,2);o.aimDir.set(0,0,1);o.weapon={...o.weapon,sub};f.G.actors=[o,v];return {f,o,v};}
function throwBurst(f,o){const p=f.G.projectiles.throwBomb(o);p.pos.set(0,.7,0);p.prev.copy(p.pos);p.vel.set(0,0,60);return p;}
function advance(f,fps=60){for(let i=0;i<10;i++){f.G.time+=1/fps;f.G.projectiles.update(1/fps);}}
for(const [w,n]of Object.entries(CATALOGUE_SUB_HIT_MAX))for(const ap of [0,57])test(`${w} JSON bounded raw hit reaches victim ${ap}AP once`,async()=>{
 const sub=w==='torpedo-splash'?'torpedo':w;
 // Independent clients must not rebind the same Actor's remote/life state.
 const clock={ms:1000},sender=await world(sub,clock),receiver=await world(sub,clock);
 let packet,ack;const ticks=[];
 function bind(world,myId,transport){
  const {f,o,v}=world;
  Object.assign(o,{nid:1,owner:'attacker',netLife:0});
  Object.assign(v,{nid:2,owner:'victim',netLife:0});
  equip(v,ap);equip(o,57);
  const session={myId,hostId:'attacker',isHost:myId==='attacker',tr:transport,
   _members:new Map([['attacker',{}],['victim',{}]])};
  const match={actors:[o,v],state:'playing',time:180,playing:()=>true};
  const nm=new f.NetMatch(session,{id:'catalogue-sub',map:'reef'});
  nm.bind(match);session.match=nm;f.G.match=match;f.G.netm=nm;
  return nm;
 }
 const tx=bind(sender,'attacker',{
  sendTo:(_id,p)=>{if(p.k==='hit')packet=JSON.parse(JSON.stringify(p));return true;},
  broadcast:p=>{if(p.k==='t')ticks.push(JSON.parse(JSON.stringify(p)));return true;},
 });
 const rx=bind(receiver,'victim',{
  sendTo:(_id,p)=>{if(p.k==='hit_ack')ack=JSON.parse(JSON.stringify(p));return true;},
  broadcast:p=>{if(p.k==='hit_ack')ack=JSON.parse(JSON.stringify(p));return true;},
 });
 try{
  // Create the equipped sub through its installed production birth owner.
  // No projectile update occurs: this remains a raw-hit payload/gear test,
  // not a replacement for collision tests or a manufactured proof record.
  assert.ok(sender.f.G.projectiles.throwBomb(sender.o),'native sub birth');
  assert.equal(tx._sendTick(),true,'native owner tick accepted locally');
  assert.equal(ticks.length,1);
  assert.ok(ticks[0].e.some(e=>e[1]==='ac'&&e[2]==='sub'&&e[5]?.phase==='spawn'&&e[5]?.subId===sub),'tick carries actual sub birth');
  const birth=ticks[0].e.find(e=>e[1]==='ac'&&e[2]==='sub'&&e[5]?.phase==='spawn');
  assert.ok(Number.isSafeInteger(birth[5].seed)&&Number.isFinite(birth[5].charge),'native birth carries replay seed/charge');
  rx.onMessage('attacker',ticks[0]);
  assert.ok(rx.peers.get('attacker')?.events.some(e=>e[1]==='ac'&&e[2]==='sub'&&e[5]?.phase==='spawn'&&e[5]?.subId===sub),'native receiver admitted catalogue birth');
  tx.sendHit(sender.o,sender.v,n,w);assert.equal(packet.d,n);
  const {v}=receiver,hp=v.hp;
  rx.onMessage('foreign',packet);
  rx.onMessage('attacker',{...packet,d:n+.1});
  assert.equal(v.hp,hp);
  rx.onMessage('attacker',packet);
  assert.equal(v.hp,hp,'FIFO alone is not attack authority');
  assert.equal(rx._combatProvenance?.proofs.get('attacker')?.length||0,0);
  clock.ms+=150;receiver.f.G.time+=.15;rx.update(.15);
  assert.ok(receiver.f.G.projectiles._s3SubObjects.some(o=>o.ghost&&o.owner===receiver.o&&o.seq===birth[5].seq),'native receiver actually creates the sub');
  close(hp-v.hp,expected(n,ap,['burst','fizzy'].includes(w)));
  close(ack.d,expected(n,ap,['burst','fizzy'].includes(w)));
  const after=v.hp;rx.onMessage('attacker',packet);assert.equal(v.hp,after);
 }finally{
  tx.dispose();rx.dispose();
  sender.f.G.projectiles.clear();receiver.f.G.projectiles.clear();
 }
});
