// #619: the active S3 Blaster launch applies the pinned
// spl__SpawnBulletAdditionMovePlayerParam.ZRate player-forward spawn-velocity
// term. The installed path under test is the adapted inkwave-public weapons.js
// composed with patches/splatoon3/runtime/weapons-fidelity.mjs — no mirror
// helper. Source: pinned Ver.11.3.0 WeaponBlasterMiddle
// (profile.weaponsFidelityCompletion, worldUnitsPerSourceUnit = 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { advanceFidelityProjectile, applyBlasterSpawnVelocity } from '../runtime/weapons-fidelity.mjs';

const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);

async function setup() {
  const f = await fixture();
  const a = f.make('blaster');
  f.G.camera = { position: new f.THREE.Vector3(0, 20, 0) };
  f.G.actors = [a];
  f.G.match.canRespawn = () => false;
  const ps = new f.Projectiles(new f.THREE.Scene());
  f.G.projectiles = ps;
  return { f, a, ps };
}
// Firing through the real installed fireBlaster path with zero spread, capturing
// p.vel immediately after _push (before any integration tick).
function fire(f, a, ps, vel) {
  a.vel.set(vel[0], vel[1], vel[2]);
  ps.clear();
  ps.fireBlaster(a, a.weapon, 0);
  const p = ps.list.at(-1);
  assert.ok(p && p.type === 'blast' && !p.ghost);
  return p;
}
function source(f) {
  const rec = f.profile.weaponsFidelityCompletion.weapons.blaster;
  return {
    zrate: rec.spl__SpawnBulletAdditionMovePlayerParam.ZRate,
    spawn: rec.MoveParam.SpawnSpeed,          // 0.945 raw units/frame
    move: rec.WeaponParam.MoveSpeed,          // 0.045 raw units/frame
    base: f.profile.weapons.blaster.projSpeed,          // 0.945 * 60 world u/s
    moveSpeedFiring: f.profile.weapons.blaster.moveSpeedFiring, // 0.045 * 60 world u/s
  };
}

test('#619 active S3 Blaster data carries the pinned SpawnBulletAdditionMovePlayerParam ZRate field', async () => {
  const f = await fixture();
  const s = source(f);
  const rec = f.profile.weaponsFidelityCompletion.weapons.blaster;
  assert.equal(rec.spl__SpawnBulletAdditionMovePlayerParam.$type, 'spl__SpawnBulletAdditionMovePlayerParam');
  assert.equal(s.zrate, 2);
  // worldUnitsPerSourceUnit pins the raw-frame -> world-second mapping used below.
  assert.equal(f.profile.weaponsFidelityCompletion.worldUnitsPerSourceUnit, 1);
  close(s.base, s.spawn * 60);          // stationary launch stays SpawnSpeed * 60
  close(s.moveSpeedFiring, s.move * 60); // no-gear firing move speed checkpoint
});

test('#619 stationary, forward, backward and strafe Blaster launches diverge only along the yaw-local forward axis', async () => {
  const { f, a, ps } = await setup();
  const s = source(f);
  a.yaw = 0;
  const still = fire(f, a, ps, [0, 0, 0]);
  // Stationary launch remains the sourced base muzzle speed.
  close(still.vel.x, 0); close(still.vel.y, 0); close(still.vel.z, s.base);

  const fwd = fire(f, a, ps, [0, 0, s.moveSpeedFiring]);
  close(fwd.vel.x, 0); close(fwd.vel.y, 0);
  close(fwd.vel.z, s.base + s.zrate * s.moveSpeedFiring);

  const back = fire(f, a, ps, [0, 0, -s.moveSpeedFiring]);
  close(back.vel.x, 0); close(back.vel.y, 0);
  close(back.vel.z, s.base - s.zrate * s.moveSpeedFiring);

  // Pure strafe injects no lateral or longitudinal term.
  const strafe = fire(f, a, ps, [s.moveSpeedFiring, 0, 0]);
  close(strafe.vel.x, 0); close(strafe.vel.y, 0); close(strafe.vel.z, s.base);

  // Vertical-only motion contributes nothing (unsupported term stays zero).
  const rise = fire(f, a, ps, [0, s.moveSpeedFiring, 0]);
  close(rise.vel.x, 0); close(rise.vel.y, 0); close(rise.vel.z, s.base);
});

test('#619 forward addition follows the yaw-local axis, not the aim vector', async () => {
  const { f, a, ps } = await setup();
  const s = source(f);
  // Aim stays +z while the body faces +x: local-forward motion is world +x.
  a.yaw = Math.PI / 2;
  const p = fire(f, a, ps, [s.moveSpeedFiring, 0, 0]);
  close(p.vel.x, s.zrate * s.moveSpeedFiring);
  close(p.vel.y, 0);
  close(p.vel.z, s.base);
  // World +z motion is pure strafe in this facing: no term.
  const q = fire(f, a, ps, [0, 0, s.moveSpeedFiring]);
  close(q.vel.x, 0); close(q.vel.y, 0); close(q.vel.z, s.base);
});

test('#619 ghosts, remote owners and repeated application never inherit', async () => {
  const { f, a, ps } = await setup();
  const s = source(f);
  a.yaw = 0;
  // Once-only: re-applying to an already-fired round changes nothing.
  const p = fire(f, a, ps, [0, 0, s.moveSpeedFiring]);
  const v = p.vel.clone();
  applyBlasterSpawnVelocity(p);
  assert.deepEqual(p.vel.toArray(), v.toArray());
  assert.equal(p.s3BlasterForwardApplied, true);
  // Remote owners never inherit (their rounds arrive via ghost replay).
  a.remote = true;
  const r = fire(f, a, ps, [0, 0, s.moveSpeedFiring]);
  close(r.vel.x, 0); close(r.vel.y, 0); close(r.vel.z, s.base);
  assert.equal(r.s3BlasterForwardApplied ?? false, false);
  a.remote = false;
  // Ghost visuals never inherit even when driven directly.
  const g = fire(f, a, ps, [0, 0, s.moveSpeedFiring]);
  const before = g.vel.clone();
  g.ghost = true; g.s3BlasterForwardApplied = false;
  applyBlasterSpawnVelocity(g);
  assert.deepEqual(g.vel.toArray(), before.toArray());
  // Pooled reuse gets a fresh inheritance exactly once.
  ps.clear();
  a.vel.set(0, 0, 0);
  ps.fireBlaster(a, a.weapon, 0);
  const fresh = ps.list.at(-1);
  close(fresh.vel.z, s.base);
});

test('#619 launch velocity is fixed-step deterministic and recorded post-addition', async () => {
  const { f, a, ps } = await setup();
  const s = source(f);
  a.yaw = 0;
  const seen = [];
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    void dt; // spawn capture happens synchronously in _push, before any tick
    const p = fire(f, a, ps, [0, 0, s.moveSpeedFiring]);
    seen.push(p.vel.z);
  }
  for (const z of seen) close(z, s.base + s.zrate * s.moveSpeedFiring);
  // The owner-side birth packet records the post-addition velocity.
  const packets = [];
  f.G.netm = { recProj(p) { packets.push(p.vel.clone()); } };
  try {
    const p = fire(f, a, ps, [0, 0, s.moveSpeedFiring]);
    assert.equal(packets.length, 1);
    assert.deepEqual(packets[0].toArray(), p.vel.toArray());
  } finally { delete f.G.netm; }
});


test('#1074 Blaster ShotGuide uses the same forward launch velocity and invalidates on movement', async () => {
  const { f, a, ps } = await setup();
  const s = source(f), frames = a.weapon.shotGuideFrame;
  assert.equal(frames, 13, 'pinned ShotGuideFrame remains 13F');
  a.yaw = 0;
  a.aimDir.set(0, 0, 1);
  a.aimPoint.set(0, 1.05, 100);

  const sample = velZ => {
    a.vel.set(0, 0, velZ);
    const guide = ps.s3WeaponGuide(a, a.weapon, null, 0, 0)?.clone();
    assert.ok(guide, 'guide point is available');
    const p = fire(f, a, ps, [0, 0, velZ]);
    for (let i = 0; i < frames; i++) advanceFidelityProjectile(p, 1 / 60);
    close(guide.x, p.pos.x, 1e-8);
    close(guide.y, p.pos.y, 1e-8);
    close(guide.z, p.pos.z, 1e-8);
    return guide;
  };

  const still = sample(0);
  const forward = sample(s.moveSpeedFiring);
  const backward = sample(-s.moveSpeedFiring);
  assert.ok(forward.z > still.z, 'forward movement advances the guide');
  assert.ok(backward.z < still.z, 'backward movement retracts the guide');

  a.vel.set(s.moveSpeedFiring, 0, 0);
  const strafe = ps.s3WeaponGuide(a, a.weapon, null, 0, 0)?.clone();
  close(strafe.x, still.x, 1e-8);
  close(strafe.y, still.y, 1e-8);
  close(strafe.z, still.z, 1e-8);
});
