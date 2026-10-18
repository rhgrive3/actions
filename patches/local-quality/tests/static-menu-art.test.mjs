import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { qualityIdentity, replaceOnce } from '../adapter.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { adaptWeaponOpponentPreview } from '../../splatoon3/weapon-opponent-preview-adapter.mjs';
import { adaptStaticMenuArt } from '../static-menu-adapter.mjs';
const STATIC_MENU_SCREENS = ['main', 'mode', 'setup', 'loadout', 'locker', 'settings', 'howto', 'credits', 'online'];

const fromRepo = path => fs.readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');
const rawGame = fromRepo('inkwave-public/src/main.js');
const rawStyle = fromRepo('inkwave-public/styles/ui.css');
const game = adaptBuildSource('src/main.js', rawGame);
const rawMenus = fromRepo('inkwave-public/src/ui/menus.js');
const menus = adaptBuildSource('src/ui/menus.js', rawMenus);
const css = adaptBuildSource('styles/ui.css', rawStyle);

function framePrefix(code) {
  const from = code.indexOf('  _frame(dt) {');
  const to = code.indexOf('    const tA = performance.now();', from);
  assert.ok(from >= 0 && to > from, 'game preserves original frame entry');
  return code.slice(from + '  _frame(dt) {'.length, to);
}

function runGate(screen, overrides = {}) {
  const calls = [];
  const G = { mode: overrides.mode || 'menu', time: 5, net: { update: dt => calls.push('net') } };
  const menus = { current: screen, _scr: { name: screen }, update: dt => calls.push('menu') };
  if (overrides.mismatch) menus.current = 'main';
  const showcase = { _pq: overrides.portrait ? [{}] : [], _portraitStep: () => calls.push('portrait') };
  const gameState = {
    menus,
    showcase,
    match: { attract: overrides.attract ?? true },
    input: { pollPad: () => calls.push('pad'), endFrame: () => calls.push('end') },
    _padMenus: () => calls.push('navigation'),
  };
  const gate = new Function('G', 'INKWAVE_ART_MENU_SCREENS',
    'return function(dt) {' + framePrefix(game) + '\nthrow new Error("full-world-frame");\n}')(
    G, new Set(STATIC_MENU_SCREENS));
  let full = false;
  try { gate.call(gameState, 1 / 60); } catch (e) {
    if (e.message !== 'full-world-frame') throw e;
    full = true;
  }
  return { calls, full, game: gameState, G };
}

test('title -> main and weapon/locker panels show still art with zero attract updates or screen render', () => {
  for (const name of STATIC_MENU_SCREENS) {
    const out = runGate(name);
    assert.equal(out.full, false, name);
    assert.deepEqual(out.calls, ['pad', 'navigation', 'net', 'menu', 'end'], name);
    assert.equal(out.G.time, 5 + 1 / 60, name);
  }
});

test('requested portrait previews retain on-demand offscreen generation, not a continuous render', () => {
  const requested = runGate('locker', { portrait: true });
  assert.deepEqual(requested.calls, ['pad', 'navigation', 'net', 'portrait', 'menu', 'end']);
  assert.equal(runGate('locker').calls.includes('portrait'), false);
});

test('title, real match, room, pause and results preserve the original 3D/game frame', () => {
  for (const screen of ['loading', 'title', 'lobby', 'pause', 'results', null]) {
    const r = runGate(screen);
    assert.equal(r.full, true, String(screen));
    assert.deepEqual(r.calls, [], String(screen));
  }
  assert.equal(runGate('main', { attract: false }).full, true, 'real match');
  assert.equal(runGate('main', { mode: 'match' }).full, true, 'match startup');
  assert.equal(runGate('locker', { mismatch: true }).full, true, 'wiped screen is not yet mounted');
});

test('static screens do not construct hidden 3D loadout, locker or Online hub showcases', () => {
  assert.match(rawGame, /if \(s === 'loadout'\) this\.showcase\.showLoadout\(/);
  assert.doesNotMatch(game, /if \(s === 'loadout'\) this\.showcase\.showLoadout\(/);
  assert.match(game, /if \(s === 'loadout'\) this\.showcase\.hide\(\);/);
  assert.match(rawMenus, /if \(sc && sc\.showHub\)/);
  assert.match(rawMenus, /if \(sc && sc\.showLocker\)/);
  assert.doesNotMatch(menus, /if \(sc && sc\.showHub\)/);
  assert.doesNotMatch(menus, /if \(sc && sc\.showLocker\)/);
  assert.equal((menus.match(/if \(sc\) safeCall\(\(\) => sc\.hide\?\.\(\)\);/g) || []).length, 2);
  assert.match(menus, /if \(sc && sc\.showLobby\)/, 'actual network room still has its showcase');
  assert.match(menus, /this\._portraitInto\(lookAv, \{ kind: 'head', size: 128 \}\)/);
});

test('CSS maps exactly three generated locally hosted WebP backgrounds to the correct menu screens', () => {
  assert.equal((css.match(/INKWAVE generated static menu backdrops/g) || []).length, 1);
  for (const name of ['weapon', 'lobby', 'locker']) {
    const url = `../patches/local-quality/assets/menu/${name}.webp`;
    assert.match(css, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    const file = new URL('../assets/menu/' + name + '.webp', import.meta.url);
    const bytes = fs.readFileSync(file);
    assert.equal(bytes.subarray(0, 4).toString(), 'RIFF', name);
    assert.equal(bytes.subarray(8, 12).toString(), 'WEBP', name);
    assert.ok(bytes.length < 250000, 'mobile image compressed: ' + name);
    assert.ok(qualityIdentity()['assets/menu/' + name + '.webp'], name + ' has a build identity');
  }
  assert.ok(css.includes('data-screen="main"'));
  assert.ok(css.includes('data-screen="loadout"'));
  assert.ok(css.includes('data-screen="locker"'));
  for (const screen of ['title', 'lobby', 'pause', 'results', 'loading']) {
    assert.equal(css.includes('data-screen="' + screen + '"'), false, screen + ' stays unchanged');
  }
  assert.match(css, /background-size: cover/);
  assert.ok(qualityIdentity()['static-menu-adapter.mjs']);
});

test('source transform is strict, idempotence fails closed, and unrelated source is unchanged', () => {
  const preview = adaptWeaponOpponentPreview('src/main.js', rawGame);
  const changed = adaptStaticMenuArt('src/main.js', preview, replaceOnce);
  assert.match(changed, /INKWAVE_ART_MENU_SCREENS/);
  assert.throws(() => adaptStaticMenuArt('src/main.js', changed, replaceOnce), /expected exactly one connection/);
  const changedStyle = adaptStaticMenuArt('styles/ui.css', rawStyle, replaceOnce);
  assert.throws(() => adaptStaticMenuArt('styles/ui.css', changedStyle, replaceOnce), /applied twice/);
  assert.equal(adaptStaticMenuArt('src/game/match.js', 'match=1;', replaceOnce), 'match=1;');
});