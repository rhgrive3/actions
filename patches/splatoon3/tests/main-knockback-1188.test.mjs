// PR1188 (A07/A08): Blaster burst and Roller body-contact knockback from the
// pinned 11.3.0 records, using the repository's #535 KnockBackParam law.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { splatBombKnockbackDelta } from '../runtime/sub-special-fidelity.mjs';
import { rollerContactAccel, knockbackDeltaForAccel, blasterKnockbackSpec } from '../runtime/main-knockback.mjs';

const near = (a, b, eps = 1e-9, m = '') => assert.ok(Math.abs(a - b) <= eps, `${m} ${a} != ${b}`);
async function world() {
  const f = await fixture({ extraExports: "export * from './patches/splatoon3/runtime/weapons-fidelity.mjs'; export * from './patches/splatoon3/runtime/main-knockback.mjs';" });
  f.installWeaponsFidelity(f, f.profile); f.installMainKnockback(f, f.profile);
  const { G, THREE } = f;
  G.scene = new THREE.Scene(); G.actors = []; G.boss = null; G.netm = null;
  G.level = new f.Level({ bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, spawnPads: [[-80, 0, 0], [80, 0, 0]],
    spawnBarrier: 0, single: [{ kind: 'box', min: [-100, -.5, -100], max: [100, 0, 100] }], half: [] });
  G.physics = new f.Physics(G.level); G.physics.los = () => true;
  G.projectiles = new f.Projectiles(G.scene);
  G.paint = { sample: () => 1, splat: () => 0 };
  return f;
}
const raw = f => f.profile.weaponsFidelityCompletion.weapons;

test('PR1188 Blaster KnockBackParam is the pinned 700 / 0.8 / 3.5 record; terrain burst uses the reduced volume', async () => {
  const f = await world(), b = raw(f).blaster;
  assert.deepEqual(b.BlastParam.KnockBackParam, { Accel: 700, Bias: .8, Distance: 3.5 });
  assert.deepEqual(blasterKnockbackSpec(b), { accel: 700, bias: .8, distance: 3.5 });
  near(blasterKnockbackSpec(b, 1, true, .4234).distance, 3.5 * .4234);
});

test('PR1188 timed Blaster burst pushes a local enemy by the #535 law; remote and out-of-range bodies untouched', async () => {
  const f = await world(), { G, THREE } = f;
  const a = f.make('blaster'); a.isLocal = true; a.pos.set(0, 0, 0);
  const near1 = f.make('shooter'); near1.team = 1; near1.pos.set(0, 0, 2); near1.vel.set(0, 0, 0);
  const far = f.make('shooter'); far.team = 1; far.pos.set(0, 0, -4); far.vel.set(0, 0, 0);
  const remote = f.make('shooter'); remote.team = 1; remote.remote = true; remote.pos.set(1, 0, 0); remote.vel.set(0, 0, 0);
  const p = G.projectiles._new(); Object.assign(p, { type: 'blast', owner: a, team: 0, s3Weapon: f.WEAPONS.blaster, wid: 'blaster', seed: .5, ghost: false });
  const centre = new THREE.Vector3(0, .7, 0);
  G.projectiles._blastBurst(p, centre, null);
  const d = 2, dv = splatBombKnockbackDelta(d, { accel: 700, bias: .8, distance: 3.5 });
  near(near1.vel.z, dv, 1e-9, 'pushed along centre -> body'); near(near1.vel.y, 0, 1e-9);
  assert.equal(far.vel.length(), 0, 'beyond Distance 3.5');
  assert.equal(remote.vel.length(), 0, 'remote bodies are pushed by their own client');
  near(dv, 700 / 10 / 60 * Math.pow(1 - 2 / 3.5, .8), 1e-12);
});

test('PR1188 ghost Blaster burst on the victim client pushes the local victim once', async () => {
  const f = await world(), { G, THREE } = f;
  const shooter = f.make('blaster'); shooter.remote = true; shooter.team = 0;
  const me = f.make('shooter'); me.team = 1; me.isLocal = true; me.pos.set(0, 0, 1.5); me.vel.set(0, 0, 0);
  const p = G.projectiles._new(); Object.assign(p, { type: 'blast', owner: shooter, team: 0, s3Weapon: f.WEAPONS.blaster, wid: 'blaster', seed: .5, ghost: true });
  G.projectiles._blastBurst(p, new THREE.Vector3(0, .7, 0), null);
  near(me.vel.z, splatBombKnockbackDelta(1.5, { accel: 700, bias: .8, distance: 3.5 }));
});

test('PR1188 queued terrain burst applies knockback when it resolves, with the reduced distance', async () => {
  const f = await world(), { G, THREE } = f;
  const a = f.make('blaster'); a.isLocal = true;
  const inside = f.make('shooter'); inside.team = 1; inside.pos.set(0, 0, 1); inside.vel.set(0, 0, 0);
  const outside = f.make('shooter'); outside.team = 1; outside.pos.set(0, 0, -2); outside.vel.set(0, 0, 0);
  const p = G.projectiles._new(); Object.assign(p, { type: 'blast', owner: a, team: 0, s3Weapon: f.WEAPONS.blaster, wid: 'blaster', seed: .5, ghost: false, s3TerrainBurst: true });
  G.projectiles._blastBurst(p, new THREE.Vector3(0, .7, 0), null);
  assert.equal(inside.vel.length(), 0, 'not before the next fixed tick');
  G.projectiles.flushBlastImpacts();
  const spec = { accel: 700, bias: .8, distance: 3.5 * f.WEAPONS.blaster.terrainSplashRadiusRate };
  near(inside.vel.z, splatBombKnockbackDelta(1, spec)); assert.equal(outside.vel.length(), 0, '2 WU > reduced 1.48 WU');
});

test('PR1188 Roller body contact: sourced opponent push and roller recoil (damage on/off) on the simulating clients', async () => {
  const f = await world(), { G } = f, c = raw(f).roller.BodyParam.CollisionParam;
  assert.deepEqual(c.KnockBackOpponent, { AccelMax: 800, AccelMin: 420, MyVelocityRate: 30, OpponentVelocityRate: 4800 });
  // Rolling at the dash speed 0.132 DU/F straight into a stationary enemy.
  near(rollerContactAccel(c.KnockBackOpponent, .132, 0), 420 + 30 * .132);
  near(rollerContactAccel(c.KnockBackRollerPlayerDamageOn, .132, 0), 550, 1e-9, 'clamped at AccelMax');
  near(rollerContactAccel(c.KnockBackRollerPlayerDamageOff, .132, 0), 280);
  const r = f.make('roller'); r.isLocal = true; r.pos.set(0, 0, 0); r.yaw = 0; r.vel.set(0, 0, .132 * 60);
  r.weaponRunner.rolling = true;
  const e = f.make('shooter'); e.team = 1; e.pos.set(0, 0, .9); e.vel.set(0, 0, 0); e.hp = 100;
  G.projectiles.applyHit(r, e, 40, 'roller');
  assert.equal(e.alive, true, 'a surviving opponent');
  near(e.vel.z, knockbackDeltaForAccel(420 + 30 * .132), 1e-9, 'opponent');
  near(r.vel.z, .132 * 60 - knockbackDeltaForAccel(550), 1e-9, 'roller recoil, damage on');
  // A flick (not rolling) or out-of-contact hit never knocks back.
  const e2 = f.make('shooter'); e2.team = 1; e2.pos.set(0, 0, 6); e2.vel.set(0, 0, 0); e2.hp = 100;
  G.projectiles.applyHit(r, e2, 10, 'roller'); assert.equal(e2.vel.length(), 0);
  r.weaponRunner.rolling = false; const e3 = f.make('shooter'); e3.team = 1; e3.pos.set(0, 0, .9); e3.vel.set(0, 0, 0); e3.hp = 100;
  G.projectiles.applyHit(r, e3, 10, 'roller'); assert.equal(e3.vel.length(), 0);
});

test('PR1188 Roller replicated hit: a remote roller pushes only the local victim', async () => {
  const f = await world(), { G } = f;
  const r = f.make('roller'); r.remote = true; r.pos.set(0, 0, 0); r.yaw = 0; r.vel.set(0, 0, 6); r.weaponRunner.rolling = true;
  const me = f.make('shooter'); me.team = 1; me.isLocal = true; me.pos.set(0, 0, .9); me.vel.set(0, 0, 0); me.hp = 100;
  G.projectiles.applyHit(r, me, 40, 'roller');
  assert.ok(me.vel.z > 0, 'local victim pushed away'); near(r.vel.z, 6, 1e-12, 'remote roller untouched');
});
