import { test } from 'node:test';
import assert from 'node:assert/strict';
import { floorCoverage } from '../runtime/scoring.mjs';
import { abilityPoints, emptyLoadout, gearCurve, modifiersFor } from '../runtime/gear.mjs';
import { createFlow, advanceFlow, awardFlow } from '../runtime/flow.mjs';
import { installResources, updateResources } from '../runtime/resources.mjs';

test('actual floor area can choose a different winner from counting cells', () => {
  const paint = { paintFaces: [
    { turf: true, grid: 0, nu: 2, nv: 1, cu: 0.1, cv: 1 },
    { turf: true, grid: 2, nu: 1, nv: 1, cu: 0.5, cv: 1 },
    { turf: false, grid: 3, nu: 1, nv: 1, cu: 10, cv: 10 },
  ], grid: new Uint8Array([1, 1, 2, 1]), dead: new Uint8Array(4) };
  const coverage = floorCoverage(paint); assert.ok(coverage[1] > coverage[0]);
  paint.dead[2] = 1; assert.deepEqual(floorCoverage(paint), [1, 0]);
  paint.dead[0] = paint.dead[1] = 1; assert.deepEqual(floorCoverage(paint), [0, 0]);
});
test('gear slot topology limits total power to 57 AP; illegal slots cannot inflate it', () => {
  const loadout = emptyLoadout(); for (const p of loadout) { p.main = 'runSpeed'; p.subs.fill('runSpeed'); }
  assert.equal(abilityPoints(loadout).runSpeed, 57);
  loadout[0].subs.push('runSpeed'); assert.equal(abilityPoints(loadout).runSpeed, 57);
});
test('gear curve follows the reference nonlinear interpolation and exact endpoints', () => {
  assert.equal(gearCurve(0, 1, 1.1, 1.3), 1); assert.equal(gearCurve(57, 1, 1.1, 1.3), 1.3);
  const p = (3.3 * 10 - .027 * 100) / 100;
  const expected = 1 + .3 * Math.pow(p, Math.log(1 / 3) / Math.log(.5));
  assert.ok(Math.abs(gearCurve(10, 1, 1.1, 1.3) - expected) < 1e-12);
  assert.deepEqual(modifiersFor(emptyLoadout(), { runSpeed: [1, 1.25, 1.5] }), { runSpeed: 1 });
});
test('flow activates once, extends on splats and expires', () => {
  const cfg = { threshold: 3, duration: 30, extension: 5, maxDuration: 30, weights: { splat: 1, turf: .1 } }, state = createFlow();
  assert.equal(awardFlow(state, 'splat', 1, cfg), false);
  assert.equal(awardFlow(state, 'turf', 20, cfg), false);
  assert.equal(awardFlow(state, 'splat', 1, cfg), true);
  advanceFlow(state, 10); awardFlow(state, 'assist', 1, cfg); assert.equal(state.remaining, 25);
  advanceFlow(state, 26); assert.equal(state.active, false);
});
test('refill respects weapon recovery wait and cannot refill in enemy-ink squid form', () => {
  const resources = { inkRefillDelay: .2, inkRefillSwim: 100 / 3, inkRefillKid: 10, regenDelay: 1,
    regenRate: 20, regenRateSwim: 20, enemyInkDamageCap: 40, enemyInkDps: 18,
    enemyInkRegenSuppression: .4, enemyInkRecovery: 30, enemyInkGrace: 0 };
  installResources({ G: { time: 0 }, PLAYER: { hp: 100, inkMax: 100 } }, { resources });
  const a = { hp: 100, ink: 0, lastFire: .1, lastDamage: 99, submerged: true, climbing: false,
    weapon: { inkRecoverStop: .4 }, weaponRunner: { busy: () => false }, damageFromInk: 0, invuln: 0 };
  updateResources(a, 1 / 60, false, true); assert.equal(a.ink, 0);
  a.lastFire = .4; updateResources(a, 1 / 60, false, true); assert.ok(a.ink > 0);
  a.ink = 0; a.submerged = false; updateResources(a, 1, true, true); assert.equal(a.ink, 0);
});
