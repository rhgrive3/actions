import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {test} from 'node:test';
import {adaptLandscapeWeaponDrawer} from '../landscape-weapon-drawer-adapter.mjs';

const root = process.env.INKWAVE_TEST_ROOT || fileURLToPath(new URL('../../../',import.meta.url));
const raw = rel => fs.readFileSync(path.join(root,'inkwave-public',rel),'utf8');

test('proposal adds only one full-name attribute to the separate lobby drawer owner', () => {
  const before = raw('src/ui/menus.js'), after = adaptLandscapeWeaponDrawer('src/ui/menus.js',before);
  assert.equal(after.split("'aria-label': w.name").length-before.split("'aria-label': w.name").length,1);
  assert.equal(after.replace(", 'aria-label': w.name",''),before);
  assert.throws(()=>adaptLandscapeWeaponDrawer('src/ui/menus.js',after),/expected one lobby card/);
});

test('drawer-only landscape CSS beats later touch sheet while preserving its fonts, art, frame and actions', () => {
  const before = raw('styles/ui.css'), after = adaptLandscapeWeaponDrawer('styles/ui.css',before), css = after.slice(before.length);
  assert(after.startsWith(before));
  assert.match(css,/@media \(orientation: landscape\) and \(max-width: 1200px\)/);
  assert.match(css,/\.iw-ldr \.iw-ldr__grid \{/);
  assert.match(css,/minmax\(min\(136px, 100%\), 1fr\)/);
  assert.match(css,/word-break: normal; line-break: strict/);
  assert.match(css,/overflow-wrap: break-word; overflow: visible/);
  assert.match(css,/-webkit-line-clamp: unset; line-clamp: unset/);
  assert.match(css,/flex: 1 0 40px; min-height: 40px/);
  assert(!/font(?:-size|-family)?:|box-shadow:|background:|color:|display: none|\.iwr-|\.iw-loadout/.test(css));
  const mobile = raw('styles/mobile.css');
  assert(mobile.includes(':is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-ldr__grid {'));
  // Shared :is() prefix, then an additional .iw-ldr owner wins over the later stylesheet.
  assert(css.includes(':is(html.iw-touch .iw-ui, .iw-ui.is-touch) .iw-ldr .iw-ldr__grid {'));
  assert.throws(()=>adaptLandscapeWeaponDrawer('styles/ui.css',after),/repeated CSS/);
  for(const rel of ['styles/mobile.css','src/config.js','patches/practice-range/styles/range.css']) assert.equal(adaptLandscapeWeaponDrawer(rel,'unchanged'),'unchanged');
});

test('production composition emits the drawer fix once without changing modal selection lifecycle', async () => {
  const {adaptBuildSource} = await import(pathToFileURL(path.join(root,'scripts/inkwave-source-composition.mjs')));
  const after = adaptBuildSource('src/ui/menus.js',raw('src/ui/menus.js'));
  const drawerOwners = after.match(/const c = h\('button', \{ class: 'iw-wcard iw-rowin'[^\n]+/g) || [];
  assert.equal(drawerOwners.length,1,'exactly one lobby drawer card owner');
  assert.equal(drawerOwners[0].split("'aria-label': w.name").length-1,1,'complete accessible name on the drawer owner');
  assert.match(after,/id: 'lw-' \+ id, accept:/);
  assert.match(after,/net && net\.setMe\(\{ weapon: id \}\)/);
  assert.match(after,/if \(this\._modal === drawer\) this\._closeModal\(true\)/);
  const css = adaptBuildSource('styles/ui.css',raw('styles/ui.css'));
  assert(css.includes('Short landscape weapon catalogue: readable names, not clipped rows.'));
  assert.equal(css.split('Landscape lobby weapon drawer: preserve complete readable names.').length-1,1);
});
