import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
// Exercise the actual module and native lifecycle methods with a minimal DOM.
// i18n and icon exports are presentation-only stubs; no browser or game boot.
const source = fs.readFileSync(new URL('../runtime/menu-layout.mjs', import.meta.url), 'utf8');
const native = fs.readFileSync(new URL('../../../inkwave-public/src/ui/menus.js', import.meta.url), 'utf8');
const methods = ['_setFocus', '_swap'].map(name => {
  const start = native.indexOf('  ' + name + '(');
  assert.notEqual(start, -1, `native ${name} method must exist`);
  const end = native.indexOf('\n  }', start);
  assert.notEqual(end, -1, `native ${name} method must terminate`);
  return native.slice(start, end + 4);
}).join('\n');
function element() {
  const classes = new Set();
  return {
    dataset: {}, children: [], handlers: {}, hidden: false,
    style: { getPropertyValue() { return ''; }, setProperty() {} },
    classList: { add: (...xs) => xs.forEach(x => classes.add(x)), remove: (...xs) => xs.forEach(x => classes.delete(x)),
      contains: x => classes.has(x), toggle(x, on = !classes.has(x)) { on ? classes.add(x) : classes.delete(x); return on; } },
    querySelector() { return null; }, querySelectorAll() { return []; },
    append(...xs) { this.children.push(...xs); }, appendChild(x) { this.children.push(x); },
    before() {}, setAttribute(k, v) { this[k] = v; },
    addEventListener(k, f) { this.handlers[k] = f; }, scrollIntoView() {},
    getBoundingClientRect() { return { top: 0, bottom: 20, height: 20 }; },
  };
}
async function fixture() {
  const context = vm.createContext({ document: { createElement: element }, console,
    getComputedStyle: () => ({ borderTopLeftRadius: '0' }), setTimeout: () => 0,
    CSS: { escape: x => x }, safeCall: f => f() });
  const mod = new vm.SourceTextModule(source, { context });
  await mod.link(async spec => new vm.SyntheticModule(spec.includes('i18n') ? ['isJa', 't'] : ['GLYPHS'], function () {
    if (spec.includes('i18n')) { this.setExport('isJa', false); this.setExport('t', x => x); }
    else this.setExport('GLYPHS', {});
  }, { context }));
  await mod.evaluate();
  const screens = [];
  function makeScreen(equipped = 0) {
    const cards = Array.from({ length: 12 }, (_, i) => Object.assign(element(), { _wid: 'w' + i,
      querySelector(s) { return s === '.s3-wkit' ? {} : null; } }));
    cards[equipped].classList.add('is-equipped');
    const grid = Object.assign(element(), { querySelectorAll: () => cards });
    let bar;
    grid.before = value => { bar = value; };
    const el = Object.assign(element(), { querySelector: s => s === '.iw-wgrid' ? grid : s.startsWith('[data-id=') ? cards[4] : null });
    const scr = { el, cards, grid, initial: cards[equipped], calls: [], destroyed: false,
      destroy() { this.destroyed = true; },
      onFocus(f) { assert.equal(scr.destroyed, false, 'never invoke destroyed screen hook'); scr.calls.push(f); },
      get bar() { return bar; } };
    screens.push(scr); return scr;
  }
  const Menus = vm.runInContext('(class Menus {' + methods + '})', context);
  Menus.prototype._scr_loadout = function () { return makeScreen(this.equipped ?? 0); };
  Menus.prototype._scr_other = function () { return makeScreen(2); };
  const api = { Menus, WEAPONS: Object.fromEntries(Array.from({ length: 12 }, (_, i) => ['w' + i, { class: i % 2 ? 'roller' : 'shooter', name: 'w' + i }])) };
  assert.equal(mod.namespace.installMenuLayout(api), true);
  assert.equal(mod.namespace.installMenuLayout(api), false, 'idempotent install');
  const menus = new Menus();
  Object.assign(menus, { _scr: makeScreen(), _focus: null, _cur: { on: false }, el: element(), layer: element(), _stack: [], _focusMem: {}, _sfx() {} });
  return { menus, screens };
}
test('construction initializes all categories without changing focus or invoking old hooks', async () => {
  const { menus } = await fixture(); const old = menus._scr; old.destroy();
  const scr = menus._scr_loadout();
  assert.equal(menus._focus, null); assert.equal(old.calls.length, 0); assert.equal(scr.calls.length, 0);
  assert.equal(scr.cards.filter(c => !c.hidden).length, 12);
  assert.equal(scr.bar.children[0]['aria-selected'], 'true');
});
test('native swap owns equipped initial focus and calls only new hook', async () => {
  const { menus } = await fixture(); const old = menus._scr; menus.equipped = 3;
  menus._swap('loadout', {});
  assert.equal(old.destroyed, true); assert.equal(old.calls.length, 0);
  assert.equal(menus._focus, menus._scr.cards[3]); assert.deepEqual(menus._scr.calls, [menus._scr.cards[3]]);
});
test('later keyboard and click filters repair hidden or absent focus and retain visible focus', async () => {
  const { menus } = await fixture(); menus._swap('loadout', {}); const scr = menus._scr;
  scr.onNav('tab_next'); assert.equal(menus._focus, scr.cards[0]); assert.equal(scr.calls.length, 1);
  scr.onNav('tab_next'); assert.equal(menus._focus, scr.cards[1]); assert.equal(scr.cards[0].hidden, true);
  assert.equal(scr.cards.filter(c => !c.hidden).length, 6);
  scr.bar.children[1].handlers.click(); assert.equal(menus._focus, scr.cards[0]);
  menus._setFocus(null); scr.bar.children[2].handlers.click(); assert.equal(menus._focus, scr.cards[1]);
});
test('repeated navigation and remembered return call no destroyed hook or duplicate initial callback', async () => {
  const { menus, screens } = await fixture();
  for (let i = 0; i < 12; i++) {
    menus._swap('loadout', {}); const scr = menus._scr;
    assert.equal(scr.calls.length, 1); scr.onNav('tab_next'); scr.onNav('tab_next');
    menus._swap('other', {}); assert.equal(scr.destroyed, true);
    menus._focusMem.loadout = 'w-w4'; menus._swap('loadout', { back: true });
    assert.equal(menus._focus, menus._scr.cards[4]); assert.equal(menus._scr.calls.length, 1);
    assert.equal(menus._scr.cards.filter(c => !c.hidden).length, 12);
  }
  assert.equal(screens.filter(s => !s.destroyed).length, 1);
});
