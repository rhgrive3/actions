// S3 Point Sensor / Tacticooler support integration (#710/#835).
// Tests exercise the installed Actor/WeaponRunner/Projectiles/NetMatch owners.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { gearCurve } from '../runtime/gear.mjs';
import { POINT_SENSOR, POINT_SENSOR_SOURCE, pointSensorMarkFrames, pointSensorThrowSpeed, pointSensorMark, pointSensorContact } from '../runtime/support-recon.mjs';
import { TACTICOOLER, TACTICOOLER_SOURCE, tacticoolerStandFrames, tacticoolerDrinkFrames, giveDrink, retireDrink, drinkEligible, drinkGearPoints } from '../runtime/support-cooler.mjs';

const tick = (f, n = 1) => { for(let i=0;i<n;i++) { f.G.time+=1/60; f.G.projectiles.update(1/60); } };
function throwAndLandCooler(f,a){a.aimDir.set(0,-1,0);a.intent.sub=true;a._updateSpecial(1/60);a.intent.sub=false;a._updateSpecial(1/60);
 for(let i=0;i<14&&a.specialActive;i++)a._updateSpecial(1/60);
 for(let i=0;i<10&&!(f.G.projectiles._s3SupportCoolers||[]).length;i++){f.G.time+=1/60;f.G.projectiles.update(1/60);}}
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
  assert.equal(f.WEAPONS.support.kitStatus,'opt-in-inkwave-support-approx-main',
    'provisional training kit must not be mislabeled as a legacy or source-verified main');
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
  // Splatoon 3 uses a real preparatory 5F/10F + 1F sub-use clock;
  // the source-owned throw is not legal on the first release frame.
  f.tick(actor,20);
  assert.ok(actor.ink<=ink-40,`real selected sub spends ink after readiness: ${actor.ink} vs ${ink}; pending=${JSON.stringify(actor.weaponRunner.s3SubReady)}`);
  assert.equal(f.G.projectiles.bombs.length,0,'sensor is not a damaging native Splat Bomb');
  assert.equal(f.G.projectiles._s3SupportSensors?.length,1);
  // The projectile inherits aim and the S3 launch arc. The marked actor
  // must intersect the *landed* field, not a guessed static world coordinate.
  let landed = null;
  for (let i = 0; i < 90; i++) {
    tick(f);
    const candidate = f.G.projectiles._s3SupportSensors?.[0];
    if (candidate?.activeAt !== null && candidate?.activeAt !== undefined) { landed = candidate; break; }
  }
  assert.ok(landed, 'the production sensor has landed and armed');
  enemy.pos.set(landed.pos.x, landed.pos.y - .7, landed.pos.z);
  ally.pos.copy(enemy.pos);
  tick(f,2);
  assert.ok(enemy.s3?.revealedUntil?.[0]>f.G.time,
    `enemy receives bounded team reveal at actual sensor hit: ${JSON.stringify({ field: landed.pos.toArray(), target: enemy.pos.toArray(), ghost: landed.ghost, ownerLife: landed.sourceLife })}`);
  tick(f,80);
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
test('S3 testing Wiki Point Sensor GP table rounds down and victim marking resistance applies', () => {
  // Independently measured GP table, not computed from the implementation.
  for(const [ap,frames] of [[0,480],[3,526],[6,570],[10,625],[20,744],[30,838],[57,960]])
    assert.equal(pointSensorMarkFrames(ap,gearCurve),frames);
  for(const [ap,percent] of [[0,100],[3,80.71],[6,70.05],[10,59.02],[20,39.16],[30,25.74],[57,10]]){
    const target={alive:true,team:1,s3:{abilityPoints:{subResistance:ap}}};
    pointSensorMark(target,0,10,8);
    assert.ok(Math.abs((target.s3.revealedUntil[0]-10)/8*100-percent)<.011,`GP${ap}`);
  }
});
test('Point Sensor late-entry mark expires eight seconds from impact at 30/60/120 Hz',async()=>{
  for(const hz of [30,60,120]){
    const {f,actor,enemy}=await setup();
    enemy.pos.set(100,0,100);
    const sensor=f.G.projectiles.throwBomb(actor);
    for(let i=0;i<hz*2&&sensor.activeAt===null;i++){f.G.time+=1/hz;f.G.projectiles.update(1/hz);}
    assert.notEqual(sensor.activeAt,null);
    const impact=sensor.activeAt;
    for(let i=0;i<hz*2;i++){f.G.time+=1/hz;f.G.projectiles.update(1/hz);}
    enemy.pos.copy(sensor.pos).add(new f.THREE.Vector3(0,-.7,0));
    f.G.time+=1/hz;f.G.projectiles.update(1/hz);
    assert.ok(Math.abs(enemy.s3.revealedUntil[0]-(impact+8))<1e-8);
    assert.ok(enemy.s3.revealedUntil[0]-f.G.time<6.01);
  }
});
test('Point Sensor keeps its field after owner respawn and uses its Lv1 saver curve',async()=>{
  const {f,actor,enemy}=await setup();
  actor.s3.loadout=Array.from({length:3},()=>({main:'inkSaverSub',subs:Array(3).fill('inkSaverSub')}));
  actor.s3RefreshGear();
  assert.equal(actor.s3.abilityPoints.inkSaverSub,57);
  assert.equal(actor.s3.modifiers.inkSaverSub,.7);
  enemy.pos.set(100,0,100);
  const sensor=f.G.projectiles.throwBomb(actor);tick(f,30);
  assert.notEqual(sensor.activeAt,null);
  actor.netLife=(actor.netLife||0)+1;
  enemy.pos.copy(sensor.pos).add(new f.THREE.Vector3(0,-.7,0));tick(f);
  assert.ok(enemy.s3.revealedUntil[0]>f.G.time,'a previously thrown sensor still marks in the next owner life');
});
test('Point Sensor bursts at an enemy capsule before distant terrain',async()=>{
  const {f,actor,enemy}=await setup();
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  const sensor=f.G.projectiles.throwBomb(actor);
  sensor.pos.set(0,.7,0);sensor.prev.copy(sensor.pos);sensor.vel.set(0,0,60);
  enemy.pos.set(0,0,.5);
  tick(f);
  assert.notEqual(sensor.activeAt,null);
  assert.ok(sensor.pos.z<1);
  assert.ok(enemy.s3.revealedUntil[0]>f.G.time);
});
test('#835 standalone cooler gives distinct one-per-player drinks and expires cleanly',async()=>{
  const {f,actor,ally,enemy}=await setup();
  ally.pos.set(0,0,1);enemy.pos.set(0,0,1);
  const normal=ally.s3.modifiers.runSpeed;
  actor.special=actor.specialCost();
  actor._startSpecial();throwAndLandCooler(f,actor);
  assert.equal(actor.special,0,'original game consumes special gauge');
  assert.equal(f.G.projectiles._s3SupportCoolers.length,1);
  tick(f,1);
  assert.equal(actor.s3.drink,true,'owner can take one');
  assert.equal(ally.s3.drink,true,'ally can take one');
  assert.notEqual(enemy.s3?.drink,true,'enemy can never take our drink');
  assert.ok(ally.s3.modifiers.runSpeed>normal,`live gear AP recomputed: normal=${normal}, after=${ally.s3.modifiers.runSpeed}, refresh=${typeof ally.s3RefreshGear}, drink=${ally.s3.drink}, points=${JSON.stringify(ally.s3.abilityPoints)}`);
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
  ally.pos.set(0,0,1);ally.form='squid';
  actor.special=actor.specialCost();actor._startSpecial();throwAndLandCooler(f,actor);
  tick(f,1);assert.notEqual(ally.s3.drink,true);
  ally.form='kid';tick(f,1);assert.equal(ally.s3.drink,true);
  ally.s3.drink=false;ally.s3.drinkUntil=0;
  tick(f,1);assert.equal(ally.s3.drink,false,'already taken after simulated splat');
});
test('#835 actor reset retires Tacticooler before gear equip recalculates a fresh life', async () => {
  const { f, ally } = await setup();
  const baseSpeed = ally.s3.modifiers.runSpeed;
  assert.equal(giveDrink(ally, f.G.time), true);
  assert.ok(ally.s3.modifiers.runSpeed > baseSpeed, 'drink affects the actual runner before death');
  ally.reset();
  assert.equal(ally.s3.drink, false, 'new life has no active drink');
  assert.equal(ally.s3.drinkUntil, 0, 'expiration clock is cleared');
  assert.equal(ally.s3.modifiers.runSpeed, baseSpeed,
    'respawn gear recalculation cannot carry a stale run-speed multiplier');
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


test('#710/#835 production r2 transport tick/sequence trailers survive sender-authenticated replay',async()=>{
  const {f,actor,enemy}=await setup();
  actor.remote=true;actor.owner='clientA';actor.nid=7;
  const nm=Object.create(f.NetMatch.prototype);
  nm.byNid=new Map([[7,actor],[2,enemy]]);
  nm.match=f.G.match;f.G.netm=nm;
  // In the actual network-replication adapter, _rec appends [fixedTick,wireSeq].
  const birth=[1,'ks','p',7,1,0,1.35,0,0,0,1,0,60,12];
  birth._netSeq=12;birth._netTick=60;
  nm._play('clientA',birth);
  assert.equal(f.G.projectiles._s3SupportSensors.length,1);
  const mark=[1.05,'ks','m',7,1,2,0,61,13];
  mark._netSeq=13;mark._netTick=61;
  nm._play('clientA',mark);
  assert.ok(enemy.s3?.revealedUntil?.[0]>f.G.time,'real r2 mark is accepted');
  const before=enemy.s3.revealedUntil[0];
  nm._play('clientA',mark);
  assert.equal(enemy.s3.revealedUntil[0],before,'duplicate transport cannot prolong mark');
  const stand=[1.1,'ks','c',7,2,0,0,1.6,0,62,14];
  stand._netSeq=14;stand._netTick=62;
  nm._play('clientA',stand);
  assert.equal(f.G.projectiles._s3SupportCoolers.length,1);
  const malformed=[1.2,'ks','p',7,3,0,1.35,0,0,0,1,0,60,15];
  malformed._netSeq=999;
  nm._play('clientA',malformed);
  assert.equal(f.G.projectiles._s3SupportSensors.length,1,'metadata mismatch fails closed');
  nm._play('intruder',[1.1,'ks','c',7,3,0,0,1.6,0,62,16]);
  assert.equal(f.G.projectiles._s3SupportCoolers.length,1,'other peer may not deploy');
});


test('#710/#835 exact pinned 1130 Point Sensor and Tacticooler duration/launch fields', () => {
  assert.deepEqual(POINT_SENSOR_SOURCE.markingFrames, [480,720,960]);
  assert.deepEqual(POINT_SENSOR_SOURCE.areaDistance, [6,6,6]);
  assert.deepEqual(POINT_SENSOR_SOURCE.spawnSpeedZ, [1.38,1.64,1.87]);
  assert.equal(POINT_SENSOR_SOURCE.spawnSpeedY, .24);
  assert.equal(POINT_SENSOR_SOURCE.inkConsume, .45);
  assert.equal(POINT_SENSOR_SOURCE.inkRecoverStopFrames, 75);
  assert.equal(POINT_SENSOR.radiusWorld,6);
  assert.equal(POINT_SENSOR.launchSpeedWorld,1.38*60);
  for(const [ap,frames,speed] of [[0,480,1.38],[57,960,1.87]]) {
    assert.equal(pointSensorMarkFrames(ap,gearCurve),frames);
    assert.ok(Math.abs(pointSensorThrowSpeed(ap,gearCurve)-speed*60)<1e-9);
  }
  assert.equal(pointSensorMarkFrames(30,gearCurve),838, '30 AP follows the existing S3 gear curve, not the table mid-index');
  assert.deepEqual(TACTICOOLER_SOURCE.powerUpFrames,[1020,1290,1500]);
  assert.equal(TACTICOOLER_SOURCE.putFrame,900);
  assert.equal(TACTICOOLER_SOURCE.putFrameOnYagura,450);
  assert.equal(TACTICOOLER_SOURCE.serveAreaRadius,7);
  assert.equal(TACTICOOLER_SOURCE.serveAreaHeightUp,3);
  assert.equal(TACTICOOLER_SOURCE.serveAreaHeightDown,0);
  assert.equal(tacticoolerDrinkFrames(0,gearCurve),1020);
  assert.equal(tacticoolerDrinkFrames(30,gearCurve),1397, 'non-midpoint 1290/1020/1500 source tier uses its own interpolation exponent');
  assert.equal(tacticoolerDrinkFrames(57,gearCurve),1500);
});
test('#835 pinned Tacticooler serving cylinder rejects through-floor pickups',()=>{
  const s={team:0,pos:{x:0,y:0,z:0},expires:20,taken:new Set()};
  const actor={team:0,alive:true,remote:false,form:'kid',pos:{x:0,y:3,z:0}};
  assert.equal(drinkEligible(actor,s,0),true);
  actor.pos.y=3.01;assert.equal(drinkEligible(actor,s,0),false);
  actor.pos.y=-.01;assert.equal(drinkEligible(actor,s,0),false);
  actor.pos.y=0;actor.pos.x=7;assert.equal(drinkEligible(actor,s,0),true);
  actor.pos.x=7.01;assert.equal(drinkEligible(actor,s,0),false);
});
test('#710/#835 authenticated extended source-frame packets survive r2 trailer and reject out of bounds',async()=>{
  const {f,actor,enemy}=await setup();
  actor.remote=true;actor.owner='clientA';actor.nid=7;
  const nm=Object.create(f.NetMatch.prototype);
  nm.byNid=new Map([[7,actor],[2,enemy]]);nm.match=f.G.match;f.G.netm=nm;
  const sensor=[1,'ks','p',7,1,0,1.35,0,0,0,1,0,60,21];
  sensor._netTick=60;sensor._netSeq=21;
  nm._play('clientA',sensor);
  assert.equal(f.G.projectiles._s3SupportSensors.length,1);
  const mark=[1.1,'ks','m',7,1,2,0,960,61,22];
  mark._netTick=61;mark._netSeq=22;
  nm._play('clientA',mark);
  assert.equal(enemy.s3.revealedUntil[0],16,'source 960F max marking duration');
  const before=enemy.s3.revealedUntil[0];
  nm._play('clientA',[1.2,'ks','m',7,1,2,0,10000,62,23]);
  assert.equal(enemy.s3.revealedUntil[0],before);
  const stand=[2,'ks','c',7,2,0,0,1.6,0,1500,63,24];
  stand._netTick=63;stand._netSeq=24;
  nm._play('clientA',stand);
  assert.equal(f.G.projectiles._s3SupportCoolers[0].drinkSeconds,25);
  const invalid=[2.1,'ks','c',7,3,0,0,1.6,0,1501,64,25];
  nm._play('clientA',invalid);
  assert.equal(f.G.projectiles._s3SupportCoolers.length,1);
});

test('Point Sensor mark source life follows the thrown field across owner respawn',async()=>{
  const {f,actor,enemy}=await setup();actor.remote=true;actor.owner='clientA';actor.nid=7;
  const nm=Object.create(f.NetMatch.prototype);nm.byNid=new Map([[7,actor],[2,enemy]]);nm.match=f.G.match;f.G.netm=nm;
  nm._play('clientA',[1,'ks','p',7,1,0,1.35,0,0,0,1,0]);
  actor.netLife=1;
  nm._play('clientA',[1.1,'ks','m',7,1,2,0,480,1,'l']);
  assert.ok(!(enemy.s3.revealedUntil?.[0]>0),'current owner life cannot impersonate the prior thrown field');
  const mark=[1.1,'ks','m',7,1,2,0,480,0,'l',61,22];mark._netTick=61;mark._netSeq=22;
  nm._play('clientA',mark);
  assert.equal(enemy.s3.revealedUntil[0],8,'the field source life remains valid after owner respawn');
});

test('Tacticooler source cylinder accepts partial native kid capsule across height and radial boundaries',async()=>{
 const {f,actor:a}=await setup();
 a.form='kid';a.remote=false;a.alive=true;a.team=0;a.pos.set(0,0,0);
 const stand={team:0,pos:new f.THREE.Vector3(),expires:10,taken:new Set()},body=f.PLAYER;
 a.pos.y=-body.height+.01;assert.equal(drinkEligible(a,stand,0,body),true,'the head can reach a stand on the platform above');
 a.pos.y=-body.height-.01;assert.equal(drinkEligible(a,stand,0,body),false,'the whole body below the cylinder stays outside');
 a.pos.set(TACTICOOLER.radiusWorld+body.radius-.01,0,0);assert.equal(drinkEligible(a,stand,0,body),true,'the capsule side can graze the source radius');
 a.pos.x=TACTICOOLER.radiusWorld+body.radius+.01;assert.equal(drinkEligible(a,stand,0,body),false);
 a.pos.set(TACTICOOLER.radiusWorld+body.radius*.8,-body.height+body.radius*.2,0);assert.equal(drinkEligible(a,stand,0,body),false,'rounded corners require actual capsule overlap');
 a.pos.set(0,3.01,0);assert.equal(drinkEligible(a,stand,0,body),false);
 a.form='squid';a.pos.set(0,0,0);assert.equal(drinkEligible(a,stand,0,body),false);
});

// FridgeParam.PutFrameOnYagura (450F) is shorter than ordinary PutFrame (900F).
test('tacticooler tower duration and moving-platform attachment use the landed stand position',async()=>{
 assert.equal(tacticoolerStandFrames(),900);
 assert.equal(tacticoolerStandFrames(true),450);
 const {f,actor}=await setup(),V=f.THREE.Vector3;
 const block={center:new V(0,0,0),axes:[new V(1,0,0),new V(0,1,0),new V(0,0,1)]};
 f.G.match.mode='tower';
 f.G.match.rankedWorld={towerBlock:block,_inTowerVolume:()=>true};
 actor.special=actor.specialCost();
 actor._startSpecial();throwAndLandCooler(f,actor);
 const stand=f.G.projectiles._s3SupportCoolers?.[0];assert.ok(stand);
 assert.equal(stand.onTower,true);
 assert.ok(Math.abs((stand.expires-f.G.time)-7.5)<1e-8);
 const original=stand.pos.clone();block.center.add(new V(.8,.2,-.4));tick(f);
 assert.ok(stand.pos.distanceTo(original.clone().add(new V(.8,.2,-.4)))<1e-9,
   'the stand follows the physical moving tower, including height');
 assert.ok(stand.mesh.position.distanceTo(stand.pos)<1e-9);
 f.G.time=stand.expires;tick(f);
 assert.equal(f.G.projectiles._s3SupportCoolers.length,0,'tower deck stand expires after 450F');

 const other=await setup();
 other.f.G.match.mode='tower';
 other.f.G.match.rankedWorld={towerBlock:block,_inTowerVolume:()=>false};
 other.actor.special=other.actor.specialCost();other.actor._startSpecial();
 throwAndLandCooler(other.f,other.actor);
 const normal=other.f.G.projectiles._s3SupportCoolers?.[0];assert.ok(normal);
 assert.equal(normal.onTower,false,'caster in Tower mode does not shorten an off-deck stand');
 assert.ok(Math.abs((normal.expires-other.f.G.time)-15)<1e-8);
});
