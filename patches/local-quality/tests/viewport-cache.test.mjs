import test from 'node:test';
import assert from 'node:assert/strict';
import { installViewportCache } from '../viewport-cache.mjs';
import { adaptViewportCache } from '../viewport-cache-adapter.mjs';

function fakeWindow() {
  const listeners = {}, state = { w: 800, h: 600, reads: 0 };
  const proto = {};
  Object.defineProperty(proto, 'innerWidth', { configurable: true, enumerable: true, get() { state.reads++; return state.w; } });
  Object.defineProperty(proto, 'innerHeight', { configurable: true, enumerable: true, get() { state.reads++; return state.h; } });
  const win = Object.create(proto);
  win.addEventListener = (type, fn) => { (listeners[type] ||= []).push(fn); };
  return { win, state, fire: type => (listeners[type] || []).forEach(fn => fn()) , listeners };
}

test('window viewport reads are cached until resize or rotation', () => {
  const { win, state, fire } = fakeWindow();
  const cache = installViewportCache(win);
  assert.ok(cache);
  assert.deepEqual([win.innerWidth, win.innerHeight], [800, 600]);
  const reads = state.reads;
  for (let i = 0; i < 500; i++) { win.innerWidth; win.innerHeight; }
  assert.equal(state.reads, reads, 'no underlying reads while the size is unchanged');
  state.w = 1024; state.h = 768;
  assert.equal(win.innerWidth, 800, 'the cached pair holds until the browser reports a resize');
  fire('resize');
  assert.deepEqual([win.innerWidth, win.innerHeight], [1024, 768]);
  state.w = 768; state.h = 1024; fire('orientationchange');
  assert.deepEqual([win.innerWidth, win.innerHeight], [768, 1024]);
  assert.equal(installViewportCache(win), cache, 'installing twice keeps one cache');
  win.innerWidth = 5;
  assert.equal(win.innerWidth, 5, 'assignment keeps the [Replaceable] attribute behaviour');
});

test('missing window or accessors leave the platform untouched', () => {
  assert.equal(installViewportCache(undefined), null);
  assert.equal(installViewportCache({ addEventListener() {} }), null);
});

test('the cache installs from the earliest device module only', () => {
  const out = adaptViewportCache('src/core/device.js', 'export const a = 1;\n');
  assert.match(out, /^import \{ installViewportCache \}/);
  assert.equal(adaptViewportCache('src/main.js', 'x'), 'x');
  assert.throws(() => adaptViewportCache('src/core/device.js', out), /already applied/);
});
