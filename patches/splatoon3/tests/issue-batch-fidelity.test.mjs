import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const EPS = 1e-8;
const close = (actual, expected, eps = EPS) => assert.ok(Math.abs(actual - expected) <= eps, `${actual} != ${expected}`);

test('death causes keep separate S3 respawn totals', async () => {
  const f = await fixture(), a = f.make();
  a.splat(null, 'weapon'); close(a.respawnTimer, 8.5);
  a.reset(); a.splat(null, 'water'); close(a.respawnTimer, 7);
  a.reset(); a.splat(null, 'out-of-bounds'); close(a.respawnTimer, 5.5);
});

test('humanoid and submerged health regeneration use 12.5 and 100 HP/s after the delay', async () => {
  const f = await fixture(), a = f.make();
  a.hp = 50; a.lastDamage = f.profile.resources.regenDelay;
  f.tick(a, 60); close(a.hp, 62.5);
  a.reset(); a.hp = 50; a.lastDamage = f.profile.resources.regenDelay; a.form = 'squid'; a.intent.squid = true;
  a.grounded = true; a.ground.hit = true; a.ground.face = 0;
  f.tick(a, 30); close(a.hp, 100);
});

test('Splattershot uses 3F humanoid first shot, 12F swim first shot and 4F post-shot swim lock', async () => {
  const f = await fixture(), a = f.make('shooter');
  a.intent.fire = true;
  f.tick(a, 2); assert.equal(f.shots.length, 0);
  f.tick(a); assert.equal(f.shots.length, 1);
  f.tick(a, 5); assert.equal(f.shots.length, 1, 'first-shot gate must not bank negative cooldown');
  f.tick(a); assert.equal(f.shots.length, 2, 'normal 6F cadence resumes after the gated first shot');

  // Release the first trigger before starting the independent swim-origin case.
  a.intent.fire = false;
  a.reset(); f.shots.length = 0; a.intent.squid = true; a.kidT = 99;
  f.tick(a); assert.equal(a.form, 'squid'); a.intent.fire = true;
  f.tick(a, 11); assert.equal(f.shots.length, 0);
  f.tick(a); assert.equal(f.shots.length, 1); assert.equal(a.form, 'kid');
  a.intent.fire = false; a.intent.squid = true;
  f.tick(a, 3); assert.equal(a.form, 'kid');
  f.tick(a); assert.equal(a.form, 'squid');
});

test('charger stores only full charge for 75F and enforces the 31F stored-fire gate', async () => {
  const f = await fixture(), a = f.make('charger'), r = a.weaponRunner;
  a.intent.fire = true; f.tick(a, 30); a.intent.squid = true; f.tick(a);
  assert.equal(r.s3Stored, null);

  a.reset(); a.grounded = true; a.intent.squid = false; a.intent.fire = true; f.tick(a, 60);
  assert.ok(r.charge >= .999);
  a.intent.squid = true; f.tick(a); assert.ok(r.s3Stored);
  a.intent.fire = false; f.tick(a, 29); assert.ok(r.s3Stored); assert.ok(r.s3Stored.fireDelay > 0);
  f.tick(a); assert.ok(r.s3Stored); close(r.s3Stored.fireDelay, 0);
  a.intent.squid = false; a.intent.fire = true; f.tick(a); assert.equal(r.s3Stored, null);
  a.intent.fire = false; f.tick(a); assert.equal(f.shots.filter(x => x.kind === 'charger').length, 1);

  a.reset(); a.grounded = true; f.shots.length = 0; a.intent.fire = true; f.tick(a, 60); a.intent.squid = true; f.tick(a);
  a.intent.fire = false; f.tick(a, 75); assert.equal(r.s3Stored, null);
});

test('charger uses 1/3 charge rate in air and with an empty tank and rejects releases under 8F', async () => {
  const f = await fixture();
  let a = f.make('charger'), r = a.weaponRunner;
  for (let i = 0; i < 59; i++) r.update(1/60, { fire: true });
  assert.ok(r.charge < .999); r.update(1/60, { fire: true }); assert.ok(r.charge >= .999);

  a = f.make('charger'); r = a.weaponRunner; a.grounded = false;
  for (let i = 0; i < 179; i++) r.update(1/60, { fire: true });
  assert.ok(r.charge < .999); r.update(1/60, { fire: true }); assert.ok(r.charge >= .999);

  a = f.make('charger'); r = a.weaponRunner; a.ink = 0;
  for (let i = 0; i < 179; i++) r.update(1/60, { fire: true });
  assert.ok(r.charge < .999); r.update(1/60, { fire: true }); assert.ok(r.charge >= .999); close(a.ink, 0);

  a = f.make('charger'); r = a.weaponRunner; f.shots.length = 0;
  for (let i = 0; i < 7; i++) r.update(1/60, { fire: true });
  r.update(1/60, { fire: false }); assert.equal(f.shots.length, 0);
  a.reset(); a.grounded = true;
  for (let i = 0; i < 8; i++) r.update(1/60, { fire: true });
  r.update(1/60, { fire: false }); assert.equal(f.shots.filter(x => x.kind === 'charger').length, 1);
});

test('shooter jump spread holds through 25F then recovers to the grounded cone by 70F', async () => {
  const f = await fixture(), a = f.make('shooter'), r = a.weaponRunner, w = a.weapon;
  r.s3JumpSpreadAge = 1/60;
  close(r._spreadDeg(w), w.spreadAir * (w.spreadFirst ?? .45));
  r.s3JumpSpreadAge = 25/60;
  close(r._spreadDeg(w), w.spreadAir * (w.spreadFirst ?? .45));
  r.s3JumpSpreadAge = 47.5/60;
  close(r._spreadDeg(w), ((w.spreadAir + w.spreadGround) / 2) * (w.spreadFirst ?? .45));
  r.s3JumpSpreadAge = 70/60;
  close(r._spreadDeg(w), w.spreadGround * (w.spreadFirst ?? .45));
  assert.equal(r.s3JumpSpreadAge, null);
});

test('swept projectile radius catches face-edge grazes without making farther misses collide', async () => {
  const f = await fixture(), V = f.THREE.Vector3;
  const center = new V(0,0,0), half = new V(.5,.5,.5);
  const block = { id:0, solid:true, grate:false, center, half, axes:[new V(1,0,0),new V(0,1,0),new V(0,0,1)], faces:[-1,-1,-1,-1,-1,-1] };
  const level = { blocks:[block], faces:[], queryBlocks:(_x,_z,_xx,_zz,out)=>{out.length=0;out.push(0);return out;} };
  const physics = new f.Physics(level), out = new f.Hit(), from = new V(-2,0,.65), to = new V(2,0,.65);
  f.projectileWorldHit(physics, from, to, .2, out, true); assert.equal(out.hit, true);
  f.projectileWorldHit(physics, from, to, .1, out, true); assert.equal(out.hit, false);
});

test('roller globs outside 16 degrees use the 100-to-35 outer damage profile', async () => {
  const f = await fixture(), victim = {}, point = new f.THREE.Vector3(1,0,0), hits = [];
  const system = { applyHit: (_o,_v,damage) => hits.push(damage) };
  const base = { s3Weapon:f.WEAPONS.roller, owner:{ weapon:f.WEAPONS.roller }, s3Vertical:false, s3DamageGroup:null, start:new f.THREE.Vector3(), age:0, wid:'roller', type:'drop' };
  f.applyProjectileHit(system, { ...base, s3OuterRoller:false }, victim, 999, point); close(hits.pop(), 150);
  f.applyProjectileHit(system, { ...base, s3OuterRoller:true }, victim, 999, point); close(hits.pop(), 100);
  point.set(9.2,0,0);
  f.applyProjectileHit(system, { ...base, s3OuterRoller:true }, victim, 999, point); close(hits.pop(), 35);
});

test('verified baseline behaviors remain locked: roll input, armor cancel, spawn shield, grates and roller cadence', async () => {
  const f = await fixture(), a = f.make(), V = f.THREE.Vector3;
  a.form='squid'; a.intent.squid=true; a.submerged=true; a.vel.set(0,0,f.profile.movement.roll.minimumSpeed);
  a.intent.move.set(-1,0,0); f.beforeActions(a,1/60,false); assert.equal(a.s3.roll,null);
  a.intent.move.set(1,0,0); f.beforeActions(a,1/60,true); assert.ok(a.s3.roll);
  a.form='kid'; f.beforeActions(a,1/60,false); assert.equal(a.s3.roll,null);

  a.reset(); a.invuln=.2; a.hp=100; f.G.paint.sample=()=>2; a.grounded=true; a.ground.hit=true; a.ground.face=0;
  f.updateResources(a,1/60); close(a.hp,100);

  const block={id:0,solid:true,grate:true,center:new V(0,-.1,0),half:new V(2,.1,2),axes:[new V(1,0,0),new V(0,1,0),new V(0,0,1)],faces:[-1,-1,-1,-1,-1,-1]};
  const physics=new f.Physics({blocks:[block],faces:[],queryBlocks:(_x,_z,_xx,_zz,out)=>{out.length=0;out.push(0);return out;}});
  const hit=new f.Hit(); physics.raycast(new V(0,1,0),new V(0,-1,0),2,hit,true); assert.equal(hit.hit,false);

  const roller=f.make('roller'); close(roller.weapon.flickWindup,21/60); close(roller.weapon.verticalWindup,26/60);
  close(roller.weapon.rollDashTime,90/60); close(roller.weapon.inkRecoverStop,43/60); close(roller.weapon.verticalInkRecoverStop,58/60);
});
