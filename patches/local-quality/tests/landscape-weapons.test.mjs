import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {test} from 'node:test';
import vm from 'node:vm';
import {adaptLandscapeWeapons} from '../landscape-weapons-adapter.mjs';

const root = process.env.INKWAVE_TEST_ROOT || fileURLToPath(new URL('../../../', import.meta.url));
const marker = '/* Short landscape weapon catalogue: readable names, not clipped rows. */';
const source = rel => fs.readFileSync(path.join(root, 'inkwave-public', rel), 'utf8');

test('only the primary catalogue card gains its complete localized accessible name', () => {
  const before = source('src/ui/menus.js');
  const after = adaptLandscapeWeapons('src/ui/menus.js', before);
  assert.equal(after.split("'aria-label': w.name").length - 1, 1);
  assert.equal(after.replace(", 'aria-label': w.name", ''), before);
  assert.throws(() => adaptLandscapeWeapons('src/ui/menus.js', after), /expected one primary/);
  assert.throws(() => adaptLandscapeWeapons('src/ui/menus.js', ''), /expected one primary/);
});

test('CSS is additive, touch-loadout-only and landscape-gated; other screens and portrait stay unchanged', () => {
  const before = source('styles/ui.css');
  const after = adaptLandscapeWeapons('styles/ui.css', before);
  assert(after.startsWith(before));
  const addition = after.slice(before.length);
  assert.equal(addition.split(marker).length - 1, 1);
  assert.equal((addition.match(/@media/g) || []).length, 2);
  assert.equal((addition.match(/@media \(orientation: landscape\) and \(max-width: 1200px\)/g) || []).length, 2);
  assert.match(addition, /and \(max-height: 500px\)/);
  // Every selector is inside the landscape media blocks and belongs to loadout.
  for (const line of addition.split('\n').filter(line => line.trim().startsWith(':is('))) {
    assert.match(line, /html\.iw-touch \.iw-ui, \.iw-ui\.is-touch/);
    assert.match(line, /\.iw-(?:screen\.)?iw-loadout|\.iw-loadout/);
  }
  assert.throws(() => adaptLandscapeWeapons('styles/ui.css', after), /repeated stylesheet/);
  for (const rel of ['styles/mobile.css', 'src/ui/ui-icons.js', 'src/config.js']) {
    assert.equal(adaptLandscapeWeapons(rel, 'original'), 'original');
  }
});

test('long Japanese/English labels have no clamp, ellipsis or fixed name/card height', () => {
  const css = adaptLandscapeWeapons('styles/ui.css', '');
  assert.match(css, /minmax\(min\(136px, 100%\), 1fr\)/);
  assert.match(css, /min-height: 3\.6em/);
  assert.match(css, /font-size: 14px !important; line-height: 1\.2/);
  assert.match(css, /word-break: normal; line-break: strict/);
  assert.match(css, /overflow-wrap: break-word; overflow: visible; text-overflow: clip/);
  assert.match(css, /-webkit-line-clamp: unset; line-clamp: unset/);
  assert.match(css, /min-height: 132px; height: auto/);
  assert(!css.includes('text-overflow: ellipsis'));
});

test('focus frame fits the grid gutter and short-phone header retains section/count DOM', () => {
  const css = adaptLandscapeWeapons('styles/ui.css', '');
  assert.match(css, /gap: 14px; padding: 8px/);
  assert.match(css, /0 0 0 6px rgba\(var\(--a-rgb\),\.5\)/);
  assert.match(css, /\.iw-wcard\.is-focus \{\s*transform: none/);
  assert(!css.includes('display: none'));
  assert.match(css, /iw-head__titles \{ padding-right: 120px/);
});

test('grid sizing beats the later splatoon3 stylesheet in real production CSS order', () => {
  const prefix = ':is(html.iw-touch .iw-ui, .iw-ui.is-touch)';
  const baselineSelector = prefix + ' .iw-loadout .iw-loadout__body .iw-wgrid.s3-wgrid';
  const candidateSelector = prefix + ' .iw-screen.iw-loadout .iw-loadout__body .iw-wgrid.s3-wgrid';
  const laterSheet = fs.readFileSync(path.join(root, 'patches/splatoon3/ui.css'), 'utf8');
  assert(laterSheet.includes(baselineSelector + ' {'));
  const css = adaptLandscapeWeapons('styles/ui.css', '');
  assert(css.includes(candidateSelector + ' {'));
  // The :is() prefix is identical, so the one additional .iw-screen class
  // deterministically wins even though splatoon3/ui.css is loaded last.
  const classCount = selector => (selector.match(/\.[\w-]+/g) || []).length;
  assert(classCount(candidateSelector) > classCount(baselineSelector));
});

test('actual catalogue category decorator keeps every entry reachable through all tabs and repeated cycles', async () => {
  const runtimeRoot = path.join(root, 'patches/splatoon3/runtime');
  const {MAIN_WEAPON_CATALOG} = await import(pathToFileURL(path.join(runtimeRoot, 'main-weapon-catalog-data.mjs')));
  const {ALTERNATE_WEAPON_KITS} = await import(pathToFileURL(path.join(runtimeRoot, 'alternate-weapon-kits-data.mjs')));
  const baseFamilies = new Map(MAIN_WEAPON_CATALOG.records.map(w => [w.id, w.family]));
  const entries = [...MAIN_WEAPON_CATALOG.records, ...ALTERNATE_WEAPON_KITS.map(w => ({...w, family: baseFamilies.get(w.baseId) || 'shooter'}))];
  class Element {
    constructor() {
      const classes = new Set();
      this.classList = {add: x => classes.add(x), contains: x => classes.has(x), toggle: (x, on) => on ? classes.add(x) : classes.delete(x)};
      this.dataset = {}; this.attributes = {}; this.children = []; this.events = {}; this.hidden = false;
    }
    append(...nodes) { this.children.push(...nodes); }
    setAttribute(k, v) { this.attributes[k] = v; }
    addEventListener(k, fn) { this.events[k] = fn; }
    scrollIntoView() { this.revealed = true; }
  }
  const cards = entries.map(w => {
    const c = new Element(); c._wid = w.id;
    c.querySelector = s => s === '.s3-wkit' ? {} : s === '.iw-wcard__kind' ? {textContent: w.family} : null;
    return c;
  });
  const W = Object.fromEntries(entries.map(w => [w.id, {class: w.family, name: w.names.ja}]));
  const grid = new Element(); grid.querySelectorAll = () => cards;
  let bar;
  const label = {after: el => { bar = el; }};
  const el = new Element(); el.querySelector = s => s === '.iw-wgrid' ? grid : label;
  const menus = {_focus: cards[0], _setFocus(c) { this._focus = c; }};
  const scr = {el};
  const runtime = fs.readFileSync(path.join(runtimeRoot, 'menu-layout.mjs'), 'utf8');
  const start = runtime.indexOf('function weaponCategory(');
  const end = runtime.indexOf('// Continuation buttons', start);
  const decorate = vm.runInNewContext(runtime.slice(start, end) + '; decorateLoadout;', {
    document: {createElement: () => new Element()}, L: (en, ja) => ja, keepInView() {},
  });
  decorate(menus, scr, {WEAPONS: W});
  assert(cards.length >= 160);
  assert.equal(bar.children.length, new Set(entries.map(w => w.family)).size + 1);
  for (const tab of bar.children) {
    grid.scrollTop = 500;
    tab.events.click(); tab.events.click();
    const visible = cards.filter(c => !c.hidden);
    assert.equal(visible.length, tab.dataset.cat === 'all' ? cards.length : entries.filter(w => w.family === tab.dataset.cat).length);
    assert(visible.length > 0);
    assert.equal(tab.attributes['aria-selected'], 'true');
    assert.equal(grid.scrollTop, 0);
    assert(!menus._focus.hidden);
    assert(cards.includes(visible.at(-1)), 'last entry remains the same real card, not a limited preview');
  }
  bar.children[0].events.click();
  for (let i = 0; i < bar.children.length * 2; i++) assert.equal(scr.onNav('tab_next'), true);
  assert.equal(cards.filter(c => !c.hidden).length, cards.length);
});

test('production composition emits the fix once and preserves catalogue art, filters and details', async () => {
  const {adaptBuildSource} = await import(pathToFileURL(path.join(root, 'scripts/inkwave-source-composition.mjs')));
  const css = adaptBuildSource('styles/ui.css', source('styles/ui.css'));
  const menus = adaptBuildSource('src/ui/menus.js', source('src/ui/menus.js'));
  assert.equal(css.split(marker).length - 1, 1, 'wire the adapter into production composition');
  assert.equal(menus.split("'aria-label': w.name").length - 1, 1);
  assert.match(menus, /weaponIcon\(w\.id \|\| id\)/, 'keep ID-to-family SVG binding');
  assert.match(menus, /const materializeArt = \(card\)/, 'preserve lazy art hydration');
  assert.match(menus, /class: 'iw-wd__name iw-display'/, 'detail panel is retained');
  assert.match(menus, /class: 'iw-seclabel__count'/, 'active/total count is retained');
  const runtime = fs.readFileSync(path.join(root, 'patches/splatoon3/runtime/menu-layout.mjs'), 'utf8');
  assert.match(runtime, /bar\.className = 's3-wfilter iw-in'/);
  assert.match(runtime, /const hidden = key !== 'all' && c\.dataset\.cat !== key/);
  assert.match(runtime, /if \(c\.hidden !== hidden\) c\.hidden = hidden/);
});
