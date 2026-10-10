// #940: grounded Heavy Splatling standing shots publish the sourced S3 envelope
// (Stand_DegSwerve 3.3 deg) and choose the outer envelope per emitted shot with the
// pinned Stand_DegBiasMax (0.3). Inner kernel = existing INKWAVE spreadFirst (0.6), unverified.
// Sources: Leanny/splat3 @ 7280ff9c WeaponSpinnerStandard (Stand_DegBiasMax 0.3, Stand_DegSwerve 3.3);
// Inkipedia Heavy Splatling data section (30% outer-reticle chance, S3). Shape not verified.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installSplatling } from '../runtime/splatling.mjs';

const GROUND = { kind: 'splatling', spreadGround: 3.3, spreadAir: 7, spreadFirst: 0.6 };
const INNER = 3.3 * 0.6;

function fixture(profile) {
  class WeaponRunner { constructor(a) { this.a = a; this.bloom = 0; } _spreadDeg() { return 0; } reset() {} cancelPendingInput() {} }
  class Projectiles { constructor() { this.calls = []; } fireSplatling(a, w, spread) { this.calls.push(spread); } _fireRound() { return null; } }
  class Actor {}
  const api = { WeaponRunner, Projectiles, Actor, G: {}, PLAYER: { inkMax: 100 } };
  installSplatling(api, profile, {
    splatlingChargeCap: () => 0, splatlingReservation: () => null,
    tickSplatlingInterrupt: () => null, releaseSplatlingInterrupt: () => {},
  });
  return { runner: new WeaponRunner({ grounded: true }), proj: new Projectiles(), Projectiles };
}

const WITH_BIAS = { weaponsFidelityCompletion: { weapons: { splatling: { WeaponParam: { Stand_DegBiasMax: 0.3 } } } } };

function withRandom(values, body) {
  const original = Math.random;
  let i = 0;
  Math.random = () => values(i++);
  try { return body(); } finally { Math.random = original; }
}

test('#940: published standing cone stays the inner kernel (continuous with #850); airborne unchanged', () => {
  const { runner } = fixture(WITH_BIAS);
  assert.ok(Math.abs(runner._spreadDeg(GROUND) - INNER) < 1e-12);
  runner.a.grounded = false;
  assert.ok(Math.abs(runner._spreadDeg(GROUND) - 7 * 0.6) < 1e-12, 'airborne path unchanged');
});

test('#940: 300 standing shots pick the outer envelope exactly 30% of the time', () => {
  const { runner, proj, Projectiles } = fixture(WITH_BIAS);
  const deviations = withRandom(i => (i + 0.5) / 300, () => {
    for (let n = 0; n < 300; n++) Projectiles.prototype.fireSplatling.call(proj, runner.a, GROUND, runner._spreadDeg(GROUND));
    return proj.calls;
  });
  const outer = deviations.filter(d => d === 3.3).length;
  const inner = deviations.filter(d => Math.abs(d - INNER) < 1e-12).length;
  assert.equal(outer, 90);
  assert.equal(inner, 210);
  assert.equal(outer + inner, 300);
});

test('#940: the first, second and later standing shots share one distribution', () => {
  const { runner, proj, Projectiles } = fixture(WITH_BIAS);
  withRandom(() => 0.2, () => {
    for (let n = 0; n < 3; n++) Projectiles.prototype.fireSplatling.call(proj, runner.a, GROUND, runner._spreadDeg(GROUND));
  });
  assert.deepEqual(proj.calls, [3.3, 3.3, 3.3]);
  proj.calls.length = 0;
  withRandom(() => 0.9, () => {
    for (let n = 0; n < 3; n++) Projectiles.prototype.fireSplatling.call(proj, runner.a, GROUND, runner._spreadDeg(GROUND));
  });
  proj.calls.forEach(d => assert.ok(Math.abs(d - INNER) < 1e-12));
});

test('#940: jump-recovery (#850) shots are not re-selected at fire time', () => {
  const { runner, proj, Projectiles } = fixture(WITH_BIAS);
  runner.a.s3SplatlingJumpAgeFrames = 10;
  withRandom(() => { throw new Error('no outer selection during #850 recovery'); }, () => {
    Projectiles.prototype.fireSplatling.call(proj, runner.a, GROUND, 2.5);
  });
  assert.deepEqual(proj.calls, [2.5]);
});

test('#940: without a pinned bias value the fire-time spread is passed through unchanged', () => {
  const { runner, proj, Projectiles } = fixture({});
  withRandom(() => { throw new Error('no selection without Stand_DegBiasMax'); }, () => {
    Projectiles.prototype.fireSplatling.call(proj, runner.a, GROUND, runner._spreadDeg(GROUND));
  });
  proj.calls.forEach(d => assert.ok(Math.abs(d - INNER) < 1e-12));
  assert.equal(proj.calls.length, 1);
});
