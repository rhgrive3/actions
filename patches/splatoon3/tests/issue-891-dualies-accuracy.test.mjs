import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './source-fixture.mjs';
import { DualiesAccuracy, DUALIES_GROUNDED_BIAS_MAX, DUALIES_ACCURACY_RECOVERY_DELAY_FRAMES,
  dualiesBiasRadius, DUALIES_BIAS_UNAVAILABLE_FALLBACK } from '../runtime/dualies-accuracy.mjs';
import { adaptSource } from '../adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PUBLIC = path.join(ROOT, 'inkwave-public');
const PROFILE = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
const PARAM = PROFILE.weaponsFidelityCompletion.weapons.dualies.WeaponParam;
const REF_HZ = PROFILE.weaponsFidelityCompletion.referenceHz;
const FRAME = 1 / REF_HZ;
const read = rel => fs.readFileSync(path.join(PUBLIC, rel), 'utf8');
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-12, `${message}: ${actual} !== ${expected}`);

async function nativeFixture(extraExports = '') {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true, extraExports });
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

async function nativeMovementFixture(extraExports = '', floorHalfWidth = 100) {
  const world = await nativeFixture(extraExports), { f, a } = world;
  const { THREE, G } = f;
  const floor = {
    id: 0, solid: true, center: new THREE.Vector3(0, -0.1, 0), half: new THREE.Vector3(floorHalfWidth, 0.1, 100),
    aabbMin: new THREE.Vector3(-floorHalfWidth, -0.2, -100), aabbMax: new THREE.Vector3(floorHalfWidth, 0, 100),
    axes: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
    faces: [-1, -1, -1, -1, -1, -1],
  };
  G.level = {
    blocks: [floor], faces: [], groundHeight: () => 0, hasRails: false, spawnBarrier: 0.5,
    spawnPads: [new THREE.Vector3(-1000, 0, 0), new THREE.Vector3(1000, 0, 0)],
    queryBlocks: (_x, _z, _xx, _zz, out) => { out.length = 0; out.push(0); return out; },
  };
  G.physics = new f.Physics(G.level);
  G.paint = { sample: () => 0, splat: () => 0 };
  G.match = { playing: () => true, canRespawn: () => false };
  G.time = 0;
  G.scene = new THREE.Scene();
  G.projectiles = new f.Projectiles(G.scene);
  delete a._integrate;
  a.pos.set(0, 0, 0); a.vel.set(0, 0, 0); a.grounded = true;
  a.ground.hit = true; a.ground.y = 0; a.ground.block = 0; a.ground.face = -1;
  a.groundN.set(0, 1, 0); a.kidT = 99; a.weaponRunner.cooldown = 0;
  a.intent.move.set(0, 0, 0); a.intent.jump = false; a.intent.fire = false;
  a.aimPoint.set(0, 1.05, 24); a.aimDir.set(0, 0, 1);
  return { ...world, projectiles: G.projectiles };
}

function nativeActorTick(f, a, dt = FRAME) {
  f.G.time += dt;
  a.update(dt);
}

function admitNativeJump(f, a) {
  const before = a.s3JumpSerial || 0;
  a.intent.jump = true;
  nativeActorTick(f, a);
  a.intent.jump = false;
  assert.equal(a.s3JumpSerial, before + 1, 'native Actor.update admitted a real jump');
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

test('#891 reads the independent jump recovery fields without inventing a jump state', () => {
  assert.equal(PARAM.Jump_DegBiasDecreaseStartFrame, 25);
  assert.equal(PARAM.Jump_DegBiasEndFrame, 70);
  const accuracy = new DualiesAccuracy(PARAM, REF_HZ);
  const state = accuracy.snapshot();
  assert.equal(state.jumpActive, false, 'construction alone does not start the native jump clock');
  assert.equal(state.jumpAgeFrames, null);
  assert.equal(state.envelope, null);
  assert.equal(accuracy.jumpDecreaseStartFrame, 25);
  assert.equal(accuracy.jumpEndFrame, 70);
});

test('#891 ordinary Dualies keep the sourced envelope and continuous bias sample at minimum bias', async () => {
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
    assert.equal(sample.randomCalls, 3, 'the continuous sampler keeps two spread draws plus the projectile seed');
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
  const { f, a, r } = await nativeMovementFixture();
  for (let i = 0; i < 12; i++) nativeActorTick(f, a);
  admitNativeJump(f, a);
  assert.equal(r.s3DualiesBiasState(a.weapon).bias, 0.4);
  assert.equal(r.s3DualiesBiasState(a.weapon).jumpAgeFrames, 0,
    'the independent clock starts on the admitted jump edge');
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

async function fixedClockTrace(renderHz) {
  const { f, a, r, projectiles } = await nativeFixture();
  const clock = new f.FixedClock(), shots = [];
  const random = mulberry32(0x8911130);
  f.setRandom(() => random());
  try {
    for (let frame = 0; frame < renderHz * 3; frame++) {
      clock.advance(1 / renderHz, step => {
        const before = projectiles.list.length;
        r.update(step, { fire: clock.ticks < 120 });
        for (let i = before; i < projectiles.list.length; i++)
          shots.push({ tick: clock.ticks, bias: r.s3DualiesBiasState(a.weapon).bias,
            velocity: Array.from(projectiles.list[i].vel.toArray()) });
      });
    }
  } finally { f.restoreRandom(); }
  return { shots, bias: r.s3DualiesBiasState(a.weapon).bias, framesSinceShot: r.s3DualiesBiasState(a.weapon).framesSinceShot, ticks: clock.ticks };
}

async function idleJumpEmissionLandingTrace(renderHz) {
  const { f, a, r, projectiles } = await nativeMovementFixture();
  const clock = new f.FixedClock(), rows = [], emissions = [];
  const originalRound = f.Projectiles.prototype._fireRound;
  let randomCalls = 0, jumpTick = null, landingTick = null;
  f.Projectiles.prototype._fireRound = function (actor, weapon, envelope, ...rest) {
    const state = actor === a && weapon.kind === 'dualies' ? r.s3DualiesBiasState(weapon) : null;
    const beforeDraws = randomCalls;
    const direction = originalRound.call(this, actor, weapon, envelope, ...rest);
    if (state) emissions.push({ tick: clock.ticks, bias: state.bias, groundedBias: state.groundedBias,
      jumpAgeFrames: state.jumpAgeFrames, envelope, draws: randomCalls - beforeDraws,
      direction: Array.from(direction.toArray()) });
    return direction;
  };
  f.setRandom(() => { randomCalls++; return 0.375; });
  try {
    for (let rendered = 0; clock.ticks < 100 && rendered < renderHz * 3; rendered++) {
      clock.advance(1 / renderHz, step => {
        const tick = clock.ticks, serial = a.s3JumpSerial || 0, groundedBefore = a.grounded;
        a.intent.jump = tick === 12;
        a.intent.fire = tick >= 13 && emissions.length === 0;
        f.G.time += step;
        a.update(step);
        if ((a.s3JumpSerial || 0) !== serial) jumpTick = tick;
        if (!groundedBefore && a.grounded && landingTick == null) landingTick = tick;
        const state = r.s3DualiesBiasState(a.weapon);
        rows.push({ tick, grounded: a.grounded, jumpActive: state.jumpActive,
          jumpAgeFrames: state.jumpAgeFrames, bias: state.bias, groundedBias: state.groundedBias,
          envelope: r._spreadDeg(a.weapon), shots: projectiles.list.length });
      });
    }
  } finally {
    f.Projectiles.prototype._fireRound = originalRound;
    f.restoreRandom();
  }
  return { rows, emissions, jumpTick, landingTick, randomCalls, ticks: clock.ticks };
}

test('#891 fixed-clock native shot and recovery boundaries match at 30/60/120 Hz render rates', async () => {
  const traces = [];
  for (const hz of [30, 60, 120]) traces.push(await fixedClockTrace(hz));
  assert.deepEqual(traces[0], traces[1]);
  assert.deepEqual(traces[1], traces[2]);
  assert.deepEqual(traces[0].shots.map(s => s.tick), Array.from({ length: 24 }, (_, i) => 2 + i * 5));
  assert.ok(traces[0].shots.every(s => s.velocity.every(Number.isFinite)),
    'production emits a finite velocity for every fixed-clock shot');
  close(traces[0].shots[0].bias, 0.02, 'first emitted shot leaves 2% for the next shot');
  close(traces[0].shots[23].bias, 0.25, '24th emitted shot reaches the 25% cap');
  close(traces[0].bias, 0.01, 'recovery returns to the grounded minimum');
  assert.equal(traces[0].framesSinceShot, 62);
  assert.equal(traces[0].ticks, 180);
});

test('#891 native idle→jump→emission→landing trace uses one 25F/70F clock at 30/60/120Hz', async () => {
  const traces = [];
  for (const hz of [30, 60, 120]) traces.push(await idleJumpEmissionLandingTrace(hz));
  assert.deepEqual(traces[0], traces[1]);
  assert.deepEqual(traces[1], traces[2]);
  const trace = traces[0];
  assert.equal(trace.ticks, 100);
  assert.equal(trace.jumpTick, 12, 'the trace begins with twelve real idle Actor updates');
  const nextFrame = trace.rows.find(row => row.tick === trace.jumpTick + 1);
  assert.equal(nextFrame.jumpAgeFrames, 1);
  assert.equal(nextFrame.bias, 0.4,
    'the stale 12F shot clock cannot recover the new jump bias on the next frame');
  assert.ok(trace.landingTick > trace.jumpTick && trace.landingTick - trace.jumpTick < 70,
    'the native Actor physics path lands while the jump clock is still active');
  assert.equal(trace.emissions.length, 1, 'the real Actor→WeaponRunner→Projectiles path emits one jump round');
  assert.equal(trace.emissions[0].tick, 15, 'the shot follows native Actor input and Dualies startup');
  assert.equal(trace.emissions[0].jumpAgeFrames, trace.emissions[0].tick - trace.jumpTick,
    'emission observes actual jump age, including the native startup frames');
  assert.equal(trace.emissions[0].bias, 0.4);
  assert.equal(trace.emissions[0].envelope, 7.5);
  assert.equal(trace.emissions[0].draws, 3, 'two spread draws and the existing projectile seed remain ordered');
  assert.ok(trace.emissions[0].direction.every(Number.isFinite), 'the native emitted direction is finite');
  assert.equal(trace.randomCalls, 3, 'the jump sample adds no random draw');

  const age25 = trace.rows.find(row => row.jumpAgeFrames === 25);
  assert.ok(age25?.jumpActive, 'the actual-jump clock reaches its sourced decrease-start frame');
  close(age25.bias, 0.4, 'jump bias remains at its sourced maximum through 25F');
  close(age25.envelope, 7.5, 'the matching angle envelope remains at Jump_DegSwerve through 25F');
  const age50 = trace.rows.find(row => row.jumpAgeFrames === 50);
  assert.ok(age50?.jumpActive && age50.bias > age50.groundedBias && age50.bias < 0.4,
    'the explicit unmeasured transition moves continuously toward the live grounded bias');
  assert.ok(age50.envelope > 2 && age50.envelope < 7.5,
    'the angle envelope follows the same 25F→70F recovery progress');

  const landed = trace.rows.find(row => row.tick === trace.landingTick);
  assert.ok(landed.jumpActive, 'landing does not retire the jump-age or clamp its bias');
  assert.ok(landed.bias > landed.groundedBias, 'landing retains the jump-derived bias');
  assert.ok(landed.envelope > 2, 'landing retains the matching jump-angle envelope');
  const recovered = trace.rows.find(row => row.jumpAgeFrames == null && row.tick > trace.landingTick);
  assert.ok(recovered, 'the grounded runner retires the track at its 70F endpoint');
  assert.equal(recovered.tick, trace.jumpTick + PARAM.Jump_DegBiasEndFrame,
    'the actual-jump clock reaches the pinned 70F endpoint after landing');
  assert.equal(recovered.bias, recovered.groundedBias, 'recovery returns to the live grounded firing state');
  assert.equal(recovered.envelope, 2, 'the grounded envelope is restored only after jump recovery completes');
});

test('#891 a real walk off a ledge does not start the jump-accuracy clock', async () => {
  const { f, a, r } = await nativeMovementFixture('', 0.45);
  a.intent.move.set(1, 0, 0);
  let walkedOff = false;
  for (let i = 0; i < 90; i++) {
    nativeActorTick(f, a);
    if (!a.grounded) { walkedOff = true; break; }
  }
  assert.equal(walkedOff, true, 'native movement and ground probing carry the Actor off the platform');
  assert.equal(a.s3JumpSerial || 0, 0, 'walking off does not increment the native jump serial');
  const state = r.s3DualiesBiasState(a.weapon);
  assert.equal(state.jumpActive, false);
  assert.equal(state.jumpAgeFrames, null);
  assert.equal(r._spreadDeg(a.weapon), 7.5, 'ordinary airborne envelope remains without a jump clock');
});

test('#891 Practice Range weapon changes and actor life reset retire the native jump track', async () => {
  const rangeExports = "export { RangeSession } from './patches/practice-range/runtime/session.mjs';";
  const { f, a, r } = await nativeMovementFixture(rangeExports);
  a.isLocal = true;
  const match = { actors: [a], local: a, state: 'playing', opts: { range: true }, canRespawn: () => true };
  f.G.match = match; f.G.actors = match.actors; f.G.local = a;
  const range = new f.RangeSession(match, { headless: true });

  admitNativeJump(f, a);
  assert.equal(r.s3DualiesBiasState(a.weapon).jumpActive, true);
  range.setWeapon('shooter');
  range.setWeapon('dualies');
  assert.equal(r.s3DualiesBiasState(a.weapon).jumpActive, false,
    'RangeSession.setWeapon retires the previous weapon clock through Actor.setWeapon');
  assert.equal(r.s3DualiesBiasState(a.weapon).bias, 0.01,
    'returning to Dualies starts from the normal grounded bias');

  a.reset();
  a.pos.set(0, 0, 0); a.vel.set(0, 0, 0); a.grounded = true;
  a.ground.hit = true; a.ground.y = 0; a.ground.block = 0; a.ground.face = -1;
  a.groundN.set(0, 1, 0);
  nativeActorTick(f, a);
  admitNativeJump(f, a);
  assert.equal(r.s3DualiesBiasState(a.weapon).jumpActive, true,
    'the next life can admit its own native jump');
  a.splat(null);
  assert.equal(r.s3DualiesBiasState(a.weapon).jumpActive, false,
    'death clears the jump track before the next life reset');
  range.dispose();
});

test('#891 keeps bias state out of custom reticle labels', () => {
  const source = adaptSource('src/ui/hud.js', read('src/ui/hud.js'));
  assert.doesNotMatch(source, /_dualiesBiasEl|s3DualiesBiasState|Dualies sourced outer-bias HUD/);
});

test('#891 seeded continuous samples follow y = s * x^(log_0.5 b)', () => {
  const envelope = 2;
  const expected = (x, b) => envelope * Math.pow(x, Math.log(b) / Math.log(0.5));
  for (const [x, bias] of [[0.25, 0.5], [0.25, 0.25], [0.37, 0.01], [0.83, 0.4]])
    close(dualiesBiasRadius(x, envelope, bias), expected(x, bias),
      `the source transform maps x=${x}, b=${bias} continuously inside its angle envelope`);
  assert.equal(dualiesBiasRadius(0.75, envelope, 0.5), 1.5,
    'bias 0.5 gives a uniform angular deviation within the full envelope');
  assert.ok(dualiesBiasRadius(0.75, envelope, 0.01) > 0,
    'the tracked grounded recovery endpoint remains above the unsupported perfect-center case');
  assert.equal(dualiesBiasRadius(0.75, envelope, 1), envelope, 'unit bias always reaches the maximum angle');
  assert.equal(dualiesBiasRadius(0.75, 0, 0.25), 0, 'zero envelope keeps the no-spread path');
  assert.equal(DUALIES_BIAS_UNAVAILABLE_FALLBACK, 0.5,
    'runner-less fixtures use the explicit neutral model fallback');

  const random = mulberry32(0x8911130), draws = Array.from({ length: 256 }, random);
  const means = [0.01, 0.1, 0.25, 0.4].map(bias => {
    const samples = draws.map(x => dualiesBiasRadius(x, envelope, bias));
    assert.ok(samples.every(radius => radius >= 0 && radius <= envelope),
      `bias ${bias} remains inside the sourced maximum angle`);
    return samples.reduce((sum, radius) => sum + radius, 0) / samples.length;
  });
  assert.ok(means[0] < means[1] && means[1] < means[2] && means[2] < means[3],
    'the same seeded uniform draws move farther from the center as bias rises');
});

test('#891 native grounded fire samples the continuous bias law inside the 2° envelope', async () => {
  const { f, a, r } = await nativeFixture();
  const base = fireBaseline(f, a, 0);
  close(r.s3DualiesBiasState(a.weapon).bias, 0.02, 'the baseline round advances the grounded bias by 1pp');

  const fired = [];
  for (const x of [0.5, 0.5, 0.5]) {
    const sampledBias = r.s3DualiesBiasState(a.weapon).bias;
    const observation = {};
    const round = fireOne(f, a, [x, 0, 0.99], observation);
    const radius = dualiesBiasRadius(x, 2, sampledBias);
    assert.ok(Math.abs(deviationDeg(base, round) - radius) < 1e-9,
      `live shot at bias ${sampledBias} follows the continuous angular sample ${radius}`);
    assert.equal(observation.randomCalls, 3,
      'the live sample keeps radial uniform, azimuth and projectile-seed draws');
    fired.push({ bias: sampledBias, radius });
  }
  assert.deepEqual(fired.map(row => row.bias), [0.02, 0.03, 0.04],
    'only admitted grounded projectiles advance the source bias by 1pp');
  assert.ok(fired[0].radius < fired[1].radius && fired[1].radius < fired[2].radius,
    'fixed seeded samples widen continuously with sustained grounded fire');
  assert.ok(fired.every(row => row.radius <= 2), 'all grounded shots stay inside Stand_DegSwerve');
});

test('#891 admitted native jump fire samples the continuous bias law inside the 7.5° envelope', async () => {
  const { f, a, r } = await nativeMovementFixture();
  for (let i = 0; i < 12; i++) nativeActorTick(f, a);
  admitNativeJump(f, a);
  assert.equal(r.s3DualiesBiasState(a.weapon).bias, 0.4);

  const base = fireBaseline(f, a, 0);
  close(r.s3DualiesBiasState(a.weapon).bias, 0.4,
    'an airborne baseline round keeps the jump bias at 40%');

  const innerRound = fireOne(f, a, [0.5, 0.25, 0.99], {});
  const expectedInner = dualiesBiasRadius(0.5, 7.5, 0.4);
  assert.ok(expectedInner > 0 && expectedInner <= 7.5, 'jump bias samples within the full air envelope');
  assert.ok(Math.abs(deviationDeg(base, innerRound) - expectedInner) < 1e-9,
    `jump sample ${deviationDeg(base, innerRound)} follows the 40% state`);
  close(r.s3DualiesBiasState(a.weapon).bias, 0.4, 'airborne fire never applies the grounded cap');

  const outerRound = fireOne(f, a, [0.999, 0.1, 0.99], {});
  const expectedOuter = dualiesBiasRadius(0.999, 7.5, 0.4);
  assert.ok(expectedOuter > expectedInner && expectedOuter <= 7.5, 'larger jump draw reaches farther inside Jump_DegSwerve');
  assert.ok(Math.abs(deviationDeg(base, outerRound) - expectedOuter) < 1e-9,
    `larger jump draw ${deviationDeg(base, outerRound)} follows the 40% state`);
  assert.ok(deviationDeg(base, outerRound) <= 7.5, 'airborne shot stays inside Jump_DegSwerve');
});

test('#891 remote Dualies ghost replays the transmitted velocity without sampling spread again', async () => {
  const { f, a, projectiles } = await nativeFixture();
  a.nid = 7;
  const net = f.G.netm = new f.NetMatch({ myId: 7 }, {});
  fireOne(f, a, [0.31, 0.77, 0.99]);
  const packet = net.out.find(event => event[1] === 'p');
  assert.ok(packet, 'the live owner shot is recorded through NetMatch');
  const remote = f.make('dualies');
  remote.remote = true;
  assert.equal(remote.weaponRunner.s3DualiesBiasState(remote.weapon).jumpActive, false,
    'remote presentation does not create an owner-side jump clock');
  projectiles.list.length = 0;
  let randomCalls = 0;
  f.setRandom(() => { randomCalls++; return 0.9; });
  try { projectiles.ghostProjectile(remote, packet); }
  finally { f.restoreRandom(); }
  const ghost = projectiles.list.at(-1);
  assert.ok(ghost.ghost);
  assert.deepEqual(Array.from(ghost.vel.toArray()), Array.from(packet.slice(8, 11)),
    "remote presentation keeps the owner's sampled launch velocity");
  assert.equal(randomCalls, 1, 'ghost reconstruction uses only its placeholder seed draw');
});
