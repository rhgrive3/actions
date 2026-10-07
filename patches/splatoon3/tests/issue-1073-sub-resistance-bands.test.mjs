// #1073 — Sub Resistance eligibility follows the resolved bomb damage class,
// not the stale Splat Bomb 3.6-unit source-tag boundary left by kit composition.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installSubResistance, subResistanceEligible } from '../runtime/sub-resistance.mjs';

test('#1073 resolved bomb damage decides Sub Resistance eligibility across stale source tags', () => {
  for (const source of ['bomb', 'splat-bomb-far']) {
    assert.equal(subResistanceEligible(180, source), false, `${source}: lethal 180 band is never reduced`);
    assert.equal(subResistanceEligible(100, source), false, `${source}: 100 damage boundary is excluded`);
    assert.equal(subResistanceEligible(99.9, source), true, `${source}: sub-100 blast remains eligible`);
    assert.equal(subResistanceEligible(30, source), true, `${source}: far 30 band is eligible`);
  }
  assert.equal(subResistanceEligible(30, 'weapon'), false, 'non-bomb damage is never admitted');
});

test('#1073 victim-side wrapper fixes both Suction/Curling stale-boundary directions', () => {
  class Actor {
    constructor() { this.s3 = { modifiers: { subResistance: .5 } }; this.received = []; }
    damage(amount, _attacker, source) { this.received.push([amount, source]); return amount; }
  }
  installSubResistance({ Actor });
  const a = new Actor();

  // Suction/max-Curling 180 inside their 4.6 near radius can arrive with the
  // stale far tag (> Splat Bomb 3.6). It must stay lethal/unreduced.
  a.damage(180, null, 'splat-bomb-far');
  assert.deepEqual(a.received.at(-1), [180, 'bomb']);

  // Min-Curling 30 outside its 1.6 near radius can arrive with the stale near
  // tag (<= Splat Bomb 3.6). Resolved 30 damage must still receive resistance.
  a.damage(30, null, 'bomb');
  assert.deepEqual(a.received.at(-1), [15, 'bomb']);

  // Native Splat Bomb behavior remains the same at its own two bands.
  a.damage(180, null, 'bomb');
  assert.deepEqual(a.received.at(-1), [180, 'bomb']);
  a.damage(30, null, 'splat-bomb-far');
  assert.deepEqual(a.received.at(-1), [15, 'bomb']);
  assert.equal(a.s3SubResistanceHit, undefined, 'temporary victim classification is restored');
});
