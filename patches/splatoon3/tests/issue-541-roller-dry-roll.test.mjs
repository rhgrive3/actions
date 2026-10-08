// #541: an established Splat Roller roll persists as a dry roll when the
// tank depletes while ZR stays held. Real public modules plus the build
// adapter; no fake game model. Full production composition via the composed
// fixture (installWeapons -> installRollerLogic).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';

const DT = 1 / 60;

// Drives the real WeaponRunner exactly like the #626 suite.
function runnerTick(f, a, inp) {
  f.G.time += DT;
  a.weaponRunner.update(DT, inp);
}

// Hold fire until the first swing has resolved and the roll is genuinely
// established (same shape as the #626 helper, 60 focused ticks).
async function establishedRoll({ composeProductionAdapters = false } = {}) {
  const f = await fixture({ composeProductionAdapters });
  const a = f.make('roller');
  a.grounded = true; a.intent.move.set(0, 0, 1);
  const r = a.weaponRunner;
  runnerTick(f, a, { fire: true, firePressed: true });
  for (let i = 1; i < 60; i++) runnerTick(f, a, { fire: true });
  assert.equal(r.rolling, true, 'must be rolling');
  assert.ok(a.ink > 0.5, 'must still hold ink');
  return { f, a, r };
}

test('#541 natural depletion keeps Roller-down with continuous rollT', async () => {
  const { f, a, r } = await establishedRoll();
  const rollTBefore = r.rollT;
  // Natural spend path: leave just above the threshold and let one stripe
  // cross it while ZR stays held and the actor moves.
  a.ink = 0.6;
  a.pos.x += 0.35;
  runnerTick(f, a, { fire: true });
  a.pos.x += 0.35;
  runnerTick(f, a, { fire: true });
  assert.ok(a.ink <= 0.5, `tank must be depleted (${a.ink})`);
  assert.equal(r.rolling, true, 'depletion must not tear down Roller-down');
  assert.ok(r.rollT > rollTBefore, `rollT must continue (${r.rollT} vs ${rollTBefore})`);
  assert.equal(r.s3RollStop, null, 'depletion must not arm the #626 interruption');
});

test('#541 a zero-ink hold paints nothing and hits nothing', async () => {
  const { f, a, r } = await establishedRoll();
  const v = f.make('roller');
  v.team = 1; v.alive = true;
  v.pos.set(a.pos.x, a.pos.y, a.pos.z + 0.8);
  a.vel.set(0, 0, 8);
  let hits = 0, paints = 0;
  const origHit = f.G.projectiles.applyHit;
  const origSplat = f.G.paint.splat;
  f.G.projectiles.applyHit = function (...args) { hits++; return origHit.apply(this, args); };
  f.G.paint.splat = function (...args) { paints++; return origSplat.apply(this, args); };
  try {
    a.ink = 0;
    runnerTick(f, a, { fire: true });
    runnerTick(f, a, { fire: true });
    assert.equal(r.rolling, true, 'dry hold keeps Roller-down');
    assert.equal(a.ink, 0, 'dry hold spends no ink');
    assert.equal(hits, 0, 'dry hold deals no contact damage');
    assert.equal(paints, 0, 'dry hold paints no turf');
  } finally {
    f.G.projectiles.applyHit = origHit;
    f.G.paint.splat = origSplat;
  }
});

test('#541 releasing ZR at zero ink exits without arming #626', async () => {
  const { f, a, r } = await establishedRoll();
  a.ink = 0;
  runnerTick(f, a, { fire: true });
  assert.equal(r.rolling, true, 'dry hold first');
  runnerTick(f, a, { fire: false });
  assert.equal(r.rolling, false, 'release still exits the roll');
  assert.equal(r.rollT, 0, 'release resets rollT');
  assert.equal(r.s3RollStop, null, 'a dry release must not arm the sourced interruption');
});

test('#541 refilling mid-hold resumes the inked roll without duplicating state', async () => {
  const { f, a, r } = await establishedRoll();
  a.ink = 0;
  runnerTick(f, a, { fire: true });
  assert.equal(r.rolling, true, 'dry hold first');
  const dryRollT = r.rollT;
  const anchor = r.lastRollPos.clone();
  a.ink = 50;
  runnerTick(f, a, { fire: true });
  assert.equal(r.rolling, true, 'refill resumes the roll on the held ZR');
  assert.ok(r.rollT >= dryRollT, 'dash timing continues across the refill');
  assert.ok(r.lastRollPos.distanceTo(anchor) < 1e-9 || r.lastRollPos === anchor,
    'no stripe may bill the dry distance at once');
});

test('#541 dry travel is not charged by the #537 floor after refill in the full adapter composition', async () => {
  const { f, a, r } = await establishedRoll({ composeProductionAdapters: true });
  const speed = 1.2, step = speed * DT;
  a.vel.set(0, 0, speed);
  a.ink = 0;
  for (let i = 0; i < 6; i++) {
    a.pos.z += step;
    runnerTick(f, a, { fire: true });
  }
  assert.equal(r.rolling, true, 'the established roll persists through dry travel');
  assert.equal(a.ink, 0, 'dry travel does not spend ink');

  a.ink = 100;
  const before = a.ink;
  a.pos.z += step;
  runnerTick(f, a, { fire: true });
  const charged = before - a.ink;
  const expectedFloor = a.weapon.rollInkMinPerFrame * 100;
  assert.ok(Math.abs(charged - expectedFloor) < 1e-10,
    `first paid tick charges only its ${expectedFloor}% minimum-floor amount (got ${charged}%)`);
});

test('#541 ZR at zero ink never cold-starts a dry roll', async () => {
  const f = await fixture();
  const a = f.make('roller');
  a.grounded = true; a.intent.move.set(0, 0, 1);
  const r = a.weaponRunner;
  a.ink = 0;
  runnerTick(f, a, { fire: true, firePressed: true });
  for (let i = 1; i < 10; i++) runnerTick(f, a, { fire: true });
  assert.equal(r.rolling, false, 'no cold-started dry roll');
  assert.equal(r.s3RollerWasDry || false, false, 'no dry state without a paid roll');
});

test('#541 dry-hold persistence is identical at 30/60/120 Hz render schedules', async () => {
  const { FixedClock } = await import('../runtime/clock.mjs');
  for (const hz of [30, 60, 120]) {
    const f = await fixture();
    const a = f.make('roller');
    a.grounded = true; a.intent.move.set(0, 0, 1);
    const r = a.weaponRunner;
    const clock = new FixedClock();
    const total = 90;
    for (let frame = 0; frame < total / 60 * hz; frame++) {
      clock.advance(1 / hz, dt => {
        const tick = clock.ticks;
        let inp = { fire: true };
        if (tick === 0) inp = { fire: true, firePressed: true };
        if (tick === 60) a.ink = 0;
        f.G.time += dt;
        r.update(dt, inp);
      });
    }
    assert.equal(r.rolling, true, `dry hold persists at ${hz} Hz`);
    assert.equal(a.ink, 0, `no dry spend at ${hz} Hz`);
  }
});
