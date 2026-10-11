import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './storm-effects-fixture.mjs';
import { installStormPower } from '../runtime/storm-power.mjs';
import { hudFrameSnapshot } from '../../local-quality/hud-snapshots.mjs';
// #469: the spent Ink Storm gauge is displayed from the existing actor-owned lock
// (480 ticks in INKWAVE; see reports/inkwave-splatoon3-behavior-2026-10-02.md).
// The lock value itself is unverified against a primary Nintendo source.
const LOCK_TICKS = 480;
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-7, msg || `${a} != ${b}`);
function system(f) {
  f.G.scene = new f.THREE.Scene(); f.G.actors = [];
  const p = f.G.projectiles = new f.Projectiles(f.G.scene);
  return p;
}
function chargeActor(f) {
  const a = f.make('charger'); a._resolve = () => { a.grounded = true; }; a.special = a.specialCost(); return a;
}
function release(f, a) { a.intent.sub = true; f.tick(a); a.intent.sub = false; f.tick(a); }
function hud(f, game, a) {
  const m = { time: 0, teamSummary: () => null, controller: null };
  return hudFrameSnapshot(game, m, a, a.weapon, 0, [], [], null, false, f.PLAYER, f.SUB);
}
const newGame = () => ({ settings: { showFps: false }, _lowInkFlash: 0, minimap: { canvas: null } });

test('#469 activation keeps the display full while authoritative charge is spent, then drains on the existing lock', async () => {
  const f = await fixture(), p = system(f), a = chargeActor(f);
  a._startSpecial(); assert.equal(a.specialActive.phase, 'hold');
  close(a.special, 0, 'activation tick spends the authoritative charge');
  close(f.stormGaugeFraction(a), 1, 'held device shows the full spent gauge');
  release(f, a);
  close(a.stormGaugeLock, LOCK_TICKS / 60); assert.equal(a.specialActive.phase, 'throw');
  let prev = 1;
  for (let i = 1; i < LOCK_TICKS; i++) {
    f.tick(a);
    const v = f.stormGaugeFraction(a);
    assert.ok(v > 0 && v <= prev + 1e-12, `monotonic non-zero drain at tick ${i}`);
    prev = v;
    if (i === 240) {
      close(v, 0.5, 'midpoint of the 480-tick lock');
      close(a.specialFrac(), 0, 'control: without the projection the spent gauge reads empty');
      assert.equal(a.specialReady(), false, 'spent gauge is not ready');
      a.addTurf(10); close(a.special, 0, 'recharge is blocked during the drain');
      close(f.stormGaugeFraction(a), 0.5, 'turf gain does not refill the displayed spent gauge');
    }
  }
  assert.ok(f.stormGaugeFraction(a) > 0, 'gauge is still draining at tick 479');
  f.tick(a); assert.equal(a.stormGaugeLock, 0); assert.equal(f.stormGaugeFraction(a), null, 'final tick ends the display');
  a.addTurf(10); close(a.special, 10, 'normal charging resumes after the lock ends');
  p.clear();
});

test('#469 HUD and mobile transport read the same projection; charge, readiness and remote snapshots are unchanged', async () => {
  const f = await fixture(), p = system(f), a = chargeActor(f), game = newGame();
  a._startSpecial();
  let frame = hud(f, game, a);
  close(frame.special, 1, 'HUD full while held'); assert.equal(frame.specialActive, true); assert.equal(frame.specialReady, false);
  release(f, a); f.tick(a, 240);
  frame = hud(f, game, a);
  close(frame.special, 0.5, 'HUD follows the lock midpoint'); assert.equal(frame.specialActive, true);
  assert.equal(frame.specialReady, false); close(game._hudTransport.mobile.special, 0.5, 'mobile mirrors the HUD gauge');
  assert.equal(game._hudTransport.mobile.activeSp, true);
  close(a.special, 0, 'native charge stays spent');
  a.remote = true; frame = hud(f, game, a);
  close(frame.special, 0, 'remote actors keep their replicated value; no invented post-use clock');
  assert.equal(frame.specialActive, false); a.remote = false;
  f.tick(a, 240); frame = hud(f, game, a);
  close(frame.special, 0, 'expired lock falls back to the ordinary empty charge');
  assert.equal(frame.specialActive, false);
  p.clear();
});

test('#469 Special Power extension sets the denominator once; death and reset keep the visible remainder', async () => {
  const f = await fixture(), p = system(f), a = chargeActor(f);
  installStormPower({ Actor: f.Actor, Projectiles: f.Projectiles });
  a.s3 = { modifiers: { stormDuration: 10 } };
  a._startSpecial(); release(f, a);
  close(a.stormGaugeLock, 10, 'Special Power extends the throw lock'); close(a.stormGaugeDuration, 10, 'denominator captured after the throw');
  f.tick(a, 300); close(f.stormGaugeFraction(a), 0.5, 'extended lock is normalized by its real duration');
  const before = f.stormGaugeFraction(a);
  a.splat(null, 'water'); a.reset();
  close(f.stormGaugeFraction(a), before, 'reset removes the temporary power snapshot without a display jump');
  close(a.stormGaugeLock, 5, 'death and reset retain the lock');
  f.tick(a, 300); assert.equal(f.stormGaugeFraction(a), null, 'lock expires after the remaining ticks');
  a.addTurf(10); close(a.special, 10, 'reset does not reopen recharge early');
  p.clear();
});

test('#469 30/60/120Hz render schedules produce identical spent-gauge display traces', async () => {
  let expected;
  for (const hz of [30, 60, 120]) {
    const f = await fixture(), p = system(f), a = chargeActor(f);
    a._startSpecial(); release(f, a);
    const clock = new f.FixedClock(), rows = [];
    for (let frame = 0; frame < hz * 8; frame++) clock.advance(1 / hz, dt => { f.G.time += dt; a.update(dt); rows.push(f.stormGaugeFraction(a)); });
    if (expected) assert.deepEqual(rows, expected); else expected = rows;
    assert.equal(rows.at(-1), null, 'display ends with the lock');
    assert.ok(rows.at(-2) > 0, 'display is still non-zero one tick before the end');
    p.clear();
  }
});
