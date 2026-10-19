import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { adaptSettingsUi } from '../settings-ui-adapter.mjs';
import { replaceOnce, qualityIdentity } from '../adapter.mjs';

const raw = fs.readFileSync(new URL('../../../inkwave-public/src/ui/menus.js', import.meta.url), 'utf8');
const built = adaptBuildSource('src/ui/menus.js', raw);
class Element extends EventTarget {
  constructor() {
    super(); this.children = []; this.style = { setProperty() {} }; this.textContent = '';
    const classes = new Set();
    this.classList = { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) };
  }
  getBoundingClientRect() { return { left: 0, width: 100 }; }
  setPointerCapture(id) { this.captured = id; }
  hasPointerCapture(id) { return this.captured === id; }
  releasePointerCapture() { this.captured = null; }
}
function fixture(source = built) {
  const a = source.indexOf('  _slider(row, value) {'), b = source.indexOf('\n  _toggle(', a);
  const win = new EventTarget(), writes = [], focused = [];
  const focusRow = new Element();
  const h = (tag, props, ...children) => { const el = new Element(); el.children = children.filter(Boolean); return el; };
  const Menu = vm.runInNewContext(`class Menu {${source.slice(a, b)}}; Menu`, {
    h, window: win, clamp: (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v)),
    DEFAULT_SETTINGS: {}, prefersReducedMotion: () => true, restartAnim() {}, performance: { now: () => 1000 },
  });
  const m = new Menu(); m._sfx = () => {}; m._setFocus = row => focused.push(row); m._setSetting = (...args) => writes.push(args);
  const control = m._slider({ key: 'master', min: 0, max: 1, step: 0.05, fmt: String }, 0.5);
  const track = control.el.children[0]; track.closest = () => focusRow;
  const pointer = (type, pointerId, clientX, button = 0) => {
    const e = new Event(type, { cancelable: true });
    Object.assign(e, { pointerId, clientX, button }); track.dispatchEvent(e);
  };
  return { control, track, pointer, writes, win, focused, focusRow };
}
test('negative control: a second finger moves and releases the native slider', () => {
  const f = fixture(raw);
  f.pointer('pointerdown', 1, 20); f.pointer('pointermove', 2, 90);
  assert.equal(f.writes.at(-1)[1], 0.9);
  f.pointer('pointerup', 2, 90);
  assert.equal(f.control.el.classList.contains('is-drag'), false);
});
test('slider admits one primary-button pointer and ignores unrelated moves and releases', () => {
  const f = fixture();
  f.pointer('pointerdown', 9, 90, 2); assert.equal(f.writes.length, 0);
  f.pointer('pointerdown', 1, 20);
  f.pointer('pointerdown', 2, 90); f.pointer('pointermove', 2, 90); f.pointer('pointerup', 2, 90);
  assert.equal(f.writes.length, 1); assert.equal(f.writes[0][1], 0.2);
  assert.equal(f.control.el.classList.contains('is-drag'), true);
  f.pointer('pointermove', 1, 75); assert.equal(f.writes.at(-1)[1], 0.75);
  f.pointer('pointerup', 1, 75); assert.equal(f.track.captured, null);
  f.pointer('pointermove', 1, 100); assert.equal(f.writes.length, 2);
});
for (const reason of ['pointercancel', 'lostpointercapture', 'blur', 'destroy']) {
  test(`slider retires on ${reason} and never consumes later moves`, () => {
    const f = fixture(); f.pointer('pointerdown', 1, 20);
    if (reason === 'destroy') f.control.destroy();
    else if (reason === 'blur') f.win.dispatchEvent(new Event('blur'));
    else f.pointer(reason, 1, 20);
    assert.equal(f.control.el.classList.contains('is-drag'), false);
    assert.equal(f.track.captured, null);
    f.pointer('pointermove', 1, 90); assert.equal(f.writes.length, 1);
    f.pointer('pointerdown', 3, 80); assert.equal(f.writes.at(-1)[1], 0.8);
    f.control.destroy();
  });
}
test('settings transform is identity-tracked, scoped, and rejects input drift', () => {
  assert(qualityIdentity()['settings-ui-adapter.mjs']);
  assert.equal(adaptSettingsUi('src/game/actor.js', raw, replaceOnce), raw);
  assert.throws(() => adaptSettingsUi('src/ui/menus.js', raw.replace("track.addEventListener('pointerdown'", "track.addEventListener('mousedown'"), replaceOnce), /expected exactly one connection/);
});

test('pressing a slider track selects its row before applying the new value', () => {
  const f = fixture();
  f.pointer('pointerdown', 1, 20);
  assert.deepEqual(f.focused, [f.focusRow]);
  f.control.destroy();
});
test('a hidden zero-width slider cannot apply invalid pointer-derived values', () => {
  const f = fixture(); f.track.getBoundingClientRect = () => ({ left: 0, width: 0 });
  f.pointer('pointerdown', 1, 0); assert.equal(f.writes.length, 0);
  assert.equal(f.control.el.classList.contains('is-drag'), false);
});
