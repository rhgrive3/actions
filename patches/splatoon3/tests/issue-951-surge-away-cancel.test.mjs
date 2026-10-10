import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

// #951: a deliberate away-stick detach while Squid Surge is in its burst must
// retire the Surge action on that tick. Wall-top launches and ink-support loss
// keep their existing behaviour.
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

async function wallRig() {
  const f = await fixture({ productionComposition: true }), a = f.make();
  let surface = 'wall';
  a.grounded = false; a.form = 'squid'; a.intent.squid = true; a.climbing = true;
  a.wallN.set(0, 0, 1); a.intent.move.set(0, 0, -1); a.intent.jump = true;
  f.G.physics.raycast = (p, dir, max, h) => {
    h.hit = Math.abs(dir.y) < .5 && surface !== 'top';
    if (h.hit) { h.face = 0; h.u = h.v = .5; h.normal.set(0, 0, 1); h.point.copy(p).addScaledVector(dir, .3); }
    return h;
  };
  f.G.paint.sample = () => 1;
  return { f, a, setSurface: value => { surface = value; } };
}

// Holds B on the wall until the Surge charge reaches `target`, then releases it.
function chargeTo(f, a, target) {
  for (let i = 0; i < 600 && !(a.s3.surge && a.s3.surge.charge >= target); i++) f.tick(a);
  assert.ok(a.s3.surge && a.s3.surge.charge >= target, `charge ${target} was not reached`);
  a.intent.jump = false;
}

for (const target of [0.25, 0.5, 0.75, 1]) {
  test(`#951 ${target * 100}% Surge: away-stick detach during burst retires the action on that tick`, async () => {
    const { f, a } = await wallRig();
    chargeTo(f, a, target);
    f.tick(a);
    assert.equal(a.s3.surge?.phase, 'burst');
    const hp = a.hp;
    a.intent.move.set(0, 0, 1);
    f.tick(a);
    assert.equal(a.climbing, false);
    assert.equal(a.s3.surge ?? null, null);
    assert.equal(a.s3.actions.surge ?? null, null);
    assert.equal(a.s3.actions.armor ?? null, null);
    a.damage(10, null, 'shooter');
    near(a.hp, hp - 10);
  });
}

test('#951 away input while still charging cancels the charge on that tick (unchanged)', async () => {
  const { f, a } = await wallRig();
  for (let i = 0; i < 10; i++) f.tick(a);
  assert.equal(a.s3.surge?.phase, 'charge');
  a.intent.move.set(0, 0, 1);
  f.tick(a);
  assert.equal(a.climbing, false);
  assert.equal(a.s3.surge ?? null, null);
});

test('#951 wall-top launch keeps the burst and its launch armor (unchanged)', async () => {
  const { f, a, setSurface } = await wallRig();
  chargeTo(f, a, 1);
  f.tick(a);
  assert.equal(a.s3.surge?.phase, 'burst');
  setSurface('top');
  f.tick(a);
  assert.equal(a.climbing, false);
  assert.equal(a.s3.surge?.phase, 'burst');
  assert.ok(a.s3.actions.armor);
});

test('#951 losing wall ink without away input keeps the burst (unchanged)', async () => {
  const { f, a } = await wallRig();
  chargeTo(f, a, 1);
  f.tick(a);
  f.G.paint.sample = () => 0;
  f.tick(a);
  assert.equal(a.climbing, false);
  assert.equal(a.s3.surge?.phase, 'burst');
});

test('#951 30/60/120Hz render schedules cancel on the same fixed simulation tick', async () => {
  const traces = [];
  for (const hz of [30, 60, 120]) {
    const { f, a } = await wallRig(), clock = new FixedClock(), trace = [];
    chargeTo(f, a, 1);
    let n = 0;
    for (let frame = 0; frame < hz; frame++) {
      clock.advance(1 / hz, () => {
        n++;
        if (n === 1) f.tick(a);
        else if (n === 2) { a.intent.move.set(0, 0, 1); f.tick(a); }
        else f.tick(a);
        trace.push([a.climbing, a.s3.surge?.phase ?? null]);
      });
    }
    traces.push(trace);
  }
  assert.deepEqual(traces[0], traces[1]);
  assert.deepEqual(traces[1], traces[2]);
  assert.deepEqual(traces[0][1], [false, null]);
});
