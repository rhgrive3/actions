import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './controls-fixture.mjs';
import { continueCanvasTouch } from '../../local-quality/first-touch-adapter.mjs';

const classes = () => { const values = new Set(); return {
  add: key => values.add(key), remove: key => values.delete(key),
  contains: key => values.has(key), toggle(key, on) { on ? values.add(key) : values.delete(key); },
}; };
const event = (pointerId, x = 700, y = 200, type = 'pointerdown') => ({
  pointerId, clientX: x, clientY: y, pointerType: 'touch', type,
  target: { closest: () => null }, preventDefault() {}, stopPropagation() {},
});
async function setup(t, button, { capture = true, clock = performance } = {}) {
  const f = await fixture({ clock }), canvas = {}, input = new f.Input(canvas), mobile = input.mobile;
  const counts = { pause: 0, gyro: 0, diagnostics: 0 }, captures = new Set();
  Object.assign(f.G, { mode: 'match', match: { state: 'playing', paused: false, attract: false } });
  Object.assign(mobile, { active: true, visible: true,
    root: { classList: classes(), querySelectorAll: () => [],
      setPointerCapture(id) { if (!capture) throw Error('capture unavailable'); captures.add(id); },
      hasPointerCapture: id => captures.has(id), releasePointerCapture: id => captures.delete(id) },
    els: Object.fromEntries(['map', 'pause', 'gyro'].map(key => [key, {
      classList: classes(), dataset: {}, setAttribute() {}, addEventListener() {}, removeEventListener() {},
    }])),
    _hitButton: () => button,
    onPause: () => counts.pause++, _toggleGyroFromTap: () => counts.gyro++, toast: () => counts.diagnostics++,
  });
  // Deterministic display teardown; real gesture, Input and platform wrappers run.
  mobile.root.remove = () => {};
  t.after(() => mobile.destroy());
  const down = id => { const e = event(id); e.target = canvas; mobile._down(e); return e; };
  const send = (e, type, dx = 0) => mobile[type === 'pointermove' ? '_move' : '_up']({ ...e, type, clientX: e.clientX + dx });
  return { ...f, input, mobile, counts, canvas, down, send };
}

for (const button of ['map', 'pause']) test(`${button}: out-and-back drag cancels the tap but a fresh deliberate tap still works`, async t => {
  const f = await setup(t, button), e = f.down(1);
  f.send(e, 'pointermove', 40); f.send(e, 'pointermove'); f.send(e, 'pointerup');
  assert.equal(button === 'map' ? f.mobile.mapOpen : f.counts.pause, button === 'map' ? false : 0);
  const next = f.down(2); f.send(next, 'pointermove', 24); f.send(next, 'pointerup', 24);
  assert.equal(button === 'map' ? f.mobile.mapOpen : f.counts.pause, button === 'map' ? true : 1);
});

test('GYRO out-and-back drag cancels permission/toggle and diagnostic actions', async t => {
  const f = await setup(t, 'gyro'), e = f.down(1);
  f.send(e, 'pointermove', 40); f.send(e, 'pointermove'); f.send(e, 'pointerup');
  assert.equal(f.counts.gyro, 0);
  const next = f.down(2); f.send(next, 'pointerup'); assert.equal(f.counts.gyro, 1);
});

test('live GYRO contact keeps touch ownership through held-stick polls and releases it on finger-up', async t => {
  const f = await setup(t, 'gyro');
  f.setPads([{ index: 0, id: 'hybrid', connected: true, mapping: 'standard',
    axes: [.6, 0, .6, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }]);
  const e = f.down(1);
  for (let i = 0; i < 120; i++) { f.input.pollPad(); assert.equal(f.input.lastDevice, 'touch'); }
  f.send(e, 'pointerup'); f.input.pollPad();
  assert.equal(f.counts.gyro, 1); assert.equal(f.input.lastDevice, 'pad');
  assert.equal(f.mobile._ptr.size, 0);
});

test('GYRO canvas fallback delivers move/up without pointer capture and cancelled contacts cannot toggle', async t => {
  const f = await setup(t, 'gyro', { capture: false });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    const e = f.down(1), before = f.counts.gyro;
    assert.equal(continueCanvasTouch(f.mobile, { ...e, type: 'pointermove' }, false), true);
    assert.equal(continueCanvasTouch(f.mobile, { ...e, type }, true), true);
    assert.equal(f.counts.gyro, before + (type === 'pointerup' ? 1 : 0));
    assert.equal(f.mobile._ptr.size, 0);
  }
});

test('a long GYRO out-and-back drag cannot open diagnostics; a deliberate long press still can', async t => {
  let now = 1000;
  const f = await setup(t, 'gyro', { clock: { now: () => now } }), e = f.down(1);
  f.send(e, 'pointermove', 50); now += 1000; f.send(e, 'pointerup');
  assert.equal(f.counts.diagnostics, 0); assert.equal(f.counts.gyro, 0);
  const next = f.down(2); now += 1000; f.send(next, 'pointerup');
  assert.equal(f.counts.diagnostics, 1); assert.equal(f.counts.gyro, 0);
});

test('reset and destruction retire GYRO ownership and a late up cannot toggle', async t => {
  const f = await setup(t, 'gyro');
  let e = f.down(1); f.mobile.resetPointers(); f.send(e, 'pointerup');
  assert.equal(f.mobile._ptr.size, 0); assert.equal(f.counts.gyro, 0);
  e = f.down(2); f.mobile.destroy(); f.send(e, 'pointerup');
  assert.equal(f.mobile._ptr.size, 0); assert.equal(f.counts.gyro, 0);
});
