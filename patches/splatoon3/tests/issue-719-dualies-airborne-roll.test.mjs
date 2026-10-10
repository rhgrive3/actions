import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';

// One Dualies press with jump held, through the production composition (actor.js adapter included).
const trial = async ({ fire = true, move = 1, rolls = 2, ink = 100, airborne = true, coyote = 0 } = {}) => {
  const f = await fixture({ composeProductionAdapters: true }), a = f.make('dualies');
  a.grounded = !airborne; a.coyote = coyote; a.vel.y = 4;
  a.ink = ink; a.weaponRunner.rollsLeft = rolls;
  a.intent.move.set(move, 0, 0); a.intent.fire = fire; a.intent.jump = true;
  const before = a.ink;
  f.tick(a);
  return { f, a, r: a.weaponRunner, before };
};

test('#719 airborne Dualies jump+fire admits one native roll, pays once, and descends', async () => {
  const { a, r, before } = await trial();
  assert.ok(r.dodge, 'airborne roll admitted through WeaponRunner.tryDodge');
  assert.equal(r.dodge.airborne, true);
  assert.equal(r.rollsLeft, 1);
  assert.ok(Math.abs(before - a.ink - a.weapon.rollInk) < 1e-8, 'normal roll ink paid once');
  assert.ok(a.vel.y < 0, 'descends with INKWAVE gravity (no invented Nintendo vertical constant)');
  assert.ok(a.vel.y >= -40 - 1e-9, 'descent respects max fall');
  assert.equal(a.jumpBuffer, 0);
  for (let n = 0; n < 4; n++) a.update(1 / 60);
  assert.equal(r.rollsLeft, 1, 'holding jump does not consume a second roll');
});

test('#719 airborne jump without firing, direction, roll count, or ink does not roll', async () => {
  for (const opts of [{ fire: false }, { move: 0 }, { rolls: 0 }, { ink: 0 }]) {
    const { a, r, before } = await trial(opts);
    assert.equal(r.dodge, null, JSON.stringify(opts));
    assert.ok(a.ink >= before - 1e-9, `no roll ink spent: ${JSON.stringify(opts)}`); // ink regenerates per frame
  }
});

test('#719 grounded Dualies roll is unchanged and not marked airborne', async () => {
  const { r, a, before } = await trial({ airborne: false });
  assert.ok(r.dodge, 'ground dodge still admitted');
  assert.equal(r.dodge.airborne, undefined);
  assert.equal(r.rollsLeft, 1);
  assert.ok(Math.abs(before - a.ink - a.weapon.rollInk) < 1e-8);
});

test('#719 a jump inside the coyote window after leaving a ledge stays an ordinary jump', async () => {
  const { a, r, before } = await trial({ coyote: 0.05 });
  assert.equal(r.dodge, null, 'no roll while the coyote jump is available');
  assert.equal(a.ink, before);
  assert.equal(a.s3JumpSerial, 1, 'ordinary coyote jump admitted');
});

test('#719 ground contact mid-roll does not replay the roll or start another one', async () => {
  // Only a flag is set here (no floor in the fixture); real floor landing is not simulated.
  const { a, r, f } = await trial();
  let starts = 0;
  const trigger = a.character.trigger.bind(a.character);
  a.character.trigger = (name, ...rest) => { if (name === 'dodge') starts++; return trigger(name, ...rest); };
  let ends = 0, dodgeWasActive = true;
  a.grounded = true;
  for (let n = 0; n < 60; n++) {
    f.tick(a);
    if (dodgeWasActive && !r.dodge) { ends++; dodgeWasActive = false; }
  }
  assert.equal(starts, 0, 'no second dodge start across ground contact');
  assert.equal(ends, 1, 'roll ends exactly once');
  assert.equal(r.dodge, null);
});
