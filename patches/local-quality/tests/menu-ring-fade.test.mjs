import test from 'node:test';
import assert from 'node:assert/strict';
import {installMenuQuality} from '../menu.mjs';

// #1432: the selection ring's entrance fade belongs to the menu owner tick,
// not to a composited CSS transition whose start waits for a presented frame.
// The native pass is stubbed: `want` decides whether the ring is on.
function rig() {
  let clock = 0;
  const env = { performance: { now: () => clock }, innerWidth: 1024, innerHeight: 768,
    getComputedStyle: () => ({ overflowY: 'visible', overflowX: 'visible', position: 'static', opacity: '1' }),
    setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {} };
  const node = () => ({ style: {}, parentNode: null, parentElement: null, children: [], classList: { add() {}, remove() {}, contains: () => false },
    appendChild(c) { c.parentNode = this; return c; }, insertBefore(c) { c.parentNode = this; return c; } });
  const ui = node(), ring = node(); ui.appendChild(ring);
  function Menus() {}
  Menus.prototype._updateCursor = function () { this._cur.on = this.want; };
  // Native _setFocus does not tick; the quality wrapper places the ring in the same task.
  Menus.prototype._setFocus = function (f) { this._focus = f; };
  Menus.prototype.show = function () {}; Menus.prototype.update = function (dt) { this._updateCursor(dt); }; Menus.prototype.dispose = function () {};
  installMenuQuality(Menus, env);
  const m = new Menus();
  Object.assign(m, { el: ui, cursorEl: ring, wipeEl: null, want: false, _focus: null, _input: 'touch', _scr: { el: null }, current: 'main',
    _cur: { on: false, x: { x: 0 }, y: { x: 0 }, w: { x: 10 }, h: { x: 10 } } });
  const tick = (ms) => { clock += ms; m._updateCursor(Math.min(0.1, ms / 1000)); return ring.style.opacity; };
  return { m, ring, tick, advance: (ms) => { clock += ms; } };
}

test('the ring never depends on a CSS opacity transition', () => {
  const { m, ring, tick } = rig();
  tick(16);
  assert.equal(ring.style.transition, 'none');
  assert.equal(ring.style.opacity, '0', 'off ring is transparent and hidden');
  assert.equal(ring.style.visibility, 'hidden');
  m.want = true; tick(16);
  assert.equal(ring.style.transition, 'none');
});

test('at a normal frame rate the ring keeps the native 180 ms CSS ease fade-in', () => {
  const { m, ring, tick } = rig();
  // 18 ms frames put a sample exactly on the half-way point of the fade.
  for (let i = 0; i < 5; i++) tick(18);
  m.want = true;
  const values = [];
  for (let i = 0; i < 14; i++) values.push(+tick(18));
  assert.equal(ring.style.visibility, '');
  assert(values[0] > 0 && values[0] < 0.2, 'first presented frame starts the fade: ' + values[0]);
  for (let i = 1; i < values.length; i++) assert(values[i] >= values[i - 1], 'monotonic fade ' + values);
  // value i is presented (i + 1) frames after the ring came on: 90 ms at i = 4.
  // CSS `ease` = cubic-bezier(.25,.1,.25,1) has ease(0.5) = 0.8024.
  assert(Math.abs(values[4] - 0.8024) < 0.002, 'CSS ease curve at 90/180 ms: ' + values[4]);
  assert(values[8] < 1 && values[9] === 1, 'fade completes at 180 ms: ' + values);
  assert.equal(values.at(-1), 1, 'fully visible after the fade');
});

test('a frame longer than the fade presents the ring fully visible (#1432)', () => {
  const { m, ring, tick } = rig();
  tick(13000); tick(13000);
  m.want = true;
  assert.equal(tick(13000), '1', 'no in-between frame exists, so the first presented frame shows the ring');
  assert.equal(ring.style.visibility, '');
  // 2 s frames, as in the earlier failed run: also no frame inside the fade
  const slow = rig(); slow.tick(2076); slow.tick(2076); slow.m.want = true;
  assert.equal(slow.tick(2076), '1');
});

test('an input-task focus change uses the measured owner frame for its first presented value', () => {
  const { m, ring, tick, advance } = rig();
  tick(16); tick(16);
  advance(5); m.want = true; m._setFocus({});
  const first = +ring.style.opacity;
  assert(first > 0 && first < 0.2, 'fast cadence: fade starts, not full: ' + first);
  const slow = rig(); slow.tick(1500); slow.tick(1500);
  slow.advance(5); slow.m.want = true; slow.m._setFocus({});
  assert.equal(slow.ring.style.opacity, '1');
});

test('turning off resets the fade and a stopped owner is not mistaken for a slow frame', () => {
  const { m, ring, tick, advance } = rig();
  tick(16); m.want = true;
  for (let i = 0; i < 20; i++) tick(16);
  assert.equal(ring.style.opacity, '1');
  m.want = false; tick(16);
  assert.equal(ring.style.opacity, '0'); assert.equal(ring.style.visibility, 'hidden');
  // The owner stops (match, hidden page) for a minute, then resumes at 60 fps.
  m.setPlatformDriven(true); advance(60000);
  m.want = true;
  const resumed = +tick(16);
  assert(resumed < 0.2, 'resume after a stop starts a normal fade: ' + resumed);
});
