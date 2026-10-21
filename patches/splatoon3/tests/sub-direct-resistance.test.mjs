import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {readySpecialEvidence} from './special-control-evidence.mjs';
import {emptyLoadout,gearCurve} from '../runtime/gear.mjs';
function equip(a,ap,ability='subResistance'){a.s3.loadout=emptyLoadout();for(const p of a.s3.loadout){if(ap>=10){p.main=ability;ap-=10;}}for(const p of a.s3.loadout)for(let i=0;i<3&&ap>=3;i++){p.subs[i]=ability;ap-=3;}a.s3RefreshGear();}
for(const [source,raw] of [['angleShooter',40],['sprinkler',20]])for(const ap of [0,10,57])test(`${source} actual victim applies only its own ${ap}AP direct Sub Resistance`,async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});f.G.match={playing:()=>true,state:'playing'};const owner=f.make(),v=f.make();owner.team=0;v.team=1;v.invuln=0;equip(v,ap);equip(owner,57);const hp=v.hp;
 v.damage(raw,owner,source);assert.ok(Math.abs((hp-v.hp)-Math.floor(raw*gearCurve(ap,1,.75,.5)*10+1e-9)/10)<1e-8);
});
for(const source of ['angleShooter','sprinkler'])for(const ap of [0,57])for(const fps of [30,60,120])test(`${source} native contact applies ${ap}AP exactly once at ${fps}Hz`,async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export {kitBombContact} from './patches/splatoon3/runtime/kit-subs.mjs';"});f.G.match={playing:()=>true,state:'playing'};
 f.G.level={...f.G.level,blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};f.G.physics=new f.installedRuntime.Physics(f.G.level);
 const o=f.make(),v=f.make();o.team=0;v.team=1;v.invuln=0;o.pos.set(0,0,0);v.pos.set(0,0,2);o.aimDir.set(0,0,1);equip(v,ap);f.G.actors=[o,v];o.weapon={...o.weapon,sub:source};o.weaponRunner.reset();const hp=v.hp;
 if(source==='angleShooter'){const p=f.G.projectiles.throwBomb(o);p.pos.set(0,.7,0);p.prev.copy(p.pos);p.vel.set(0,0,60);}
 else{f.G.projectiles.throwBomb(o);const b=f.G.projectiles.bombs.at(-1);assert.equal(b.s3Resolved?.spec?.id,'sprinkler','native contact20 uses actual sprinkler spec');f.kitBombContact(f.SUB,b,{hit:true,point:new f.THREE.Vector3(0,0,0),normal:new f.THREE.Vector3(0,1,0)});b.s3Sprinkler.nextFrame=Infinity;b.s3Sprinkler.drops.push({pos:new f.THREE.Vector3(0,.7,2),vel:new f.THREE.Vector3(),life:0,seed:.2});}
 for(let i=0;i<10&&v.hp===hp;i++){f.G.time+=1/fps;f.G.projectiles.update(1/fps);}assert.equal(hp-v.hp,(source==='angleShooter'?40:20)*(ap===57?.5:1));
});
for(const source of ['angleShooter','sprinkler'])for(const armor of ['booyahBomb','crabTank'])test(`${source} retains raw ${armor} object damage and applies resistance only to admitted body damage`,async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true}),o=f.make(),v=f.make();o.team=1;o.pos.set(0,0,5);v.invuln=0;equip(v,57);v.weapon={...v.weapon,special:armor,specialCost:100};v.special=100;readySpecialEvidence(v);const state=v._s3AllSpecialState;
 const hp=v.hp;state.armorHP=100;v.specialActive.armorHP=100;v.damage(40,o,source);
 assert.equal(state.armorHP,60,'victim Sub Resistance cannot halve the raw object debit');assert.equal(v.hp,hp);
 state.armorHP=10;v.specialActive.armorHP=10;v.damage(40,o,source);assert.equal(state.armorHP,0);
 const breakingBody=armor==='crabTank'?15:0;
 assert.equal(hp-v.hp,breakingBody,'Booyah absorbs a breaking hit below100; Crab retains its armor-HP spill');
 const afterBreak=v.hp;v.damage(40,o,source);assert.equal(afterBreak-v.hp,20,'the next bare-body hit still applies57AP Sub Resistance once');
});
async function nativeSprinklerWire(ap){
 const clock={ms:1000},hits=[],acks=[],ticks=[];
 async function endpoint(id){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmPerformance:{now:()=>clock.ms}});
  const V=f.THREE.Vector3;const wall={id:0,solid:true,center:new V(0,2,3),half:new V(10,2,.2),axes:[new V(1,0,0),new V(0,1,0),new V(0,0,1)],faces:[-1,-1,-1,-1,-1,-1]};f.G.level={...f.G.level,blocks:[wall],faces:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;out.push(0);return out;}};f.G.physics=new f.installedRuntime.Physics(f.G.level);
  const o=f.make(),v=f.make();if(ap===57){for(const piece of v.s3.loadout){piece.main='subResistance';piece.subs=['subResistance','subResistance','subResistance'];}v.s3RefreshGear();}Object.assign(o,{nid:1,owner:'S',netLife:0,team:0});Object.assign(v,{nid:2,owner:'V',netLife:0,team:1,invuln:0});
  o.pos.set(0,0,0);o.aimDir.set(0,-.9,.435889894);v.pos.set(200,0,0);o.weapon={...o.weapon,sub:'sprinkler'};o.weaponRunner.reset();
  const tr={sendTo(to,p){if(p.k==='hit')hits.push(JSON.parse(JSON.stringify(p)));if(p.k==='hit_ack')acks.push(JSON.parse(JSON.stringify(p)));return true;},broadcast(p){if(p.k==='hit_ack')acks.push(JSON.parse(JSON.stringify(p)));if(p.k==='t'&&id==='S')ticks.push(JSON.parse(JSON.stringify(p)));return true;}};
  const session={myId:id,hostId:'S',isHost:id==='S',tr,_members:new Map([['S',{}],['V',{}]])};const match={actors:[o,v],playing:()=>true,state:'playing',time:180};const nm=new f.NetMatch(session,{id:'sprinkler-life',map:'reef'});nm.bind(match);session.match=nm;f.G.match=match;f.G.netm=nm;f.G.actors=match.actors;
  return {f,o,v,nm};
 }
 const tx=await endpoint('S'),rx=await endpoint('V');tx.f.G.projectiles.throwBomb(tx.o);assert.equal(tx.nm._sendTick(),true);rx.nm.onMessage('S',ticks[0]);clock.ms+=150;rx.f.G.time+=.15;rx.nm.update(.15);
 assert.equal(ticks[0].e.find(e=>e[1]==='b').length,16,'tagged native sprinkler birth');assert.equal(rx.nm._combatProvenance.proofs.get('S').length,1,'native created commit');const bomb=tx.f.G.projectiles.bombs.find(b=>b.owner===tx.o);assert.ok(bomb);assert.equal(bomb.s3Resolved.spec.id,'sprinkler');assert.equal(bomb.s3PaintBirth,undefined,'identity adds no paint grant');let previous=0,contactCount=0,placed=false;
 for(let i=0;i<300;i++){
  const st=bomb.s3Sprinkler;
  // Place a live opponent at an existing naturally emitted drop, never inject a drop or claim.
  if(!placed&&st?.drops.length&&i>50){const d=st.drops.find(d=>d.pos.y>.15&&d.pos.y<1.7);if(d){tx.v.pos.set(d.pos.x,0,d.pos.z);rx.v.pos.copy(tx.v.pos);placed=true;}}
  clock.ms+=1000/60;tx.f.G.time+=1/60;rx.f.G.time+=1/60;try{tx.f.G.projectiles.update(1/60);}catch(error){console.log('CRASH',i,bomb.age,bomb.s3Mode,bomb.pos.toArray(),!!bomb.mesh,tx.f.G.projectiles.bombs.includes(bomb),bomb.s3Sprinkler?.drops.length);throw error;}
  if(i%10===0){tx.nm._sendTick();rx.nm.onMessage('S',ticks.at(-1));}rx.nm.update(1/60);rx.f.G.projectiles.update(1/60);
  if(i===100||i===230)console.log('STATE',i,bomb.s3Mode,bomb.pos.toArray(),st?.drops.length,rx.nm._combatProvenance?.proofs.get('S'));
  while(previous<hits.length){const h=hits[previous++];assert.equal(h.w,'sprinkler');assert.equal(h.d,20);const before=rx.v.hp;rx.nm.onMessage('foreign',h);assert.equal(rx.v.hp,before);rx.nm.onMessage('S',{...h,w:'unknown-sub'});assert.equal(rx.v.hp,before);rx.nm.onMessage('S',{...h,d:40});assert.ok(!rx.nm._combatProvenance.pending.get('S')?.some(p=>p.d.h===h.h),'raw40 cannot reserve valid20 hit ID');rx.nm.onMessage('S',h);console.log('RESULT',rx.v.hp,acks.length,rx.nm._combatProvenance?.pending.get('S')?.length);contactCount++;}
  if(acks.length>=1)break;
 }
 console.log('CONTACT_FINAL',false,contactCount,rx.v.hp,acks.length,rx.f.G.projectiles.bombs.find(b=>b.ghost)?.s3Sprinkler?.drops.length);assert.equal(acks.length,1,'native receiver contact flushes one actual hit');assert.equal(rx.v.hp,100-(ap===57?10:20)*acks.length);
 tx.nm.dispose();rx.nm.dispose();
}
for(const source of ['angleShooter','sprinkler'])for(const ap of [0,57])test(`${source} JSON hit retains raw damage and applies victim ${ap}AP once`,async()=>{
 if(source==='sprinkler'){await nativeSprinklerWire(ap);return;}
 async function endpoint(){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true}),o=f.make(),v=f.make();
  Object.assign(o,{team:0,nid:1,owner:'attacker',netLife:0});Object.assign(v,{team:1,nid:2,owner:'victim',netLife:0,invuln:0});
  o.pos.set(0,0,0);v.pos.set(0,0,2);o.aimDir.set(0,0,1);equip(v,ap);equip(o,57);o.weapon={...o.weapon,sub:source};o.weaponRunner.reset();
  assert.equal(o.weapon.sub,source);
  if(source==='sprinkler')assert.equal(o.weaponRunner.s3Sub?.id,source,'runner selected the equipped sprinkler');
  return {f,o,v};
 }
 const sender=await endpoint(),receiver=await endpoint();let packet,ack;const ticks=[];
 function bind(world,myId,tr){
  const {f,o,v}=world,session={myId,hostId:'attacker',isHost:myId==='attacker',tr,_members:new Map([['attacker',{}],['victim',{}]])};
  const match={actors:[o,v],state:'playing',time:180,playing:()=>true};
  const nm=new f.NetMatch(session,{id:'direct-sub',map:'reef'});nm.bind(match);session.match=nm;f.G.match=match;f.G.netm=nm;f.G.actors=match.actors;return nm;
 }
 const tx=bind(sender,'attacker',{sendTo:(_id,p)=>{if(p.k==='hit')packet=JSON.parse(JSON.stringify(p));return true;},broadcast:p=>{if(p.k==='t')ticks.push(JSON.parse(JSON.stringify(p)));return true;}});
 const rx=bind(receiver,'victim',{sendTo:(_id,p)=>{if(p.k==='hit_ack')ack=JSON.parse(JSON.stringify(p));return true;},broadcast:p=>{if(p.k==='hit_ack')ack=JSON.parse(JSON.stringify(p));return true;}});
 try{
  // Real producer birth and receiver tick admission, never hand-written proofs.
  const born=sender.f.G.projectiles.throwBomb(sender.o);
  assert.ok(source==='angleShooter'?born:sender.f.G.projectiles.bombs.some(b=>b.owner===sender.o),'native equipped direct-sub birth');
  if(source==='sprinkler'){const b=sender.f.G.projectiles.bombs.find(b=>b.owner===sender.o);assert.equal(b.s3Sub?.id,source);assert.equal(b.s3Resolved?.spec?.id,source,'birth resolves the equipped sprinkler, not stale suction');}
  assert.equal(tx._sendTick(),true);assert.equal(ticks.length,1);
  const isBirth=e=>source==='angleShooter'?e[1]==='ac'&&e[2]==='sub'&&e[5]?.phase==='spawn'&&e[5]?.subId===source:e[1]==='b'&&e[2]===1&&e[3]==='bomb'&&e[11]===source;
  assert.ok(ticks[0].e.some(isBirth),'native direct-sub event recorded');
  rx.onMessage('attacker',ticks[0]);assert.ok(rx.peers.get('attacker')?.events.some(isBirth),'native direct-sub event admitted');
  // Raw40 validates wire resistance/ACK policy, not native sprinkler contact20.
  tx.sendHit(sender.o,sender.v,40,source);assert.equal(packet.d,40);
  const {v}=receiver,hp=v.hp;
  rx.onMessage('foreign',packet);assert.equal(v.hp,hp);rx.onMessage('attacker',{...packet,w:'unknown-sub'});assert.equal(v.hp,hp);
  if(source==='angleShooter'){rx.onMessage('attacker',{...packet,d:40.1});assert.equal(v.hp,hp,'source direct ceiling enforced before hit ID is consumed');}
  rx.onMessage('attacker',packet);
  // Receiver playback owns materialization; FIFO receipt alone is not a hit proof.
  for(let i=0;i<30&&!ack;i++){receiver.f.G.time+=1/60;rx.update(1/60);}
  if(source==='sprinkler')assert.ok(receiver.f.G.projectiles.bombs.some(b=>b.owner===receiver.o&&b.ghost),'native receiver sprinkler materialized');
  assert.equal(hp-v.hp,ap===57?20:40);assert.equal(ack?.d,ap===57?20:40,'ACK reports authoritative reduced damage');
  const after=v.hp;rx.onMessage('attacker',packet);assert.equal(v.hp,after);
 }finally{tx.dispose();rx.dispose();sender.f.G.projectiles.clear();receiver.f.G.projectiles.clear();}
});
import fs from 'node:fs';import crypto from 'node:crypto';
import {DIRECT_SUB_RESISTANCE_CURVES} from '../runtime/sub-resistance.mjs';
import {isHitPayloadValid,ANGLE_SHOOTER_HIT_MAX} from '../../reliability/net-hit-payload-adapter.mjs';
test('direct resistance curves and Angle hit bound come from pinned 11.3.0 fields',()=>{
 const bytes=fs.readFileSync(new URL('../reference/gear-params-1130.json',import.meta.url));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'7d01dc1542316bc496425a35efe1a7ece553b2e1b8140ebc4b465555e754788e');const raw=JSON.parse(bytes);
 assert.deepEqual(DIRECT_SUB_RESISTANCE_CURVES.angleShooter,[...raw.DamageRt_LineMarker].reverse());assert.deepEqual(DIRECT_SUB_RESISTANCE_CURVES.sprinkler,[...raw.DamageRt_Sprinkler].reverse());const lineBytes=fs.readFileSync(new URL('../reference/line-marker-1130.json',import.meta.url));assert.equal(crypto.createHash('sha256').update(lineBytes).digest('hex'),'aae1cbb683bdf95e4318d639b5b3ea183e3e6b030665891a7ac5d0f2acfc0dda');const line=JSON.parse(lineBytes);assert.equal(ANGLE_SHOOTER_HIT_MAX,line.GameParameters.MoveParam.DirectDamage/10);
 assert.equal(isHitPayloadValid({w:'angleShooter',d:40}),true);assert.equal(isHitPayloadValid({w:'angleShooter',d:40.1}),false);assert.equal(isHitPayloadValid({w:'angleShooter-forged',d:40}),false);
});

for(const wear of [false,true])test(`victim Sub Resistance does not alter Splash Wall object HP; attacker Object Shredder ${wear}`,async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true}),o=f.make(),defender=f.make();o.team=1;defender.team=0;equip(defender,57);o.s3.loadout[2].main=wear?'objectShredder':'none';defender.weapon={...defender.weapon,sub:'splashWall'};
 const wall=f.G.projectiles.throwBomb(defender);wall.phase='deployed';wall.pos.set(0,1,0);wall.prev.copy(wall.pos);wall.vel.set(0,0,0);wall.hp=1000;
 const p={owner:o,team:1,damage:40,wid:'angleShooter',size:.05,prev:new f.THREE.Vector3(0,1,-1),pos:new f.THREE.Vector3(0,1,1)};const ghost=f.G.projectiles.kitBarrierCandidate({...p,ghost:true},p.prev,p.pos);ghost.onHit();assert.equal(wall.hp,1000);
 const c=f.G.projectiles.kitBarrierCandidate(p,p.prev,p.pos);c.onHit();assert.equal(wall.hp,1000-40*(wear?1.5:1));c.onHit();assert.equal(wall.hp,1000-40*(wear?1.5:1));
});
