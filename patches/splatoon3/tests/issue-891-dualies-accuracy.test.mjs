import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './source-fixture.mjs';
import { DualiesAccuracy, DUALIES_GROUNDED_BIAS_MAX, DUALIES_ACCURACY_RECOVERY_DELAY_FRAMES,
  dualiesBiasRadius, dualiesOuterThreshold, DUALIES_INNER_ENVELOPE_FALLBACK } from '../runtime/dualies-accuracy.mjs';
import { adaptSource } from '../adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PUBLIC = path.join(ROOT, 'inkwave-public');
const PROFILE = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
const PARAM = PROFILE.weaponsFidelityCompletion.weapons.dualies.WeaponParam;
const REF_HZ = PROFILE.weaponsFidelityCompletion.referenceHz;
const FRAME = 1 / REF_HZ;
const read = rel => fs.readFileSync(path.join(PUBLIC, rel), 'utf8');
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-12, `${message}: ${actual} !== ${expected}`);

async function nativeFixture() {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  const a = f.make('dualies');
  a.ink = 100;
  a.form = 'kid';
  a.pos.set(0, 0, 0);
  a.character.root.position.copy(a.pos);
  a.aimPoint.set(0, 1.05, 24);
  a.aimDir.set(0, 0, 1);
  a.yaw = 0;
  a.weaponRunner.cooldown = 0;
  return { f, a, r: a.weaponRunner, projectiles: f.G.projectiles };
}

function fireOne(f, a, randomValues = [0.99], observation = null) {
  const r = a.weaponRunner, values = [...randomValues];
  let randomCalls = 0;
  const before = f.G.projectiles.list.length;
  r.cooldown = 0;
  r.hand = 0;
  r.inkShotSequences = Object.create(null);
  f.setRandom(() => {
    randomCalls++;
    return values.length ? values.shift() : 0.99;
  });
  try {
    for (let i = 0; i < 8 && f.G.projectiles.list.length === before; i++)
      r.update(FRAME, { fire: true });
  }
  finally { f.restoreRandom(); }
  if (observation) observation.randomCalls = randomCalls;
  assert.equal(f.G.projectiles.list.length, before + 1, 'native WeaponRunner admission emits one Dualies projectile');
  return f.G.projectiles.list.at(-1);
}

// A zero-spread normal shot shares the ballistic base line of later spread
// shots from the same hand, so the angular deviation of a sampled round from
// it equals the sampler radius exactly.
function fireBaseline(f, a, hand) {
  const before = f.G.projectiles.list.length;
  let randomCalls = 0;
  f.setRandom(() => { randomCalls++; return 0.5; });
  try {
    f.G.projectiles.fireDualies(a, a.weapon, 0, hand);
  } finally { f.restoreRandom(); }
  assert.equal(f.G.projectiles.list.length, before + 1, 'baseline shot emits');
  assert.equal(randomCalls, 1, 'zero-spread baseline keeps only the projectile seed draw');
  return f.G.projectiles.list.at(-1);
}

function deviationDeg(base, round) {
  const b = base.vel.clone().normalize(), v = round.vel.clone().normalize();
  return Math.atan2(b.clone().cross(v).length(), b.dot(v)) * 180 / Math.PI;
}

// Deterministic 32-bit PRNG so distribution checks are reproducible.
const mulberry32 = seed => () => {
  seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

test('#891 uses the pinned Splat Dualies bias parameters and Wiki cap', () => {
  assert.equal(PROFILE.weaponsFidelityCompletion.sourceCommit, '7280ff9cde8bb1c5dcef46c700c326471584d2e6');
  assert.equal(REF_HZ, 60);
  assert.equal(PARAM.Stand_DegBiasMin, 0.01);
  assert.equal(PARAM.Stand_DegBiasKf, 0.01);
  assert.equal(PARAM.Stand_DegBiasDecrease, 0.005);
  assert.equal(PARAM.RepeatFrame, 5);
  assert.equal(DUALIES_ACCURACY_RECOVERY_DELAY_FRAMES, 5);
  assert.equal(PARAM.Jump_DegBiasMax, 0.4);
  assert.equal(PARAM.Stand_DegSwerve, 2);
  assert.equal(PARAM.Jump_DegSwerve, 7.5);
  assert.equal(DUALIES_GROUNDED_BIAS_MAX, 0.25);
});

test('#891 grounded bias starts at 1%, reaches 25% after 24 shots, then recovers after 5F', () => {
  const accuracy = new DualiesAccuracy(PARAM, REF_HZ);
  assert.equal(accuracy.bias, 0.01);
  const samples = [];
  for (let i = 0; i < 30; i++) {
    samples.push(accuracy.bias);
    accuracy.recordShot(true);
  }
  assert.equal(samples[0], 0.01);
  close(samples[23], 0.24, '24th shot still samples the pre-cap state');
  assert.equal(samples[24], 0.25);
  assert.equal(samples[29], 0.25);
  assert.equal(accuracy.bias, 0.25);

  for (let i = 0; i < 5; i++) accuracy.advance(FRAME);
  close(accuracy.bias, 0.25, 'first five fixed frames hold the last shot bias');
  accuracy.advance(FRAME);
  close(accuracy.bias, 0.245, 'first recovery step is 0.5 percentage points');
  for (let i = 0; i < 47; i++) accuracy.advance(FRAME);
  close(accuracy.bias, 0.01, '53 frames after the last shot reaches the minimum');
});

test('#891 jump sets 40% bias and keeps its 5F/0.5pp recovery state separate', () => {
  const accuracy = new DualiesAccuracy(PARAM, REF_HZ);
  accuracy.jump();
  assert.equal(accuracy.bias, 0.4);
  accuracy.recordShot(false);
  for (let i = 0; i < 5; i++) accuracy.advance(FRAME);
  close(accuracy.bias, 0.4, 'five frames after a jump shot stay at 40%');
  for (let i = 0; i < 78; i++) accuracy.advance(FRAME);
  close(accuracy.bias, 0.01, '83 frames after a jump shot reaches the minimum');
});

test('#891 ordinary Dualies keep the sourced envelope and existing radial sample at minimum bias', async () => {
  const { f, a, r } = await nativeFixture();
  const selected = [];
  const originalRound = f.Projectiles.prototype._fireRound;
  f.Projectiles.prototype._fireRound = function (actor, weapon, spread, ...rest) {
    if (actor === a && weapon.kind === 'dualies') selected.push(spread);
    return originalRound.call(this, actor, weapon, spread, ...rest);
  };
  try {
    const sample = {};
    fireOne(f, a, [0.25, 0, 0.99], sample);
    assert.equal(selected[0], 2, 'low bias does not collapse the sourced grounded envelope to a point');
    assert.equal(sample.randomCalls, 3, 'the existing radial sampler consumes two draws plus the projectile seed');
    close(r.s3DualiesBiasState(a.weapon).bias, 0.02, 'one admitted grounded round advances the next bias by 1pp');
    assert.equal(r.spread, 2, 'runner spread remains the sourced maximum envelope');
  } finally {
    f.Projectiles.prototype._fireRound = originalRound;
    f.restoreRandom();
  }
});

test('#891 dry clicks and blocked Dualies updates do not advance bias', async () => {
  const { f, a, r, projectiles } = await nativeFixture();
  a.ink = 0;
  r.update(FRAME, { fire: true });
  assert.equal(projectiles.list.length, 0, 'empty input emits no projectile');
  assert.equal(r.s3DualiesBiasState(a.weapon).bias, 0.01);

  a.ink = 100;
  r.dodge = { t: 0, dur: 0.2 };
  r.update(FRAME, { fire: true });
  assert.equal(projectiles.list.length, 0, 'a roll-blocked update emits no projectile');
  assert.equal(r.s3DualiesBiasState(a.weapon).bias, 0.01);
});

test('#891 jump bias, grounded/air envelopes and post-roll turret remain separate', async () => {
  const { f, a, r } = await nativeFixture();
  a.grounded = false;
  a.s3JumpSerial = 1;
  r.update(FRAME, { fire: false });
  assert.equal(r.s3DualiesBiasState(a.weapon).bias, 0.4);
  assert.equal(r.spread, 7.5, 'air envelope stays at Jump_DegSwerve');
  const selected = [];
  const originalRound = f.Projectiles.prototype._fireRound;
  f.Projectiles.prototype._fireRound = function (actor, weapon, spread, ...rest) {
    if (actor === a && weapon.kind === 'dualies') selected.push(spread);
    return originalRound.call(this, actor, weapon, spread, ...rest);
  };
  try {
    const jumpSample = {};
    fireOne(f, a, [0.25, 0, 0.99], jumpSample);
    assert.equal(selected[0], 7.5, 'jump fire retains the sourced airborne envelope');
    assert.equal(jumpSample.randomCalls, 3, 'jump fire uses the same two-draw spread sampler');
  } finally {
    f.Projectiles.prototype._fireRound = originalRound;
    f.restoreRandom();
  }
  assert.equal(r.s3DualiesBiasState(a.weapon).bias, 0.4, 'air shots do not replace the jump bias with the grounded cap');

  const beforeTurret = r.s3DualiesBiasState(a.weapon).bias;
  r.s3Turret = true;
  r.bloom = 1;
  assert.equal(r._spreadDeg(a.weapon), a.weapon.spreadLock);
  let turretRandomCalls = 0;
  f.setRandom(() => { turretRandomCalls++; return 0.99; });
  const before = f.G.projectiles.list.length;
  const directSpreads = [];
  const originalFire = f.G.projectiles.fireDualies;
  f.G.projectiles.fireDualies = function (actor, weapon, spread, hand) {
    directSpreads.push(spread);
    return originalFire.call(this, actor, weapon, spread, hand);
  };
  try {
    f.G.projectiles.fireDualies(a, a.weapon, r._spreadDeg(a.weapon), 0);
  } finally {
    f.G.projectiles.fireDualies = originalFire;
    f.restoreRandom();
  }
  assert.equal(f.G.projectiles.list.length, before + 1, 'turret still emits through its independent native shot path');
  assert.equal(directSpreads[0], 0, 'post-roll turret keeps its sourced zero-spread envelope');
  assert.equal(turretRandomCalls, 1, 'zero-spread turret skips the two spread draws');
  close(r.s3DualiesBiasState(a.weapon).bias, beforeTurret, 'turret firing does not inherit or advance normal bias');
});

test('#891 landing applies the documented grounded cap before the next normal projectile', async () => {
  const { f, a, r } = await nativeFixture();
  a.grounded = false;
  a.s3JumpSerial = 1;
  r.update(FRAME, { fire: false });
  assert.equal(r.s3DualiesBiasState(a.weapon).bias, 0.4);

  const selected = [];
  const originalRound = f.Projectiles.prototype._fireRound;
  f.Projectiles.prototype._fireRound = function (actor, weapon, spread, ...rest) {
    if (actor === a && weapon.kind === 'dualies') selected.push(spread);
    return originalRound.call(this, actor, weapon, spread, ...rest);
  };
  a.grounded = true;
  try {
    const sample = {};
    fireOne(f, a, [0.3, 0.99, 0.99], sample);
    assert.equal(sample.randomCalls, 3, 'landing normal fire uses the existing radial sample without a bias coin flip');
  } finally {
    f.Projectiles.prototype._fireRound = originalRound;
    f.restoreRandom();
  }
  assert.equal(selected[0], 2, 'landing uses the sourced grounded envelope after applying the grounded cap');
  assert.equal(r.s3DualiesBiasState(a.weapon).bias, 0.25);
});

async function fixedClockTrace(renderHz) {
  const { f, a, r, projectiles } = await nativeFixture();
  const clock = new f.FixedClock(), shots = [];
  f.setRandom(() => 0.99);
  try {
    for (let frame = 0; frame < renderHz * 3; frame++) {
      clock.advance(1 / renderHz, step => {
        const before = projectiles.list.length;
        r.update(step, { fire: clock.ticks < 120 });
        if (projectiles.list.length > before)
          shots.push({ tick: clock.ticks, bias: r.s3DualiesBiasState(a.weapon).bias });
      });
    }
  } finally { f.restoreRandom(); }
  return { shots, bias: r.s3DualiesBiasState(a.weapon).bias, framesSinceShot: r.s3DualiesBiasState(a.weapon).framesSinceShot, ticks: clock.ticks };
}

test('#891 fixed-clock native shot and recovery boundaries match at 30/60/120 Hz render rates', async () => {
  const traces = [];
  for (const hz of [30, 60, 120]) traces.push(await fixedClockTrace(hz));
  assert.deepEqual(traces[0], traces[1]);
  assert.deepEqual(traces[1], traces[2]);
  assert.deepEqual(traces[0].shots.map(s => s.tick), Array.from({ length: 24 }, (_, i) => 2 + i * 5));
  close(traces[0].shots[0].bias, 0.02, 'first emitted shot leaves 2% for the next shot');
  close(traces[0].shots[23].bias, 0.25, '24th emitted shot reaches the 25% cap');
  close(traces[0].bias, 0.01, 'recovery returns to the grounded minimum');
  assert.equal(traces[0].framesSinceShot, 62);
  assert.equal(traces[0].ticks, 180);
});

test('#891 keeps bias state out of custom reticle labels', () => {
  const source = adaptSource('src/ui/hud.js', read('src/ui/hud.js'));
  assert.doesNotMatch(source, /_dualiesBiasEl|s3DualiesBiasState|Dualies sourced outer-bias HUD/);
});

test('#891 seeded conditional sampling keeps real inner scatter and tracks the bias chance', () => {
  const envelope = 2, inner = 0.5, count = 6000, rates = [], bandRates = [];
  for (const bias of [0.01, 0.25, 0.4]) {
    const random = mulberry32(0x89100 + Math.round(bias * 1000));
    let outer = 0, band = 0, zeros = 0, innerMax = 0;
    for (let i = 0; i < count; i++) {
      const u = random();
      const radius = dualiesBiasRadius(u, envelope, bias, inner);
      const isOuter = u > dualiesOuterThreshold(bias);
      assert.equal(isOuter, u > 1 - bias, `draw ${u} selects the outer kernel above 1 - ${bias}`);
      assert.ok(radius >= 0 && radius <= envelope + 1e-12,
        `sample ${radius} stays inside the sourced ${envelope}° envelope`);
      if (!isOuter) assert.ok(radius <= envelope * inner + 1e-12,
        `inner-kernel sample ${radius} stays inside the inner band`);
      if (radius === 0) zeros++;
      if (radius > envelope * inner) band++;
      if (!isOuter) innerMax = Math.max(innerMax, radius);
      if (isOuter) outer++;
    }
    assert.equal(zeros, 0, 'no radial draw collapses to a perfect 0° center shot');
    assert.ok(innerMax > 0 && innerMax <= envelope * inner + 1e-12,
      'inner shots carry real scatter inside the inner band');
    const rate = outer / count;
    const tolerance = 5 * Math.sqrt(bias * (1 - bias) / count) + 1 / count;
    assert.ok(Math.abs(rate - bias) <= tolerance,
      `${bias} bias yields outer-kernel rate ${rate} within ${tolerance}`);
    const bandExpected = bias * (1 - inner * inner);
    const bandTolerance = 5 * Math.sqrt(bandExpected * (1 - bandExpected) / count) + 1 / count;
    assert.ok(Math.abs(band / count - bandExpected) <= bandTolerance,
      `${bias} bias yields outer-band share ${band / count} within ${bandTolerance}`);
    rates.push(rate);
    bandRates.push(band / count);
  }
  assert.ok(rates[0] < rates[1] && rates[1] < rates[2],
    'a higher sourced bias chance yields more outer-reticle samples');
  assert.ok(bandRates[0] < bandRates[1] && bandRates[1] < bandRates[2],
    'a higher sourced bias chance widens the sampled envelope share');

  // Bias 1 (a runner without the composed state) reproduces the legacy
  // full-envelope radial law exactly; bias 0 stays inside the inner band.
  for (const u of [1e-6, 0.25, 0.5, 0.999, 1])
    close(dualiesBiasRadius(u, envelope, 1, inner), envelope * Math.sqrt(u),
      'bias 1 keeps the legacy law');
  close(dualiesBiasRadius(0.25, envelope, 0, inner), envelope * inner * Math.sqrt(0.25),
    'bias 0 stays inner');
  // Closed forms at the branch boundary keep both kernels continuous in law.
  const threshold = dualiesOuterThreshold(0.25);
  assert.equal(threshold, 0.75, 'the outer threshold is 1 - bias');
  close(dualiesBiasRadius(threshold, envelope, 0.25, 0.5), envelope * 0.5,
    'the threshold draw lands on the inner-band edge');
  close(dualiesBiasRadius(1, envelope, 0.25, 0.5), envelope,
    'draw 1 reaches the sourced envelope');
  close(dualiesBiasRadius(1e-9, envelope, 0.25, 0.5), envelope * 0.5 * Math.sqrt(1e-9 / 0.75),
    'a near-zero draw keeps nonzero inner scatter');
  assert.equal(DUALIES_INNER_ENVELOPE_FALLBACK, 0.45, 'shared inner-band fallback stays documented');
  assert.equal(dualiesBiasRadius(0.5, 0, 0.25, 0.5), 0, 'zero envelope keeps the zero-spread path');
});

test('#891 native grounded fire samples the inner and outer kernels inside the 2° envelope', async () => {
  const { f, a, r } = await nativeFixture();
  const base = fireBaseline(f, a, 0);
  close(r.s3DualiesBiasState(a.weapon).bias, 0.02, 'the baseline round advances the grounded bias by 1pp');

  // Inner kernel at the current 2% state: draw 0.5 is below the 1 - bias
  // boundary, so the shot lands on the predicted inner radius with real
  // scatter — never the perfect center an earlier draft invented.
  const innerBias = r.s3DualiesBiasState(a.weapon).bias;
  const innerSample = {};
  const innerRound = fireOne(f, a, [0.5, 0.25, 0.99], innerSample);
  const expectedInner = dualiesBiasRadius(0.5, 2, innerBias, a.weapon.spreadFirst);
  assert.ok(expectedInner > 0 && expectedInner <= 1, 'the inner band is a real nonzero band');
  assert.ok(Math.abs(deviationDeg(base, innerRound) - expectedInner) < 1e-9,
    `inner sample ${deviationDeg(base, innerRound)} follows the state-predicted ${expectedInner}`);
  assert.equal(innerSample.randomCalls, 3,
    'the conditional draw keeps two spread draws plus the projectile seed');
  close(r.s3DualiesBiasState(a.weapon).bias, 0.03, 'the inner round still advances the sourced bias');

  // Outer kernel: draw 0.999 is above the boundary at the 3% state.
  const outerBias = r.s3DualiesBiasState(a.weapon).bias;
  const outerRound = fireOne(f, a, [0.999, 0.75, 0.99], {});
  const expectedOuter = dualiesBiasRadius(0.999, 2, outerBias, a.weapon.spreadFirst);
  assert.ok(expectedOuter > 1 && expectedOuter <= 2, 'the outer kernel reaches the sourced envelope');
  assert.ok(Math.abs(deviationDeg(base, outerRound) - expectedOuter) < 1e-9,
    `outer sample ${deviationDeg(base, outerRound)} follows the state-predicted ${expectedOuter}`);
  assert.ok(deviationDeg(base, outerRound) <= 2, 'outer shot stays inside Stand_DegSwerve');
});

test('#891 jump fire samples the 40% bias kernel inside the 7.5° air envelope', async () => {
  const { f, a, r } = await nativeFixture();
  a.grounded = false;
  a.s3JumpSerial = 1;
  r.update(FRAME, { fire: false });
  assert.equal(r.s3DualiesBiasState(a.weapon).bias, 0.4);

  const base = fireBaseline(f, a, 0);
  close(r.s3DualiesBiasState(a.weapon).bias, 0.4,
    'an airborne baseline round keeps the jump bias at 40%');

  const innerRound = fireOne(f, a, [0.5, 0.25, 0.99], {});
  const expectedInner = dualiesBiasRadius(0.5, 7.5, 0.4, a.weapon.spreadFirst);
  assert.ok(expectedInner > 0 && expectedInner <= 3.75, 'jump inner band stays under half the air envelope');
  assert.ok(Math.abs(deviationDeg(base, innerRound) - expectedInner) < 1e-9,
    `jump inner sample ${deviationDeg(base, innerRound)} follows the 40% state`);
  close(r.s3DualiesBiasState(a.weapon).bias, 0.4, 'airborne fire never applies the grounded cap');

  const outerRound = fireOne(f, a, [0.999, 0.1, 0.99], {});
  const expectedOuter = dualiesBiasRadius(0.999, 7.5, 0.4, a.weapon.spreadFirst);
  assert.ok(expectedOuter > 3.75 && expectedOuter <= 7.5, 'jump outer kernel reaches Jump_DegSwerve');
  assert.ok(Math.abs(deviationDeg(base, outerRound) - expectedOuter) < 1e-9,
    `jump outer sample ${deviationDeg(base, outerRound)} follows the 40% state`);
  assert.ok(deviationDeg(base, outerRound) <= 7.5, 'airborne shot stays inside Jump_DegSwerve');
});
