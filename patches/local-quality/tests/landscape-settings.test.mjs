import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptLandscapeSettings } from '../landscape-settings-adapter.mjs';

const raw = fs.readFileSync(new URL('../../../inkwave-public/src/ui/menus.js', import.meta.url), 'utf8');
const built = adaptLandscapeSettings('src/ui/menus.js', raw);

function stripFixture({ scrollWidth = 600, clientWidth = 300, left = 0, right = 300 } = {}) {
  const tabsEl = { scrollWidth, clientWidth, scrollLeft: 0, getBoundingClientRect: () => ({ left, right }) };
  const tabBtns = Array.from({ length: 5 }, (_, i) => ({
    pressed: null, selected: null,
    classList: { toggle(name, value) { tabBtns[i].selected = value; } },
    setAttribute(name, value) { assert.equal(name, 'aria-pressed'); this.pressed = value; },
    getBoundingClientRect: () => ({ left: left + i * 120 - tabsEl.scrollLeft, right: left + (i + 1) * 120 - tabsEl.scrollLeft }),
  }));
  const start = built.indexOf('    const revealTab = (b) => {');
  const end = built.indexOf('    const selectTab = (i, sound) => {', start);
  const helpers = vm.runInNewContext(`${built.slice(start, end)}; ({ revealTab, syncTabSelection });`, { tabsEl, tabBtns });
  return { tabsEl, tabBtns, ...helpers };
}

test('offscreen selected tab reveals horizontally and exposes one pressed button', () => {
  const f = stripFixture();
  f.syncTabSelection(4);
  assert.equal(f.tabsEl.scrollLeft, 300);
  assert.deepEqual(f.tabBtns.map(b => b.pressed), ['false', 'false', 'false', 'false', 'true']);
  f.syncTabSelection(0);
  assert.equal(f.tabsEl.scrollLeft, 0);
  assert.deepEqual(f.tabBtns.map(b => b.selected), [true, false, false, false, false]);
});

test('keyboard focus reveals an unselected tab without changing selection', () => {
  const f = stripFixture({ left: 44, right: 344 });
  f.syncTabSelection(0);
  f.revealTab(f.tabBtns[4]);
  assert.equal(f.tabsEl.scrollLeft, 300);
  assert.equal(f.tabBtns[0].pressed, 'true');
  assert.equal(f.tabBtns[4].pressed, 'false');
  // Repeated selection/focus never moves a strip farther than needed.
  f.revealTab(f.tabBtns[4]); assert.equal(f.tabsEl.scrollLeft, 300);
  f.revealTab(f.tabBtns[0]); assert.equal(f.tabsEl.scrollLeft, 0);
});

test('normal-width tabs are not scrolled and helper never calls document scrolling', () => {
  const f = stripFixture({ scrollWidth: 600, clientWidth: 600, right: 600 });
  f.syncTabSelection(4); assert.equal(f.tabsEl.scrollLeft, 0);
  assert(!built.slice(built.indexOf('const revealTab'), built.indexOf('const selectTab')).includes('scrollIntoView'));
  assert(built.includes('if (tabBtns.includes(f)) revealTab(f);'));
  assert(built.includes('afterMount: () => { movePill(true); revealTab(tabBtns[tabIdx]); }'));
});

test('short-landscape CSS is touch/settings-only and keeps guidance and edit row', () => {
  const css = adaptLandscapeSettings('styles/mobile.css', '/* input */');
  assert(css.includes('@media (orientation: landscape) and (max-height: 520px)'));
  assert(css.includes('flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden; touch-action: pan-x;'));
  assert(css.includes('touch-action: pan-x pan-y;'));
  assert(css.includes('.iw-settings .iw-prev__stage { display: none; }'));
  assert(!/\.iw-prev(?:__help)?\s*\{[^}]*display:\s*none/.test(css));
  assert(built.includes("this.api.editTouchLayout && this.api.editTouchLayout()"));
  assert(built.includes("pvHelp.textContent = tr(help || (r ? r.help : ''));"));
  assert.throws(() => adaptLandscapeSettings('styles/mobile.css', css), /repeated CSS transform/);
});

test('adapter is scoped, fail-closed and leaves the captured source unchanged', () => {
  assert.equal(adaptLandscapeSettings('styles/hud.css', raw), raw);
  const start = raw.indexOf('  _scr_settings() {');
  const end = raw.indexOf('\n  // ================================================================ SCREEN: howto', start);
  assert.equal(built.slice(0, start), raw.slice(0, start));
  assert(built.endsWith(raw.slice(end)));
  const drifted = raw.slice(0, start) + raw.slice(start, end).replace('    const selectTab = (i, sound) => {', '    const changedTab = (i, sound) => {') + raw.slice(end);
  assert.throws(() => adaptLandscapeSettings('src/ui/menus.js', drifted), /expected exactly one tab strip reveal connection/);
  assert.throws(() => adaptLandscapeSettings('src/ui/menus.js', built), /repeated menu transform/);
});

// Execute the real transformed screen method as well as the small geometry
// helpers. This is a DOM/input contract test, not browser layout validation.
function screenFixture(initialTab = 0) {
  class Element extends EventTarget {
    constructor(tag, props = {}, ...children) {
      super();
      this.tagName = tag; this.dataset = {}; this.style = { setProperty() {} };
      this.children = children.flat(Infinity).filter(x => x && typeof x === 'object');
      this.scrollLeft = 0; this.scrollTop = 0; this.clientWidth = 300; this.scrollWidth = 600;
      this.className = props?.class || ''; const classes = new Set(this.className.split(' '));
      this.classList = { add: x => classes.add(x), remove: x => classes.delete(x), toggle: (x, state) => state ? classes.add(x) : classes.delete(x), contains: x => classes.has(x) };
      this.attributes = {};
    }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.children.push(child); }
    set innerHTML(value) { this.children = []; }
    get childElementCount() { return this.children.length; }
    setAttribute(name, value) { this.attributes[name] = value; }
    getBoundingClientRect() {
      const index = this.dataset.id?.startsWith('tab-') ? Number(this.dataset.id.slice(4)) : null;
      const offset = elements.find(el => el.className === 'iw-tabs')?.scrollLeft || 0;
      return index === null ? { left: 0, right: 300 } : { left: index * 120 - offset, right: (index + 1) * 120 - offset };
    }
    querySelector(selector) {
      const match = el => selector === '[data-nav]' ? el.dataset.nav : selector[0] === '.' && el.classList.contains(selector.slice(1));
      for (const child of this.children) { if (match(child)) return child; const result = child.querySelector(selector); if (result) return result; }
      return null;
    }
    querySelectorAll(selector) { const result = []; for (const child of this.children) { if (selector === '.iw-row' && child.classList.contains('iw-row')) result.push(child); result.push(...child.querySelectorAll(selector)); } return result; }
  }
  const elements = [], h = (tag, props, ...children) => { const el = new Element(tag, props, ...children); elements.push(el); return el; };
  const SETTINGS_TABS = Array.from({ length: 5 }, (_, i) => ({ id: String(i), label: 'Tab ' + i, icon: 'test', rows: [{ key: i === 0 ? '_layout' : 'value' + i, type: i === 0 ? 'link' : 'toggle', label: 'Row ' + i, help: 'Help ' + i }] }));
  const source = process.env.LANDSCAPE_SETTINGS_COMPOSED_SOURCE ? fs.readFileSync(process.env.LANDSCAPE_SETTINGS_COMPOSED_SOURCE, 'utf8') : built;
  const start = source.indexOf('  _scr_settings() {'), end = source.indexOf('\n  // ================================================================ SCREEN: howto', start);
  const Menu = vm.runInNewContext(`class Menu {${source.slice(start, end)}}; Menu`, {
    h, SETTINGS_TABS, GLYPHS: { test: '', check: '', reset: '', next: '' }, DEFAULT_SETTINGS: {}, TAB_BLURB: Object.fromEntries(SETTINGS_TABS.map(t => [t.id, t.label])),
    tr: x => x, tu: x => x, restartAnim() {}, padGlyph: () => '', safeCall: fn => fn(), setTimeout() {}, clearTimeout() {},
    createPreview: () => ({ el: h('div'), set() {} }), QUALITY: {}, TEAM_PALETTES: [], COLORBLIND_PALETTE: {}, DIFF_INFO: {}, MATCH: {},
    createPreviewRetirement: () => ({ retire() {}, destroy() {} }), clearPreviewRoot() {}, window: new EventTarget(),
  });
  const m = new Menu(), binds = new Map(); let edits = 0;
  m._input = 'touch'; m._settingsTab = initialTab; m.api = { editTouchLayout() { edits++; } };
  m._settings = () => ({}); m._diffs = () => ({}); m._sfx = () => {}; m._hint = () => '';
  m._bind = (el, options) => { el.dataset.id = options.id; el.dataset.nav = options.type; binds.set(options.id, { el, ...options }); };
  m._toggle = () => ({ el: h('span'), accept() {} });
  m._btn = ({ id, accept }) => { const el = h('button', {}, h('span', { class: 'iw-btn__label' })); binds.set(id, { el, accept }); return el; };
  m._panel = (className, ...children) => h('div', { class: className }, ...children);
  m._header = () => h('header');
  m._prompts = () => h('div', { class: 'iw-prompts' }, h('span'), h('span', {}, h('span', { class: 'iw-padg' })));
  const screen = m._scr_settings();
  const strip = elements.find(el => el.className === 'iw-tabs');
  m._setFocus = el => { m._focus = el; screen.onFocus(el); };
  return { m, binds, screen, strip, get edits() { return edits; } };
}

test('real screen restores last tab, keyboard selection, touch accept and layout edit action', () => {
  const f = screenFixture(4);
  f.screen.afterMount();
  assert.equal(f.strip.scrollLeft, 300);
  assert.equal(f.binds.get('tab-4').el.attributes['aria-pressed'], 'true');
  f.m._setFocus(f.binds.get('tab-4').el);
  assert.equal(f.screen.onNav('tab_prev'), true);
  assert.equal(f.m._settingsTab, 3);
  assert.equal(f.binds.get('tab-3').el.attributes['aria-pressed'], 'true');
  // Same accept handler is used by touch, click and menu accept.
  f.binds.get('tab-0').accept();
  assert.equal(f.strip.scrollLeft, 0);
  assert.equal(f.m._settingsTab, 0);
  assert.equal(f.binds.get('tab-0').el.attributes['aria-pressed'], 'true');
  f.binds.get('set-_layout').accept();
  assert.equal(f.edits, 1);
  f.binds.get('tab-4').accept();
  f.strip.scrollLeft = 0; // user swipes away, then accepts the still-focused tab
  f.binds.get('tab-4').accept();
  assert.equal(f.strip.scrollLeft, 300);
  assert.equal(f.m._settingsTab, 4);
});
