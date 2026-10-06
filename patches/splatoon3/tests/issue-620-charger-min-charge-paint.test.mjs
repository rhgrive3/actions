import { test } from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { chargerPaintParameters } from '../runtime/weapons-charger-flight.mjs';

// Issue #620: at the first legal 8f Splat Charger release (chargeT = 8/60 on
// the installed 60f charge progression, charge = 1/6) the pinned S3 11.3.0
// MinCharge paint endpoints must resolve exactly: Radius 0.906, WidthHalf
// 0.78, DepthHalf 2.73, OnTopRate 0.125 (line interval 4.7775). Full 60f
// keeps the FullCharge endpoints. Charge-rate modifiers and sub-boundary
// releases may not shift the legal minimum endpoint.

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const MIN_CHARGE = 1 / 6; // first legal release: S-curve 1.25 * (8/60)

const chargerRecord = () => {
  const profile = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../profile.json', import.meta.url)), 'utf8'));
  return profile.weaponsFidelityCompletion.weapons.charger;
};

// Drives the installed pipeline: real Actor + WeaponRunner charge progression
// at fixed 60Hz, real release gate, real Projectiles.fireCharger installed by
// installChargerFlight — then reads the resolved paint parameters off the
// live flight job.
async function releasedPaint(frames) {
  const f = await fixture(), a = f.make('charger');
  a.ink = 100;
  a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1.05, 30);
  const system = new f.Projectiles(new f.THREE.Scene());
  f.G.actors = [a];
  f.G.projectiles = { ...f.G.projectiles, fireCharger: (actor, w, charge) => system.fireCharger(actor, w, charge) };
  a.intent.fire = true;
  f.tick(a, frames);
  const runnerCharge = a.weaponRunner.charge;
  a.intent.fire = false;
  f.tick(a);
  assert.equal(system._fidelityChargerFlights?.length, 1, 'release created exactly one finite charger flight');
  return { runnerCharge, job: system._fidelityChargerFlights[0] };
}

test('first legal 8f release resolves the pinned S3 MinCharge paint endpoints', async () => {
  const { runnerCharge, job } = await releasedPaint(8);
  near(runnerCharge, MIN_CHARGE);       // installed S-curve at chargeT = 8/60
  near(job.charge, MIN_CHARGE);         // release gate passes the 8f charge
  near(job.paint.impact, 0.906);        // PaintParam.RadiusMinCharge
  near(job.paint.width, 0.78);          // SplashPaintParam.WidthHalfMinCharge
  near(job.paint.depth, 2.73);          // SplashPaintParam.DepthHalfMinCharge
  near(job.paint.onTop, 0.125);         // SplashSpawnParam.OnTopRateMinCharge
  near(job.paint.interval, 4.7775);     // 2 * 2.73 * (1 - 0.125) * max(1, SkipNum)
});

test('full 60f release keeps the pinned S3 FullCharge paint endpoints', async () => {
  const { runnerCharge, job } = await releasedPaint(61);
  assert.ok(runnerCharge >= 0.999, 'precondition: full charge');
  near(job.paint.impact, 3.263);        // PaintParam.RadiusFullCharge
  near(job.paint.width, 1.56);          // SplashPaintParam.WidthHalfFullCharge
  near(job.paint.depth, 1.56);          // SplashPaintParam.DepthHalfFullCharge
  near(job.paint.onTop, 0.34);          // SplashSpawnParam.OnTopRateFullCharge
  near(job.paint.interval, 2 * 1.56 * (1 - 0.34));
});

test('sub-boundary releases never shift the legal minimum endpoint and partial paint stays monotonic', async () => {
  const raw = chargerRecord();
  // The 0.12 minimum-release gate and empty-tank caps only clamp: the minimum
  // endpoint family is the floor below the first legal release.
  for (const charge of [0, 0.05, 0.12, MIN_CHARGE - 1e-12, MIN_CHARGE]) {
    const p = chargerPaintParameters(raw, charge);
    near(p.impact, 0.906); near(p.width, 0.78); near(p.depth, 2.73);
    near(p.onTop, 0.125); near(p.interval, 4.7775);
  }
  // Monotonic and continuous across the partial window up to the full step.
  let previousImpact = -Infinity, previousWidth = -Infinity;
  for (let charge = MIN_CHARGE; charge < 0.999; charge += 0.01) {
    const p = chargerPaintParameters(raw, charge);
    assert.ok(p.impact >= previousImpact - 1e-12, `impact regressed at charge ${charge}`);
    assert.ok(p.width >= previousWidth - 1e-12, `width regressed at charge ${charge}`);
    previousImpact = p.impact; previousWidth = p.width;
    const next = chargerPaintParameters(raw, Math.min(0.998999, charge + 1e-6));
    assert.ok(Math.abs(next.impact - p.impact) < 1e-3, `impact discontinuity at charge ${charge}`);
    assert.ok(Math.abs(next.depth - p.depth) < 1e-3, `depth discontinuity at charge ${charge}`);
  }
  // Just below the full step the partial window reaches the MaxCharge family.
  const atTop = chargerPaintParameters(raw, 0.998999);
  assert.ok(Math.abs(atTop.width - 1.56) < 0.01);
  assert.ok(Math.abs(atTop.depth - 1.56) < 0.01);
  assert.ok(Math.abs(atTop.impact - 2.719) < 0.01);
});
