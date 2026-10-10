import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { BLASTER_KNOCKBACK, validBlasterKnockback, splatBombKnockbackDelta } from '../runtime/sub-special-fidelity.mjs';

const near = (a, b) => assert.ok(Math.abs(a-b) < 1e-9, `${a} != ${b}`);
function nativeGround(f, wall = false) {
  const single = [{ kind:'box', min:[-30,-.5,-30], max:[30,0,30] }];
  if (wall) single.push({ kind:'box', min:[2.351,0,-3], max:[2.45,4,3] });
  f.G.level = new f.Level({ bounds:{ minX:-30,maxX:30,minZ:-30,maxZ:30 },
    spawnPads:[[-25,0,0],[25,0,0]], spawnBarrier:0, half:[], single });
  f.G.physics = new f.Physics(f.G.level);
  delete f.victim._integrate;
  f.G.physics.groundProbe(2,0,0,.4,.35,.24,f.victim.ground,false);
}

async function world() {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  const { G, THREE } = f;
  G.netm = null; G.boss = null; G.local = null;
  G.camera = { position: new THREE.Vector3(100, 100, 100) };
  const owner = f.make('blaster'), victim = f.make('shooter');
  owner.team = 0; owner.addTurf = () => {};
  victim.team = 1; victim.alive = true; victim.invuln = 0; victim.hp = 100;
  victim.vel.set(0, 0, 0); victim.pos.set(2, 0, 0);
  victim.damage = function (damage) { this.hp -= damage; return false; };
  G.actors = [owner, victim];
  const center = new THREE.Vector3(0, .7, 0);
  const p = { type: 'blast', wid: 'blaster', owner, team: 0, ghost: false, s3Weapon: owner.weapon, age: 1 };
  return { ...f, owner, victim, center, p, burst: direct => G.projectiles._blastBurst(p, center, direct ?? null) };
}

test('#574 active standard-Blaster source tuple is consumed by the explicitly calibrated response', async () => {
  const f = await world();
  const raw = f.profile.weaponsFidelityCompletion.weapons.blaster.BlastParam;
  assert.deepEqual(BLASTER_KNOCKBACK, { accel: raw.KnockBackParam.Accel, bias: raw.KnockBackParam.Bias, distance: raw.KnockBackParam.Distance });
  assert.equal(raw.DamageAttackerPriority, true);
  assert.deepEqual(BLASTER_KNOCKBACK, { accel: 700, bias: .8, distance: 3.5 });
});

test('#574 native air-burst keeps 70..50 HP bands while applying a deterministic independent radial response', async () => {
  const f = await world();
  for (const distance of [1, 2, 3.385]) {
    f.victim.pos.set(distance, 0, 0); f.victim.hp = 100; f.victim.vel.set(0, 0, 0);
    f.burst();
    near(f.victim.hp, 100 - f.distanceDamage(f.owner.weapon.damageBands, distance));
    near(f.victim.vel.x, splatBombKnockbackDelta(distance, BLASTER_KNOCKBACK));
    near(f.victim.vel.y, 0); near(f.victim.vel.z, 0);
  }
  f.victim.pos.set(0, 0, -2); f.victim.hp = 100; f.victim.vel.set(0, 0, 0); f.burst();
  near(f.victim.vel.x, 0); assert.ok(f.victim.vel.z < 0);
});

test('#574 separate 3.385..3.5 region pushes without damage; boundary/outside/zero direction do not push', async () => {
  const f = await world();
  for (const distance of [3.4, 3.49, 3.5, 3.6, 0]) {
    f.victim.pos.set(distance, 0, 0); f.victim.hp = 100; f.victim.vel.set(0, 0, 0); f.burst();
    if (distance > 3.385) assert.equal(f.victim.hp, 100);
    assert.equal(f.victim.vel.length() > 0, distance > 0 && distance < 3.5);
  }
  for (const offset of [[NaN, 0, 0], [Infinity, 0, 0], [0, 0, 0], [3.5, 0, 0], [1, 0], '1,0,0', null]) assert.equal(validBlasterKnockback(offset), false);
});

test('#574 friendly, dead, blocked, invulnerable, direct and visual ghosts keep zero impulse', async () => {
  const f = await world();
  const cases = [
    [() => { f.victim.team = 0; }, () => { f.victim.team = 1; }],
    [() => { f.victim.alive = false; }, () => { f.victim.alive = true; }],
    [() => { f.G.physics.los = () => false; }, () => { f.G.physics.los = () => true; }],
    [() => { f.victim.invuln = 1; }, () => { f.victim.invuln = 0; }],
    [() => { f.p.ghost = true; }, () => { f.p.ghost = false; }],
  ];
  for (const [set, reset] of cases) {
    f.victim.hp = 100; f.victim.vel.set(0, 0, 0); set(); f.burst();
    assert.equal(f.victim.hp, 100); assert.equal(f.victim.vel.length(), 0); reset();
  }
  f.burst(f.victim); assert.equal(f.victim.hp, 100); assert.equal(f.victim.vel.length(), 0);
  f.victim.pos.set(3.4, 0, 0);
  f.G.projectiles.kitBarrierCandidate = () => ({ distance: 1, onHit() {} });
  f.burst(); assert.equal(f.victim.vel.length(), 0, 'knockback-only ring cannot bypass a defending dome');
  f.G.projectiles.kitBarrierCandidate = () => null;
  f.p.s3TerrainBurst = true; f.victim.pos.set(1, 0, 0); f.burst(); f.G.projectiles.flushBlastImpacts?.();
  assert.ok(f.victim.hp < 100, 'existing terrain damage still lands');
  assert.equal(f.victim.vel.length(), 0, 'unverified terrain knockback is not invented');
});

test('#574 response reaches native Actor integration and fixed-step displacement agrees at 30/60/120 render Hz', async () => {
  const positions = [];
  for (const hz of [30, 60, 120]) {
    const f = await world(); f.burst();
    // Native input, Actor.update, Physics and Level all participate.
    nativeGround(f);
    let remainder = 0;
    for (let frame = 0; frame < hz / 2; frame++) {
      remainder += 1 / hz;
      while (remainder + 1e-10 >= 1 / 60) {
        f.G.time += 1 / 60; f.victim.update(1 / 60);
        remainder -= 1 / 60;
      }
    }
    assert.ok(f.victim.pos.x > 2);
    positions.push(f.victim.pos.x);
  }
  near(positions[0], positions[1]); near(positions[1], positions[2]);
});


test('#574 native terrain collision blocks the impulse and reset discards any pending movement component', async () => {
  const f = await world(); nativeGround(f, true); f.burst();
  f.G.time += 1/60; f.victim.update(1/60);
  assert.ok(f.victim.pos.x < 2.01, 'thin wall stops the native body');
  assert.equal(f.victim.contacts.wall, true);
  assert.ok(f.victim.vel.x <= 1e-9, 'collision response is not overwritten by knockback');
  f.victim.reset(); f.victim.alive=true; f.victim.invuln=0; f.victim.pos.set(1,0,0);
  f.victim.grounded=true; f.victim.ground.hit=true; f.victim.vel.set(0,0,0);
  f.G.time += 1/60; f.victim.update(1/60);
  near(f.victim.pos.x, 1); near(f.victim.vel.x, 0);
  // Reset before the protected movement step must discard it too.
  f.victim.pos.set(2,0,0); f.victim.hp=100; f.burst(); f.victim.reset();
  f.victim.alive=true; f.victim.invuln=0; f.victim.pos.set(1,0,0); f.victim.grounded=true;
  f.victim.ground.hit=true; f.victim.vel.set(0,0,0);
  f.G.time += 1/60; f.victim.update(1/60);
  near(f.victim.pos.x, 1); near(f.victim.vel.x, 0);
});
