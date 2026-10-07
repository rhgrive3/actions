import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('#983 ten-second 4v4 idle movement trace constructs no timer-dedup containers', async () => {
  const f = await fixture({ extraExports: `
    let setConstructions = 0;
    const NativeSet = globalThis.Set;
    export function countSets() {
      setConstructions = 0;
      globalThis.Set = new Proxy(NativeSet, {
        construct(target, args) { setConstructions++; return Reflect.construct(target, args); }
      });
    }
    export function finishCountSets() { globalThis.Set = NativeSet; return setConstructions; }
  ` });
  const actors = Array.from({length: 8}, () => f.make());
  for (const a of actors) f.movementState(a); // state creation is not a steady-state cost
  f.countSets();
  for (let frame = 0; frame < 600; frame++)
    for (const a of actors) f.beforeActions(a, 1 / 60, false);
  assert.equal(f.finishCountSets(), 0, '4800 timer updates must allocate zero Sets');
  const source = fs.readFileSync(new URL('../runtime/movement.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /new Set\(\[state\.roll, state\.surge, state\.armor\]\)/,
    'the temporary Array literal must also be absent');
});

test('#983 all identity/null combinations decrement each distinct armor timer once', async () => {
  const f = await fixture();
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    for (let roll = 0; roll < 4; roll++) for (let surge = 0; surge < 4; surge++) for (let armor = 0; armor < 4; armor++) {
      const a = f.make(); a.form = 'squid'; a.grounded = false;
      const actions = [null, ...Array.from({length: 3}, () => ({time: 10, phase: 'auto-climb', armorTime: 1}))];
      const state = f.movementState(a);
      [state.roll, state.surge, state.armor] = [actions[roll], actions[surge], actions[armor]];
      const selected = new Set([state.roll, state.surge, state.armor]);
      f.beforeActions(a, dt, false);
      for (const action of actions.slice(1)) near(action.armorTime, selected.has(action) ? 1 - dt : 1);
    }
  }
});

test('#983 timer clamping and lifecycle cleanup retain their behavior', async () => {
  const f = await fixture();
  for (const transition of ['death', 'special', 'superjump', 'kid']) {
    const a = f.make(); a.form = 'squid';
    if (transition === 'death') a.alive = false;
    if (transition === 'special') a.specialActive = 'storm';
    if (transition === 'superjump') a.superJumpState = {};
    if (transition === 'kid') a.form = 'kid';
    const state = f.movementState(a), action = {armorTime: 1 / 60, time: 1};
    state.roll = state.surge = state.armor = action;
    assert.equal(f.beforeActions(a, 1 / 60, false), false);
    assert.equal(action.armorTime, 0);
    assert.equal(state.roll, null); assert.equal(state.surge, null); assert.equal(state.armor, null);
  }
});
