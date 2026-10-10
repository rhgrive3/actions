import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, ROOT } from '../../../scripts/weapons-fixture.mjs';
import { FixedClock, STEP } from '../runtime/clock.mjs';
import { SPLATLING_SUB_INTERRUPT } from '../runtime/weapons.mjs';

const EPS = 1e-9;
const near = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) <= EPS, `${message}: ${actual} != ${expected}`);

async function setup() {
  const f = await fixture({ site: `${ROOT}.codex1-splatling-sub-cancel`, fidelity: true });
  const a = f.make('splatling');
  f.G.actors = [a];
  let bombs = 0;
  f.G.projectiles.throwBomb = () => { bombs++; };
  const step = (fire = false, sub = false) => {
    a.intent.fire = fire;
    a.intent.sub = sub;
    f.G.time += STEP;
    a.update(STEP);
  };
  return { f, a, r: a.weaponRunner, step, bombs: () => bombs };
}

async function charging() {
  const h = await setup();
  h.a.ink = 100;
  for (let i = 0; i < 20; i++) h.step(true, false);
  assert.equal(h.r.charging, true, 'precondition: active partial charge');
  assert.equal(h.r.streaming, false);
  return h;
}

async function streaming() {
  const h = await setup();
  h.a.ink = 100;
  let guard = 0;
  while (!h.r.charging && guard++ < 10) h.step(true, false);
  while (h.r.charge < 1 && guard++ < 200) h.step(true, false);
  assert.equal(h.r.charging, true, 'precondition: full charge before release');
  h.step(false, false);
  guard = 0;
  while (!h.r.streaming && guard++ < 5) h.step(false, false);
  assert.equal(h.r.streaming, true, 'precondition: active prepaid stream');
  assert.ok(h.a.ink < 100, 'precondition: full-round stream cost was paid');
  return h;
}

function snap({ a, r, f }) {
  return {
    charging: !!r.charging,
    streaming: !!r.streaming,
    charge: +r.charge.toFixed(9),
    aimingSub: !!r.aimingSub,
    subReadyAge: r.s3SubReady ? +r.s3SubReady.age.toFixed(9) : null,
    ink: +a.ink.toFixed(9),
    shots: f.fires.length,
  };
}

test('#1021 full-composition charge -> sub waits five fixed frames before native sub preparation', async () => {
  const h = await charging();
  const initialCharge = h.r.charge, initialInk = h.a.ink;
  const shotsBeforeInterrupt = h.f.fires.length;
  assert.equal(SPLATLING_SUB_INTERRUPT, 5 / 60);

  // Match the reported simultaneous input: ZR is released on the R edge.
  // The pending gate keeps the unpaid charge alive until its cancel boundary.
  for (let frame = 1; frame <= 4; frame++) {
    h.step(false, true);
    assert.equal(h.r.charging, true, `frame ${frame}: charge remains interruptible`);
    assert.equal(h.r.streaming, false, `frame ${frame}: no paid stream starts`);
    assert.equal(h.r.aimingSub, false, `frame ${frame}: aimingSub stays off`);
    assert.equal(h.r.s3SubReady, null, `frame ${frame}: bomb-ready clock stays off`);
    assert.equal(h.a.ink, initialInk, `frame ${frame}: no charge payment`);
    assert.equal(h.f.fires.length, shotsBeforeInterrupt, `frame ${frame}: no charge-release burst`);
    assert.equal(h.bombs(), 0, `frame ${frame}: no sub projectile before the boundary`);
  }
  assert.ok(h.r.charge > initialCharge, 'the held charge continues during the delay');

  // The fifth fixed update retires the pending charge and admits normal sub aim.
  h.step(false, true);
  assert.equal(h.r.charging, false, 'charge cancels at the 5F boundary');
  assert.equal(h.r.streaming, false, 'charge does not become a paid stream');
  assert.equal(h.r.aimingSub, true, 'normal sub aim begins at the boundary');
  assert.equal(h.r.s3SubReady.age, 0, 'normal sub-ready age starts at zero');
  assert.equal(h.f.fires.length, shotsBeforeInterrupt, 'charge cancellation emits no main projectile');
  assert.equal(h.bombs(), 0, 'holding sub does not throw the bomb');
  assert.equal(h.a.ink, initialInk, 'an unpaid charge has no ink refund or charge');
  assert.equal(h.r.s3SplatlingSubInterruptPending, false);
  assert.equal(h.r.s3SplatlingSubInterruptReady, false);
});

test('#1006 full-composition stream -> sub waits five fixed frames and refunds only unspent rounds once', async () => {
  const h = await streaming();
  const paidInk = h.a.ink;
  const shotsBefore = h.f.fires.length;

  for (let frame = 1; frame <= 4; frame++) {
    h.step(false, true);
    assert.equal(h.r.streaming, true, `frame ${frame}: stream remains active`);
    assert.equal(h.r.charging, false);
    assert.equal(h.r.aimingSub, false, `frame ${frame}: aimingSub stays off`);
    assert.equal(h.r.s3SubReady, null, `frame ${frame}: bomb-ready clock stays off`);
    assert.equal(h.bombs(), 0, `frame ${frame}: no sub projectile before the boundary`);
  }
  assert.ok(h.f.fires.length > shotsBefore, 'the paid stream continues during the delay');
  const refund = h.r.s3Spin.unspent;
  const inkBeforeCancel = h.a.ink;
  assert.ok(refund > 0, 'the interruption retains an exact partial unspent-round balance');
  assert.ok(refund < h.r.s3Spin.paid, 'some paid rounds were already emitted');

  // On fixed frame five, retire the stream and transfer its refund once.
  h.step(false, true);
  assert.equal(h.r.streaming, false, 'stream cancels at the 5F boundary');
  assert.equal(h.r.s3Spin, null, 'the stream reservation retires');
  assert.equal(h.r.aimingSub, true, 'normal sub aim begins at the boundary');
  assert.equal(h.r.s3SubReady.age, 0, 'normal sub-ready age starts at zero');
  assert.equal(h.bombs(), 0, 'holding sub does not throw the bomb');
  near(h.a.ink, Math.min(h.f.PLAYER.inkMax, inkBeforeCancel + refund), 'one exact partial refund');
  assert.ok(h.a.ink > paidInk, 'the remaining prepaid rounds return to the tank');

  const inkAfterRefund = h.a.ink;
  h.step(false, true);
  near(h.a.ink, inkAfterRefund, 'later held-sub ticks do not refund again');
});

test('Splatling R/sub boundary histories match at 30/60/120Hz render cadence through FixedClock', async () => {
  for (const [name, create] of [['charge', charging], ['stream', streaming]]) {
    const traces = [];
    for (const hz of [30, 60, 120]) {
      const h = await create();
      h.a.intent.fire = false;
      h.a.intent.sub = true;
      const clock = new FixedClock();
      const trace = [];
      let ticks = 0;
      while (ticks < 5) {
        clock.advance(1 / hz, dt => {
          if (ticks >= 5) return;
          h.f.G.time += dt;
          h.a.update(dt);
          ticks++;
          trace.push(snap(h));
        });
      }
      assert.equal(trace.length, 5, `${name}, ${hz}Hz: five fixed simulation updates`);
      for (let frame = 0; frame < 4; frame++) {
        assert.equal(trace[frame].aimingSub, false, `${name}, ${hz}Hz frame ${frame}`);
        assert.equal(trace[frame].subReadyAge, null, `${name}, ${hz}Hz frame ${frame}`);
        assert.equal(name === 'charge' ? trace[frame].charging : trace[frame].streaming, true,
          `${name}, ${hz}Hz frame ${frame}: main state remains live`);
      }
      assert.equal(trace[4].aimingSub, true, `${name}, ${hz}Hz: R aim enters on fixed frame five`);
      assert.equal(trace[4].subReadyAge, 0, `${name}, ${hz}Hz: sub-ready starts at age zero`);
      traces.push(trace);
    }
    assert.deepEqual(traces[1], traces[0], `${name}: 60Hz render matches 30Hz`);
    assert.deepEqual(traces[2], traces[0], `${name}: 120Hz render matches 30Hz`);
  }
});
