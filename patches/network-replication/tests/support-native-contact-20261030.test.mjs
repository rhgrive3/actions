import test from 'node:test';
import assert from 'node:assert/strict';
import {supportNativeProducer as setup} from './support-native-producer-fixture.mjs';


test('native Point Sensor payment/launch reaches a landed local contact; unspent, remote-origin and instant marks do not',async t=>{
  const x=await setup(t),{f,owner,victim}=x;
  victim.pos.set(100,0,100);x.deliver([],100,0);
  const fake=[1000,'ks','p',7,100,0,1.35,0,0,0,82.8,0,60000,1];
  x.deliver([fake],100,0);assert.equal(f.projectiles._s3SupportSensors?.length||0,0,'unspent birth has no capability');
  owner.ink=100;
  const rows=x.produce(()=>{owner.intent.sub=true;owner.weaponRunner.update(1/60,{sub:true,subReleased:false});owner.intent.sub=false;for(let i=0;i<30&&!nmHasBirth();i++)owner.weaponRunner.update(1/60,{sub:false,subReleased:i===0});function nmHasBirth(){return x.nm.out.some(e=>e[1]==='ks'&&e[2]==='p');}});
  const birth=rows.find(e=>e[1]==='ks'&&e[2]==='p');assert.ok(birth,'actual native paid throw must record ks/p');
  const ink=owner.ink;assert.ok(ink<=55.1);f.projectiles.clear();
  const distant=structuredClone(birth);distant[4]+=100;distant[5]=500;
  x.deliver([distant],ink,0);assert.equal(f.projectiles._s3SupportSensors.length,0,'unreachable origin rejected');
  // A fresh receiver-observed replenishment and real payment establish the next throw.
  x.deliver([],100,0);x.deliver([birth],ink,0);
  const sensor=f.projectiles._s3SupportSensors[0];assert.ok(sensor?.ghost);
  victim.pos.copy(sensor.pos);victim.pos.y-=.7;
  const mark=[1000,'ks','m',7,sensor.seq,8,0,480,0,'l',60000,1];x.deliver([mark],ink,0);
  assert.equal(victim.s3?.revealedUntil?.[0]>f.G.time,false,'flying field cannot mark');
  victim.pos.set(100,0,100);for(let i=0;i<120&&sensor.activeAt===null;i++)x.step();assert.notEqual(sensor.activeAt,null);
  victim.pos.copy(sensor.pos);victim.pos.y-=.7;x.step();assert.ok(victim.s3.revealedUntil[0]>f.G.time,'receiver-native landed field grants a real mark');
  const expiry=victim.s3.revealedUntil[0];x.deliver([mark],ink,0);x.step();assert.equal(victim.s3.revealedUntil[0],expiry);
});

test('Tacticooler needs accepted charged use and real throw/receiver land; fresh deploy claims cannot create drinks',async t=>{
  const x=await setup(t),{f,owner,victim}=x;victim.team=0;victim.pos.set(0,0,0);
  const fake=[1000,'ks','c',7,77,0,0,0,0,1020,60000,1];x.deliver([fake],100,0);x.step();
  assert.equal(f.projectiles._s3SupportCoolers?.length||0,0);assert.notEqual(victim.s3?.drink,true);
  owner.special=owner.specialCost();x.deliver([],100,owner.special);
  const rows=x.produce(()=>{owner._startSpecial();owner.intent.sub=true;owner._updateSpecial(1/60);owner.intent.sub=false;owner._updateSpecial(1/60);for(let i=0;i<14&&owner.specialActive;i++)owner._updateSpecial(1/60);});
  assert.ok(rows.some(e=>e[1]==='ev'&&e[2]==='special:use'));assert.ok(rows.some(e=>e[1]==='ks'&&e[2]==='t'));
  f.projectiles.clear();x.deliver(rows,100,0);assert.equal(f.projectiles._s3SupportCoolerThrows.length,1);
  for(let i=0;i<120&&!f.projectiles._s3SupportCoolers.length;i++)x.step();assert.equal(f.projectiles._s3SupportCoolers.length,1);
  const stand=f.projectiles._s3SupportCoolers[0];victim.pos.copy(stand.pos);x.step();assert.equal(victim.s3.drink,true);
  const until=victim.s3.drinkUntil,seq=stand.seq;x.deliver([[1000,'ks','c',7,seq+1,...stand.pos.toArray(),0,1500,60000,1]],100,0);x.step();
  assert.equal(f.projectiles._s3SupportCoolers.length,1);assert.equal(victim.s3.drinkUntil,until);
});


test('native support debit history and monotonic use count recover delayed actions without reusing credit',async t=>{
  const x=await setup(t),{f,owner,victim}=x;victim.pos.set(100,0,100);x.deliver([],100,0);
  owner.ink=100;
  const sensorRows=x.produce(()=>{owner.intent.sub=true;owner.weaponRunner.update(1/60,{sub:true,subReleased:false});owner.intent.sub=false;for(let i=0;i<30&&!x.nm.out.some(e=>e[1]==='ks'&&e[2]==='p');i++)owner.weaponRunner.update(1/60,{sub:false,subReleased:i===0});});
  const birth=sensorRows.find(e=>e[1]==='ks'&&e[2]==='p'),ink=owner.ink;assert.ok(birth);f.projectiles.clear();
  x.deliver([],ink,0); // Resource snapshot outruns its action event.
  x.deliver([birth],ink,0,.05);assert.equal(f.projectiles._s3SupportSensors.length,1,'late native throw consumes retained debit');
  const twice=structuredClone(birth);twice[4]+=1;x.deliver([twice],ink,0);assert.equal(f.projectiles._s3SupportSensors.length,1,'fresh serial cannot spend the same native ink debit');
  // The full-gauge packet is lost. Native use counter still advances once.
  owner.special=owner.specialCost();
  const rows=x.produce(()=>{owner._startSpecial();owner.intent.sub=true;owner._updateSpecial(1/60);owner.intent.sub=false;owner._updateSpecial(1/60);for(let i=0;i<14&&owner.specialActive;i++)owner._updateSpecial(1/60);});
  assert.ok(rows.some(e=>e[1]==='ks'&&e[2]==='t'));f.projectiles.clear();
  x.deliver([],ink,0);x.deliver(rows,ink,0,.05);assert.equal(f.projectiles._s3SupportCoolerThrows.length,1,'native use-counter increment proves a lost pre-use gauge snapshot');
  const replay=structuredClone(rows);for(const e of replay)if(e[1]==='ks'&&e[2]==='t')e[4]+=1;
  x.deliver(replay,ink,0);assert.equal(f.projectiles._s3SupportCoolerThrows.length,1,'same counter credit cannot authorize another throw');
});

test('Tacticooler held full-gauge activation followed by a later native release remains admissible',async t=>{
 const x=await setup(t),{f,owner,victim}=x;victim.pos.set(100,0,100);x.deliver([],100,0);
 owner.special=owner.specialCost();const use=x.produce(()=>owner._startSpecial());
 assert.ok(owner.specialActive);assert.equal(owner.special,owner.specialCost(),'native held reservation preserves reusable gauge value');
 x.deliver(use,100,owner.special);
 const launch=x.produce(()=>{owner.intent.sub=true;owner._updateSpecial(1/60);owner.intent.sub=false;owner._updateSpecial(1/60);for(let i=0;i<14&&owner.specialActive;i++)owner._updateSpecial(1/60);});
 assert.ok(launch.some(e=>e[1]==='ks'&&e[2]==='t'));const held=owner.special;f.projectiles.clear();
 x.deliver(launch,100,held);assert.equal(f.projectiles._s3SupportCoolerThrows.length,1);
});


test('native AP57 Point Sensor survives owner respawn with the original field and bounded source duration',async t=>{
 const x=await setup(t),{f,owner,victim}=x;owner.s3.loadout=Array.from({length:3},()=>({main:'subPower',subs:Array(3).fill('subPower')}));owner.s3RefreshGear();assert.equal(owner.s3.abilityPoints.subPower,57);victim.pos.set(100,0,100);x.deliver([],100,0);owner.ink=100;
 const rows=x.produce(()=>{owner.weaponRunner.update(1/60,{sub:true,subReleased:false});for(let i=0;i<30&&!x.nm.out.some(e=>e[1]==='ks'&&e[2]==='p');i++)owner.weaponRunner.update(1/60,{sub:false,subReleased:i===0});});
 const birth=rows.find(e=>e[1]==='ks'&&e[2]==='p'),ink=owner.ink;assert.ok(birth);f.projectiles.clear();x.deliver(rows,ink,0);
 const sensor=f.projectiles._s3SupportSensors[0];assert.ok(sensor?.ghost);
 for(let i=0;i<120&&sensor.activeAt===null;i++)x.step();assert.notEqual(sensor.activeAt,null);
 const impact=sensor.activeAt;owner.netLife=1;x.deliver([],ink,0);
 victim.pos.copy(sensor.pos);victim.pos.y-=.7;x.step();
 assert.ok(Math.abs(victim.s3.revealedUntil[0]-(impact+16))<1e-8,'native AP57 source is 960F from real impact');
 const until=victim.s3.revealedUntil[0];
 const malformed=[1000,'ks','m',7,sensor.seq,8,0,961,sensor.sourceLife,'l',60000,1];
 x.deliver([malformed],ink,0);assert.equal(victim.s3.revealedUntil[0],until,'out-of-source extended duration cannot refresh the native mark');
 const old=structuredClone(birth);old[4]+=100;x.deliver([],100,0);x.deliver([old],ink,0);
 assert.equal(f.projectiles._s3SupportSensors.length,1,'a stale-life birth cannot become another current-life field');
});

test('native AP57 Tacticooler flight owns its 1500F drink duration despite forged deploy duration',async t=>{
 const x=await setup(t),{f,owner,victim}=x;owner.s3.loadout=Array.from({length:3},()=>({main:'specialPower',subs:Array(3).fill('specialPower')}));owner.s3RefreshGear();assert.equal(owner.s3.abilityPoints.specialPower,57);victim.team=0;victim.pos.set(100,0,100);
 owner.special=owner.specialCost();x.deliver([],100,owner.special);
 const rows=x.produce(()=>{owner._startSpecial();owner.intent.sub=true;owner._updateSpecial(1/60);owner.intent.sub=false;owner._updateSpecial(1/60);for(let i=0;i<14&&owner.specialActive;i++)owner._updateSpecial(1/60);});
 assert.ok(rows.some(e=>e[1]==='ks'&&e[2]==='t'));f.projectiles.clear();x.deliver(rows,100,0);
 for(let i=0;i<120&&!f.projectiles._s3SupportCoolers.length;i++)x.step();
 const stand=f.projectiles._s3SupportCoolers[0];assert.ok(stand);assert.equal(stand.drinkSeconds,25);
 const invalid=[1000,'ks','c',7,stand.seq,...stand.pos.toArray(),stand.sourceLife,1501,60000,1];
 x.deliver([invalid],100,0);assert.equal(f.projectiles._s3SupportCoolers.length,1);assert.equal(stand.drinkSeconds,25);
 victim.pos.copy(stand.pos);x.step();assert.equal(victim.s3.drink,true);
 assert.ok(Math.abs(victim.s3.drinkUntil-f.G.time-25)<1e-8);
});
