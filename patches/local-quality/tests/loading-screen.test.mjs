import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptLoadingScreen, zevantWordmark } from '../loading-screen-adapter.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { LOADING_ART_PRECACHE } from '../../loading-cache/adapter.mjs';

const read = (rel) => fs.readFileSync(new URL('../../../' + rel, import.meta.url), 'utf8');
const loadingScreen = (code) => code.slice(code.indexOf('  _scr_loading() {'), code.indexOf('  // ================================================================ SCREEN: title'));

test('native loading screen keeps its tick/label/tip owners and drops the splat logo', () => {
  const raw = read('inkwave-public/src/ui/menus.js');
  const scr = loadingScreen(adaptBuildSource('src/ui/menus.js', raw));
  assert.match(scr, /const fill = h\('i', \{ class: 'iw-zl__fill' \}\);/);
  assert.match(scr, /const pctEl = h\('span', \{ class: 'iw-zl__pct' \}, '0%'\);/);
  assert.match(scr, /const label = h\('div', \{ class: 'iw-zl__label' \}, this\._loading\.label\);/);
  assert.match(scr, /const tipText = h\('div', \{ class: 'iw-tip__text' \}\);/);
  assert.match(scr, /h\('div', \{ class: 'iw-screen iw-loading iw-zl' \}/);
  assert.match(scr, /'aria-label': GAME_TITLE/);
  assert.ok(scr.includes(JSON.stringify(zevantWordmark('zvl'))));
  assert.doesNotMatch(scr, /logoMarkup|GAME_SUBTITLE|iw-bgblob/);
  // The (localized) version line survives verbatim apart from its entrance class.
  assert.match(scr, /h\('div', \{ class: 'iw-corner iw-corner--br' \}, tu\(`v\$\{this\._version\(\)\}`\)\)\);/);
  // tick() / setLabel() / setTip() are untouched.
  for (const owner of ["fill.style.transform = `translateX(${(-100 + p * 100).toFixed(2)}%)`", 'pctEl.textContent = pr', 'label.textContent = t', 'tipText.innerHTML = richText']) {
    assert.ok(scr.includes(owner), owner);
  }
  const once = adaptLoadingScreen('src/ui/menus.js', raw);
  assert.throws(() => adaptLoadingScreen('src/ui/menus.js', once), /loading screen layout/);
});

test('logo subtitle is removed everywhere the logo is drawn', () => {
  const config = adaptBuildSource('src/config.js', read('inkwave-public/src/config.js'));
  assert.match(config, /export const GAME_SUBTITLE = '';/);
  assert.match(config, /export const GAME_TITLE = 'ZEVANT';/);
});

test('loading stylesheet is appended once and only animates compositor properties', () => {
  const raw = read('inkwave-public/styles/ui.css');
  const out = adaptLoadingScreen('styles/ui.css', raw);
  assert.ok(out.startsWith(raw));
  assert.throws(() => adaptLoadingScreen('styles/ui.css', out), /applied twice/);
  const added = out.slice(raw.length);
  for (const [, body] of added.matchAll(/@keyframes iw-zl-[\w-]+ \{([^@]*?)\}\n/g)) {
    for (const [, prop] of body.matchAll(/([a-z-]+):/g)) assert.ok(['transform', 'opacity'].includes(prop), prop);
  }
  assert.match(added, /prefers-reduced-motion: reduce/);
  assert.equal(adaptLoadingScreen('src/game/match.js', 'match=1;'), 'match=1;');
});

test('boot shell shows the same ZEVANT wordmark and classes as the native screen', () => {
  const css = adaptBuildSource('styles/ui.css', read('inkwave-public/styles/ui.css'));
  const shell = read('patches/loading-cache/shell.html');
  assert.doesNotMatch(shell, /INKWAVE(?![_-])|Turf Riot|TURF RIOT/);
  assert.ok(shell.includes('<h1 class="iw-zl__mark" aria-label="ZEVANT">' + zevantWordmark('zvs') + '</h1>'));
  for (const cls of ['iw-zl__art', 'iw-zl__shade', 'iw-zl__beam', 'iw-zl__c--tl', 'iw-zl__status', 'iw-zl__rule', 'iw-zl__label', 'iw-zl__bar', 'iw-zl__fill', 'iw-zl__shine']) {
    assert.ok(shell.includes(cls), cls);
    assert.ok(css.includes('.' + cls), cls);
  }
  // Arena backdrop is a locally hosted WebP resolved relative to styles/ui.css.
  assert.match(css, /url\('\.\.\/patches\/local-quality\/assets\/loading\/arena\.webp'\)/);
  const art = fs.readFileSync(new URL('../assets/loading/arena.webp', import.meta.url));
  assert.equal(art.subarray(8, 12).toString(), 'WEBP');
  assert.ok(art.length < 250000, 'compressed backdrop');
  // First launch: the shell preloads it and the offline precache carries it.
  assert.equal(LOADING_ART_PRECACHE, 'patches/local-quality/assets/loading/arena.webp');
  assert.ok(shell.includes('<link rel="preload" href="' + LOADING_ART_PRECACHE + '" as="image"'));
  assert.match(read('patches/loading-cache/adapter.mjs'), /'patches\/splatoon3\/profile\.json',LOADING_ART_PRECACHE,/);
  // Distinct gradient ids: the hidden shell's defs must not be what the native screen paints with.
  assert.notEqual(zevantWordmark('zvs'), zevantWordmark('zvl'));
});
