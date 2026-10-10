import test from 'node:test';
import assert from 'node:assert/strict';
import { chargerInkCost } from '../runtime/weapons.mjs';
import { fixture } from './source-fixture.mjs';

const close = (actual, expected, msg = '', eps = 1e-4) =>
  assert.ok(Math.abs(actual - expected) < eps, `${actual} != ${expected} (diff: ${Math.abs(actual - expected)}) ${msg}`);

test('#675 chargerInkCost computes 2.25% at 8F minimum legal release and 18.0% at full charge', () => {
  const w = {
    inkMin: 2.25,
    inkFull: 18.0,
    chargeTime: 1.0,
  };

  // Sub-8F releases (e.g. 0..8F) map to inkMin (2.25%)
  close(chargerInkCost(w, 0, 0), 2.25, '0F');
  close(chargerInkCost(w, 8 / 60, 8 / 60), 2.25, '8F earliest legal release');

  // Full charge (60F = 1.0s) maps to inkFull (18.0%)
  close(chargerInkCost(w, 1.0, 1.0), 18.0, '60F full charge');

  // Monotonic increase between 8F and 60F
  let prev = 2.25;
  for (let f = 9; f <= 60; f++) {
    const cost = chargerInkCost(w, f / 60, f / 60);
    assert.ok(cost > prev, `frame ${f} cost (${cost}) > frame ${f - 1} cost (${prev})`);
    prev = cost;
  }

  // Exact halfway charge (34F, halfway between 8 and 60)
  const halfway = chargerInkCost(w, 34 / 60, 34 / 60);
  close(halfway, 2.25 + (18.0 - 2.25) * 0.5, '34F midpoint');
});

test('#675 live actor firing Charger at 8F legal boundary consumes exactly 2.25% ink', async () => {
  const f = await fixture();
  const a = f.make();
  a.setWeapon('charger');
  a.ink = 100;
  const initialInk = a.ink;
  a.lastFire = 0; // ensure no refill

  // 1F human startup
  a.intent.fire = true;
  f.tick(a);

  // 8 fixed charge frames
  for (let i = 0; i < 8; i++) {
    f.tick(a);
  }
  close(a.weaponRunner.chargeT, 8 / 60, 'accumulated exactly 8F charge');

  // Release fire
  a.intent.fire = false;
  f.tick(a);

  // Consumes exactly 2.25%
  close(initialInk - a.ink, 2.25, '8F release consumes 2.25%');
});

test('#675 live actor firing Charger at 60F full charge consumes 18.0% ink', async () => {
  const f = await fixture();
  const a = f.make();
  a.setWeapon('charger');
  a.ink = 100;
  const initialInk = a.ink;

  // 1F startup + 60F charge
  a.intent.fire = true;
  f.tick(a);
  for (let i = 0; i < 60; i++) {
    f.tick(a);
  }
  close(a.weaponRunner.chargeT, 1.0, 'full charge reached');

  // Release fire
  a.intent.fire = false;
  f.tick(a);

  // Consumes exactly 18.0%
  close(initialInk - a.ink, 18.0, 'full charge consumes 18.0%');
});

test('#675 low ink cannot become negative', async () => {
  const f = await fixture();
  const a = f.make();
  a.setWeapon('charger');
  a.ink = 1.0;

  a.intent.fire = true;
  f.tick(a);
  a.intent.fire = false;
  f.tick(a);

  assert.ok(a.ink >= 0, 'ink never drops below 0');
});


// #675: source-backed complete Actor/WeaponRunner Gear/AP regression.
// 1130 WeaponChargerNormal: InkConsumeMinCharge=.0225, FullCharge=.18.
import { emptyLoadout, gearCurve, abilityPoints } from '../runtime/gear.mjs';
import { FixedClock } from '../runtime/clock.mjs';
function equipInkSaver(actor, gp) {
  actor.s3.loadout = emptyLoadout();
  if (gp === 10) actor.s3.loadout[0].main = 'inkSaverMain';
  if (gp === 57) for (const part of actor.s3.loadout) {
    part.main = 'inkSaverMain';
    part.subs.fill('inkSaverMain');
  }
  assert.equal(abilityPoints(actor.s3.loadout).inkSaverMain || 0, gp);
  actor.setWeapon('charger');
}
test('#675 source-backed Gear/AP: 8F and 60F actual Charger ink debits at 0/10/57 AP', async () => {
  for (const gp of [0, 10, 57]) for (const chargeFrames of [8, 60]) {
    const f = await fixture(), actor = f.make('charger');
    equipInkSaver(actor, gp);
    const factor = gearCurve(gp, ...f.profile.gear.inkSaverMain);
    close(actor.weapon.inkMin, 2.25 * factor, 'geared minimum source ink');
    close(actor.weapon.inkFull, 18 * factor, 'geared full source ink');
    actor.ink = 100;
    actor.lastFire = 0;
    actor.intent.fire = true;
    f.tick(actor); // fresh humanoid ZR startup, no charge yet
    for (let i = 0; i < chargeFrames; i++) f.tick(actor);
    close(actor.weaponRunner.chargeT, chargeFrames / 60, 'source charge progression');
    actor.intent.fire = false;
    // #680 gives the native projectile one held release frame. Charge ink is
    // already paid progressively, so record debit on that exact first frame,
    // then verify that the second release frame emits one real shot. Do not
    // confuse subsequent native ink regeneration with the firing ink cost.
    f.tick(actor);
    const paidOnRelease = 100 - actor.ink;
    assert.equal(f.shots.length, 0, 'deferred one-frame release is still pending');
    f.tick(actor);
    assert.equal(f.shots.length, 1, 'one legal geared Charger release after the held frame');
    const expected = (chargeFrames === 8 ? 2.25 : 18) * factor;
    close(paidOnRelease, expected, gp + 'AP at ' + chargeFrames + 'F source cost');
    assert.ok(actor.ink >= 0, 'never underdraws ink');
  }
});

test('#675 pre-minimum releases remain rejected instead of creating an unauthorized shot', async () => {
  for (const heldFrames of [0, 1, 4, 7]) {
    const f = await fixture(), actor = f.make('charger');
    actor.intent.fire = true;
    f.tick(actor);
    for (let i = 0; i < heldFrames; i++) f.tick(actor);
    actor.intent.fire = false;
    for (let i = 0; i < 5; i++) f.tick(actor);
    assert.equal(f.shots.length, 0, 'no unauthorized ' + heldFrames + 'F shot');
    assert.ok(actor.ink >= 0 && actor.ink <= 100);
  }
});

test('#675 8F/60F geared source cost has identical traces at 30/60/120Hz rendering', async () => {
  for (const frames of [8, 60]) {
    const traces = [];
    for (const hz of [30, 60, 120]) {
      const f = await fixture(), actor = f.make('charger'), clock = new FixedClock();
      equipInkSaver(actor, 10);
      actor.ink = 100;
      actor.lastFire = 0;
      const rows = [];
      let ticks = 0;
      for (let i = 0; i < 2 * hz; i++) clock.advance(1 / hz, () => {
        ticks++;
        actor.intent.fire = ticks <= frames + 1;
        f.tick(actor);
        rows.push([actor.ink, actor.weaponRunner.chargeT, actor.weaponRunner.charging, f.shots.length]);
      });
      assert.equal(ticks, 120);
      const factor = gearCurve(10, ...f.profile.gear.inkSaverMain);
      // Compare the *release tick*, before the independent native ink-refill
      // delay expires; the 2s trace intentionally includes later legal refill.
      close(100 - rows[frames + 1][0], (frames === 8 ? 2.25 : 18) * factor);
      traces.push(rows);
    }
    assert.deepEqual(traces[0], traces[1]);
    assert.deepEqual(traces[1], traces[2]);
  }
});
