// #771 live-path evidence. The existing issue-771 test only calls the pure helper
// rollerSpeedSwerveDegrees. This drives the REAL release (WeaponRunner.update ->
// fireFlick -> configureFidelityFlick) and checks what the helper-only test
// cannot: that the live emitter consumes SwerveRateBySpeed, that a fixed actor
// yaw no longer pins each main-glob index to one launch yaw, and that the seeded
// launch distribution does not depend on the render interval (30/60/120 Hz).
//
// PROVISIONAL, NOT A SOURCE CLAIM: Leanny/splat3 7280ff9 (Ver. 11.3.0) gives
// SwerveRateBySpeed = 0.05 (main 12-glob unit) / 0.1 (near unit) but no public
// source recovered gives the speed->yaw transform (unit, sign, formula). The
// expected yaw below is the INKWAVE calibration in weapons-fidelity.mjs
// rollerSpeedSwerveDegrees (rate * normalised speed deviation * SpawnWideDegree),
// so this test pins "the live emitter uses that calibration", not retail parity.
// Logic-only (Node VM, production modules); no browser or Switch comparison.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../../scripts/weapons-fixture.mjs';

const YAW = .4, DEG = Math.PI / 180;
async function release(hz, seed) {
  const f = await fixture({fidelity: true, floor: false}), a = f.make('roller', {x: 2, y: 10, z: 3}), r = a.weaponRunner;
  r.s3FlickVertical = false; a.yaw = YAW; f.reseed(seed);
  const clock = new f.FixedClock();
  let first = true;
  for (let i = 0; i < Math.round(40 / 60 * hz); i++) clock.advance(1 / hz, dt => {
    r.update(dt, {fire: false, firePressed: first}); first = false;
  });
  const main = [...f.projectiles.list].filter(p => p.s3FlickUnit === 0);
  assert.equal(main.length, 12);
  return {f, clock, main};
}
const yawOffset = p => Math.atan2(p.vel.x, p.vel.z) - YAW;

test('#771 live release: each main glob launch yaw is fan + sourced swerve term at its sampled speed', async () => {
  const {f, main} = await release(60, 112);
  const unit = main[0].fidelityRollerUnit;
  assert.equal(unit.SwerveRateBySpeed, .05, 'main unit record carries the pinned 11.3.0 rate');
  assert.equal(unit.SpawnWideDegree, 18);
  let swerved = 0;
  main.forEach((p, i) => {
    const sampledSourceSpeed = p.vel.length() / 60;
    assert.ok(Math.abs(sampledSourceSpeed - unit.SpawnSpeedBase) <= unit.SpawnSpeedRandom + 1e-9, 'speed stays inside the sourced random band');
    const fanOnly = (i / 11 * 2 - 1) * unit.SpawnWideDegree;
    const expected = f.rollerSpeedSwerveDegrees(unit, i, 12, sampledSourceSpeed);
    assert.ok(Math.abs(yawOffset(p) - expected * DEG) < 1e-9, `glob ${i}: live yaw ${yawOffset(p) / DEG} deg vs helper ${expected} deg`);
    assert.ok(Math.abs(expected) <= (Math.abs(fanOnly) + unit.SwerveRateBySpeed * unit.SpawnWideDegree) + 1e-9, 'swerve shifts the fan by at most rate * SpawnWideDegree');
    if (Math.abs(expected - fanOnly) > 1e-6) swerved++;
  });
  assert.ok(swerved >= 10, `the swerve term is live for most globs (${swerved}/12)`);
});

test('#771 live release: a fixed actor yaw no longer pins any main-glob index to one launch yaw', async () => {
  const perIndex = Array.from({length: 12}, () => new Set());
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const {main} = await release(60, seed);
    main.forEach((p, i) => perIndex[i].add(yawOffset(p).toFixed(9)));
  }
  perIndex.forEach((set, i) => assert.ok(set.size > 1, `index ${i} launched with ${set.size} distinct yaw over 8 seeds`));
});

test('#771 live release: seeded launch speed and yaw are identical at 30/60/120 Hz render intervals', async () => {
  const runs = {};
  for (const hz of [30, 60, 120]) runs[hz] = await release(hz, 112);
  const sig = r => r.main.map(p => [p.vel.length(), yawOffset(p)]);
  for (const hz of [30, 60, 120]) assert.equal(runs[hz].clock.ticks, 40, `${hz} Hz advances 40 fixed ticks`);
  assert.deepEqual(sig(runs[30]), sig(runs[60]), '30 Hz == 60 Hz');
  assert.deepEqual(sig(runs[120]), sig(runs[60]), '120 Hz == 60 Hz');
});
