import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';
import { adaptSource } from '../adapter.mjs';

async function fireCenterline(kind, { renderHz = 60, profileTransform, targetDistance = 10.5 } = {}) {
  const f = await fixture({ profileTransform });
  const actor = f.make(kind);
  actor.pos.set(0, 0, 0);
  actor.character.root.position.set(0, 0, 0);
  actor.aimDir.set(0, 0, 1);

  const projectiles = new f.Projectiles(new f.THREE.Scene());
  f.G.projectiles = projectiles;
  f.G.actors = [actor];
  f.setRandom(() => 0.5);

  let projectile = null, origin = null, distance = 0, axisX = 0, axisZ = 0, launchPitch = 0;
  let crossingY = null;
  const clock = new FixedClock();
  const fire = () => {
    const muzzle = projectiles._muzzle(actor, new f.THREE.Vector3());
    actor.aimPoint.set(muzzle.x, muzzle.y, muzzle.z + targetDistance);
    if (kind === 'shooter') projectiles.fireShooter(actor, actor.weapon, 0);
    else if (kind === 'dualies') projectiles.fireDualies(actor, actor.weapon, 0, false);
    else projectiles.fireSplatling(actor, actor.weapon, 0);

    projectile = projectiles.list.at(-1);
    assert.ok(projectile?.fidelityMove, `${kind} launch uses the installed fidelity movement record`);
    origin = projectile.pos.clone();
    distance = Math.hypot(actor.aimPoint.x - origin.x, actor.aimPoint.z - origin.z);
    axisX = (actor.aimPoint.x - origin.x) / distance;
    axisZ = (actor.aimPoint.z - origin.z) / distance;
    launchPitch = Math.atan2(projectile.vel.y, Math.hypot(projectile.vel.x, projectile.vel.z));
  };

  for (let frame = 0; frame < renderHz * 2 && crossingY === null; frame++) {
    clock.advance(1 / renderHz, dt => {
      if (!projectile) fire();
      if (crossingY !== null) return;
      const before = projectile.pos.clone();
      f.advanceFidelityProjectile(projectile, dt);
      const beforeAlong = (before.x - origin.x) * axisX + (before.z - origin.z) * axisZ;
      const afterAlong = (projectile.pos.x - origin.x) * axisX + (projectile.pos.z - origin.z) * axisZ;
      if (beforeAlong <= distance && afterAlong >= distance) {
        const t = (distance - beforeAlong) / (afterAlong - beforeAlong);
        crossingY = before.y + (projectile.pos.y - before.y) * t;
      }
    });
  }
  return {
    kind,
    renderHz,
    targetY: actor.aimPoint.y,
    crossingY,
    launchPitch,
    endSpeed: projectile?.fidelityMove?.endSpeed,
  };
}

test('S3 shooter-family centerlines converge through the installed fidelity integrator at 30/60/120 Hz', async () => {
  for (const kind of ['shooter', 'dualies', 'splatling']) {
    const results = [];
    for (const renderHz of [30, 60, 120]) {
      const result = await fireCenterline(kind, { renderHz });
      assert.notEqual(result.crossingY, null, `${kind} at ${renderHz} Hz crosses the reachable aim point`);
      assert.ok(
        Math.abs(result.crossingY - result.targetY) < 0.02,
        `${kind} at ${renderHz} Hz crosses ${result.crossingY}, target is ${result.targetY}`,
      );
      results.push(result);
    }
    assert.ok(
      Math.max(...results.map(x => x.launchPitch)) - Math.min(...results.map(x => x.launchPitch)) < 1e-10,
      `${kind} launch pitch is independent of render cadence`,
    );
  }
});

test('centerline prediction follows the installed per-weapon source movement record', async () => {
  const normal = await fireCenterline('shooter');
  const changed = await fireCenterline('shooter', {
    profileTransform: profile => { profile.weapons.shooter.ballistics.endSpeed -= 8; },
  });
  assert.notEqual(normal.endSpeed, changed.endSpeed);
  assert.ok(Math.abs(normal.launchPitch - changed.launchPitch) > 1e-4,
    'changing the copied source-backed speed cap changes the predicted launch pitch');
  for (const result of [normal, changed]) {
    assert.notEqual(result.crossingY, null);
    assert.ok(Math.abs(result.crossingY - result.targetY) < 0.02,
      `installed ${result.endSpeed} speed cap still converges through actual flight`);
  }
});

test('unreachable S3 aim points retain a finite camera direction', async () => {
  for (const kind of ['shooter', 'dualies', 'splatling']) {
    const result = await fireCenterline(kind, { targetDistance: 100 });
    assert.ok(Number.isFinite(result.launchPitch), `${kind} launch pitch is finite`);
    assert.ok(Math.abs(result.launchPitch) < 1e-12, `${kind} keeps the camera-derived level pitch`);
  }
  const nearLimit = await fireCenterline('splatling', { targetDistance: 20 });
  assert.ok(Number.isFinite(nearLimit.launchPitch));
  if (nearLimit.crossingY === null) {
    assert.ok(Math.abs(nearLimit.launchPitch) < 1e-12,
      'a target beyond the production projectile lifetime keeps the camera-derived pitch');
  } else {
    assert.ok(Math.abs(nearLimit.crossingY - nearLimit.targetY) < 0.02,
      'a target reached before production projectile expiry converges');
  }
});

test('the installed adapter replaces both legacy S3 call sites before spread', () => {
  const source = fs.readFileSync(new URL('../../../inkwave-public/src/game/weapons.js', import.meta.url), 'utf8');
  const installed = adaptSource('src/game/weapons.js', source);
  assert.equal([...source.matchAll(/life: 1\.2, straight: w\.straightTime/g)].length, 2,
    'both shooter-family production constructors keep the lifetime used by the predictor');
  const calls = [...installed.matchAll(/fidelityAimConvergence\(m, dir, a\.aimPoint, w, w\.projSpeed\)/g)];
  assert.equal(calls.length, 2);
  assert.doesNotMatch(installed,
    /this\._ballistic\(m, dir, a\.aimPoint, w\.projSpeed, w\.straightTime, 28, 0\.8, w\.range\)/);
  for (const call of calls) assert.match(installed.slice(call.index),
    /^fidelityAimConvergence\(m, dir, a\.aimPoint, w, w\.projSpeed\);\s+spreadWeaponRound\(this, dir, a, w, spreadDeg\);\s+const p = this\._new\(\);/,
    'the current shared cone sampler follows convergence exactly once before each native birth');
});

test('#608 the existing weapon guides still predict each converged centerline', async () => {
  for (const kind of ['shooter', 'dualies', 'splatling']) {
    const f = await fixture(), actor = f.make(kind);
    const projectiles = f.G.projectiles = new f.Projectiles(new f.THREE.Scene());
    actor.pos.set(0, 0, 0); actor.character.root.position.set(0, 0, 0);
    actor.aimDir.set(0, 0, 1);
    const muzzle = projectiles._muzzle(actor, new f.THREE.Vector3());
    actor.aimPoint.set(muzzle.x, muzzle.y, muzzle.z + 10.5);
    f.setRandom(() => 0.5);
    const guides = kind === 'dualies'
      ? projectiles.s3DualiesGuides(actor, actor.weapon).map(p => p.clone())
      : [new f.THREE.Vector3().copy(f.computeShotGuide(actor))];
    for (let hand = 0; hand < guides.length; hand++) {
      if (kind === 'shooter') projectiles.fireShooter(actor, actor.weapon, 0);
      else if (kind === 'dualies') projectiles.fireDualies(actor, actor.weapon, 0, hand);
      else projectiles.fireSplatling(actor, actor.weapon, 0);
      const round = projectiles.list.at(-1);
      for (let frame = 0; frame < actor.weapon.shotGuideFrame; frame++) f.advanceFidelityProjectile(round, 1 / 60);
      assert.ok(round.pos.distanceTo(guides[hand]) < 1e-9,
        `${kind} hand ${hand} guide differs from its real converged round by ${round.pos.distanceTo(guides[hand])}`);
    }
  }
});
