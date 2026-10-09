import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, STEP } from './full-install-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

// #931 (characterization: this passes on the pre-existing code, which already re-arms lastFire on every stream round):
// Heavy Splatling's sourced 40F inkRecoverStop must elapse after the final stream round, not inside the stream.
// Logic-only: real composed Actor/WeaponRunner/Projectiles/resources on the VM at fixed 60 Hz ticks; not a browser run
// and not a Splatoon 3 real-device comparison (whether S3 measures the 40F from the last round is unconfirmed).
async function rig() {
  const f = await boot(), a = f.make({ weapon: 'splatling' }), ps = f.G.projectiles, r = a.weaponRunner;
  f.tick(a); a.aimYaw = 0; a.aimPitch = 0; a.ink = f.PLAYER.inkMax;
  const state = { tick: 0, rounds: [], refillTick: null, streamEndTick: null, streamRefill: false, releaseTick: null };
  const fire = ps.fireSplatling;
  ps.fireSplatling = function (...args) { state.rounds.push(state.tick); return fire.apply(this, args); };
  const step = () => {
    state.tick++; const before = a.ink, wasStreaming = r.streaming;
    f.G.time += STEP; a.update(STEP); ps.update(STEP);
    if (wasStreaming && !r.streaming && state.streamEndTick === null) state.streamEndTick = state.tick;
    if (a.ink > before + 1e-12 && state.rounds.length) {
      if (r.streaming) state.streamRefill = true;
      state.refillTick ??= state.tick;
    }
  };
  // Hold ZR for `charge` ticks, release, then run until refill starts (or the guard).
  const run = (holdTicks, guard = 600) => {
    a.intent.fire = true; for (let i = 0; i < holdTicks; i++) step();
    a.intent.fire = false; state.releaseTick = state.tick + 1;
    for (let i = 0; i < guard && state.refillTick === null; i++) step();
    return state;
  };
  return { f, a, r, step, run, state };
}

test('#931 full stream: refill waits the 40F recovery stop after the final round, never refills while streaming', async t => {
  const { f, a, run } = await rig(); t.after(f.close);
  assert.ok(Math.abs(a.weapon.inkRecoverStop * 60 - 40) < 1e-9, 'sourced 40F stop');
  const s = run(75);
  assert.ok(s.rounds.length >= 38, `full stream emitted rounds (${s.rounds.length})`);
  assert.equal(s.streamRefill, false, 'no refill while streaming');
  assert.ok(s.streamEndTick !== null);
  const last = s.rounds.at(-1);
  assert.ok(s.refillTick - last >= 40, `refill began ${s.refillTick - last}F after the last round`);
  assert.ok(s.refillTick - last <= 42, `and not much later (${s.refillTick - last}F)`);
  assert.ok(s.refillTick - s.streamEndTick > 30, `first tick after the stream cannot refill (${s.refillTick - s.streamEndTick}F after stream end)`);
});

test('#931 partial stream preserves the same post-firing recovery stop', async t => {
  const { f, run } = await rig(); t.after(f.close);
  const s = run(55);
  assert.ok(s.rounds.length > 1 && s.rounds.length < 38, `partial stream (${s.rounds.length} rounds)`);
  const gap = s.refillTick - s.rounds.at(-1);
  assert.ok(gap >= 40 && gap <= 42, `${gap}F`);
});

test('#931 refill admission tick is identical under 30/60/120Hz render clocks', async t => {
  const ticks = [];
  for (const hz of [30, 60, 120]) {
    const { f, a, step, state } = await rig(); t.after(f.close);
    const clock = new FixedClock(); let tick = 0;
    for (let render = 0; render < 6 * hz && state.refillTick === null; render++) clock.advance(1 / hz, () => {
      a.intent.fire = tick++ < 75; step();
    });
    ticks.push([state.refillTick, state.rounds.at(-1)]);
  }
  assert.deepEqual(ticks[0], ticks[1]); assert.deepEqual(ticks[1], ticks[2]);
  assert.ok(ticks[0][0] - ticks[0][1] >= 40);
});
