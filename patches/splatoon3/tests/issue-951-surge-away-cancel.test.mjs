import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

// Production-composed Actor, climb admission and movement owner; only geometry,
// character display and integration are fixture boundaries, as in the Surge tests.
async function wall() {
  const f = await fixture({ productionComposition: true });
  let terrain = 'wall';
  f.G.physics.raycast = (p, dir, max, h) => {
    h.hit = Math.abs(dir.y) < .5 && terrain !== 'top';
    if (h.hit) { h.face = 0; h.u = h.v = .5; h.normal.set(0, 0, 1); h.point.copy(p).addScaledVector(dir, .3); }
    return h;
  };
  f.G.paint.sample = () => terrain === 'ink-end' ? 0 : 1;
  function charge(frames = 45) {
    terrain = 'wall';
    const a = f.make();
    a.grounded = false; a.form = 'squid'; a.intent.squid = true;
    a.climbing = true; a.wallN.set(0, 0, 1); a.intent.move.set(0, 0, -1);
    a.intent.jump = true; f.tick(a, frames);
    return a;
  }
  return { ...f, charge, terrain: value => { terrain = value; } };
}
function release(f, a) { a.intent.jump = false; f.tick(a); assert.equal(a.s3.surge.phase, 'burst'); }
function cancel(f, a) { a.intent.move.set(0, 0, 1); f.tick(a); }
function retired(a) {
  assert.equal(a.climbing, false);
  assert.equal(a.s3.actions.surge, null);
  assert.equal(a.s3.surge, null);
  assert.equal(a.anim.surgeCharge, 0);
}

test('#951 full and partial Surge burst retire on the actual away-detach tick', async () => {
  const f = await wall();
  for (const frames of [12, 23, 34, 45]) {
    const a = f.charge(frames); release(f, a);
    const surge = a.s3.surge;
    cancel(f, a); retired(a);
    assert.equal(surge.armorPending, false);
    assert.equal(surge.armorTime, 0);
    assert.equal(a.s3.actions.armor, null);
    const hp = a.hp; a.damage(10, null, 'shooter'); assert.equal(a.hp, hp - 10);
    // A canceled action cannot gain a launch shield at a later unrelated ledge.
    a._ledgePop(new f.THREE.Vector3(0, 0, -1));
    assert.equal(a.s3.actions.armor, null);
    f.tick(a, 2); assert.equal(a.s3.surge, null);
  }
});

test('#951 charge cancellation remains immediate and uncharged ordinary detach remains valid', async () => {
  const f = await wall(), a = f.charge(15);
  assert.equal(a.s3.surge.phase, 'charge'); cancel(f, a); retired(a);
  const ordinary = f.charge(1);
  ordinary.s3.actions.surge = ordinary.s3.surge = null;
  ordinary.anim.surgeCharge = 0; ordinary.intent.jump = false;
  cancel(f, ordinary); retired(ordinary);
  assert.equal(ordinary.s3.roll, null);
});

test('#951 wall top, ink loss and fresh wall Roll keep their distinct transitions', async () => {
  const f = await wall();
  const top = f.charge(); release(f, top); const launched = top.s3.surge;
  // Top is tested before away input in native climb, so even an away input on
  // this tick must not be mistaken for the explicit away-detach branch.
  top.intent.move.set(0, 0, 1); f.terrain('top'); f.tick(top);
  assert.equal(top.climbing, false); assert.equal(top.s3.surge, launched);
  assert.equal(top.s3.actions.armor, launched);
  assert.equal(launched.armorTime, f.profile.movement.surge.armorTime);
  assert.ok(top.vel.y > 0);
  const inkEnd = f.charge(); release(f, inkEnd); const detached = inkEnd.s3.surge;
  inkEnd.intent.move.set(0, 0, 1); f.terrain('ink-end'); f.tick(inkEnd);
  assert.equal(inkEnd.climbing, false); assert.equal(inkEnd.s3.surge, detached);
  assert.equal(detached.armorPending, false); assert.equal(inkEnd.s3.actions.armor, null);
  const roll = f.charge(); release(f, roll);
  roll.intent.jump = true; cancel(f, roll);
  assert.ok(roll.s3.roll); assert.equal(roll.s3.surge, null);
  assert.equal(roll.character.events.filter(event => event[0] === 'squidroll').length, 1);
});

test('#951 cancellation removes only the canceled Surge armor owner', async () => {
  const f = await wall(), a = f.charge(); release(f, a);
  const own = a.s3.surge; own.armorTime = .5; a.s3.actions.armor = own;
  cancel(f, a); retired(a); assert.equal(a.s3.actions.armor, null); assert.equal(own.armorTime, 0);
  const b = f.charge(); release(f, b);
  const other = { armorTime: .5, armorHP: 100, armorThreshold: 100 };
  b.s3.actions.armor = other; cancel(f, b); retired(b);
  assert.equal(b.s3.actions.armor, other); assert.ok(other.armorTime > 0);
});

test('#951 30/60/120 Hz schedules agree on the cancellation tick and next airborne state', async () => {
  const rows = [];
  for (const hz of [30, 60, 120]) {
    const f = await wall(), a = f.charge(), clock = new FixedClock(), trace = [];
    a.intent.jump = false;
    let tick = 0;
    for (let frame = 0; frame < hz / 2; frame++) clock.advance(1 / hz, () => {
      if (tick++ === 1) a.intent.move.set(0, 0, 1);
      f.tick(a);
      trace.push([a.climbing, a.s3.surge?.phase ?? null, a.s3.actions.surge?.phase ?? null,
        a.s3.actions.armor?.armorTime ?? 0, ...a.vel.toArray()]);
    });
    assert.equal(trace[0][1], 'burst'); assert.equal(trace[1][1], null);
    rows.push(trace);
  }
  assert.deepEqual(rows[0], rows[1]); assert.deepEqual(rows[1], rows[2]);
});
