import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { fixture as composedFixture } from './weapon-edgecases-fixture.mjs';
import { emptyLoadout } from '../runtime/gear.mjs';
import { FixedClock } from '../runtime/clock.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

// Issue #888 — Heavy Splatling charging jump.
// S3 reference: the gear-power verification table states that non-exception
// splatlings and chargers use a 0.7 DU/f charging jump initial velocity, which
// is lower than the 0.8 DU/f GP0 enemy-ink value, so the weapon state always
// wins. INKWAVE maps it with the existing DU/f x6 calibration (0.08 DU/f
// enemy ink -> 4.8), giving 4.2 world u/s — the same calibration the Charger's
// fullChargeJumpVelocity already uses.

function make(f, kind, onEnemy = false) {
  f.G.paint.sample = () => (onEnemy ? 2 : 1);
  const a = f.make(kind);
  a.grounded = true; a.ground.hit = true; a.ground.face = 0;
  return a;
}
function jumpAfterCharge(f, kind, frames, onEnemy = false) {
  const a = make(f, kind, onEnemy);
  a.intent.fire = true; f.tick(a, frames);
  a.intent.jump = true; f.tick(a);
  return a;
}
function gear(a, ap, ability = 'inkResistance') {
  a.s3.loadout = emptyLoadout();
  if (ap === 57) for (const part of a.s3.loadout) { part.main = ability; part.subs.fill(ability); }
  if (ap === 10) a.s3.loadout[0].main = ability;
  if (ap === 3) a.s3.loadout[0].subs[0] = ability;
  a.setWeapon(a.weaponId);
}

test('#888 Heavy Splatling charging selects the reduced S3 0.7-DU/f takeoff impulse; ordinary jump is unchanged', async () => {
  const f = await fixture();
  const idle = make(f, 'splatling');
  f.tick(idle, 2); idle.intent.jump = true; f.tick(idle);
  close(idle.vel.y, f.PLAYER.jumpVel);

  for (const frames of [30, 72]) {
    const a = jumpAfterCharge(f, 'splatling', frames);
    close(a.vel.y, 4.2);
    assert.ok(a.vel.y < idle.vel.y, `charging ${frames}F takeoff ${a.vel.y} must be below the ordinary ${idle.vel.y}`);
  }

  const shooter = make(f, 'shooter');
  f.tick(shooter, 1); shooter.intent.jump = true; f.tick(shooter);
  close(shooter.vel.y, f.PLAYER.jumpVel);
});

test('#888 early charge, first ring and full charge all use the flat pinned charging value (no invented interpolation)', async () => {
  const f = await fixture();
  const first = f.WEAPONS.splatling.firstChargeTime / f.WEAPONS.splatling.chargeTime; // 0.8/1.2
  for (const charge of [1 / 72, first, 1]) {
    const a = make(f, 'splatling');
    a.intent.fire = true; a.weaponRunner.charging = true; a.weaponRunner.charge = charge;
    a.intent.jump = true; f.tick(a);
    assert.equal(a.weaponRunner.charging, true, `charge ${charge} must remain the authoritative charging state`);
    close(a.vel.y, 4.2);
  }
  // A released stream is not "charging": the stream state keeps the ordinary impulse.
  const streaming = make(f, 'splatling');
  streaming.intent.fire = true; f.tick(streaming, 72);
  streaming.intent.fire = false; f.tick(streaming);
  assert.equal(streaming.weaponRunner.charging, false);
  streaming.intent.jump = true; f.tick(streaming);
  close(streaming.vel.y, f.PLAYER.jumpVel);
});

test('#888 0 AP enemy ink and full Ink Resistance cannot raise a charging Splatling above its weapon cap', async () => {
  const f = await fixture();
  for (const ap of [0, 3, 10, 57]) {
    const a = make(f, 'splatling', true);
    gear(a, ap);
    a.intent.fire = true; f.tick(a, 30);
    assert.equal(a.onEnemy, true, `AP ${ap}: sample must be enemy ink`);
    a.intent.jump = true; f.tick(a);
    close(a.vel.y, 4.2);
  }
  // The same gear still lifts an uncharged enemy-ink jump, so the cap — not the
  // gear — is what holds the charging value.
  const gearRaised = make(f, 'splatling', true);
  gear(gearRaised, 57);
  f.tick(gearRaised, 2); gearRaised.intent.jump = true; f.tick(gearRaised);
  close(gearRaised.vel.y, 6.6);
  const base = make(f, 'splatling', true);
  f.tick(base, 2); base.intent.jump = true; f.tick(base);
  close(base.vel.y, f.PLAYER.enemyInkJumpVel);
});

test('#888 the cap is per-weapon data so 1.0-DU/f exception Splatlings can differ', async () => {
  const f = await fixture();
  const saved = f.WEAPONS.splatling.chargeJumpVelocity;
  try {
    f.WEAPONS.splatling.chargeJumpVelocity = 6.0; // 1.0 DU/f exception
    const a = jumpAfterCharge(f, 'splatling', 30);
    close(a.vel.y, 6.0);
  } finally {
    f.WEAPONS.splatling.chargeJumpVelocity = saved;
  }
  const restored = jumpAfterCharge(f, 'splatling', 30);
  close(restored.vel.y, 4.2);
});

test('#888 normal jump, squid jump, Squid Roll, Squid Surge and Dualies admission stay unchanged', async () => {
  const f = await fixture();
  const runner = { charging: true, charge: 1 };
  // Squid-form swim/roll/surge launches never take this path.
  assert.equal(f.normalJumpVelocity({ form: 'squid', weapon: { kind: 'splatling' }, weaponRunner: runner }, f.PLAYER.swimJumpVel), f.PLAYER.swimJumpVel);
  // Non-charging Splatling and other weapons keep the generic impulse.
  close(f.normalJumpVelocity({ form: 'kid', weapon: f.WEAPONS.splatling, weaponRunner: { charging: false, charge: 0 } }, f.PLAYER.jumpVel), f.PLAYER.jumpVel);
  close(f.normalJumpVelocity({ form: 'kid', weapon: f.WEAPONS.dualies, weaponRunner: runner }, f.PLAYER.jumpVel), f.PLAYER.jumpVel);
  // #251 Charger behavior is untouched.
  f.G.paint.sample = () => 1;
  const charger = f.make('charger'); charger.intent.fire = true; f.tick(charger, 80);
  charger.intent.jump = true; f.tick(charger);
  close(charger.vel.y, 4.2);
  const partial = f.make('charger'); partial.weaponRunner.charging = true; partial.weaponRunner.charge = 0.5;
  partial.intent.fire = true; partial.intent.jump = true; f.tick(partial);
  close(partial.vel.y, f.PLAYER.jumpVel);
  // Actual Squid Roll launch velocity is unchanged.
  const roll = f.make();
  roll.form = 'squid'; roll.intent.squid = true; roll.submerged = true;
  roll.wallN.set(0, 0, 1); roll.vel.set(0, 0, 11.52); roll.intent.move.set(0, 0, -1);
  assert.equal(f.beforeActions(roll, 1 / 60, true), true);
  close(roll.vel.y, f.profile.movement.roll.jumpVelocity);
});

test('#888 the fully composed production adapter chain selects the same charging impulse', async () => {
  const f = await composedFixture({ composeProductionAdapters: true });
  const a = f.make('splatling');
  a.grounded = true; a.ground.hit = true; a.ground.face = 0;
  a.intent.fire = true; f.tick(a, 30);
  assert.equal(a.weaponRunner.charging, true);
  a.intent.jump = true; f.tick(a);
  close(a.vel.y, 4.2);
});

test('#888 a charging Splatling reaches the same reduced apex at 30/60/120Hz rendering', async () => {
  const values = [];
  for (const hz of [30, 60, 120]) {
    const f = await fixture();
    const a = jumpAfterCharge(f, 'splatling', 30);
    close(a.vel.y, 4.2);
    delete a._integrate; a._resolve = () => {};
    const clock = new FixedClock(); let apex = a.pos.y;
    for (let i = 0; i < hz; i++) clock.advance(1 / hz, dt => { a._integrate(dt, false, false); apex = Math.max(apex, a.pos.y); });
    values.push(apex);
    assert.ok(apex > 0 && apex < 0.5, `apex ${apex} inside the reduced-jump band`);
  }
  close(values[0], values[1]); close(values[1], values[2]);
});
