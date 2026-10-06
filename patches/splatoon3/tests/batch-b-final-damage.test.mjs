import test from 'node:test';
import assert from 'node:assert/strict';
import { damageTenths, finalWeaponDamage } from '../runtime/final-damage.mjs';
import { conditionalPoints } from '../runtime/conditional-gear.mjs';
import { flowAbilityPoints } from '../runtime/flow-effects.mjs';

test('final damage floors once at the victim boundary', () => {
  assert.equal(damageTenths(34.875), 34.8);
  assert.equal(damageTenths(30), 30);
  assert.equal(damageTenths(0.1), 0.1);
});

test('grouped increments quantize the cumulative post-defense amount', () => {
  const victim = { s3PendingHitGroup: 7 }, attacker = { owner: 'local' };
  const first = finalWeaponDamage(victim, 30.39, attacker, 'weapon');
  const second = finalWeaponDamage(victim, 3.92, attacker, 'weapon');
  assert.equal(first, 30.3);
  assert.equal(second, 4);
  assert.equal(first + second, 34.3);
  assert.equal(finalWeaponDamage(victim, .037, attacker, 'ink'), .037);
});

test('conditional gear composes before Flow and caps at 57 AP', () => {
  const actor = { s3: { loadout: [{ main: 'openingGambit' }] } };
  const match = { state: 'playing', duration: 180, time: 170, attract: false, bossMode: null };
  const cfg = { openingDuration: 30, openingAP: 30, openingExtension: 15, lastDitchWindow: 30, lastDitchAP: 18, comebackDuration: 20, comebackAP: 10 };
  const base = { runSpeed: 27, swimSpeed: 10 };
  const conditional = conditionalPoints(actor, base, match, cfg);
  const combined = flowAbilityPoints(conditional, true, 30);
  assert.equal(conditional.runSpeed, 57);
  assert.equal(combined.runSpeed, 57);
  assert.equal(combined.swimSpeed, 57);
});
