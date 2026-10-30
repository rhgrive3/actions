import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {adaptBuildSource} from '../inkwave-source-composition.mjs';
const raw=fs.readFileSync(new URL('../../inkwave-public/src/ui/menus.js',import.meta.url),'utf8');
const built=adaptBuildSource('src/ui/menus.js',raw);
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
    get lastChild(){ return this.children.at(-1); }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.children.push(child); }
    set innerHTML(value) { this.children = []; }
    get childElementCount() { return this.children.length; }
    setAttribute(name, value) { this.attributes[name] = value; }
    closest(){return null;}
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
  const timers=new Map();let timerId=0;const writes=[];
  const elements = [], h = (tag, props, ...children) => { const el = new Element(tag, props, ...children); elements.push(el); return el; };
  const SETTINGS_TABS = Array.from({ length: 5 }, (_, i) => ({ id: String(i), label: 'Tab ' + i, icon: 'test', rows: [{ key: i === 0 ? '_layout' : 'value' + i, type: i === 0 ? 'link' : 'toggle', label: 'Row ' + i, help: 'Help ' + i }] }));
  const source = process.env.LANDSCAPE_SETTINGS_COMPOSED_SOURCE ? fs.readFileSync(process.env.LANDSCAPE_SETTINGS_COMPOSED_SOURCE, 'utf8') : built;
  const start = source.indexOf('  _scr_settings() {'), end = source.indexOf('\n  // ================================================================ SCREEN: howto', start);
  const Menu = vm.runInNewContext(`class Menu {${source.slice(start, end)}}; Menu`, {
    h, SETTINGS_TABS, GLYPHS: { test: '', check: '', reset: '', next: '' }, DEFAULT_SETTINGS: {value1:true}, TAB_BLURB: Object.fromEntries(SETTINGS_TABS.map(t => [t.id, t.label])),
    tr: x => x, tu: x => x, restartAnim() {}, padGlyph: () => '', safeCall: fn => fn(), setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);},
    createPreview: () => ({ el: h('div'), set() {} }), QUALITY: {}, TEAM_PALETTES: [], COLORBLIND_PALETTE: {}, DIFF_INFO: {}, MATCH: {},
    createPreviewRetirement: () => ({ retire() {}, destroy() {} }), clearPreviewRoot() {},legacyPadToS3:x=>x, window: new EventTarget(),
  });
  const bindStart=built.indexOf('  _bind(el, opts = {}) {'),bindEnd=built.indexOf('\n  /** Pointer micro-interactions:',bindStart);
  const NativeBind=vm.runInNewContext(`class NativeBind {${built.slice(bindStart,bindEnd)}};NativeBind`);
  const m = new Menu(), binds = new Map(); m._binds=new Map(); let edits = 0;
  m._input = 'touch'; m._settingsTab = initialTab; m.api = {editTouchLayout(){edits++;},setSettings(value){writes.push(value);}};
  m._accentExternal=true; m._settings = () => ({}); m._diffs = () => ({}); m._sfx = () => {}; m._hint = () => '';
  m._bind = (el, options) => { NativeBind.prototype._bind.call(m,el,options); binds.set(options.id, { el, ...options }); };
  m._toggle = () => ({ el: h('span'), accept() {}, refresh(){} });
  m._btn = ({ id, accept }) => { const el = h('button', {}, h('span', { class: 'iw-btn__label' })); m._bind(el,{id,accept}); return el; };
  m._panel = (className, ...children) => h('div', { class: className }, ...children);
  m._header = () => h('header');
  m._prompts = () => h('div', { class: 'iw-prompts' }, h('span'), h('span', {}, h('span', { class: 'iw-padg' })));
  const screen = m._scr_settings();
  const strip = elements.find(el => el.className === 'iw-tabs');
  m._setFocus = el => { m._focus = el; screen.onFocus(el); };
  return { m, binds, screen, strip, writes,timers,clickReset:()=>binds.get('reset').el.dispatchEvent(new Event('click')), get edits() { return edits; } };
}

test('settings Reset needs a second press and expires without changing data',()=>{const f=screenFixture();const reset=f.binds.get('reset');f.clickReset();assert.equal(f.writes.length,0);assert.equal(reset.el.querySelector('.iw-btn__label').textContent,'PRESS AGAIN TO CONFIRM');f.screen.tick(2.7);assert.equal(f.writes.length,0);assert.equal(reset.el.querySelector('.iw-btn__label').textContent,'RESET TO DEFAULTS');f.clickReset();assert.equal(f.writes.length,0);f.clickReset();assert.equal(f.writes.length,1);assert.equal(f.writes[0].value1,true);assert.equal(f.timers.size,1);f.screen.destroy();assert.equal(f.timers.size,0);});
test('leaving settings after arming Reset revokes its detached delayed accept',()=>{const f=screenFixture();const reset=f.binds.get('reset');f.clickReset();f.screen.destroy();f.clickReset();assert.equal(f.writes.length,0,'retired settings screen reset data');assert.equal(f.timers.size,0);});
test('a detached Reset cannot re-arm itself after settings is closed',()=>{const f=screenFixture();const reset=f.binds.get('reset');f.screen.destroy();f.clickReset();f.clickReset();assert.equal(f.writes.length,0);});
