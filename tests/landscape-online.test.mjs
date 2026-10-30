import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptLandscapeOnline, LANDSCAPE_ONLINE_CSS } from '../patches/local-quality/landscape-online-adapter.mjs';

const root = path.resolve(process.env.INKWAVE_SOURCE_ROOT || fileURLToPath(new URL('../', import.meta.url)));
const compose = process.env.INKWAVE_COMPOSED ? (await import(pathToFileURL(path.join(root, 'scripts/inkwave-source-composition.mjs')))).adaptBuildSource : null;
const rawSource = fs.readFileSync(path.join(root, 'inkwave-public/src/ui/menus.js'), 'utf8');
const source = compose ? compose('src/ui/menus.js', rawSource) : rawSource;
const method = source.slice(source.indexOf('  _scr_online() {'), source.indexOf('  // ================================================================ SCREEN: lobby'));
const rawCss = fs.readFileSync(path.join(root, 'inkwave-public/styles/ui.css'), 'utf8');
const css = compose ? compose('styles/ui.css', rawCss) : rawCss;

class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.style = {}; this.listeners = new Map(); this.value = ''; this.disabled = false; this._text = '';
    const classes = new Set();
    this.classList = { add: (...v) => v.forEach(x => classes.add(x)), remove: (...v) => v.forEach(x => classes.delete(x)), contains: x => classes.has(x), toggle: (x, force = !classes.has(x)) => { force ? classes.add(x) : classes.delete(x); return force; } };
  }
  set className(v) { this.classList.add(...String(v).split(/\s+/).filter(Boolean)); }
  get textContent() { return this._text + this.children.map(c => c.textContent ?? String(c)).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get firstChild() { return this.children[0]; }
  append(...children) { for (const c of children.flat(Infinity)) if (c != null) { this.children.push(c); if (typeof c === 'object') c.parentNode = this; } }
  insertBefore(child, before) { const i = this.children.indexOf(before); this.children.splice(i < 0 ? this.children.length : i, 0, child); child.parentNode = this; }
  addEventListener(name, fn) { const a = this.listeners.get(name) || []; a.push(fn); this.listeners.set(name, a); }
  removeEventListener(name, fn) { this.listeners.set(name, (this.listeners.get(name) || []).filter(f => f !== fn)); }
  dispatch(name, attrs = {}) { const e = { key: '', preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...attrs }; for (const fn of this.listeners.get(name) || []) fn(e); return e; }
  focus() { this.document.activeElement = this; this.dispatch('focus'); }
  blur() { if (this.document.activeElement === this) this.document.activeElement = null; }
}
function fixture() {
  const document = new Element(); document.activeElement = null;
  const h = (tag, attrs, ...children) => { const e = new Element(tag); e.document = document; for (const [k, v] of Object.entries(attrs || {})) { if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else e[k] = v; } e.append(...children); return e; };
  const timers = new Map(); let timerId = 0;
  const requests = [], pending = [], left = [], shows = [];
  const net = { join: (...args) => { requests.push(['join', ...args]); return new Promise((resolve, reject) => pending.push({ resolve, reject })); }, create: (...args) => { requests.push(['create', ...args]); return new Promise((resolve, reject) => pending.push({ resolve, reject })); }, leave: () => left.push(true) };
  const env = {
    document, navigator: { clipboard: { readText: async () => 'Join my room: BCEFG' } },
    tu: s => s, t: s => s, tr: s => s,
    h, clamp: (v, a, b) => Math.max(a, Math.min(b, v)), prefersReducedMotion: () => true,
    splatSVG: () => '', dripsSVG: () => '', weaponIcon: () => '', SQUID: '', G: {},
    GLYPHS: new Proxy({}, { get: () => '' }), CODE_ABC: 'BCEFGHJKLMNPQRTUVXYZ23456789',
    JOIN_ERR: { 'Room not found': { title: 'ROOM NOT FOUND', text: 'No room uses that code. Double-check it with your friend — rooms close when everyone leaves.', icon: 'question' } },
    fnv: () => 0, tagArt: () => '', tagTitle: () => '', tagNum: () => '', colorVars() {}, restartAnim() {}, safeCall: f => f(), touchPrimary: true,
    setTimeout: fn => { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
  };
  const api = {
    _input: 'touch', current: 'online', api: {}, _sc: () => null, _net: () => net,
    _fx() {}, _portraitInto() {}, _sfx() {}, _loadout: () => ({ weapon: 'shooter' }),
    _weapons: () => ({ shooter: { name: 'Splattershot', kind: 'shooter' } }), _profile: () => ({ name: 'Player', level: 1 }), _accent: () => ['#ff8a14'],
    _nameRow: () => { const row = h('div'); row._input = h('input'); row.append(row._input); return row; },
    _hint: () => h('span'), _prompts: rows => h('div', null, rows.map(() => h('span'))),
    _header: () => h('div', { class: 'iw-head' }),
    _bind: (el, binding) => { el.binding = binding; el.addEventListener('click', () => binding.accept('touch')); },
    _setFocus(el) { this._focus = el; }, _graphNav: () => false,
    _go(screen) { shows.push(screen); }, show(screen) { shows.push(screen); },
  };
  const screen = vm.runInNewContext(`({${method}})`, env)._scr_online.call(api);
  const find = cls => { const visit = e => e.classList?.contains(cls) ? e : e.children?.map(visit).find(Boolean); return visit(screen.el); };
  return { document, screen, api, requests, pending, left, shows, find, timers };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

// These are offline DOM/state tests, not browser geometry or real-room tests.
test('adapter only appends scoped CSS, stays idempotent and fails closed on changed anchors', () => {
  assert.equal(adaptLandscapeOnline('src/ui/menus.js', source), source);
  const adapted = adaptLandscapeOnline('styles/ui.css', css);
  assert.ok(adapted.startsWith(css)); assert.equal(adaptLandscapeOnline('styles/ui.css', adapted), adapted);
  assert.throws(() => adaptLandscapeOnline('styles/ui.css', ''), /anchors missing/);
  assert.match(LANDSCAPE_ONLINE_CSS, /@media \(orientation: landscape\) and \(max-height: 500px\)/);
  for (const selector of LANDSCAPE_ONLINE_CSS.matchAll(/([^{}]+)\{/g)) {
    if (selector[1].includes('@media')) continue;
    assert.ok(selector[1].includes('.iw-online'), selector[1]);
  }
  assert.doesNotMatch(LANDSCAPE_ONLINE_CSS, /(?:background|color|rotate|transform|scale):/);
  assert.match(LANDSCAPE_ONLINE_CSS, /grid-template-rows: auto minmax\(0, 1fr\)/);
  assert.match(LANDSCAPE_ONLINE_CSS, /\.iw-online\.iw-screen > \.iw-head\s*\{\s*margin-bottom: 0/);
  assert.match(LANDSCAPE_ONLINE_CSS, /min-height: 0;[\s\S]*overflow-y: auto/);
  assert.match(LANDSCAPE_ONLINE_CSS, /\.iw-code-input\s*\{\s*min-height: 44px;\s*height: 44px/);
  for (const [w, height, affected] of [[844,390,true],[740,360,true],[812,375,true],[896,414,true],[1133,744,false],[1090,700,false],[390,844,false]]) {
    assert.equal(w > height && height <= 500, affected, `${w}x${height} landscape media applicability`);
  }
});

test('touch native input sanitizes, edits/backspaces, and Enter submits once while busy', async () => {
  const f = fixture(), input = f.find('iw-code-input'), join = f.find('iw-hubcard--join');
  input.focus(); input.value = 'b0c1ewfG'; input.dispatch('input'); assert.equal(input.value, 'BCEFG');
  assert.equal(f.requests.length, 0, 'native touch input must not auto-join');
  input.value = 'BCEF'; input.dispatch('input'); assert.equal(input.value, 'BCEF');
  input.dispatch('keydown', { key: 'Enter' }); assert.equal(f.requests.length, 0, 'incomplete input cannot submit');
  input.value = 'BCEFG'; input.dispatch('input'); input.dispatch('keydown', { key: 'Enter' });
  assert.deepEqual(f.requests[0], ['join', 'BCEFG', 'Player']); assert.equal(input.disabled, true);
  input.dispatch('keydown', { key: 'Enter' }); assert.equal(f.requests.length, 1);
  f.pending[0].reject(new Error('Room not found')); await flush();
  assert.equal(input.disabled, false); assert.ok(join.classList.contains('is-err')); assert.ok(f.find('iw-jstat').classList.contains('is-on'));
  assert.match(f.find('iw-jstat__txt').textContent, /ROOM NOT FOUND/);
  input.value = 'BCE'; input.dispatch('input'); assert.ok(!join.classList.contains('is-err')); assert.ok(!f.find('iw-jstat').classList.contains('is-on'));
  input.dispatch('keydown', { key: 'Escape' }); assert.equal(join.dataset.mode, 'idle');
  f.screen.destroy();
});

test('touch paste and paste button populate without auto-joining; cancel ignores late rejection', async () => {
  const f = fixture(), input = f.find('iw-code-input'), buttons = f.find('iw-join__btns').children;
  const event = input.dispatch('paste', { clipboardData: { getData: () => 'Join my room: bcefg' } });
  assert.equal(event.defaultPrevented, true); assert.equal(input.value, 'BCEFG'); assert.equal(f.requests.length, 0);
  buttons[0].dispatch('click'); await flush(); assert.equal(input.value, 'BCEFG'); assert.equal(f.requests.length, 0);
  buttons[1].dispatch('click'); assert.equal(input.disabled, true); assert.equal(buttons[1].firstChild.textContent, 'CANCEL');
  buttons[1].dispatch('click'); assert.equal(input.disabled, false); assert.equal(f.left.length, 1); assert.equal(buttons[1].firstChild.textContent, 'JOIN');
  f.pending[0].reject(new Error('Room not found')); await flush();
  assert.equal(f.find('iw-hubcard--join').dataset.mode, 'entry'); assert.ok(!f.find('iw-jstat').classList.contains('is-on'));
  f.screen.destroy();
});

test('create stays available; keyboard entry, error recovery, repeated open/back preserve lifecycle', async () => {
  for (let i = 0; i < 3; i++) {
    const f = fixture(); assert.equal(f.document.listeners.get('paste').length, 1);
    f.find('iw-hubcard--create').dispatch('click'); assert.equal(f.requests[0][0], 'create');
    assert.ok(f.find('iw-hubcard--create').classList.contains('is-busy'));
    f.pending[0].reject(new Error('Could not connect')); await flush();
    assert.ok(f.find('iw-hubcard--create').classList.contains('is-err')); assert.ok(!f.find('iw-hubcard--create').classList.contains('is-busy'));
    assert.match(f.find('iw-hubcard__status').textContent, /Could not connect/);
    f.screen.onInputMode('kbm');
    for (const key of 'BCEFG') assert.equal(f.screen.onKey({ key }), true);
    assert.equal(f.find('iw-code-input').value, 'BCEFG');
    f.screen.onKey({ key: 'Backspace' }); assert.equal(f.find('iw-code-input').value, 'BCEF');
    f.screen.onKey({ key: 'g' }); f.screen.onKey({ key: 'Enter' }); assert.equal(f.requests[1][0], 'join');
    f.screen.destroy(); assert.equal(f.document.listeners.get('paste').length, 0);
    f.pending[1].reject(new Error('Room not found')); await flush(); assert.deepEqual(f.shows, []);
  }
});
