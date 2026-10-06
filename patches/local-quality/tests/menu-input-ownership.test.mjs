// Screen ownership of input across wiped menu transitions (results → main menu → battle): the real composed
// Menus.show / _swap / _nav sections with the local-quality installer, a tiny DOM stand-in and a manual wipe clock.
// Logic-only evidence; the browser round trip lives in scripts/check-inkwave-rematch-lifecycle.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { installMenuQuality } from '../menu.mjs';
import { adaptQualitySource } from '../adapter.mjs';

const root = new URL('../../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const section = (s, a, b) => { const i = s.indexOf(a), j = s.indexOf(b, i); assert(i >= 0 && j > i, a); return s.slice(i, j); };

class Node {
  constructor(name, opacity = 1) { this.name = name; this.children = []; this.parentElement = null; this.listeners = {}; this.style = { getPropertyValue: () => '', setProperty() {} }; this.dataset = {}; this.opacity = opacity; this.inert = false;
    const set = new Set(); this.classList = { add: (...c) => c.forEach((x) => set.add(x)), remove: (...c) => c.forEach((x) => set.delete(x)), toggle: (c, on) => ((on ?? !set.has(c)) ? set.add(c) : set.delete(c)), contains: (c) => set.has(c) }; }
  get parentNode() { return this.parentElement; }
  get isConnected() { let n = this; while (n.parentElement) n = n.parentElement; return n.name === 'document'; }
  append(...kids) { for (const k of kids) { k.parentElement = this; this.children.push(k); } }
  appendChild(k) { this.append(k); return k; }
  prepend(k) { this.append(k); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((k) => k !== this); this.parentElement = null; }
  contains(n) { for (; n; n = n.parentElement) if (n === this) return true; return false; }
  closest(sel) { for (let n = this; n; n = n.parentElement) if (sel === '[data-nav]' ? n.dataset.nav : sel === '.is-leaving' ? n.classList.contains('is-leaving') : false) return n; return null; }
  addEventListener(type, fn, o) { (this.listeners[type] ||= []).push({ fn, capture: o === true || !!o?.capture }); }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 10, height: 10, right: 10, bottom: 10 }; }
}
// capture listeners root → target, then the target's own listeners, unless stopped
function dispatch(target, type) {
  const path = []; for (let n = target; n; n = n.parentElement) path.unshift(n);
  let stopped = false, prevented = false;
  const e = { type, target, stopImmediatePropagation() { stopped = true; }, preventDefault() { prevented = true; } };
  for (const n of path) for (const l of n.listeners[type] || []) if ((l.capture || n === target) && !stopped) l.fn(e);
  return { stopped, prevented };
}
// a real browser never delivers pointer events into an inert subtree
const tap = (el) => { for (let n = el; n; n = n.parentElement) if (n.inert) return 'inert'; dispatch(el, 'pointerdown'); return dispatch(el, 'click').stopped ? 'blocked' : 'delivered'; };

function fixture() {
  const source = adaptQualitySource('src/ui/menus.js', read('inkwave-public/src/ui/menus.js'));
  const consts = ["const SCREENS", "const WIPES", "const LIGHT"].map((k) => source.match(new RegExp(k + ' = [^\\n]+'))[0]).join('\n');
  const methods = [section(source, '  show(name = null, opts = {}) {', '\n  setLoading('), section(source, '  _swap(name, opts) {', '\n  /** mode:'), section(source, '  _setFocus(el,', '\n  _candidates()'), section(source, '  _nav(dir) {', '\n  /** Keyboard / pad focus move')].join('\n');
  const document = new Node('document');
  const env = { performance: { now: () => 0 }, getComputedStyle: (n) => ({ opacity: String(n.opacity ?? 1), borderTopLeftRadius: '4px' }), setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {}, CSS: { escape: (s) => s } };
  const Menus = vm.runInNewContext(consts + '\nclass Menus {' + methods + '\n  _updateCursor() {}\n}; Menus', { ...env, h: () => new Node('dimbg'), safeCall: (f) => f(), prefersReducedMotion: () => false, console });
  installMenuQuality(Menus, env);
  const m = new Menus();
  const ui = new Node('ui'), layer = new Node('layer'); document.append(ui); ui.append(layer);
  let wipeMid = null;
  const calls = [];
  const screen = (name, ids, opacity = 1) => () => {
    const el = new Node(name); const items = {};
    for (const id of ids) { const b = new Node(id, opacity); b.dataset.nav = 'button'; b.dataset.id = id; b.addEventListener('click', () => calls.push(`${name}:${id}`)); el.append(b); items[id] = b; }
    el.querySelectorAll = () => Object.values(items); el.querySelector = () => Object.values(items)[0];
    return { el, items, initial: Object.values(items)[0], onNav: (dir) => (dir === 'accept' ? (calls.push(`${name}:nav`), true) : false) };
  };
  Object.assign(m, {
    el: ui, layer, cursorEl: new Node('cursor'), current: null, _scr: null, _stack: [], _focusMem: {}, _focus: null, _swapToken: 0, _shownAt: 0, _cur: { on: false }, _binds: new Map(), _news: { maybeShow() {} },
    api: { onScreenChange: () => {} }, wipe: { busy: false, cancel() {} }, _runWipe: (mid) => { wipeMid = mid; }, _starting: false,
    _scr_results: screen('results', ['rematch', 'home']), _scr_main: screen('main', ['play', 'loadout']), _scr_mode: screen('mode', ['mode-turf']),
  });
  return { m, calls, mid: () => { const f = wipeMid; wipeMid = null; f?.(); }, screen };
}

test('negative control: upstream show() leaves the closed results screen live until the wipe midpoint', () => {
  const raw = read('inkwave-public/src/ui/menus.js');
  const show = section(raw, '  show(name = null, opts = {}) {', '\n  setLoading(');
  assert.match(show, /if \(wipe && prev !== null && !prefersReducedMotion\(\)\) this\._runWipe\(swap\);/);
  assert.doesNotMatch(show, /inert/);
});

test('MAIN MENU on results: the closing results screen takes no further taps or pad input', () => {
  const { m, calls, mid } = fixture();
  m.show('results');
  const results = m._scr;
  assert.equal(tap(results.items.home), 'delivered');
  m.show(null);                       // quitToMenu: logical screen gone, swap waits for the wipe
  assert.equal(m.current, null); assert.equal(m._scr, results, 'wipe still owns the old screen');
  assert.equal(results.el.inert, true); assert.equal(results.el.style.pointerEvents, 'none');
  assert.equal(tap(results.items.rematch), 'inert', 'a second tap cannot REMATCH');
  assert.equal(m._nav('accept'), true); assert.deepEqual(calls, ['results:home'], 'pad/keyboard accept ignored while pending');
  m.show('main');                     // fade done before the wipe midpoint
  assert.equal(m._scr.name, 'main');
  mid();                              // stale midpoint: no swap back to null
  assert.equal(m._scr.name, 'main'); assert.equal(m.current, 'main');
  assert.equal(tap(m._scr.items.play), 'delivered');
  assert.deepEqual(calls, ['results:home', 'main:play']);
});

test('a tap that began on the previous screen never activates the item that appears under it', () => {
  const { m, calls } = fixture();
  m.show('results');
  const home = m._scr.items.home;
  dispatch(home, 'pointerdown');      // finger goes down on MAIN MENU …
  m.show('main', { wipe: false });    // … the next screen mounts before the click is delivered
  const r = dispatch(m._scr.items.loadout, 'click');
  assert.equal(r.stopped, true, 'click from a press on the old screen is swallowed');
  assert.deepEqual(calls, []);
  assert.equal(tap(m._scr.items.loadout), 'delivered', 'a fresh press on the live screen works');
  assert.deepEqual(calls, ['main:loadout']);
});

test('items still invisible in their entrance animation cannot be activated; visible ones can', () => {
  const { m, calls } = fixture();
  m.show('results');
  m.show('main', { wipe: false });
  const { play, loadout } = m._scr.items;
  loadout.opacity = 0.1;
  assert.equal(tap(loadout), 'blocked');
  loadout.opacity = 1;
  assert.equal(tap(loadout), 'delivered');
  play.opacity = 0.9;
  assert.equal(tap(play), 'delivered');
  assert.deepEqual(calls, ['main:loadout', 'main:play']);
});

test('ordinary screen changes keep working: immediate swaps stay live, nav works once mounted', () => {
  const { m, calls } = fixture();
  m.show('main');
  assert.equal(m._nav('accept'), true);
  m.show('mode', { push: true });     // light transition: immediate swap
  assert.equal(m._scr.name, 'mode'); assert.equal(m._scr.el.inert, false);
  assert.equal(tap(m._scr.items['mode-turf']), 'delivered');
  assert.deepEqual(calls, ['main:nav', 'mode:mode-turf']);
});
