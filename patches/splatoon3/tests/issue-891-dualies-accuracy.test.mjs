import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './source-fixture.mjs';
import { DualiesAccuracy, DUALIES_GROUNDED_BIAS_MAX, DUALIES_ACCURACY_RECOVERY_DELAY_FRAMES } from '../runtime/dualies-accuracy.mjs';
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
