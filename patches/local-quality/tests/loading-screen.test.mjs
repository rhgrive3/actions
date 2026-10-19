import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptLoadingScreen, loadingArtMarquee, LOADING_ART_MARQUEE_REPEAT } from '../loading-screen-adapter.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const read = (rel) => fs.readFileSync(new URL('../../../' + rel, import.meta.url), 'utf8');

test('native loading screen gains one decorative art layer without text nodes', () => {
  const raw = read('inkwave-public/src/ui/menus.js');
  const out = adaptLoadingScreen('src/ui/menus.js', raw);
  assert.notEqual(out, raw);
  const scr = out.slice(out.indexOf('  _scr_loading() {'), out.indexOf('  // ================================================================ SCREEN: title'));
  assert.match(scr, /h\('div', \{ class: 'iw-load-art', 'aria-hidden': 'true' \}/);
  assert.match(scr, /h\('div', \{ class: 'iw-screen iw-loading' \}, blobs, art,/);
  assert.match(scr, new RegExp('`\\$\\{GAME_TITLE\\} • TURF RIOT • NOW LOADING • `\\.repeat\\(' + LOADING_ART_MARQUEE_REPEAT + '\\)'));
  // Band text lives in data-t (CSS content), keeping .iw-loading textContent unchanged.
  const art = scr.slice(scr.indexOf('const art'), scr.indexOf('const el'));
  assert.doesNotMatch(art, /h\('i', \{[^}]*\}, '/);
  assert.throws(() => adaptLoadingScreen('src/ui/menus.js', out), /loading screen art layer/);
});

test('loading art stylesheet is appended once and only animates compositor properties', () => {
  const raw = read('inkwave-public/styles/ui.css');
  const out = adaptLoadingScreen('styles/ui.css', raw);
  assert.ok(out.startsWith(raw));
  assert.throws(() => adaptLoadingScreen('styles/ui.css', out), /applied twice/);
  const added = out.slice(raw.length);
  for (const [, body] of added.matchAll(/@keyframes iw-load-[\w-]+ \{([^@]*?)\}\n/g)) {
    for (const [, prop] of body.matchAll(/([a-z-]+):/g)) assert.ok(['transform', 'opacity'].includes(prop), prop);
  }
  assert.match(added, /prefers-reduced-motion: reduce/);
  assert.equal(adaptLoadingScreen('src/game/match.js', 'match=1;'), 'match=1;');
});

test('production composition renames the marquee and keeps the shell on the same art classes', () => {
  const menus = adaptBuildSource('src/ui/menus.js', read('inkwave-public/src/ui/menus.js'));
  assert.equal(menus.split("class: 'iw-load-art'").length - 1, 1);
  const css = adaptBuildSource('styles/ui.css', read('inkwave-public/styles/ui.css'));
  assert.equal(css.split('.iw-load-art {').length - 1, 1);
  const shell = read('patches/loading-cache/shell.html');
  assert.doesNotMatch(shell, /INKWAVE(?![_-])/, 'no public INKWAVE text in the boot shell');
  assert.match(shell, /aria-label="ZEVANT"/);
  for (const cls of ['iw-load-art__rays', 'iw-load-art__flash', 'iw-load-art__streaks', 'iw-load-art__band--top', 'iw-load-art__band--bot']) {
    assert.ok(shell.includes(cls), cls);
    assert.ok(css.includes('.' + cls), cls);
  }
  assert.equal(shell.split(`data-t="${loadingArtMarquee('ZEVANT')}"`).length - 1, 2);
});
