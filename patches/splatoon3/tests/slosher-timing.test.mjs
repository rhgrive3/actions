import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

// Actual adapted WeaponRunner.update/_slosher, with only the projectile sink
// and Character display stubbed. Frame numbers count elapsed ticks AFTER the
// initial slosh trigger; the input tick itself starts its clock at zero.
async function rig() {
  const f = await fixture(), a = f.make('slosher'), shots = [], starts = [];
  let tick = 0, time = 0;
  const trigger = a.character.trigger;
  a.character.trigger = function (name, ...args) {
    if (name === 'slosh') starts.push({ tick, time, ink: a.ink });
    return trigger.call(this, name, ...args);
  };
  f.G.projectiles.fireSlosh = (actor, weapon) => shots.push({ tick, time, ink: actor.ink, weapon });
  const step = (dt = 1 / 60, fire = true) => {
    tick++; time += dt; f.G.time = time; a.intent.fire = fire;
    a.weaponRunner.update(dt, { fire });
  };
  const frames = (count, fire = true) => { for (let i = 0; i < count; i++) step(1 / 60, fire); };
  return { f, a, shots, starts, step, frames, get tick() { return tick; }, get time() { return time; } };
}

test('actual Slosher first release waits 12 elapsed ticks and held attacks repeat every 29 ticks', async () => {
  const r = await rig(), w = r.a.weapon;
  assert.equal(w.windup, 12 / 60); assert.equal(w.fireInterval, 29 / 60);
  r.frames(110);
  assert.deepEqual(r.starts.map(x => x.tick), [1, 30, 59, 88]);
  assert.deepEqual(r.shots.map(x => x.tick), [13, 42, 71, 100]);
  assert.equal(r.shots[0].tick - r.starts[0].tick, 12);
  for (let i = 1; i < r.shots.length; i++) assert.equal(r.shots[i].tick - r.shots[i - 1].tick, 29);
  assert.ok(Math.abs(r.a.ink - (100 - 4 * w.inkPerShot)) < 1e-10, 'one debit per trigger');
});

test('fixed 60-tick Runner trace is identical under 30/60/120Hz render clocks', async () => {
  const traces = [];
  for (const hz of [30, 60, 120]) {
    const r = await rig(), clock = new FixedClock(), trace = [];
    for (let render = 0; render < 2 * hz; render++) clock.advance(1 / hz, dt => {
      r.step(dt); const runner = r.a.weaponRunner;
      trace.push({ tick: clock.ticks, slosh: runner.slosh, cooldown: runner.cooldown,
        busy: runner.busy(), firing: runner.firingPose(), ink: r.a.ink, shots: r.shots.length });
    });
    assert.equal(clock.ticks, 120); assert.deepEqual(r.shots.map(x => x.tick), [13, 42, 71, 100]);
    traces.push(trace);
  }
  assert.deepEqual(traces[0], traces[1]); assert.deepEqual(traces[1], traces[2]);
});

test('seconds dt preserves accumulated deadlines without rounding each attack to display frames', async () => {
  for (const pattern of [[1 / 30], [1 / 60], [1 / 120], [.037, .009, .023, .011]]) {
    const r = await rig(), tolerance = Math.max(...pattern); let i = 0;
    while (r.time < 4.6) r.step(pattern[i++ % pattern.length]);
    assert.ok(r.shots.length >= 9);
    for (let shot = 0; shot < r.shots.length; shot++) {
      const due = r.starts[0].time + r.a.weapon.windup + shot * r.a.weapon.fireInterval;
      assert.ok(r.shots[shot].time >= due - 1e-10, 'no shot precedes its seconds deadline');
      assert.ok(r.shots[shot].time - due <= tolerance + 1e-10, 'phase error does not accumulate per attack');
    }
  }
});

test('zero and fractional seconds do not become rounded frame progress', async () => {
  const r = await rig(); r.step(0);
  r.step(.2 - 1e-8, false); assert.equal(r.shots.length, 0, 'epsilon must not erase meaningful remaining time');
  r.step(0, false); assert.equal(r.shots.length, 0);
  r.step(1e-8, false); assert.equal(r.shots.length, 1);
});

test('released input finishes one committed windup and a long idle cannot skip the next windup', async () => {
  const r = await rig(); r.step(); r.frames(11, false);
  assert.equal(r.shots.length, 0); assert.equal(r.a.weaponRunner.busy(), true);
  r.step(1 / 60, false); assert.equal(r.shots.length, 1);
  const ink = r.a.ink; r.frames(100, false); assert.equal(r.shots.length, 1); assert.equal(r.a.ink, ink);
  r.step(); const started = r.tick;
  assert.equal(r.a.weaponRunner.slosh, 0, 'idle cooldown is not attack carry');
  r.frames(11, false); assert.equal(r.shots.length, 1);
  r.step(1 / 60, false); assert.equal(r.shots.length, 2); assert.equal(r.shots[1].tick - started, 12);
});

test('repress during recovery respects the remaining cooldown and does not double-debit ink', async () => {
  const r = await rig(); r.frames(13); const ink = r.a.ink;
  r.frames(4, false); r.frames(12, true);
  assert.equal(r.starts.length, 1); assert.equal(r.a.ink, ink);
  r.step(); assert.equal(r.starts[1].tick, 30); assert.equal(r.shots.length, 1);
  r.frames(12, false); assert.equal(r.shots[1].tick, 42);
  assert.ok(Math.abs(r.a.ink - (ink - r.a.weapon.inkPerShot)) < 1e-10);
});

test('ink admission uses the current actor weapon cost exactly once, including empty retry', async () => {
  const r = await rig(); r.a.weapon = { ...r.a.weapon, inkPerShot: 2.7 }; r.a.ink = 2.7 - 1e-8;
  r.step(); assert.equal(r.starts.length, 0); assert.equal(r.a.weaponRunner.slosh, -1);
  assert.equal(r.shots.length, 0); assert.equal(r.a.ink, 2.7 - 1e-8);
  r.a.ink = 2.7; r.frames(12);
  assert.equal(r.starts.length, 1); assert.ok(Math.abs(r.a.ink) < 1e-12);
  r.frames(12, false); assert.equal(r.shots.length, 1); assert.ok(Math.abs(r.a.ink) < 1e-12);
  assert.equal(r.shots[0].weapon.inkPerShot, 2.7);
});

test('reset, death and weapon replacement cancel pending release and start a fresh timed attack', async () => {
  for (const ending of ['reset', 'death', 'weapon']) {
    const r = await rig(); r.frames(6);
    if (ending === 'reset') r.a.weaponRunner.reset();
    if (ending === 'death') r.a.weaponRunner.onDeath();
    if (ending === 'weapon') { r.a.setWeapon('shooter'); r.a.setWeapon('slosher'); }
    r.frames(30, false); assert.equal(r.shots.length, 0, ending); assert.equal(r.a.weaponRunner.busy(), false);
    r.step(); const started = r.tick; r.frames(12, false);
    assert.equal(r.shots.length, 1, ending); assert.equal(r.shots[0].tick - started, 12);
  }
});

test('Slosher ink recovery starts 40 fixed ticks after glob release at 30/60/120Hz', async () => {
  const traces = [];
  for (const hz of [30, 60, 120]) {
    const f = await fixture(), a = f.make('slosher'), clock = new FixedClock(), shots = [];
    a.lastFire = 0; a.ink = 90;
    let simTick = 0, spentInk, releaseTick, releaseLastFire, firstRefillTick;
    f.G.projectiles.fireSlosh = () => shots.push(simTick);
    const step = dt => {
      simTick++; f.G.time += dt; a.intent.fire = simTick === 1; a.update(dt);
      if (simTick === 1) spentInk = a.ink;
      if (releaseTick === undefined && shots.length) {
        releaseTick = simTick; releaseLastFire = a.lastFire;
      }
      if (releaseTick !== undefined && firstRefillTick === undefined && a.ink > spentInk + 1e-10) {
        firstRefillTick = simTick;
      }
    };
    for (let render = 0; render < 2 * hz; render++) clock.advance(1 / hz, step);
    assert.equal(clock.ticks, 120, `${hz}Hz fixed-step count`);
    assert.equal(a.weapon.windup * 60, 12, 'existing Slosher windup remains 12F');
    assert.equal(a.weapon.fireInterval * 60, 29, 'existing repeat interval remains 29F');
    assert.equal(a.weapon.inkRecoverStop * 60, 40, 'profile recovery stop remains 40F');
    assert.deepEqual(shots, [13], 'the first glob group still releases at tick 13');
    assert.equal(releaseLastFire, 0, 'release restarts the existing recovery clock');
    assert.equal(firstRefillTick, 53, 'first refill is exactly 40 fixed ticks after release');
    traces.push({ hz, releaseTick, firstRefillTick });
    f.restoreRandom();
  }
  assert.deepEqual(traces, [
    { hz: 30, releaseTick: 13, firstRefillTick: 53 },
    { hz: 60, releaseTick: 13, firstRefillTick: 53 },
    { hz: 120, releaseTick: 13, firstRefillTick: 53 },
  ]);
});

test('ordinary Shooter ink recovery retains its existing 20F fire-event deadline', async () => {
  const f = await fixture(), a = f.make('shooter');
  a.lastFire = 0; a.ink = 90;
  let simTick = 0, shotTick, spentInk, firstRefillTick;
  f.G.projectiles.fireShooter = () => { shotTick = simTick; };
  for (simTick = 1; simTick <= 30; simTick++) {
    a.intent.fire = simTick === 1; f.G.time += 1 / 60; a.update(1 / 60);
    if (shotTick === simTick) spentInk = a.ink;
    if (spentInk !== undefined && simTick > shotTick && firstRefillTick === undefined && a.ink > spentInk + 1e-10) firstRefillTick = simTick;
  }
  assert.equal(a.weapon.inkRecoverStop * 60, 20);
  const expectedShotTick = Math.max(1, Math.round(a.weapon.firstShotDelay * 60));
  assert.equal(shotTick, expectedShotTick, 'Shooter keeps its sourced first-shot gate');
  assert.equal(firstRefillTick, expectedShotTick + 20, 'ordinary Shooter recovery remains 20F after the actual fire event');
  f.restoreRandom();
});
