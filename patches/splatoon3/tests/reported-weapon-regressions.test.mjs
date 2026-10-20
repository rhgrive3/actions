import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {FixedClock} from '../runtime/clock.mjs';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';
import {blasterHitCueKind} from '../runtime/audio/blaster-hit.mjs';
import {sourceChargerHitCue} from '../runtime/audio/combat-hit-classifier.mjs';
import {mainAudioSourceId} from '../runtime/audio/weapon-recipes.mjs';
import {throwVolley,trizookaSpecialWeapon,trizookaOrbitOffset,VOLLEY_CONFIG} from '../runtime/kit-trizooka.mjs';
const boot=()=>fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
for(const hz of [30,60,120])test(`scope releases three paid shots with finite recovery at ${hz} Hz`,async()=>{
 const f=await boot(),a=f.make('charger_scope'),clock=new FixedClock(),shots=[];
 f.on('weapon:fire',e=>{if(e.actor===a)shots.push(e);});
 for(let cycle=0;cycle<3;cycle++){
  const begin=clock.ticks;a.intent.fire=true;
  while(clock.ticks<begin+90)clock.advance(1/hz,dt=>{f.G.time+=dt;a.update(dt);});
  assert.equal(a.weaponRunner.charge,1);
  a.intent.fire=false;
  while(clock.ticks<begin+120)clock.advance(1/hz,dt=>{f.G.time+=dt;a.update(dt);});
  assert(Number.isFinite(a.weaponRunner.cooldown));assert.equal(shots.length,cycle+1);
 }
 assert.equal(mainAudioSourceId('charger_scope'),'s3-charger-normalscope');
});
test('finite full-charge flight preserves critical audio after trigger release',async()=>{
 const f=await boot(),a=f.make('charger'),foe=f.make('shooter'),hits=[];
 a.isLocal=true;foe.team=1;foe.pos.set(0,0,5);foe.invuln=0;foe.hp=foe.maxHp=500;
 f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,20);
 f.on('hit',e=>hits.push(e));
 f.G.projectiles.fireCharger(a,a.weapon,1);a.weaponRunner.charge=0;
 for(let i=0;i<10;i++)f.G.projectiles.update(1/60);
 assert.equal(hits.length,1);assert.equal(hits[0].hitMeta?.charge,1);
 assert.equal(sourceChargerHitCue(hits[0].weaponId,hits[0].hitMeta.charge),'combat:critical');
 assert.equal(a._sourceChargerAudioHit,undefined);
 assert.equal(sourceChargerHitCue('charger_scope',1),'combat:critical');
});
test('reduced 25 damage Blaster contacts never announce full direct criticals',()=>{
 const actor={weapon:{kind:'blaster',directDamage:125}};
 assert.equal(blasterHitCueKind(actor,'blaster',25),'indirect');
 assert.equal(blasterHitCueKind(actor,'blaster',125),'direct');
 const rapid={weapon:{kind:'catalog',behaviorKind:'blaster',catalogRecord:{parameters:{DamageParam:{ValueMax:850}}}}};
 assert.equal(blasterHitCueKind(rapid,'s3-blaster-light',25),'indirect');
 assert.equal(blasterHitCueKind(rapid,'s3-blaster-light',85),'direct');
});
for(const hz of [30,60,120])test(`Burst preview and actual first contact agree at ${hz} Hz`,async()=>{
 const f=await sourceLoadedActorFixture({random:()=>.4}),a=await f.make();
 for(const pitch of [-.2,0,.65])for(const ap of [0,57]){
  a.pos.set(0,0,0);a.vel.set(0,0,0);a.weapon={...a.weapon,sub:'burst'};
  a.aimPitch=pitch;a.aimYaw=0;a.s3.abilityPoints={...a.s3.abilityPoints,subPower:ap};
  a.weaponRunner.aimingSub=true;a.character.update(1/60,{subAim:true,hp:100});
  f.G.projectiles.updateArc(a,true);assert(f.G.projectiles.arcRing.visible);
  const expected=f.G.projectiles.arcRing.position.clone();
  const object=f.G.projectiles.throwBomb(a);assert(object);let contact;
  const off=f.on('all:sub',e=>{if(e.actor===a&&e.phase==='burst')contact=new f.THREE.Vector3(e.x,e.y,e.z);});
  for(let i=0;i<hz*4&&!contact;i++){f.G.time+=1/hz;f.G.projectiles.update(1/hz);}
  off();assert(contact,'live projectile reaches its contact');
  assert(contact.distanceTo(expected)<1e-5,JSON.stringify({hz,pitch,ap,expected:expected.toArray(),actual:contact.toArray()}));
  f.G.projectiles.clear();
 }
 f.reset();
});
test('all main models stow through sub aim and throw, and restore afterwards',async()=>{
 const f=await sourceLoadedActorFixture({random:()=>.4}),a=await f.make(),c=a.character;
 for(const id of ['shooter','s3-roller-compact','roller','charger_scope','splatling']){
  a.setWeapon(id);a.weaponRunner.aimingSub=true;
  for(let i=0;i<20;i++){f.G.time+=1/60;a._finishFrame(1/60);}
  assert.equal(c.weapon.pivot.visible,false,id+' held');
  c.trigger('throw');a.weaponRunner.aimingSub=false;
  f.G.time+=1/60;a._finishFrame(1/60);assert.equal(c.weapon.pivot.visible,false,id+' release');
  for(let i=0;i<65;i++){f.G.time+=1/60;a._finishFrame(1/60);}
  assert.equal(c.weapon.pivot.visible,true,id+' restored');
 }
 f.reset();
});
test('Trizooka lobes share a launch axis and a volley-time orbit clock',async()=>{
 const f=await boot(),a=f.make('shooter');a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,25);
 const lobes=throwVolley(f.G.projectiles,a,trizookaSpecialWeapon());assert.equal(lobes.length,3);
 for(const p of lobes)assert(p.vel.clone().normalize().distanceTo(lobes[0].vel.clone().normalize())<1e-10);
 const rows=lobes.map((p,i)=>trizookaOrbitOffset({...p,age:.5-i*VOLLEY_CONFIG.lobeInterval}));
 for(let i=1;i<3;i++)assert(Math.abs(rows[i].phase-rows[0].phase-i*2*Math.PI/3)<1e-10);
 assert.equal(trizookaOrbitOffset({...lobes[0],age:0}).radius,0);
});
