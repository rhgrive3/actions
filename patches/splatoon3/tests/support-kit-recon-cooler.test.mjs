// S3 Point Sensor / Tacticooler support integration (#710/#835).
// Tests exercise the installed Actor/WeaponRunner/Projectiles/NetMatch owners.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { POINT_SENSOR, pointSensorMark, pointSensorContact } from '../runtime/support-recon.mjs';
import { TACTICOOLER, giveDrink, retireDrink, drinkEligible, drinkGearPoints } from '../runtime/support-cooler.mjs';

const tick = (f, n = 1) => { for(let i=0;i<n;i++) { f.G.time+=1/60; f.G.projectiles.update(1/60); } };
async function setup() {
  const f=await fixture({fullRuntime:true,realProjectiles:true});
  f.G.scene ||= new f.THREE.Scene();
  f.G.camera ||= new f.THREE.PerspectiveCamera();
  f.G.match={state:'playing',playing:()=>true};
  f.G.actors=[];
  f.G.physics={
    los:()=>true,
    segment(_a,b,hit) {
      if(b.z>=1.3){hit.hit=true;hit.point.copy(b).setZ(1.3);hit.normal.set(0,0,-1);}
      else hit.hit=false;
      return hit;
    },
    raycast(_a,_b,_c,h){h.hit=false;return h;},
  };
  const actor=f.make('support');
  actor.nid=0;actor.owner='me';actor.isLocal=true;actor.form='kid';
  actor.aimYaw=0;actor.aimPitch=0;actor.aimDir.set(0,0,1);
  const ally=f.make('shooter');ally.nid=1;ally.owner='me';ally.team=0;ally.form='kid';
  const enemy=f.make('shooter');enemy.nid=2;enemy.owner='enemy';enemy.team=1;enemy.form='kid';
  f.G.actors=[actor,ally,enemy];
  return {f,actor,ally,enemy};
}
test('#710 opt-in support kit preserves original Shooter identity and 7-weapon list', async () => {
  const {f,actor}=await setup();
  assert.equal(f.WEAPONS.shooter.sub,'suction');
  assert.equal(f.WEAPONS.shooter.special,'trizooka');
  assert.equal(actor.weapon.id,'support');
  assert.equal(actor.weapon.kind,'shooter');
  assert.equal(actor.weapon.sub,'pointSensor');
  assert.equal(actor.weapon.special,'tacticooler');
  assert.equal(f.SUB.pointSensor.inkCost,45);
  assert.equal(POINT_SENSOR.areaSeconds,2.5);
  assert.equal(POINT_SENSOR.markSeconds,8);
  assert.ok(!f.WEAPON_ORDER.includes('support'),'support remains opt-in by URL');
});
test('#710 source-owned sensor uses no turf/damage, marks only opposing team', async () => {
  const {f,actor,ally,enemy}=await setup();
  let paint=0,damage=0;
  f.G.paint.splat=()=>{paint++;return 0;};
  f.G.projectiles.applyHit=()=>{damage++;};
  enemy.pos.set(.1,0,1.3); ally.pos.set(.1,0,1.3);
  let ink=actor.ink;
  actor.intent.sub=true; f.tick(actor);
  actor.intent.sub=false; f.tick(actor);
  assert.ok(actor.ink<=ink-40,'real selected sub owner spends its ink');
  assert.equal(f.G.projectiles.bombs.length,0,'sensor is not a damaging native Splat Bomb');
  assert.equal(f.G.projectiles._s3SupportSensors?.length,1);
  tick(f,90);
  assert.ok(enemy.s3?.revealedUntil?.[0]>f.G.time,'enemy receives bounded team reveal');
  assert.equal(enemy.s3?.revealedUntil?.[1],undefined);
  assert.equal(ally.s3?.revealedUntil?.[0],undefined);
  assert.equal(damage,0);
  assert.equal(paint,0);
  tick(f,220);
  assert.equal(f.G.projectiles._s3SupportSensors.length,0,'2.5-second area expires');
  assert.ok(enemy.s3.revealedUntil[0]<f.G.time+8,'expired sensor never perpetually refreshes a mark');
});
test('#710 low-level team/reveal guards refuse stale, ally and nonfinite inputs', () => {
  const enemy={alive:true,team:1,s3:{},pos:{x:0,y:0,z:0}};
  assert.equal(pointSensorMark(enemy,0,10),true);
  assert.equal(pointSensorMark(enemy,0,9),false);
  assert.equal(pointSensorMark(enemy,1,10),false);
  assert.equal(pointSensorMark(enemy,0,NaN),false);
  assert.equal(pointSensorContact(enemy,{x:0,y:.7,z:0},1.2),true);
  assert.equal(pointSensorContact(enemy,{x:0,y:.7,z:5},1.2),false);
});
test('#835 standalone cooler gives distinct one-per-player drinks and expires cleanly',async()=>{
  const {f,actor,ally,enemy}=await setup();
  ally.pos.set(0,0,1);enemy.pos.set(0,0,1);
  const normal=ally.s3.modifiers.runSpeed;
  actor.special=actor.specialCost();
  actor._startSpecial();
  assert.equal(actor.special,0,'original game consumes special gauge');
  assert.equal(f.G.projectiles._s3SupportCoolers.length,1);
  tick(f,1);
  assert.equal(actor.s3.drink,true,'owner can take one');
  assert.equal(ally.s3.drink,true,'ally can take one');
  assert.notEqual(enemy.s3?.drink,true,'enemy can never take our drink');
  assert.ok(ally.s3.modifiers.runSpeed>normal,'live gear AP recomputed');
  const stand=f.G.projectiles._s3SupportCoolers[0];
  assert.equal(stand.taken.size,2);
  tick(f,60);
  assert.equal(stand.taken.size,2,'same stand never grants twice');
  tick(f,17*60+2);
  assert.equal(ally.s3.drink,false,'drink expires at 17 seconds');
  assert.equal(ally.s3.modifiers.runSpeed,normal,'gear stats revert after expiry');
  assert.equal(f.G.projectiles._s3SupportCoolers.length,0,'stand expires at 15 seconds');
});
test('#835 a swimmer cannot take a drink and a respawn cannot re-take the same stand',async()=>{
  const {f,actor,ally}=await setup();
  actor.special=actor.specialCost();actor._startSpecial();
  ally.pos.set(0,0,1);ally.form='squid';
  tick(f,1);assert.notEqual(ally.s3.drink,true);
  ally.form='kid';tick(f,1);assert.equal(ally.s3.drink,true);
  ally.s3.drink=false;ally.s3.drinkUntil=0;
  tick(f,1);assert.equal(ally.s3.drink,false,'already taken after simulated splat');
});
test('#835 drink is a maximum AP, not stackable points; RP remains a penalty',()=>{
  const actor={alive:true,remote:false,s3:{},s3RefreshGear(){}};
  assert.equal(giveDrink(actor,10),true);
  assert.equal(drinkGearPoints({runSpeed:50,quickRespawn:6,swimSpeed:3},actor).runSpeed,50);
  assert.equal(drinkGearPoints({runSpeed:50,quickRespawn:6,swimSpeed:3},actor).quickRespawn,57);
  assert.equal(drinkGearPoints({runSpeed:50,quickRespawn:6,swimSpeed:3},actor).swimSpeed,29);
  assert.equal(retireDrink(actor,25),false);
  assert.equal(retireDrink(actor,27),true);
});
test('#710/#835 reject foreign, stale, malformed and wrong-weapon online event packets',async()=>{
  const {f,actor,enemy}=await setup();
  actor.remote=true;actor.owner='clientA';actor.nid=7;
  const net=Object.create(f.NetMatch.prototype);
  net.byNid=new Map([[7,actor],[2,enemy]]);
  net.match=f.G.match;
  f.G.netm=net;
  const packet=[1,'ks','p',7,1,0,1.35,0,0,0,1,0];
  net._play('intruder',packet);
  assert.equal(f.G.projectiles._s3SupportSensors?.length||0,0);
  net._play('clientA',[...packet.slice(0,11),99]);
  assert.equal(f.G.projectiles._s3SupportSensors?.length||0,0);
  net._play('clientA',packet);
  assert.equal(f.G.projectiles._s3SupportSensors.length,1);
  net._play('clientA',packet);
  assert.equal(f.G.projectiles._s3SupportSensors.length,1,'duplicate throw rejected');
  net._play('clientA',[2,'ks','m',7,1,2,0]);
  assert.equal(enemy.s3?.revealedUntil?.[0] > f.G.time,true);
  const initial=enemy.s3.revealedUntil[0];
  net._play('clientA',[2,'ks','m',7,1,2,0]);
  assert.equal(enemy.s3.revealedUntil[0],initial,'duplicate hit never extends mark');
  net._play('clientA',[3,'ks','c',7,2,0,0,1.6,0]);
  assert.equal(f.G.projectiles._s3SupportCoolers.length,1);
  net._play('clientA',[3,'ks','c',7,2,0,0,1.6,0]);
  assert.equal(f.G.projectiles._s3SupportCoolers.length,1);
});
