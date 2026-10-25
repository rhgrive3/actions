import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptBuildSource } from '../inkwave-source-composition.mjs';
import { deferPrimaryWeaponIcon } from '../../patches/local-quality/static-menu-adapter.mjs';
import { createLazyComposerTarget } from '../../patches/local-quality/composer-target-adapter.mjs';

// Exercise the real production composer, including every earlier strict patch.
// A direct test of static-menu-adapter against unpatched upstream would miss
// the four-argument showcase and animation anchors owned by earlier layers.
const composed = (rel) => adaptBuildSource(rel,
  fs.readFileSync(new URL('../../inkwave-public/' + rel, import.meta.url), 'utf8'));

test('offline and network match exits do not build 8 unseen bots under static art', () => {
  const main = composed('src/main.js');
  assert.match(main, /_startAttract\(\) \{\n    this\._staticMenuAttract = !!arguments\[0\]\?\.staticMenu;/);
  assert.match(main, /noBots: this\._staticMenuAttract \|\| mapNoBots\(/);
  assert.match(main, /mannequins: !this\._staticMenuAttract && DEV_STAGE/);
  assert.equal((main.match(/this\._startAttract\(\{ staticMenu: true \}\)/g) || []).length, 3,
    'offline quit, online end and title-to-main should avoid invisible actor rigs');
  assert.match(main, /s === 'main' && this\.match\?\.attract && !this\._staticMenuAttract\) this\._startAttract\(\{ staticMenu: true \}\)/,
    'first title-to-main transition also retires the 8 idle GPU character rigs');
  assert.match(main, /s === 'title' && this\._staticMenuAttract\) this\._startAttract\(\)/,
    'opening the real animated title restores the demo characters');
  assert.match(main, /this\.R\?\.releasePausedFrame\?\.\(\)/);
  assert.match(main, /this\.R\?\.composer\?\.releaseInactiveTargets\?\.\(\)/);
  assert.match(main, /artScreen !== 'locker' && this\.showcase\?\._rt/,
    'only the visible locker keeps its offscreen showcase target');
  assert.match(main, /if \(artScreen === 'locker'.*renderInkwaveLockerStage/,
    'locker portrait remains an actual visible 3D render');
});

test('loadout retains all real selectable weapons while offscreen mobile SVGs are deferred', () => {
  const menus = composed('src/ui/menus.js');
  assert.match(menus, /const order = this\._weaponOrder\(\)\.filter\(\(id\) => Ws\[id\]\)/);
  assert.match(menus, /const cards = order\.map\(\(id, i\) => \{/);
  assert.match(menus, /lazyWeaponArt && i >= 20/);
  assert.match(menus, /h\('span', \{ class: 'iw-wcard__blob', html: deferArt \? ''/);
  assert.match(menus, /h\('span', \{ class: 'iw-wcard__icon', html: deferArt \? ''/);
  assert.match(menus, /new IntersectionObserver\(/);
  assert.match(menus, /root: el, rootMargin: '320px 0px'/, 'mobile catalogue uses scroll container as observer root');
  assert.match(menus, /materializeArt\(f\)/);
  assert.match(menus, /destroy: \(\) => weaponArtObserver\?\.disconnect\(\)/);
  assert.match(menus, /this\.api\.setLoadout && this\.api\.setLoadout\(\{ weapon: id \}\)/,
    'lazy art must not affect actual equipping');
  const css = composed('styles/ui.css');
  assert.match(css, /content-visibility: auto/);
  assert.match(css, /contain-intrinsic-size: auto 116px/);
  assert.match(css, /\.iw-wcard\[data-art-deferred="1"\]/);
});

test('one catalogue hydrator serves touch, pad and mouse while equip-only decoration stays lazy', () => {
  const menus = composed('src/ui/menus.js');
  assert.match(menus, /const lazyWeaponArt = n > 20 && typeof IntersectionObserver !== 'undefined';/);
  assert.match(menus, /html: deferArt \? '' : id === equipped \? splatSVG/);
  assert.match(menus, /materializeArt\(c\);\n        restartAnim\(c, 'is-pick'\);/);
  const start = menus.indexOf('    const materializeArt = (card) => {');
  const end = menus.indexOf('\n    let weaponArtObserver', start);
  assert.ok(start >= 0 && end > start);
  const hydrate = new Function('Ws', 'splatSVG', 'weaponIcon', menus.slice(start, end) + '\nreturn materializeArt;')(
    { test: { id: 'test' } }, opts => 'blob-' + opts.seed, id => 'icon-' + id);
  const card = (deferred, equipped) => {
    const blob = { firstChild: null }, icon = {};
    Object.defineProperty(blob, 'innerHTML', { set(value) { this.firstChild = { value }; } });
    return { _wid: 'test', _weaponArtIndex: 23, _artDeferred: deferred, dataset: { artDeferred: '1' },
      classList: { contains: () => equipped.value },
      querySelector: selector => selector.endsWith('__blob') ? blob : icon, blob, icon };
  };
  for (const deferred of [false, true]) {
    const equipped = { value: false }, c = card(deferred, equipped);
    hydrate(c);
    assert.equal(c.blob.firstChild, null, 'scroll/focus cannot allocate invisible equip decoration');
    if (deferred) assert.equal(c.icon.innerHTML, 'icon-test', 'deferred icon uses the composed catalogue ID');
    assert.equal(c._artDeferred, false);
    equipped.value = true;
    hydrate(c);
    const blob = c.blob.firstChild;
    assert.equal(blob.value, 'blob-109', 'equipping eagerly creates the identical seeded artwork');
    hydrate(c);
    assert.equal(c.blob.firstChild, blob, 'refocus/re-equip reuses existing art');
    equipped.value = false;
    hydrate(c);
    assert.equal(c.blob.firstChild, blob, 'old equip decoration survives the original shrinking transition');
  }
  hydrate(null);
});

test('lazy composer frees the native GPU targets once and rebuilds with the same passes', () => {
  const allocated = [];
  let releases = 0;
  const listeners = new Map();
  const doc = {
    visibilityState: 'visible',
    addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener(name) { listeners.delete(name); },
  };
  const proxy = createLazyComposerTarget(({ width, height, pixelRatio }) => {
    const native = {
      width, height, pixelRatio, passes: [], renders: 0,
      addPass(p) { this.passes.push(p); },
      render() { this.renders++; },
      setPixelRatio(v) { this.pixelRatio = v; },
      setSize(w, h) { this.width = w; this.height = h; },
      dispose() { releases++; },
    };
    allocated.push(native);
    return native;
  }, { width: 1280, height: 720, pixelRatio: 1, ownerDocument: doc });
  const passA = { id: 'scene' }, passB = { id: 'grade' };
  proxy.addPass(passA); proxy.addPass(passB);
  assert.equal(allocated.length, 0, 'menu must not reallocate the composer before a 3D frame');
  proxy.render();
  assert.equal(allocated.length, 1);
  assert.deepEqual(allocated[0].passes, [passA, passB]);
  proxy.releaseInactiveTargets();
  proxy.releaseInactiveTargets();
  assert.equal(releases, 1, 'repeating static-menu RAF must not repeatedly dispose');
  assert.equal(proxy.readBuffer, null);
  proxy.setPixelRatio(0.8); proxy.setSize(800, 600);
  assert.equal(allocated.length, 1, 'resizing a suspended menu must stay allocation-free');
  proxy.render();
  assert.equal(allocated.length, 2, 'return to title/battle lazily rebuilds the compositor');
  assert.equal(allocated[1].width, 800);
  assert.equal(allocated[1].height, 600);
  assert.equal(allocated[1].pixelRatio, 0.8);
  assert.deepEqual(allocated[1].passes, [passA, passB]);
  assert.equal(allocated[1].renders, 1);
  proxy.dispose();
  assert.equal(releases, 2);
  assert.equal(listeners.size, 0);
});

test('deferred weapon card uses the precise upstream-composed catalogue icon and fails closed on ambiguity', () => {
  const row = "        h('span', { class: 'iw-wcard__icon', html: weaponIcon(w.modelKind || w.kind || id) }),";
  const replace = (source, before, after) => {
    assert.equal(source.split(before).length, 2, 'one scoped icon owner');
    return source.replace(before, after);
  };
  const result = deferPrimaryWeaponIcon(row, replace);
  assert.match(result.grid, /html: deferArt \? '' : weaponIcon\(w\.modelKind \|\| w\.kind \|\| id\)/);
  assert.equal(result.hydration, 'weaponIcon(w.modelKind || w.kind || id)');
  assert.match(composed('src/ui/menus.js'), /const id = card\._wid, i = card\._weaponArtIndex, w = Ws\[id\];/);
  assert.throws(() => deferPrimaryWeaponIcon(row + '\n' + row, replace), /expected one/);
  assert.throws(() => deferPrimaryWeaponIcon('', replace), /expected one/);
});
