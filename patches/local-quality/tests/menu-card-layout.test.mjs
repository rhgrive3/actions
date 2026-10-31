import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptMenuCardLayout } from '../menu-card-layout-adapter.mjs';
import { replaceOnce } from '../adapter.mjs';

const rel = 'patches/splatoon3/runtime/menu-layout.mjs';
const source = fs.readFileSync(new URL('../../splatoon3/runtime/menu-layout.mjs', import.meta.url), 'utf8');
const adapted = adaptMenuCardLayout(rel, source, replaceOnce);

async function fixture({ touch = true, grid = true, reduced = true } = {}) {
  let nextFrame = 0, nextTimer = 0;
  const frames = new Map(), timers = new Map(), scrolls = [];
  const context = vm.createContext({
    document: { documentElement: { classList: { contains: () => touch } } },
    getComputedStyle: e => ({ overflowY: e.overflowY || 'visible' }),
    matchMedia: () => ({ matches: reduced }),
    requestAnimationFrame: fn => { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout: id => timers.delete(id),
  });
  const mod = new vm.SourceTextModule(adapted, { context });
  await mod.link(async spec => new vm.SyntheticModule(spec.includes('i18n') ? ['isJa', 't'] : ['GLYPHS'], function () {
    if (spec.includes('i18n')) { this.setExport('isJa', false); this.setExport('t', x => x); }
    else this.setExport('GLYPHS', {});
  }, { context }));
  await mod.evaluate();
  const screens = [];
  function makeScreen() {
    const listeners = new Map(), hostListeners = new Map();
    const root = { isConnected: true, querySelector: () => null, querySelectorAll: () => [],
      addEventListener(type, fn) { listeners.set(type, fn); },
      removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); },
    };
    const host = { parentElement: root, scrollTop: 0, scrollHeight: 5000, clientHeight: 600,
      overflowY: 'auto', classList: { contains: name => grid && name === 's3-wgrid' },
      contains: node => node.parentElement === host,
      getBoundingClientRect: () => ({ top: 100, bottom: 700, height: 600 }),
      scrollTo({ top, behavior }) { scrolls.push({ top, behavior }); this.scrollTop = top; },
      addEventListener(type, fn) { hostListeners.set(type, fn); },
      removeEventListener(type, fn) { if (hostListeners.get(type) === fn) hostListeners.delete(type); },
    };
    const card = (top = 1800) => ({ parentElement: host, isConnected: true, top,
      closest: () => null,
      getBoundingClientRect() { return { top: this.top - host.scrollTop, bottom: this.top - host.scrollTop + 160, height: 160 }; },
    });
    const scr = { el: root, host, card, listeners, hostListeners, destroyed: 0, destroy() { this.destroyed++; } };
    screens.push(scr); return scr;
  }
  class Menus {
    _moveFocus(next) { this._focus = next; return !!next; }
    _swap(scr) { this._scr?.destroy(); this._scr = scr; return scr; }
    _scr_loadout() { return makeScreen(); }
    dispose() { this._scr?.destroy(); this._scr = null; return 'disposed'; }
  }
  assert.equal(mod.namespace.installMenuLayout({ Menus }), true);
  assert.equal(mod.namespace.installMenuLayout({ Menus }), false);
  const menus = new Menus(); menus._scr = menus._scr_loadout();
  return { menus, frames, timers, scrolls, screens,
    flush() { const jobs = [...frames]; frames.clear(); for (const [, fn] of jobs) fn(); },
    flushTimers() { const jobs = [...timers]; timers.clear(); for (const [, fn] of jobs) fn(); },
  };
}

test('adapter leaves unrelated modules alone and fails closed on source drift or double application', () => {
  assert.equal(adaptMenuCardLayout('src/stages.js', source, replaceOnce), source);
  assert.throws(() => adaptMenuCardLayout(rel, source.replace('if (host) keepInView', 'if (host) changedKeepInView'), replaceOnce));
  assert.throws(() => adaptMenuCardLayout(rel, adapted, replaceOnce));
});

test('a far touch-card jump has one screen-owned correction and no idle work', async () => {
  const f = await fixture(), scr = f.menus._scr, target = scr.card();
  f.menus._moveFocus(target);
  assert.equal(f.frames.size, 1); assert.equal(scr.listeners.size, 3);
  target.top += 70; // real wrapped rows replace content-visibility estimates
  f.flush();
  const r = target.getBoundingClientRect();
  assert.equal(r.top + r.height / 2, 400, 'large jump centers the fully laid out target');
  assert.equal(f.frames.size, 0); assert.equal(scr.listeners.size, 0);
  assert.equal(f.scrolls.length, 2);
  f.flush(); assert.equal(f.scrolls.length, 2, 'no continuing correction loop');
});

test('rapid navigation retains only the latest target correction', async () => {
  const f = await fixture(), scr = f.menus._scr;
  for (const top of [1600, 2600, 900, 3500]) f.menus._moveFocus(scr.card(top));
  assert.equal(f.frames.size, 1); assert.equal(scr.listeners.size, 3);
  f.flush();
  assert.equal(f.menus._focus.getBoundingClientRect().top, 320);
  assert.equal(f.frames.size, 0); assert.equal(scr.listeners.size, 0);
});

for (const reduced of [true, false]) for (const type of ['wheel', 'touchstart', 'pointerdown']) {
  test(`${type} cancels ${reduced ? 'reduced' : 'smooth'} correction without rewinding manual scrolling`, async () => {
    const f = await fixture({ reduced }), scr = f.menus._scr;
    f.menus._moveFocus(scr.card());
    scr.listeners.get(type)();
    scr.host.scrollTop = 387;
    f.flushTimers(); f.flush();
    assert.equal(scr.host.scrollTop, 387);
    assert.equal(f.scrolls.length, 1); assert.equal(f.frames.size, 0); assert.equal(f.timers.size, 0);
    assert.equal(scr.listeners.size, 0); assert.equal(scr.hostListeners.size, 0);
  });
}

for (const reduced of [true, false]) for (const action of ['swap', 'destroy', 'dispose']) {
  test(`${action} removes the owning screen's ${reduced ? 'reduced' : 'smooth'} work and listeners`, async () => {
    const f = await fixture({ reduced }), old = f.menus._scr;
    f.menus._moveFocus(old.card());
    if (action === 'swap') f.menus._swap(f.menus._scr_loadout());
    if (action === 'destroy') old.destroy();
    if (action === 'dispose') assert.equal(f.menus.dispose(), 'disposed');
    f.flushTimers(); f.flush();
    assert.equal(f.scrolls.length, 1); assert.equal(f.frames.size, 0); assert.equal(f.timers.size, 0);
    assert.equal(old.listeners.size, 0); assert.equal(old.hostListeners.size, 0);
    assert.equal(old.destroyed, 1);
  });
}

test('late destruction of an old screen cannot cancel the new screen correction', async () => {
  const f = await fixture(), old = f.menus._scr;
  f.menus._scr = f.menus._scr_loadout();
  const next = f.menus._scr;
  f.menus._moveFocus(next.card()); old.destroy();
  assert.equal(f.frames.size, 1); assert.equal(next.listeners.size, 3);
  f.menus._focus.top += 70;
  f.flush(); assert.equal(f.scrolls.length, 2); assert.equal(next.listeners.size, 0);
});

for (const fallback of [false, true]) {
  test(`smooth scrolling settles once after ${fallback ? 'the quiet-scroll fallback' : 'scrollend'}, never during the animation`, async () => {
    const f = await fixture({ reduced: false }), scr = f.menus._scr, target = scr.card();
    f.menus._moveFocus(target);
    assert.equal(f.frames.size, 0); assert.equal(f.timers.size, 1); assert.equal(scr.hostListeners.size, 2);
    for (let i = 0; i < 20; i++) scr.hostListeners.get('scroll')();
    assert.equal(f.frames.size, 0); assert.equal(f.timers.size, 1, 'scroll events debounce a single timer');
    target.top += 400;
    if (fallback) f.flushTimers(); else scr.hostListeners.get('scrollend')();
    assert.equal(f.frames.size, 1); assert.equal(f.timers.size, 0); assert.equal(scr.hostListeners.size, 0);
    f.flush();
    assert.equal(target.getBoundingClientRect().top, 320);
    assert.equal(f.scrolls.at(-1).behavior, 'auto', 'final layout correction cannot start another smooth-scroll cycle');
    assert.equal(f.frames.size, 0); assert.equal(scr.listeners.size, 0); assert.equal(f.scrolls.length, 2);
    f.flushTimers(); f.flush(); assert.equal(f.scrolls.length, 2);
  });
}

for (const change of ['screen', 'modal', 'focus', 'detached', 'host']) {
  test(`a changed ${change} invalidates the callback before it scrolls`, async () => {
    const f = await fixture(), scr = f.menus._scr, target = scr.card();
    f.menus._moveFocus(target);
    if (change === 'screen') f.menus._scr = {};
    if (change === 'modal') f.menus._modal = {};
    if (change === 'focus') f.menus._focus = scr.card();
    if (change === 'detached') scr.el.isConnected = false;
    if (change === 'host') target.parentElement = null;
    f.flush(); assert.equal(f.scrolls.length, 1); assert.equal(scr.listeners.size, 0);
  });
}

test('nearby navigation retains its edge margin and other scrollers retain existing behavior', async () => {
  const f = await fixture(), scr = f.menus._scr, target = scr.card(660);
  f.menus._moveFocus(target); const top = scr.host.scrollTop;
  f.flush(); assert.equal(scr.host.scrollTop, top, 'no unnecessary centering for a nearby card');
  for (const options of [{ touch: false }, { grid: false }]) {
    const f = await fixture(options); f.menus._moveFocus(f.menus._scr.card());
    assert.equal(f.scrolls.length, 1); assert.equal(f.frames.size, 0); assert.equal(f.menus._scr.listeners.size, 0);
  }
});
