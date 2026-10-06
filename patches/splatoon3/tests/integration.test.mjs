import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
test('actual Actor stores a full charger charge and expires it without firing underwater', async () => {
  const f = await fixture(), a = f.make('charger'); a.intent.fire = true;
  f.tick(a, 61); assert.ok(a.weaponRunner.charge >= .999);
  a.intent.squid = true; f.tick(a); assert.equal(a.form, 'squid'); assert.ok(a.weaponRunner.s3Stored);
  // ZR stays held, so only the 75 frame window can end the keep, and it fires nothing.
  f.tick(a, 74); assert.equal(f.shots.length, 0); assert.equal(a.weaponRunner.s3Stored, null);
});
test('stored charge survives emergence on a held ZR and fires on release; reset clears it', async () => {
  const f = await fixture(), a = f.make('charger'); a.intent.fire = true; f.tick(a, 61);
  a.intent.squid = true; f.tick(a); a.intent.squid = false; f.tick(a, 6); assert.equal(f.shots.length, 0);
  a.intent.fire = false; f.tick(a);
  assert.equal(f.shots.length, 1); assert.equal(f.shots[0].charge, 1);
  a.reset(); assert.equal(a.weaponRunner.s3Stored, null);
});
test('actual stationary post-dodge state persists after lock and cancels on movement', async () => {
  const f = await fixture(), a = f.make('dualies'), r = a.weaponRunner;
  a.intent.fire = true; r.dodge = { t: 0, dur: a.weapon.rollTime };
  for (let i = 0; i < 100; i++) r.update(1 / 60, { fire: true });
  assert.equal(r.lockT, 0); assert.equal(r.s3Turret, true); assert.equal(r._spreadDeg(a.weapon), 0);
  a.intent.move.set(1, 0, 0); r.update(1 / 60, { fire: true }); assert.equal(r.s3Turret, false);
});
test('jump initiation selects vertical roller windup, retaining it after landing', async () => {
  const f = await fixture(), a = f.make('roller'), r = a.weaponRunner;
  a.grounded = false; r.update(1 / 60, { fire: true, firePressed: true });
  assert.equal(r.s3FlickVertical, true); a.grounded = true;
  for (let i = 0; i < 31; i++) r.update(1 / 60, { fire: true });
  assert.equal(f.shots.length, 1); assert.equal(f.shots[0].windup, 31 / 60);
});
test('actual roll consumes one jump edge and routes armor overflow through damage', async () => {
  const f = await fixture(), a = f.make(); a.form = 'squid'; a.intent.squid = true;
  a.vel.set(0, 0, f.PLAYER.swimSpeed); a.intent.move.set(0, 0, -1); a.intent.jump = true;
  f.tick(a); assert.ok(a.s3.roll); assert.ok(a.vel.z < 0); assert.equal(a.invuln, 0);
  const first = a.s3.roll; f.tick(a); assert.equal(a.s3.roll, first);
  a.damage(60, null, 'shooter'); assert.equal(a.hp, 100);
  // The first 60 breaks 30 HP armor while absorbing that entire hit.
  a.damage(60, null, 'shooter'); assert.equal(a.hp, 40);
});
test('surge holds still, fully charges, launches on release and cancels on loss of wall', async () => {
  const f = await fixture(), a = f.make(); a.form = 'squid'; a.intent.squid = true; a.climbing = true;
  a._updateClimb = () => {}; a.intent.jump = true; f.tick(a, 46);
  assert.equal(a.vel.length(), 0); assert.equal(a.s3.surge.charge, 1);
  a.intent.jump = false; f.tick(a); assert.equal(a.s3.surge.phase, 'burst'); assert.ok(a.vel.y > f.PLAYER.climbSpeed);
  a.reset(); a.form = 'squid'; a.intent.squid = true; a.climbing = true; a.intent.jump = true; f.tick(a, 5);
  a.climbing = false; f.tick(a); assert.equal(a.s3.surge, null);
});
test('zero gear has normal refill, and unrelated actors retain separate stats', async () => {
  const f = await fixture(), a = f.make(), b = f.make(); a.ink = 0; a.form = 'squid'; a.intent.squid = true;
  f.tick(a, 60); assert.ok(Math.abs(a.ink - 100 / 3) < 1e-8);
  assert.notEqual(a.weapon, b.weapon); assert.ok(Math.abs(b.weapon.inkPerShot - .92) < 1e-12);
});
test('full charger beam pierces two enemies, stops at a wall, and skips teammates', async () => {
  const f = await fixture(), { G, THREE } = f, a = f.make('charger');
  const victims = [3, 6, 9].map(z => { const e = f.make(); e.team = 1; e.pos.set(0, 0, z); return e; });
  const teammate = f.make(); teammate.pos.set(0, 0, 2);
  a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1.05, 30);
  G.actors = [a, teammate, ...victims];
  G.physics.raycast = (from, dir, _distance, hit) => {
    hit.hit = dir.z > .9; hit.dist = 7; hit.point.copy(from).addScaledVector(dir, 7); hit.normal.set(0, 0, -1); return hit;
  };
  const system = new f.Projectiles(new THREE.Scene()), hits = [];
  system.applyHit = (_owner, target, damage) => hits.push({ target, damage });
  system.fireCharger(a, a.weapon, 1);
  assert.deepEqual(hits.map(h => h.target), victims.slice(0, 2));
  assert.ok(hits.every(h => h.damage === 160));
  assert.equal(system.beams[0].mesh.scale.z, 7); assert.equal(G.actors.length, 5);
  hits.length = 0; system.fireCharger(a, a.weapon, .5);
  assert.equal(hits.length, 1); assert.equal(hits[0].target, victims[0]); assert.equal(hits[0].damage, 60);
});
test('splatling charges once and does not pay again for every burst bullet', async () => {
  const f = await fixture(), a = f.make('splatling'), r = a.weaponRunner;
  for (let i = 0; i < 73; i++) r.update(1 / 60, {fire:true});
  assert.equal(r.charge, 1); r.update(1 / 60, {fire:false});
  assert.ok(Math.abs(a.ink - 77.5) < 1e-9);
  for (let i = 0; i < 170; i++) r.update(1 / 60, {fire:false});
  assert.ok(f.shots.length > 35); assert.ok(Math.abs(a.ink - 77.5) < 1e-9);
});
test('blaster windup survives trigger release and spaces repeated shots', async () => {
  const f = await fixture(), a = f.make('blaster'), r = a.weaponRunner;
  r.update(1 / 60, {fire:true}); assert.equal(f.shots.length, 0);
  for (let i = 0; i < 9; i++) r.update(1 / 60, {fire:false});
  assert.equal(f.shots.length, 0); r.update(1 / 60, {fire:false}); assert.equal(f.shots.length, 1);
  for (let i = 0; i < 39; i++) r.update(1 / 60, {fire:true}); assert.equal(f.shots.length, 1);
  for (let i = 0; i < 12; i++) r.update(1 / 60, {fire:true}); assert.equal(f.shots.length, 2);
});
test('respawn clears resource suppression from the previous life', async () => {
  const f = await fixture(), a = f.make(); a.s3.recoverStopRemaining = 100; a.s3.enemyInkTime = 3;
  a.reset(); assert.equal(a.s3.recoverStopRemaining, 0); assert.equal(a.s3.enemyInkTime, 0);
});
test('disabled shadows use the original renderer without touching an unallocated shadow map', async () => {
  const f = await fixture(); let calls = 0;
  const sm = { enabled:false, render: () => calls++, autoUpdate:true };
  const cache = new f.ShadowCache({shadowMap:sm});
  sm.render([{isDirectionalLight:true, shadow:{map:null}}], f.G.scene, {});
  assert.equal(calls, 1); assert.equal(cache.cache, null);
});
test('a released short keyboard/mouse tap reaches the actual controller once', async () => {
  const f = await fixture(), a = f.make(), camera = new f.THREE.PerspectiveCamera(); f.G.camera = camera; f.G.settings = {};
  const pressed = new Set(['Space']), mouse = {dx:0,dy:0,left:false,leftPressed:true};
  const input = {mouse, down:()=>false, wasPressed:key=>pressed.has(key), padPressed:new Set(), padButton:()=>false, padValue:()=>0};
  const controller = new f.PlayerController(a, {yaw:0,pitch:0,gameCam:camera}, input);
  controller.update(1/60); assert.equal(a.intent.jump, true); assert.equal(a.intent.fire, true);
  pressed.clear(); mouse.leftPressed = false; controller.update(1/60);
  assert.equal(a.intent.jump, false); assert.equal(a.intent.fire, false);
});
test('gear uses distinct walk and firing curves, and does not speed up roller rolling', async () => {
  const f = await fixture(), a = f.make(), b = f.make('roller');
  a.s3.loadout = b.s3.loadout = Array.from({length:3}, () => ({main:'runSpeed',subs:['runSpeed','runSpeed','runSpeed']}));
  a.setWeapon('shooter'); b.setWeapon('roller');
  assert.ok(Math.abs(a.weaponRunner.moveSpeed()-f.PLAYER.runSpeed*1.5)<1e-9);
  a.weaponRunner.firingT = 1; assert.ok(Math.abs(a.weaponRunner.moveSpeed()-a.weapon.moveSpeedFiring*1.25)<1e-9);
  b.weaponRunner.rolling = true; b.weaponRunner.rollT = 2; assert.equal(b.weaponRunner.moveSpeed(), b.weapon.rollSpeed);
});
test('splatling first stage yields its 80-frame stream, conserving the prepaid ink', async () => {
  const f = await fixture(), a = f.make('splatling'), r = a.weaponRunner;
  a.ink = 11.25;
  for(let i=0;i<73;i++)r.update(1/60,{fire:true});
  assert.ok(Math.abs(r.charge-2/3)<1e-9);
  r.update(1/60,{fire:false});
  assert.ok(Math.abs(r.burstDur-80/60)<1e-9); assert.ok(a.ink<1e-9);
  for(let i=0;i<90;i++)r.update(1/60,{fire:false});
  assert.equal(f.shots.length,20); assert.ok(a.ink<1e-9);
});
test('bomb sub power normalizes the low base once and reaches the raw high value', async () => {
  const f = await fixture(), a = f.make(), r = a.weaponRunner; let thrown;
  a.s3.loadout = Array.from({length:3},()=>({main:'subPower',subs:['subPower','subPower','subPower']}));a.setWeapon('shooter');
  const ps = new f.Projectiles(new f.THREE.Scene()); f.G.projectiles = ps;
  const velocity = ps.throwVelocity.bind(ps);
  ps.throwVelocity = (actor, speed, out) => { thrown = speed; return velocity(actor, speed, out); };
  for (let i = 0; i < 6; i++) r.update(1/60,{sub:true});
  r.update(1/60,{subReleased:true}); assert.equal(ps.bombs.length,1);
  assert.ok(Math.abs(thrown-1.68*60)<1e-9);assert.ok(Math.abs(f.SUB.bomb.throwSpeed-1.12*60)<1e-9);
});
test('splatling diving cancels both charging and an active stream', async () => {
  const f=await fixture(),a=f.make('splatling');a.intent.fire=true;f.tick(a,30);assert.equal(a.weaponRunner.charging,true);
  a.intent.squid=true;f.tick(a);assert.equal(a.form,'squid');assert.equal(a.weaponRunner.charging,false);assert.equal(f.shots.length,0);
  a.reset();a.intent.squid=false;a.intent.fire=true;f.tick(a,73);a.intent.fire=false;f.tick(a,2);assert.equal(a.weaponRunner.streaming,true);
  const count=f.shots.length;a.intent.squid=true;f.tick(a,45);assert.equal(a.weaponRunner.streaming,false);assert.equal(f.shots.length,count);
});
test('an 8F legal Charger charge has already spent the 2.25 percent minimum before release', async () => {
  const f=await fixture(),a=f.make('charger'),r=a.weaponRunner;a.ink=2.25;
  // C22's 1F humanoid startup precedes the eight legal charge frames.
  r.update(1/60,{fire:true});
  for(let i=0;i<8;i++)r.update(1/60,{fire:true});
  assert.ok(a.ink<1e-9,'minimum charge ink is committed during charging');
  const charge=r.charge;
  r.update(1/60,{fire:false});
  assert.equal(f.shots.length,1);assert.equal(f.shots[0].charge,charge);
  assert.ok(a.ink<1e-9,'release does not debit the already-paid charge again');
});
test('airborne Charger charge advances at one third rate without resetting across landing', async () => {
  const f=await fixture(),a=f.make('charger'),r=a.weaponRunner;a.ink=100;a.grounded=false;
  r.update(1/60,{fire:true}); // 1F humanoid startup
  for(let i=0;i<60;i++)r.update(1/60,{fire:true});
  assert.ok(Math.abs(r.chargeT-1/3)<1e-9);assert.ok(r.charge<.999);
  a.grounded=true;
  for(let i=0;i<40;i++)r.update(1/60,{fire:true});
  assert.ok(Math.abs(r.chargeT-1)<1e-9);assert.ok(r.charge>=.999);
});
test('global menu time cannot skip an actor ink recovery wait', async () => {
  const f=await fixture(),a=f.make();a.form='squid';a.intent.squid=true;a.ink=0;a.lastFire=2;a.s3.recoverStopRemaining=.5;
  f.G.time=1000;f.tick(a);assert.equal(a.ink,0);assert.ok(a.s3.recoverStopRemaining>.48);
  f.tick(a,40);assert.ok(a.ink>0);
});
