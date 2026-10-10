// #655: the real platform-input installer with a deterministic gamepad fixture.
// Analog LT/RT holds across lifecycle rebase stay neutral until physical release.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installInputPlatform, resetPlatformInput } from '../platform-input.mjs';

function fixture() {
  const listeners = new Map();
  const target = {
    addEventListener(type, cb) { const s = listeners.get(type) || new Set(); s.add(cb); listeners.set(type, s); },
    removeEventListener(type, cb) { listeners.get(type)?.delete(cb); },
  };
  const doc = { ...target, hidden: false, hasFocus: () => true };
  const env = { ...target, document: doc, screen: { orientation: target } };
  let pad;
  class Input {
    constructor() {
      this.padPrev = []; this.padPressed = new Set(); this.padMenuPressed = new Set();
      this.padMenuBlocked = new Set(); this.pad = null; this._padEpoch = 0;
    }
    pollPad() {
      this.padPressed.clear(); this.pad = pad;
      if (!pad) { this.padPrev = []; return; }
      pad.buttons.forEach((b, i) => {
        const pressed = i === 6 || i === 7 ? b.value > .3 : !!b.pressed;
        if (pressed && !this.padPrev[i]) this.padPressed.add(i);
        this.padPrev[i] = pressed;
      });
    }
    padButton(i) { return !!this.pad?.buttons?.[i]?.pressed; }
    padValue(i) { return this.pad?.buttons?.[i]?.value ?? 0; }
    padAxis(i) { return this.pad?.axes?.[i] ?? 0; }
    padStick(_x, _y, out) { out.x = out.y = out.mag = 0; return out; }
  }
  installInputPlatform(Input, env);
  const input = new Input();
  function setButton(i, value, pressed = value > .5) {
    if (!pad) pad = { buttons: Array.from({ length: 16 }, () => ({ value: 0, pressed: false })), axes: [0, 0, 0, 0] };
    pad.buttons[i] = { value, pressed };
  }
  return { input, setButton, releasePad() { pad = null; },
    poll() { input.pollPad(); },
    reset() { resetPlatformInput(input); },
    event(type) { for (const cb of listeners.get(type) || []) cb({ type }); },
  };
}

for (const i of [6, 7]) for (const pressed of [false, true])
  test('#655 ' + (i === 6 ? 'LT' : 'RT') + ' raw pressed=' + pressed + ': resume stays neutral until release', () => {
    const f = fixture(), { input } = f;
    f.setButton(i, .40, pressed); f.poll(); f.reset();
    for (let n = 0; n < 8; n++) {
      f.poll();
      assert.equal(input.padValue(i), 0, 'pre-resume analog hold cannot drive gameplay');
      assert.equal(input.padButton(i), false, 'raw pressed cannot bypass hold mask');
      assert.equal(input.padPressed.has(i), false, 'no synthesized fresh edge');
      assert.equal(input.padPrev[i], true, 'canonical threshold used for edge rebase');
    }
    f.setButton(i, .29, false); f.poll();
    assert.equal(input.padValue(i), .29, 'release clears mask');
    assert.equal(input.padPressed.has(i), false);
    f.setButton(i, .31, false); f.poll();
    assert.equal(input.padValue(i), .31);
    assert.equal(input.padPressed.has(i), true, 'new press gives exactly one edge');
    f.poll(); assert.equal(input.padPressed.has(i), false);
  });

test('#655 blur/focus and screen rebase share a physical release boundary', () => {
  const f = fixture(), i = 7;
  f.setButton(i, .4, false); f.poll();
  for (const event of ['blur', 'screen']) {
    if (event === 'blur') { f.event('blur'); f.poll(); f.event('focus'); }
    f.reset(); f.poll();
    assert.equal(f.input.padValue(i), 0);
    assert.equal(f.input.padPressed.has(i), false);
  }
  f.releasePad(); f.poll();
  f.setButton(i, .6, true); f.poll();
  assert.equal(f.input.padValue(i), .6);
  assert.equal(f.input.padPressed.has(i), true);
});

test('#655 digital buttons and axes are independent of trigger masking', () => {
  const f = fixture(), { input } = f;
  f.setButton(7, .4, false); f.setButton(0, 1, true);
  f.poll(); f.reset(); f.poll();
  assert.equal(input.padValue(7), 0);
  assert.equal(input.padValue(0), 1);
  assert.equal(input.padButton(0), true);
  f.setButton(0, 0, false); f.poll(); f.setButton(0, 1, true); f.poll();
  assert.equal(input.padPressed.has(0), true);
});
