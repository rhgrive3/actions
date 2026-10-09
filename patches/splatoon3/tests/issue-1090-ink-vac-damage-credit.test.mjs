import assert from 'node:assert/strict';
import { inkVacChargeFromDamage } from '../runtime/kit-ink-vac.mjs';

assert.equal(inkVacChargeFromDamage(0), 0);
assert.equal(inkVacChargeFromDamage(36), 36 / 1100);
assert.equal(inkVacChargeFromDamage(3 * 36), 108 / 1100);
assert.equal(inkVacChargeFromDamage(1100), 1);
assert.equal(inkVacChargeFromDamage(2000), 1);
assert.equal(inkVacChargeFromDamage(-10), 0);
assert.equal(inkVacChargeFromDamage(NaN), 0);
console.log('Ink Vac damage-equivalent credit regression passed');
