import {readySpecialEvidence,useSpecialEvidence} from './special-control-evidence.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
async function setup(){return fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});}
function equip(actor,id){actor.weapon={...actor.weapon,special:id,specialCost:100};actor.special=100;actor.alive=true;actor.remote=false;actor.intent.fire=false;actor.intent.sub=false;actor.intent.jump=false;actor._prevIntent||={};}
for(const [id,rate] of [['booyahBomb',1.1],['crabTank',1.3]])test(`Object Shredder applies target-specific ${id} armor multiplier on real Actor`,async()=>{
 const f=await setup(),defender=f.make(),attacker=f.make();equip(defender,id);attacker.team=1;attacker.pos.set(0,0,5);f.G.actors=[defender,attacker];
 attacker.s3.loadout[2].main='objectShredder';readySpecialEvidence(defender, {placeAtFixtureOrigin:true});defender._updateSpecial(1/60);
 const state=defender._s3AllSpecialState,before=state.armorHP,hp=defender.hp;
 defender.damage(100,attacker,'shooter');assert.ok(Math.abs(state.armorHP-(before-100*rate*(id==='booyahBomb'?.7:1)))<1e-9);assert.equal(defender.hp,hp);
});

import {objectShredderEquipped,objectGearRate,receiveObjectGearSnapshot,withObjectHitGear,OBJECT_SHREDDER_FLAG} from '../runtime/object-gear.mjs';
test('fixed gear identity requires shoes main and accepted owner/life; numbers and AP do not grant it',()=>{
 const a={s3:{loadout:[{main:'objectShredder'},{main:'objectShredder'},{main:'runSpeed',subs:['objectShredder']}],modifiers:{objectShredder:true,objectShredderAP:57}}};
 assert.equal(objectGearRate(a,'sprinkler'),1);a.s3.loadout[2].main='objectShredder';assert.equal(objectGearRate(a,'sprinkler'),10);assert.equal(objectGearRate(a,'unknown'),1);
 a.remote=true;a.owner='peer';a.netLife=3;assert.equal(objectShredderEquipped(a),false);
 receiveObjectGearSnapshot(a,'peer',OBJECT_SHREDDER_FLAG);assert.equal(objectShredderEquipped(a),true);
 a.netLife=4;assert.equal(objectShredderEquipped(a),false);a.netLife=3;a.owner='other';assert.equal(objectShredderEquipped(a),false);
 assert.equal(withObjectHitGear(a,10,()=>objectGearRate(a,'sprinkler')),1);
 assert.equal(withObjectHitGear(a,true,()=>objectGearRate(a,'sprinkler')),10);
 assert.throws(()=>withObjectHitGear(a,true,()=>{throw Error('test');}));assert.equal(a.s3.objectHitGear,undefined);
});
for(const id of ['booyahBomb','crabTank'])test(`${id}: no gear is identical, source attack rows and gear remain independent, rear/body is not multiplied`,async()=>{
 const f=await setup(),a=f.make(),b=f.make();equip(a,id);b.team=1;b.pos.set(0,0,5);readySpecialEvidence(a, {placeAtFixtureOrigin:true});a._updateSpecial(1/60);
 const s=a._s3AllSpecialState,start=s.armorHP;a.damage(20,b,'shooter');assert.equal(s.armorHP,start-20*(id==='booyahBomb'?.7:1));
 b.s3.loadout[2].main='objectShredder';const rate=id==='crabTank'?1.3:1.1;
 a.damage(20,b,'bomb');assert.ok(Math.abs(s.armorHP-(start-20*(id==='booyahBomb'?.7:1)-20*rate*(id==='booyahBomb'?1.5:1)))<1e-9);
 // Empty armor passes the original amount to the ordinary Actor damage chain.
 s.armorHP=0;a.specialActive.armor=false;a.hp=100;a._damageIFrames=0;
 a.damage(10,b,'shooter');assert.equal(a.hp,90);
});
function deploy(f,owner,id){owner.weapon={...owner.weapon,sub:id};const o=f.G.projectiles.throwBomb(owner);o.phase=id==='torpedo'?'chase':'deployed';o.chasedTarget=id==='torpedo';o.pos.set(0,1,0);o.prev.copy(o.pos);o.vel.set(0,0,0);o.hp=1000;return o;}
for(const [id,rate] of [['splashWall',1.5],['beakon',10],['torpedo',1.3],['inkMine',1]])test(`${id} direct object damage is target-specific, once-only and ghost-safe`,async()=>{
 const f=await setup(),a=f.make(),b=f.make();b.team=1;b.s3.loadout[2].main='objectShredder';const o=deploy(f,a,id);
 const p={owner:b,team:1,damage:10,size:.05,prev:new f.THREE.Vector3(0,1,-1),pos:new f.THREE.Vector3(0,1,1)};
 const ghost=f.G.projectiles.kitBarrierCandidate({...p,ghost:true},p.prev,p.pos);if(id==='inkMine'){assert.equal(ghost,null,'Ink Mine is not a destroyable device');assert.equal(o.hp,1000);return;}assert.ok(ghost);ghost.onHit();assert.equal(o.hp,1000);
 const hit=f.G.projectiles.kitBarrierCandidate(p,p.prev,p.pos);assert.ok(hit);hit.onHit();assert.equal(o.hp,1000-10*rate);hit.onHit();assert.equal(o.hp,1000-10*rate);
});
for(const [id,kind,rate] of [['waveBreaker','wave',1.25],['superChump','decoy',2]])test(`${id} object candidate applies fixed rate once and rejects ghosts`,async()=>{
 const f=await setup(),a=f.make(),b=f.make();equip(a,id);b.team=1;b.s3.loadout[2].main='objectShredder';f.G.actors=[a,b];readySpecialEvidence(a, {placeAtFixtureOrigin:true});useSpecialEvidence(f,a);
 const o=f.G.projectiles._s3AllSpecialObjects.find(o=>o.kind===kind);assert.ok(o);o.hp=1000;
 const p={owner:b,team:1,damage:10,prev:o.pos.clone().add(new f.THREE.Vector3(0,0,-2)),pos:o.pos.clone().add(new f.THREE.Vector3(0,0,2))};
 const ghost=f.G.projectiles.kitDefenseCandidate({...p,ghost:true},p.prev,p.pos);assert.ok(ghost);ghost.onHit();assert.equal(o.hp,1000);
 const c=f.G.projectiles.kitDefenseCandidate(p,p.prev,p.pos);assert.ok(c);c.onHit();assert.equal(o.hp,1000-10*rate);c.onHit();assert.equal(o.hp,1000-10*rate);
});

test('real NetMatch preserves shoes identity through JSON hit, rejects foreign sender, and deduplicates armor damage',async()=>{
 const f=await setup(),a=f.make(),v=f.make();a.team=1;a.nid=2;a.owner='attacker';v.nid=1;v.owner='victim';a.netLife=v.netLife=0;a.s3.loadout[2].main='objectShredder';
 let packet;const sender=new f.NetMatch({myId:'attacker',hostId:'attacker',isHost:true,tr:{sendTo:(_id,d)=>{packet=JSON.parse(JSON.stringify(d));}}},{id:'object-gear'});sender.bind({actors:[a,v],state:'playing',time:180});sender.sendHit(a,v,100,'shooter');assert.equal(packet.os,true);
 const receiver=new f.NetMatch({myId:'victim',hostId:'attacker',isHost:false,tr:{sendTo(){}}},{id:'object-gear'});receiver.bind({actors:[a,v],state:'playing',time:180});f.G.netm=receiver;
 equip(v,'booyahBomb');readySpecialEvidence(v, {placeAtFixtureOrigin:true});v._updateSpecial(1/60);v.invuln=0;const before=v._s3AllSpecialState.armorHP;
 a.s3.loadout[2].main='runSpeed';receiver.onMessage('foreign',packet);assert.equal(v._s3AllSpecialState.armorHP,before);
 receiver.onMessage('attacker',packet);assert.ok(Math.abs(v._s3AllSpecialState.armorHP-(before-77))<1e-9);assert.equal(a.s3.objectHitGear,undefined);
 receiver.onMessage('attacker',packet);assert.ok(Math.abs(v._s3AllSpecialState.armorHP-(before-77))<1e-9);
});

test('real owner snapshot bit27 is independent from RP and special ready and rejects stale/foreign rows',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export {objectShredderEquipped} from './patches/splatoon3/runtime/object-gear.mjs';"}),a=f.make();a.nid=1;a.owner='owner';a.s3.loadout[2].main='objectShredder';
 let packet;const sender=new f.NetMatch({myId:'owner',hostId:'owner',isHost:true,tr:{broadcast:d=>{packet=JSON.parse(JSON.stringify(d));}}},{id:'object-gear'});sender.bind({actors:[a],state:'playing',time:180});sender._sendTick();assert.ok(packet.a[0][10]&OBJECT_SHREDDER_FLAG);
 const remote=f.make();remote.owner='owner';remote.nid=1;const receiver=new f.NetMatch({myId:'viewer',hostId:'owner',isHost:false},{id:'object-gear'});receiver.bind({actors:[remote],state:'playing',time:180});
 receiver._tick('foreign',{...packet,ts:1});assert.equal(f.objectShredderEquipped(remote),false);
 receiver._tick('owner',{...packet,ts:2});assert.equal(f.objectShredderEquipped(remote),true);
 const clear=JSON.parse(JSON.stringify(packet));clear.ts=1;clear.a[0][10]&=~OBJECT_SHREDDER_FLAG;receiver._tick('owner',clear);assert.equal(f.objectShredderEquipped(remote),true);
 f.G.time+=1/60;a.s3.loadout[2].main='runSpeed';sender._sendTick();packet.ts=3;receiver._tick('owner',packet);assert.equal(f.objectShredderEquipped(remote),false);
});

for(const [id,kind,rate] of [['waveBreaker','wave',1.25],['superChump','decoy',2]])test(`${id}: real catalogue JSON proposals bind sender and target life and apply multiplier only once`,async()=>{
 const receiver=await setup(),owner=receiver.make(),remote=receiver.make();Object.assign(owner,{nid:101,owner:'defender',netLife:3});Object.assign(remote,{nid:102,owner:'attacker',netLife:7,team:1});
 const rx=new receiver.NetMatch({myId:'defender',hostId:'defender',isHost:true,tr:{broadcast(){}}},{id:'objects'});rx.bind({actors:[owner,remote],state:'playing',time:180});receiver.G.netm=rx;receiver.G.match=rx.match;
 const outbound=[];rx._rec=e=>outbound.push(JSON.parse(JSON.stringify(e)));equip(owner,id);readySpecialEvidence(owner, {placeAtFixtureOrigin:true});useSpecialEvidence(receiver,owner);
 const object=receiver.G.projectiles._s3AllSpecialObjects.find(o=>o.kind===kind);assert.ok(object);object.hp=1000;
 const sender=await setup(),remoteOwner=sender.make(),attacker=sender.make();Object.assign(remoteOwner,{nid:101,owner:'defender',netLife:3});Object.assign(attacker,{nid:102,owner:'attacker',netLife:7,team:1});attacker.s3.loadout[2].main='objectShredder';
 const tx=new sender.NetMatch({myId:'attacker',hostId:'defender',isHost:false,tr:{broadcast(){},sendTo(){}}},{id:'objects'});tx.bind({actors:[remoteOwner,attacker],state:'playing',time:180});sender.G.netm=tx;sender.G.match=tx.match;
 for(const e of outbound)tx._play('defender',[0,...e]);
 const ghost=sender.G.projectiles._s3AllSpecialObjects.find(o=>o.kind===kind);assert.ok(ghost);const proposals=[];tx._rec=e=>proposals.push(JSON.parse(JSON.stringify(e)));
 const p={owner:attacker,team:1,damage:10,prev:ghost.pos.clone().add(new sender.THREE.Vector3(0,0,-2)),pos:ghost.pos.clone().add(new sender.THREE.Vector3(0,0,2))};sender.G.projectiles.kitDefenseCandidate(p,p.prev,p.pos).onHit();
 const e=proposals.find(e=>e[4].action==='objectHit');assert.ok(e);assert.equal(e[4].objectShredder,true);assert.equal(e[4].damage,10,'sender sends raw damage, never a requested multiplier');
 rx._play('wrong',[0,...e]);assert.equal(object.hp,1000);rx._play('attacker',[0,...e]);assert.equal(object.hp,1000-10*rate);rx._play('attacker',[0,...e]);assert.equal(object.hp,1000-10*rate);
 const stale=JSON.parse(JSON.stringify(e));stale[4].tick+=1;stale[4].attackerLife=6;rx._play('attacker',[1,...stale]);assert.equal(object.hp,1000-10*rate);
 const numeric=JSON.parse(JSON.stringify(e));numeric[4].tick+=2;numeric[4].objectShredder=100;rx._play('attacker',[2,...numeric]);assert.equal(object.hp,1000-10*rate-10,'numeric multiplier cannot grant gear');
});

import fs from 'node:fs';
import crypto from 'node:crypto';
import {OBJECT_SHREDDER_RATES} from '../runtime/object-gear.mjs';
const reference=JSON.parse(fs.readFileSync(new URL('../reference/object-shredder-1130.json',import.meta.url)));
test('all fixed Object Shredder rates equal pinned target columns, without claiming source base-weapon damage rates',()=>{
 assert.equal(reference.receipt.version,'11.3.0');
 for(const [id,rate] of Object.entries(OBJECT_SHREDDER_RATES)){const row=reference.targets[id];assert.equal(row.RowKey,'ObjectEffect_Up');assert.equal(rate,row.DamageRate,id);}
});
test('raw damage-table content hash and extracted rows match the immutable source',{skip:!process.env.INKWAVE_OBJECT_DAMAGE_REFERENCE},()=>{
 const raw=fs.readFileSync(process.env.INKWAVE_OBJECT_DAMAGE_REFERENCE),table=JSON.parse(raw);
 assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),reference.receipt.sha256);
 assert.equal(crypto.createHash('sha1').update(`blob ${raw.length}\0`).update(raw).digest('hex'),reference.receipt.gitBlob);
 for(const row of Object.values(reference.targets))assert.deepEqual(table.CellList[`${row.RowKey}___${row.ColumnKey}`],row);
});

for(const id of ['booyahBomb','crabTank'])test(`${id}: actual native bomb explosion reaches armor with the source object multiplier`,async()=>{
 const losses=[];
 for(const wear of [false,true]){
  const f=await setup(),target=f.make(),attacker=f.make();equip(target,id);attacker.team=1;attacker.pos.set(0,0,5);attacker.weapon={...attacker.weapon,sub:'bomb'};attacker.weaponRunner.reset();
  attacker.s3.loadout[2].main=wear?'objectShredder':'runSpeed';f.G.actors=[target,attacker];f.G.physics.los=()=>true;readySpecialEvidence(target, {placeAtFixtureOrigin:true});target._updateSpecial(1/60);target.invuln=0;
  f.G.projectiles.throwBomb(attacker);const bomb=f.G.projectiles.bombs.at(-1);assert.ok(bomb);bomb.pos.set(0,.7,1);const state=target._s3AllSpecialState,before=state.armorHP;
  f.G.projectiles._explodeBomb(bomb);losses.push(before-state.armorHP);
 }
 assert.ok(losses[0]>0);assert.ok(Math.abs(losses[1]/losses[0]-(id==='crabTank'?1.3:1.1))<1e-9);
});

for(const [id,rate] of [['splashWall',1.5],['beakon',10],['torpedo',1.3]])test(`${id}: owner-admitted catalogue JSON applies raw damage and fixed gear once`,async()=>{
 const receiver=await setup(),owner=receiver.make(),remote=receiver.make();Object.assign(owner,{nid:201,owner:'defender',netLife:3});Object.assign(remote,{nid:202,owner:'attacker',netLife:7,team:1});
 const rx=new receiver.NetMatch({myId:'defender',hostId:'defender',isHost:true,tr:{broadcast(){},sendTo(){}}},{id:'subobjects'});rx.bind({actors:[owner,remote],state:'playing',time:180});receiver.G.netm=rx;receiver.G.match=rx.match;
 const outbound=[];rx._rec=e=>outbound.push(JSON.parse(JSON.stringify(e)));const target=deploy(receiver,owner,id);
 const sender=await setup(),remoteOwner=sender.make(),attacker=sender.make();Object.assign(remoteOwner,{nid:201,owner:'defender',netLife:3});Object.assign(attacker,{nid:202,owner:'attacker',netLife:7,team:1});attacker.s3.loadout[2].main='objectShredder';remoteOwner.weapon={...remoteOwner.weapon,sub:id};
 const tx=new sender.NetMatch({myId:'attacker',hostId:'defender',isHost:false,tr:{broadcast(){},sendTo(){}}},{id:'subobjects'});tx.bind({actors:[remoteOwner,attacker],state:'playing',time:180});sender.G.netm=tx;sender.G.match=tx.match;
 for(const e of outbound)tx._play('defender',[0,...e]);const ghost=sender.G.projectiles._s3SubObjects.find(o=>o.subId===id);assert.ok(ghost);
 ghost.phase=target.phase;ghost.chasedTarget=target.chasedTarget;ghost.pos.copy(target.pos);ghost.yaw=target.yaw;
 const records=[];tx._rec=e=>records.push(JSON.parse(JSON.stringify(e)));const p={owner:attacker,team:1,damage:10,size:.05,prev:ghost.pos.clone().add(new sender.THREE.Vector3(0,0,-1)),pos:ghost.pos.clone().add(new sender.THREE.Vector3(0,0,1))};
 sender.G.projectiles.kitBarrierCandidate(p,p.prev,p.pos).onHit();const event=records.find(e=>e[4].phase==='objectHit');assert.ok(event);assert.equal(event[4].damage,10);assert.equal(event[4].objectShredder,true);
 rx._play('foreign',[0,...event]);assert.equal(target.hp,1000);rx._play('attacker',[0,...event]);assert.equal(target.hp,1000-10*rate);rx._play('attacker',[0,...event]);assert.equal(target.hp,1000-10*rate);
});

for(const id of ['booyahBomb','crabTank'])for(const wear of [false,true])test(`${id} armor break boundary retains raw overflow with Object Shredder ${wear}`,async()=>{
 const f=await setup(),v=f.make(),a=f.make();equip(v,id);a.team=1;a.pos.set(0,0,5);a.s3.loadout[2].main=wear?'objectShredder':'runSpeed';readySpecialEvidence(v, {placeAtFixtureOrigin:true});v._updateSpecial(1/60);v.invuln=0;v.hp=100;
 const state=v._s3AllSpecialState;state.armorHP=50;v.specialActive.armorHP=50;
 const rate=(wear?(id==='crabTank'?1.3:1.1):1)*(id==='booyahBomb'?.7:1),rawOverflow=100-50/rate;
 const legacyBodyFactor=v.specialActive.armor===true?.25:1;
 const expectedDamage=Math.floor(rawOverflow*legacyBodyFactor*10+1e-9)/10; // existing final 0.1-HP quantizer
 v.damage(100,a,'shooter');assert.equal(state.armorHP,0);assert.equal(v.hp,100-expectedDamage);
});
