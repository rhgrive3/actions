import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, pad } from './pause-fixture.mjs';
import { installInputPlatform } from '../../local-quality/platform-input.mjs';

test('lifecycle rebase masks a held analog trigger until physical release', async () => {
  const h = await boot();
  installInputPlatform(h.input.constructor);
  const held = pad([])[0];
  Object.assign(held, { index: 0, id: 'same-controller', mapping: 'standard' });
  held.buttons[7] = { pressed: false, value: 0.4 };

  h.setPads([held]); h.input.pollPad();
  h.input._platformPadRebase = true; h.input.pollPad();
  assert.equal(h.input.padPrev[7], true, 'rebase uses the canonical LT/RT threshold');
  assert.equal(h.input.padMenuBlocked.has(7), true, 'held trigger remains suppressed');
  assert.equal(h.input.padPressed.has(7), false, 'rebase does not create a fresh edge');
  assert.equal(h.input.padValue(7), 0, 'gameplay cannot read the held trigger during rebase');

  h.input.pollPad();
  assert.equal(h.input.padPressed.has(7), false, 'a held trigger never replays on the next poll');
  assert.equal(h.input.padValue(7), 0);
  held.buttons[7] = { pressed: false, value: 0 };
  h.input.pollPad();
  assert.equal(h.input.padMenuBlocked.has(7), false, 'a physical release clears the block');
  held.buttons[7] = { pressed: false, value: 0.4 };
  h.input.pollPad();
  assert.equal(h.input.padPressed.has(7), true, 'a fresh analog press after release is admitted');
  assert.equal(h.input.padValue(7), 0.4);
});
