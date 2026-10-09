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
