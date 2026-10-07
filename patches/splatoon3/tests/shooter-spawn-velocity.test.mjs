// #312: the active S3 Splattershot (Shooter) launch applies the pinned
// spl__SpawnBulletAdditionMovePlayerParam.ZRate player-forward spawn-velocity
// term. The installed path under test is the adapted inkwave-public weapons.js
// composed with patches/splatoon3/runtime/weapons-fidelity.mjs — no mirror
// helper. Source: pinned Ver.11.3.0 WeaponShooterNormal
// (profile.weaponsFidelityCompletion, worldUnitsPerSourceUnit = 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { applyShooterSpawnVelocity } from '../runtime/weapons-fidelity.mjs';

const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);

async function setup(weaponKind = 'shooter') {
  const f = await fixture();
  const a = f.make(weaponKind);
  f.G.camera = { position: new f.THREE.Vector3(0, 20, 0) };
  f.G.actors = [a];
  f.G.match.canRespawn = () => false;
  const ps = new f.Projectiles(new f.THREE.Scene());
  f.G.projectiles = ps;
  return { f, a, ps };
}

// Firing through the real installed fireShooter path with zero spread, capturing
// p.vel immediately after _push (before any integration tick).
function fire(f, a, ps, vel) {
  a.vel.set(vel[0], vel[1], vel[2]);
  ps.clear();
  ps.fireShooter(a, a.weapon, 0);
  const p = ps.list.at(-1);
  assert.ok(p && p.type === 'shot' && !p.ghost);
  return p;
}

function source(f) {
  const rec = f.profile.weaponsFidelityCompletion.weapons.shooter;
  return {
    zrate: rec.spl__SpawnBulletAdditionMovePlayerParam.ZRate,
    spawn: rec.MoveParam.SpawnSpeed,          // 2.266 raw units/frame
    move: rec.WeaponParam.MoveSpeed,          // 0.072 raw units/frame
    base: f.profile.weapons.shooter.projSpeed,          // 2.266 * 60 = 135.96 world u/s
    moveSpeedFiring: f.profile.weapons.shooter.moveSpeedFiring, // 0.072 * 60 = 4.32 world u/s
  };
}

test('#312 active S3 Shooter data carries the pinned SpawnBulletAdditionMovePlayerParam ZRate field', async () => {
  const f = await fixture();
  const s = source(f);
  const rec = f.profile.weaponsFidelityCompletion.weapons.shooter;
  assert.equal(rec.spl__SpawnBulletAdditionMovePlayerParam.$type, 'spl__SpawnBulletAdditionMovePlayerParam');
  assert.equal(s.zrate, 2);
  // worldUnitsPerSourceUnit pins the raw-frame -> world-second mapping used below.
  assert.equal(f.profile.weaponsFidelityCompletion.worldUnitsPerSourceUnit, 1);
  close(s.base, s.spawn * 60);          // stationary launch stays SpawnSpeed * 60 = 135.96
  close(s.moveSpeedFiring, s.move * 60); // no-gear firing move speed checkpoint = 4.32
});

test('#312 stationary, forward, backward and strafe Shooter launches diverge only along the yaw-local forward axis', async () => {
  const { f, a, ps } = await setup();
  const s = source(f);
  a.yaw = 0;

  // Negative control / stationary launch: remains exactly the sourced base muzzle speed.
  const still = fire(f, a, ps, [0, 0, 0]);
  close(still.vel.x, 0); close(still.vel.y, 0); close(still.vel.z, s.base);

  // Forward motion: adds local forward velocity * ZRate.
  const fwd = fire(f, a, ps, [0, 0, s.moveSpeedFiring]);
  close(fwd.vel.x, 0); close(fwd.vel.y, 0);
  close(fwd.vel.z, s.base + s.zrate * s.moveSpeedFiring);

  // Backward motion: subtracts local forward velocity * ZRate (signed forward gain).
  const back = fire(f, a, ps, [0, 0, -s.moveSpeedFiring]);
  close(back.vel.x, 0); close(back.vel.y, 0);
  close(back.vel.z, s.base - s.zrate * s.moveSpeedFiring);

  // Pure strafe: injects no lateral or longitudinal term (unsupported lateral stays zero).
  const strafe = fire(f, a, ps, [s.moveSpeedFiring, 0, 0]);
  close(strafe.vel.x, 0); close(strafe.vel.y, 0); close(strafe.vel.z, s.base);

  // Vertical-only motion contributes nothing (unsupported vertical stays zero).
  const rise = fire(f, a, ps, [0, s.moveSpeedFiring, 0]);
  close(rise.vel.x, 0); close(rise.vel.y, 0); close(rise.vel.z, s.base);
});

test('#312 forward addition follows the yaw-local axis, not the aim vector', async () => {
  const { f, a, ps } = await setup();
  const s = source(f);
  // Aim stays +z while the body faces +x (yaw = PI/2): local-forward motion is world +x.
  a.yaw = Math.PI / 2;
  const p = fire(f, a, ps, [s.moveSpeedFiring, 0, 0]);
  close(p.vel.x, s.zrate * s.moveSpeedFiring);
  close(p.vel.y, 0);
  close(p.vel.z, s.base);

  // World +z motion is pure strafe in this facing: no term added.
  const q = fire(f, a, ps, [0, 0, s.moveSpeedFiring]);
  close(q.vel.x, 0); close(q.vel.y, 0); close(q.vel.z, s.base);
});

test('#312 ghosts, remote owners and repeated application never inherit', async () => {
  const { f, a, ps } = await setup();
  const s = source(f);
  a.yaw = 0;

  // Once-only: re-applying to an already-fired round changes nothing.
  const p = fire(f, a, ps, [0, 0, s.moveSpeedFiring]);
  const v = p.vel.clone();
  applyShooterSpawnVelocity(p);
  assert.deepEqual(p.vel.toArray(), v.toArray());
  assert.equal(p.s3ShooterForwardApplied, true);

  // Remote owners never inherit (their rounds arrive via ghost replay).
  a.remote = true;
  const r = fire(f, a, ps, [0, 0, s.moveSpeedFiring]);
  close(r.vel.x, 0); close(r.vel.y, 0); close(r.vel.z, s.base);
  assert.equal(r.s3ShooterForwardApplied ?? false, false);
  a.remote = false;

  // Ghost visuals never inherit even when driven directly.
  const g = fire(f, a, ps, [0, 0, s.moveSpeedFiring]);
  const before = g.vel.clone();
  g.ghost = true; g.s3ShooterForwardApplied = false;
  applyShooterSpawnVelocity(g);
  assert.deepEqual(g.vel.toArray(), before.toArray());

  // Pooled reuse gets a fresh inheritance exactly once.
  ps.clear();
  a.vel.set(0, 0, 0);
  ps.fireShooter(a, a.weapon, 0);
  const fresh = ps.list.at(-1);
  close(fresh.vel.z, s.base);
  ps.clear();
  a.vel.set(0, 0, s.moveSpeedFiring);
  ps.fireShooter(a, a.weapon, 0);
  const reused = ps.list.at(-1);
  assert.equal(reused, fresh, 'the native pool reuses the previously released projectile');
  close(reused.vel.z, s.base + s.zrate * s.moveSpeedFiring);
  assert.equal(reused.s3ShooterForwardApplied, true);
  const reusedVelocity = reused.vel.clone();
  applyShooterSpawnVelocity(reused);
  assert.deepEqual(reused.vel.toArray(), reusedVelocity.toArray(), 'reused inheritance remains once-only');
});

test('#312 synchronous launch is recorded once after player-forward addition', async () => {
  const { f, a, ps } = await setup();
  const s = source(f);
  a.yaw = 0;
  // The owner-side birth packet records the post-addition velocity.
  const packets = [];
  f.G.netm = { recProj(p) { packets.push(p.vel.clone()); } };
  try {
    const p = fire(f, a, ps, [0, 0, s.moveSpeedFiring]);
    assert.equal(packets.length, 1);
    assert.deepEqual(packets[0].toArray(), p.vel.toArray());
  } finally { delete f.G.netm; }
});

test('#312 non-shooter weapons do not trigger shooter spawn velocity addition', async () => {
  const { f, a, ps } = await setup('dualies');
  a.yaw = 0;
  a.vel.set(0, 0, 4.32);
  ps.clear();
  ps.fireDualies(a, a.weapon, 0, false);
  const p = ps.list.at(-1);
  assert.ok(p && p.type === 'shot');
  // Dualies keeps its distinct #414 signed-forward owner; Shooter must not add again.
  assert.equal(p.s3ShooterForwardApplied ?? false, false);
  assert.equal(p.s3ForwardVelocityApplied,true);close(p.vel.z, a.weapon.projSpeed + 2 * 4.32);
});
