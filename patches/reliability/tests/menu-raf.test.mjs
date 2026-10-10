import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { reliabilityIdentity } from '../adapter.mjs';

const MENU_REL = 'src/ui/menus.js';
const RAW = fs.readFileSync(new URL('../../../inkwave-public/src/ui/menus.js', import.meta.url), 'utf8');
const COMPOSED = adaptBuildSource(MENU_REL, RAW);
const MAIN_RAW = fs.readFileSync(new URL('../../../inkwave-public/src/main.js', import.meta.url), 'utf8');
const MAIN_COMPOSED = adaptBuildSource('src/main.js', MAIN_RAW);

function section(source, start, end) {
  const at = source.indexOf(start), until = source.indexOf(end, at);
  assert.ok(at >= 0 && until > at, `source method exists: ${start}`);
  assert.equal(source.indexOf(start, at + start.length), -1, `source method is unique: ${start}`);
  return source.slice(at, until);
}

test('production engine loop schedules itself and drives the menu update path', () => {
  assert.ok(MAIN_COMPOSED.includes('requestAnimationFrame(() => this._loop());'), 'engine RAF remains active');
  assert.ok(MAIN_COMPOSED.includes('this.menus?.update?.(dt);'), 'engine frame remains the menu animation owner');
  assert.ok(reliabilityIdentity()['menu-raf-adapter.mjs'], 'the adapter participates in the build identity');
});

function menuHarness(source) {
  const rafs = new Map(), animationDts = [], cursorDts = [];
  let serial = 0, now = 0;
  const request = callback => { const id = ++serial; rafs.set(id, callback); return id; };
  const cancel = id => rafs.delete(id);
  const context = vm.createContext({
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    performance: { now: () => now },
    requestAnimationFrame: request,
    cancelAnimationFrame: cancel,
    SCREENS: ['title', 'main', 'results', 'lobby'],
    WIPES: new Set(),
    LIGHT: new Set(),
    continuationNavigation: () => {},
    safeCall: callback => { try { return callback(); } catch { return undefined; } },
  });
  const methods = [
    section(source, '  show(name = null, opts = {}) {', '\n  setLoading(p, label) {'),
    section(source, '  update(dt) {', '\n  handleKey(e) {'),
    section(source, '  _loop(t) {', '\n  /** The UI lab'),
    section(source, '  _tick(dt) {', '\n  _sfx('),
    '  _frozen() { return false; }',
    '  _updateCursor(dt) { this._cursorDts.push(dt); }',
  ].join('\n');
  const Menu = vm.runInContext(`(class Menus { ${methods} })`, context);
  const menu = new Menu();
  Object.assign(menu, {
    _raf: 0, _lastT: 0, _extTick: 0, current: 'title',
    _stack: [], _focus: null, _focusMem: {}, _swapToken: 0, _resultsDirty: false, api: {},
    _loading: { target: 0, shown: 0 }, timeScale: 1,
    wipe: { timeScale: 1, busy: false }, _cursorDts: cursorDts,
    _scr: { tick: dt => animationDts.push(dt) },
  });
  menu._swap = name => {
    menu.current = name;
    menu._scr = name ? { tick: dt => animationDts.push(dt) } : null;
  };
  menu._loop = menu._loop.bind(menu);
  const dispatchFrame = (timestamp, engineFirst, engineId) => {
    now = timestamp;
    const frame = [...rafs.entries()];
    // rAF callbacks already dispatched for this frame may still run after cancellation.
    // Clearing before invocation models that boundary and makes the stale-callback case explicit.
    rafs.clear();
    if (engineFirst) frame.sort(([a], [b]) => Number(b === engineId) - Number(a === engineId));
    for (const [, callback] of frame) callback(timestamp);
  };
  return { menu, rafs, request, animationDts, cursorDts, dispatchFrame };
}

for (const hz of [30, 60, 120]) {
  for (const engineFirst of [false, true]) {
    test(`${hz} Hz ${engineFirst ? 'engine-first stale callback' : 'menu-first pending callback'} keeps one scheduler through repeated menu/match cycles`, () => {
      const { menu, rafs, request, dispatchFrame, animationDts, cursorDts } = menuHarness(COMPOSED);
      menu._raf = request(menu._loop); // the constructor's native menu-loop start
      dispatchFrame(100, false, 0); // menu owns animation before the engine starts
      assert.equal(animationDts.length, 1, 'menu animation still advances before engine takeover');

      let engineId = 0, engineFrames = 0;
      const engineFrame = timestamp => {
        engineId = request(engineFrame); // main.js schedules its next engine frame before _frame()
        engineFrames++;
        menu.update(1 / hz); // main.js _frame() owner call
      };
      engineId = request(engineFrame);
      dispatchFrame(100 + 1000 / hz, engineFirst, engineId);
      assert.equal(rafs.size, 1, 'takeover leaves only the engine scheduling chain');
      assert.equal(animationDts.length, engineFirst ? 2 : 3,
        'active screen animation ticks before takeover and once on its first engine-owned update');

      let expectedAnimations = animationDts.length;
      for (let cycle = 0; cycle < 12; cycle++) {
        const states = [['main', true], [null, false], ['results', true], ['lobby', true]];
        for (let step = 0; step < states.length; step++) {
          const [screen, animates] = states[step];
          menu.show(screen, { wipe: false, light: false });
          if (animates) expectedAnimations++;
          const next = 100 + (2 + cycle * 4 + step) * 1000 / hz;
          dispatchFrame(next, engineFirst, engineId);
          assert.equal(rafs.size, 1, `one engine chain after cycle ${cycle}, screen ${screen ?? 'match'}`);
        }
      }
      assert.equal(engineFrames, 49, 'all simulated engine frames ran once');
      assert.equal(animationDts.length, expectedAnimations, 'menu animations advance once per engine-owned menu frame');
      assert.equal(cursorDts.length, engineFrames + (engineFirst ? 1 : 2), 'the cursor animation still ticks with each engine frame');
    });
  }
}
