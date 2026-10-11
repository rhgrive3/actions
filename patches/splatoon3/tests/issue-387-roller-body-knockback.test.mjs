// #387: Splat Roller body-contact knockback (pinned Ver. 11.3.0 BodyParam.CollisionParam).
// The accel law is a documented model (unit and combination 未確認), so these tests pin the
// model's behaviour and the authority rules; they are not evidence of Splat 3 measurements.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../../scripts/weapons-fixture.mjs';

const near = (a, b, eps = 1e-9, m = '') => assert.ok(Math.abs(a - b) <= eps, `${m} ${a} != ${b}`);
const RATE = .132;              // roller dash speed, source units per frame (PaintParam SpeedMax)
const WU_PER_S = RATE * 60;     // the same speed in world units per second (scale 1)
const collision = f => f.profile.weaponsFidelityCompletion.weapons.roller.BodyParam.CollisionParam;

async function world() {
  const f = await fixture({ fidelity: true });
  f.G.actors = [];
  return f;
}
function rollingRoller(f, { remote = false, z = 0 } = {}) {
  const r = f.make('roller', { team: 0, z });
  r.pos.set(0, 0, 0); r.yaw = 0; r.vel.set(0, 0, WU_PER_S);
  if (remote) { r.remote = true; r.character = { s3RollerFlick: { rolling: true } }; }
  else { r.isLocal = true; r.weaponRunner.rolling = true; }
  return r;
}
function enemy(f, { z = .9, remote = false } = {}) {
  const e = f.make('shooter', { team: 1, z });
  e.vel.set(0, 0, 0);
  e.remote = remote; e.isLocal = !remote;
  return e;
}

test('#387 pinned Roller BodyParam.CollisionParam knockback records match Ver. 11.3.0', async () => {
  const c = collision(await world());
  assert.deepEqual(c.KnockBackOpponent, { AccelMax: 800, AccelMin: 420, MyVelocityRate: 30, OpponentVelocityRate: 4800 });
  assert.deepEqual(c.KnockBackRollerPlayerDamageOn, { AccelMax: 550, AccelMin: 410, MyVelocityRate: 4800, OpponentVelocityRate: 30 });
  assert.deepEqual(c.KnockBackRollerPlayerDamageOff, { AccelMax: 280, AccelMin: 280, MyVelocityRate: 4800, OpponentVelocityRate: 30 });
});

test('#387 accel model is clamped to [AccelMin, AccelMax] for the three response sets', async () => {
  const f = await world(), c = collision(f);
  near(f.rollerContactAccel(c.KnockBackOpponent, RATE, 0), 420 + 30 * RATE, 1e-9, 'opponent, stationary target');
  near(f.rollerContactAccel(c.KnockBackOpponent, 0, 0), 420, 1e-9, 'opponent, no closing speed');
  near(f.rollerContactAccel(c.KnockBackRollerPlayerDamageOn, RATE, 0), 550, 1e-9, 'damage on clamps at AccelMax');
  near(f.rollerContactAccel(c.KnockBackRollerPlayerDamageOff, RATE, 0), 280, 1e-9, 'damage off is constant');
});

test('#387 surviving roll contact pushes the enemy and recoils the local roller (damage on)', async () => {
  const f = await world(), c = collision(f);
  const r = rollingRoller(f), e = enemy(f);
  f.projectiles.applyHit(r, e, 40, 'roller');
  assert.ok(e.alive && e.hp < 100000, 'damage still applied');
  const dvOpp = f.knockbackDeltaForAccel(420 + 30 * RATE), dvSelf = f.knockbackDeltaForAccel(550);
  near(e.vel.z, dvOpp, 1e-9, 'enemy pushed away along centre -> body');
  near(e.vel.x, 0, 1e-9);
  near(r.vel.z, WU_PER_S - dvSelf, 1e-9, 'roller recoil, damage on');
  assert.ok(dvOpp > 0 && dvSelf > 0 && c.KnockBackOpponent);
});

test('#387 invulnerable target: damage rejected, so the roller uses the damage-off recoil', async () => {
  const f = await world();
  const r = rollingRoller(f), e = enemy(f);
  // The fixture's Actor.damage is a bare stub; mirror the upstream invulnerability rule (actor.js:161).
  e.invuln = 1;
  e.damage = function (d) { if (this.invuln > 0) return false; this.hp -= d; return false; };
  f.projectiles.applyHit(r, e, 40, 'roller');
  assert.equal(e.hp, 100000, 'no damage while invulnerable');
  near(e.vel.z, f.knockbackDeltaForAccel(420 + 30 * RATE), 1e-9, 'target still pushed by the opponent response');
  near(r.vel.z, WU_PER_S - f.knockbackDeltaForAccel(280), 1e-9, 'damage-off recoil');
});

test('#387 no knockback without rolling, outside the drum, or when the contact kills the target', async () => {
  const f = await world();
  const r = rollingRoller(f);
  r.weaponRunner.rolling = false;
  const near1 = enemy(f);
  f.projectiles.applyHit(r, near1, 10, 'roller');
  assert.equal(near1.vel.length(), 0, 'not rolling');
  assert.equal(r.vel.z, WU_PER_S, 'roller untouched when not rolling');

  r.weaponRunner.rolling = true;
  const far = enemy(f, { z: 6 });
  f.projectiles.applyHit(r, far, 10, 'roller');
  assert.equal(far.vel.length(), 0, 'outside the drum contact volume');

  const lethal = enemy(f); lethal.hp = 5;
  f.projectiles.applyHit(r, lethal, 40, 'roller');
  assert.ok(lethal.hp <= 0, 'contact is lethal (hp <= 0)');
  assert.equal(lethal.vel.length(), 0, 'lethal contact is outside the survivable scope');
  assert.equal(r.vel.z, WU_PER_S, 'no roller recoil from a lethal contact');
});

test('#387 networked: a remote roller pushes only the local victim, its own client applies its recoil', async () => {
  const f = await world();
  const r = rollingRoller(f, { remote: true }), e = enemy(f);
  f.projectiles.applyHit(r, e, 40, 'roller');
  near(e.vel.z, f.knockbackDeltaForAccel(420 + 30 * RATE), 1e-9, 'local victim pushed by replicated rolling contact');
  near(r.vel.z, WU_PER_S, 1e-9, 'remote roller body not changed on this client');
});

test('#387 networked: a remote victim is not pushed here, the local roller still recoils', async () => {
  const f = await world();
  const r = rollingRoller(f), e = enemy(f, { remote: true });
  f.projectiles.applyHit(r, e, 40, 'roller');
  assert.equal(e.vel.length(), 0, 'remote victim is simulated by its own client');
  near(r.vel.z, WU_PER_S - f.knockbackDeltaForAccel(550), 1e-9, 'local roller recoil');
});

test('#387 a remote roller without the replicated rolling flag does not push', async () => {
  const f = await world();
  const r = rollingRoller(f, { remote: true }); r.character = { s3RollerFlick: { rolling: false } };
  const e = enemy(f);
  f.projectiles.applyHit(r, e, 40, 'roller');
  assert.equal(e.vel.length(), 0);
});
