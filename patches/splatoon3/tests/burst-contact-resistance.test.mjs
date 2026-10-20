import {readySpecialEvidence} from './special-control-evidence.mjs';
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
async function world(clock=null){const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,...(clock?{vmPerformance:{now:()=>clock.ms}}:{})});f.G.match={state:'playing',playing:()=>true};f.G.level={...f.G.level,blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};f.G.physics=new f.installedRuntime.Physics(f.G.level);const o=f.make(),v=f.make();o.team=0;v.team=1;v.invuln=0;o.pos.set(0,0,-4);v.pos.set(0,0,2);o.aimDir.set(0,0,1);o.weapon={...o.weapon,sub:'burst'};f.G.actors=[o,v];return {f,o,v};}
function throwBurst(f,o){const p=f.G.projectiles.throwBomb(o);p.pos.set(0,.7,0);p.prev.copy(p.pos);p.vel.set(0,0,60);return p;}
function advance(f,fps=60){for(let i=0;i<10;i++){f.G.time+=1/fps;f.G.projectiles.update(1/fps);}}
for(const ap of [0,57])for(const fps of [30,60,120])test(`Burst native direct ${ap}AP at ${fps}Hz preserves direct and one-frame splash`,async()=>{const {f,o,v}=await world();equip(v,ap);const bystander=f.make();bystander.team=1;bystander.invuln=0;bystander.pos.set(1.5,0,2);equip(bystander,ap);const hits=[],other=[],damage=v.damage,collateral=bystander.damage;v.damage=function(n,a,w){hits.push([n,w]);return damage.call(this,n,a,w);};bystander.damage=function(n,a,w){other.push([n,w]);return collateral.call(this,n,a,w);};const hp=v.hp,bhp=bystander.hp;throwBurst(f,o);advance(f,fps);assert.deepEqual(hits,[[25,'burst'],[35,'burst']]);close(hp-v.hp,expected(60,ap,true));assert.equal(other.length,1);assert.equal(other[0][1],'burst');assert.ok(other[0][0]>0&&other[0][0]<=35);close(bhp-bystander.hp,expected(other[0][0],ap,true));});
for(const armor of ['booyahBomb','crabTank'])test(`Burst native collision consumes raw ${armor} armor before the next-frame body splash`,async()=>{
 const {f,o,v}=await world();equip(v,57);v.yaw=Math.PI;v.aimDir.set(0,0,-1);
 v.weapon={...v.weapon,special:armor,specialCost:100};v.special=100;readySpecialEvidence(v,{placeAtFixtureOrigin:true});
 const s=v._s3AllSpecialState;s.armorHP=10;v.specialActive.armorHP=10;
 const hp=v.hp,hits=[],body=[],damage=v.damage;
 v.damage=function(n,a,w){hits.push([n,w]);const result=damage.call(this,n,a,w);body.push(hp-this.hp);return result;};
 throwBurst(f,o);advance(f);assert.deepEqual(hits,[[25,'burst'],[35,'burst']]);assert.equal(s.armorHP,0);
 // Booyah follows the general 100-damage penetration threshold: its breaking
 // 25 contact is fully absorbed despite only 10 armor HP remaining. The next
 // native phase hits the unarmored body for 35*.6=21. Crab keeps its existing
 // armor-HP spill: (25-10)*.6=9, then another 21, totaling 30.
 assert.deepEqual(body,armor==='crabTank'?[9,30]:[0,21]);
 close(hp-v.hp,armor==='crabTank'?30:21);
});
test('Burst native Booyah armor boundary uses raw contact object damage before Sub Resistance',async()=>{
 for(const armorHP of [37.5,37.5001]){
  const {f,o,v}=await world();equip(v,57);v.weapon={...v.weapon,special:'booyahBomb',specialCost:100};v.special=100;
  readySpecialEvidence(v,{placeAtFixtureOrigin:true});const state=v._s3AllSpecialState;
  state.armorHP=armorHP;v.specialActive.armorHP=armorHP;
  const hp=v.hp,phases=[],damage=v.damage;
  v.damage=function(amount,attacker,cause){const result=damage.call(this,amount,attacker,cause);
   phases.push({amount,cause,armor:state.armorHP,body:hp-this.hp});return result;};
  throwBurst(f,o);advance(f);
  assert.deepEqual(phases.map(p=>[p.amount,p.cause]),[[25,'burst'],[35,'burst']]);
  close(phases[0].armor,armorHP-25*1.5);close(phases[0].body,0);
  assert.equal(phases[1].armor,0);
  // At exactly 25*the pinned Bomb_DirectHit→NiceBall multiplier, the second
  // phase sees bare skin. Any positive armor instead absorbs the entire 35
  // breaking splash; neither attack reaches the general 100 threshold.
  close(phases[1].body,armorHP===37.5?21:0);
 }
});
test('ghost Burst flight never applies direct or splash body damage',async()=>{const {f,o,v}=await world();const p=throwBurst(f,o);p.ghost=true;const hp=v.hp;advance(f);assert.equal(v.hp,hp);});
test('Burst native collision sends both raw phases through real NetMatch and duplicate JSON stays inert',async()=>{
 const clock={ms:1000},sender=await world(clock),receiver=await world(clock),packets=[],ticks=[];
 const bind=(world,myId,tr)=>{
  const {f,o,v}=world;Object.assign(o,{nid:1,owner:'attacker',netLife:0,isLocal:myId==='attacker'});Object.assign(v,{nid:2,owner:'victim',netLife:0});equip(v,57);
  const session={myId,hostId:'attacker',isHost:myId==='attacker',_members:new Map([['attacker',{}],['victim',{}]]),tr};
  const match={actors:[o,v],state:'playing',time:180,playing:()=>true};
  const nm=new f.NetMatch(session,{id:'burst-native'});nm.bind(match);session.match=nm;f.G.match=match;f.G.netm=nm;return nm;
 };
 const tx=bind(sender,'attacker',{sendTo:(_id,p)=>{packets.push(JSON.parse(JSON.stringify(p)));return true;},broadcast:p=>{if(p.k==='t')ticks.push(JSON.parse(JSON.stringify(p)));return true;}});
 const rx=bind(receiver,'victim',{sendTo(){return true;},broadcast(){return true;}});
 try{
  const hp=receiver.v.hp,senderHP=sender.v.hp;
  throwBurst(sender.f,sender.o);assert.equal(tx._sendTick(),true);assert.equal(ticks.length,1);
  const birth=ticks[0].e.find(e=>e[1]==='ac'&&e[2]==='sub'&&e[5]?.phase==='spawn'&&e[5]?.subId==='burst');assert.ok(birth,'actual Burst birth');assert.ok(Number.isSafeInteger(birth[5].seed)&&Number.isFinite(birth[5].charge),'native birth carries replay seed/charge');
  rx.onMessage('attacker',ticks[0]);assert.ok(rx.peers.get('attacker')?.events.some(e=>e[1]==='ac'&&e[5]?.seq===birth[5].seq),'receiver admits Burst birth');
  advance(sender.f);const hits=packets.filter(p=>p.k==='hit');assert.equal(hits.length,2);assert.deepEqual(hits.map(p=>p.d),[25,35]);assert.equal(sender.v.hp,senderHP);
  for(const packet of hits)rx.onMessage('attacker',packet);assert.equal(receiver.v.hp,hp,'FIFO alone cannot authorize collision claims');
  assert.equal(rx._combatProvenance?.proofs.get('attacker')?.length||0,0);
  clock.ms+=150;receiver.f.G.time+=.15;rx.update(.15);
  assert.ok(receiver.f.G.projectiles._s3SubObjects.some(o=>o.ghost&&o.owner===receiver.o&&o.seq===birth[5].seq),'native receiver creates Burst');
  assert.equal(hp-receiver.v.hp,36);
  for(const packet of hits)rx.onMessage('attacker',packet);assert.equal(hp-receiver.v.hp,36);
 }finally{tx.dispose();rx.dispose();sender.f.G.projectiles.clear();receiver.f.G.projectiles.clear();}
});
for(const wear of [false,true])test(`Burst intercepted by Splash Wall preserves object HP path, Object Shredder ${wear}`,async()=>{const {f,o,v}=await world();equip(v,57);o.s3.loadout[2].main=wear?'objectShredder':'none';o.s3RefreshGear();v.weapon={...v.weapon,sub:'splashWall'};const wall=f.G.projectiles.throwBomb(v);wall.phase='deployed';wall.pos.set(0,.7,1);wall.prev.copy(wall.pos);wall.vel.set(0,0,0);wall.hp=1000;wall.wallHpInitial=0;const hp=v.hp;throwBurst(f,o);advance(f);assert.equal(v.hp,hp);close(wall.hp,1000-35*2*(wear?1.5:1));});

