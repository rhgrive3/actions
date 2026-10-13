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
 else{f.G.projectiles.throwBomb(o);const b=f.G.projectiles.bombs.at(-1);f.kitBombContact(f.SUB,b,{hit:true,point:new f.THREE.Vector3(0,0,0),normal:new f.THREE.Vector3(0,1,0)});b.s3Sprinkler.nextFrame=Infinity;b.s3Sprinkler.drops.push({pos:new f.THREE.Vector3(0,.7,2),vel:new f.THREE.Vector3(),life:0,seed:.2});}
 for(let i=0;i<10&&v.hp===hp;i++){f.G.time+=1/fps;f.G.projectiles.update(1/fps);}assert.equal(hp-v.hp,(source==='angleShooter'?40:20)*(ap===57?.5:1));
});
for(const source of ['angleShooter','sprinkler'])for(const armor of ['booyahBomb','crabTank'])test(`${source} does not reduce ${armor} object armor but reduces body spillover`,async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true}),o=f.make(),v=f.make();o.team=1;o.pos.set(0,0,5);v.invuln=0;equip(v,57);v.weapon={...v.weapon,special:armor,specialCost:100};v.special=100;readySpecialEvidence(v);const state=v._s3AllSpecialState;
 state.armorHP=10;v.specialActive.armorHP=10;const hp=v.hp;v.damage(40,o,source);assert.equal(state.armorHP,0);assert.ok(Math.abs((hp-v.hp)-15)<1e-8,'source object rows consume raw armor; victim resistance reduces only the body spillover');
});
for(const source of ['angleShooter','sprinkler'])for(const ap of [0,57])test(`${source} JSON hit retains raw damage and applies victim ${ap}AP once`,async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true}),o=f.make(),v=f.make();Object.assign(o,{team:0,nid:1,owner:'attacker',netLife:0});Object.assign(v,{team:1,nid:2,owner:'victim',netLife:0,invuln:0});equip(v,ap);equip(o,57);o.weapon={...o.weapon,sub:source};
 let packet;const tx=new f.NetMatch({myId:'attacker',hostId:'attacker',isHost:true,tr:{sendTo:(_id,p)=>{packet=JSON.parse(JSON.stringify(p));}}},{id:'direct-sub'});tx.bind({actors:[o,v],state:'playing',time:180});tx.sendHit(o,v,40,source);assert.equal(packet.d,40);
 let ack;const rx=new f.NetMatch({myId:'victim',hostId:'attacker',isHost:false,tr:{sendTo:(_id,p)=>{ack=JSON.parse(JSON.stringify(p));}}},{id:'direct-sub'});rx.bind({actors:[o,v],state:'playing',time:180});f.G.netm=rx;const hp=v.hp;
 rx.onMessage('foreign',packet);assert.equal(v.hp,hp);rx.onMessage('attacker',{...packet,w:'unknown-sub'});assert.equal(v.hp,hp);if(source==='angleShooter'){rx.onMessage('attacker',{...packet,d:40.1});assert.equal(v.hp,hp,'source direct ceiling enforced before hit ID is consumed');}rx.onMessage('attacker',packet);assert.equal(hp-v.hp,ap===57?20:40);assert.equal(ack.d,ap===57?20:40,'ACK reports authoritative reduced damage');const after=v.hp;rx.onMessage('attacker',packet);assert.equal(v.hp,after);
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
