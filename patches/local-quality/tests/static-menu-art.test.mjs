import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { qualityIdentity, replaceOnce, adaptQualitySource } from '../adapter.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { adaptWeaponOpponentPreview } from '../../splatoon3/weapon-opponent-preview-adapter.mjs';
import { adaptStaticMenuArt } from '../static-menu-adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
const STATIC_MENU_SCREENS = ['main', 'mode', 'setup', 'loadout', 'locker', 'settings', 'howto', 'credits', 'online'];

const fromRepo = path => fs.readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');
const rawGame = fromRepo('inkwave-public/src/main.js');
const rawStyle = fromRepo('inkwave-public/styles/ui.css');
const game = adaptBuildSource('src/main.js', rawGame);
const rawMenus = fromRepo('inkwave-public/src/ui/menus.js');
const menus = adaptBuildSource('src/ui/menus.js', rawMenus);
const css = adaptBuildSource('styles/ui.css', rawStyle);

function checkedStaticMenuCss(code) {
  const marker = '/* INKWAVE generated static menu backdrops: no live attract/composer rendering. */';
  const start = code.indexOf(marker);
  assert.ok(start >= 0, 'generated menu CSS has its ownership marker');
  assert.equal(code.lastIndexOf(marker), start, 'one generated menu CSS block');
  const inherited = code.slice(0, start), generated = code.slice(start);
  for (const screen of ['title', 'lobby', 'pause', 'results', 'loading']) {
    assert.equal(generated.includes('data-screen="' + screen + '"'), false, screen + ' stays unchanged');
  }
  // Online room cursors and toast rules already belong to the native sheet;
  // they must survive, even though the new background block excludes lobby.
  const lobbyRules = rawStyle.match(/[^{}]*\[data-screen="lobby"\][^{]*\{[^{}]*\}/g);
  assert.ok(lobbyRules?.length, 'native sheet contains actual online-room rules');
  for (const rule of lobbyRules) assert.ok(inherited.includes(rule.trim()), 'existing lobby CSS remains intact');
  return generated;
}

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
  if (overrides.mismatch) menus.current = overrides.mismatch;
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

test('only the locker draws its art and live pedestal kid into the canvas', () => {
  const draw = (screen) => {
    const G = { mode: 'menu', time: 0, renderer: {} }, calls = [];
    const menus = { current: screen, _scr: { name: screen }, update: () => calls.push('menu') };
    const owner = { menus, showcase: { _pq: [] }, match: { attract: true }, input: { pollPad() {}, endFrame: () => calls.push('end') }, _padMenus() {} };
    const gate = new Function('G', 'INKWAVE_ART_MENU_SCREENS', 'renderInkwaveLockerStage',
      'return function(dt) {' + framePrefix(game) + '\nthrow new Error("full-world-frame");\n}')(
      G, new Set(STATIC_MENU_SCREENS), (who, g, dt) => calls.push(['stage', who === owner, g === G, dt]));
    gate.call(owner, 1 / 60);
    return calls;
  };
  assert.deepEqual(draw('locker'), [['stage', true, true, 1 / 60], 'menu', 'end']);
  for (const name of STATIC_MENU_SCREENS.filter((s) => s !== 'locker')) assert.deepEqual(draw(name), ['menu', 'end'], name);
  assert.match(game, /import \{ renderLockerStage as renderInkwaveLockerStage \} from '\.\.\/patches\/local-quality\/locker-stage\.mjs';/);
  assert.ok(qualityIdentity()['locker-stage.mjs']);
});

test('title, real match, room, pause and results preserve the original 3D/game frame', () => {
  for (const screen of ['loading', 'title', 'lobby', 'pause', 'results', null]) {
    const r = runGate(screen);
    assert.equal(r.full, true, String(screen));
    assert.deepEqual(r.calls, [], String(screen));
  }
  assert.equal(runGate('main', { attract: false }).full, true, 'real match');
  assert.equal(runGate('main', { mode: 'match' }).full, true, 'match startup');
  for (const from of ['loading', 'title', 'lobby']) {
    assert.equal(runGate(from, { mismatch: 'main' }).full, true, from + ' stays drawn until the wipe swaps in the art');
  }
  assert.equal(runGate('main', { mismatch: 'lobby' }).full, true, 'room set takes over as soon as it is current');
});

test('a wipe between two art screens never draws the demo world in between', () => {
  for (const [from, to] of [['main', 'settings'], ['settings', 'main'], ['main', 'locker'], ['locker', 'main'], ['setup', 'loadout']]) {
    const r = runGate(from, { mismatch: to });
    assert.equal(r.full, false, from + ' -> ' + to);
  }
});

test('the demo canvas is hidden behind art screens and shown again before any world frame', () => {
  const frame = (screen, owner) => {
    const canvas = { style: { visibility: '' } };
    const G = { mode: 'menu', time: 0, renderer: { domElement: canvas } };
    const self = owner || { showcase: { _pq: [] }, match: { attract: true }, input: { pollPad() {}, endFrame() {} }, _padMenus() {} };
    self.menus = { current: screen, _scr: { name: screen }, update() {} };
    const gate = new Function('G', 'INKWAVE_ART_MENU_SCREENS', 'renderInkwaveLockerStage',
      'return function(dt) {' + framePrefix(game) + '\nthrow new Error("full-world-frame");\n}')(
      G, new Set(STATIC_MENU_SCREENS), () => {});
    let full = false;
    try { gate.call(self, 1 / 60); } catch (e) { if (e.message !== 'full-world-frame') throw e; full = true; }
    return { self, canvas, full };
  };
  const settings = frame('settings');
  assert.equal(settings.canvas.style.visibility, 'hidden');
  assert.equal(frame('locker').canvas.style.visibility, '', 'locker draws its pedestal kid into the canvas');
  // the next real 3D frame (title, room, match) unhides before it renders
  const title = frame('title', settings.self);
  assert.equal(title.full, true);
  assert.equal(title.canvas.style.visibility, '');
  assert.equal(settings.self._artCanvasHidden, false);
});

test('static screens do not construct hidden 3D loadout or Online hub showcases', () => {
  assert.match(rawGame, /if \(s === 'loadout'\) this\.showcase\.showLoadout\(/);
  assert.doesNotMatch(game, /if \(s === 'loadout'\) this\.showcase\.showLoadout\(/);
  assert.match(game, /if \(s === 'loadout'\) this\.showcase\.hide\(\);/);
  assert.match(rawMenus, /if \(sc && sc\.showHub\)/);
  assert.doesNotMatch(menus, /if \(sc && sc\.showHub\)/);
  assert.match(menus, /if \(sc && sc\.showLocker\)/, 'locker keeps its visible pedestal kid');
  assert.equal((menus.match(/if \(sc\) safeCall\(\(\) => sc\.hide\?\.\(\)\);/g) || []).length, 1);
  assert.match(menus, /if \(sc && sc\.showLobby\)/, 'actual network room still has its showcase');
  assert.match(menus, /this\._portraitInto\(lookAv, \{ kind: 'head', size: 128 \}\)/);
});

test('CSS maps exactly three generated locally hosted WebP backgrounds to the correct menu screens', () => {
  assert.equal((css.match(/INKWAVE generated static menu backdrops/g) || []).length, 1);
  const generated = checkedStaticMenuCss(css);
  for (const name of ['weapon', 'lobby', 'locker']) {
    const url = `../patches/local-quality/assets/menu/${name}.webp`;
    // The locker image is drawn under the canvas kid by locker-stage.mjs instead.
    if (name === 'locker') assert.ok(!generated.includes(url) && fromRepo('patches/local-quality/locker-stage.mjs').includes("'./assets/menu/locker.webp'"));
    else assert.match(generated, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    const file = new URL('../assets/menu/' + name + '.webp', import.meta.url);
    const bytes = fs.readFileSync(file);
    assert.equal(bytes.subarray(0, 4).toString(), 'RIFF', name);
    assert.equal(bytes.subarray(8, 12).toString(), 'WEBP', name);
    assert.ok(bytes.length < 250000, 'mobile image compressed: ' + name);
    assert.ok(qualityIdentity()['assets/menu/' + name + '.webp'], name + ' has a build identity');
  }
  assert.ok(generated.includes('data-screen="main"'));
  assert.ok(generated.includes('data-screen="loadout"'));
  assert.ok(generated.includes('data-screen="locker"'));
  assert.match(generated, /background-size: cover/);
  const blurOff = generated.match(/\.iw-ui\.is-active:is\(([^)]*)\) \* \{\n  -webkit-backdrop-filter: none;\n  backdrop-filter: none;\n\}/);
  assert.ok(blurOff, 'art screens drop the per-frame backdrop blur');
  assert.deepEqual(blurOff[1].match(/data-screen="([a-z]+)"/g).map((x) => x.slice(13, -1)), STATIC_MENU_SCREENS);
  assert.ok(qualityIdentity()['static-menu-adapter.mjs']);
});

test('hidden HUD loops, leaving stage pickers and the picker backdrop drift stop compositing', () => {
  const generated = checkedStaticMenuCss(css);
  const paused = generated.match(/\n([^{}]*)\{\n  animation-play-state: paused !important;\n\}/);
  assert.ok(paused, 'one paused-animation rule');
  const selectors = paused[1].split('*/').pop().split(/,\s*(?![^()]*\))/).map((s) => s.trim());
  for (const s of ['.iw-hud.is-hidden', '.iw-hud.is-hidden *', '.iw-screen.is-leaving:is(.iw-ss, .iw-modesel) *']) {
    assert.ok(selectors.includes(s), s);
  }
  // Screens whose own leave animation runs on descendants (news, modals) keep it.
  assert.ok(selectors.every((s) => s.startsWith('.iw-hud.is-hidden') || s.startsWith('.iw-screen.is-leaving:is(.iw-ss, .iw-modesel) ')), selectors.join(' | '));
  assert.match(generated, /\.iw-ui\.is-active:is\(\[data-screen="mode"\], \[data-screen="setup"\]\) \.iw-ss__bgimg \{\n  animation: none;\n\}/);
  // Touch pause (and screens opened from it) drop the per-frame blur over the re-presented arena.
  assert.match(generated, /:is\(html\.iw-touch \.iw-ui, \.iw-ui\.is-touch\)\.is-ingame \* \{\n  -webkit-backdrop-filter: none;\n  backdrop-filter: none;\n\}/);
  assert.match(rawStyle, /\.iw-pause__dim \{[^}]*backdrop-filter: blur\(7px\)/, 'desktop pause keeps its blur');
  // The HUD is only paused while hidden: the in-match rules are untouched.
  assert.match(rawStyle, /\.iw-hud\.is-hidden \{ opacity: 0; visibility: hidden;/);
  assert.match(rawStyle, /\.iw-ss__bgimg \{[^}]*animation: iw-ss-drift 26s/);
});

test('CSS ownership rejects a new static lobby background and loss of existing room rules', () => {
  const injected = css + '\n.iw-ui.is-active[data-screen="lobby"] { background-image: url("lobby.webp"); }';
  assert.throws(() => checkedStaticMenuCss(injected), /lobby stays unchanged/);
  const nativeToast = rawStyle.match(/\.iw-ui\[data-screen="lobby"\] \.iw-toasts \{[^{}]*\}/)?.[0];
  assert.ok(nativeToast, 'negative control removes a real native room rule');
  const missingRoomRule = css.replace(nativeToast, '');
  assert.notEqual(missingRoomRule, css);
  assert.throws(() => checkedStaticMenuCss(missingRoomRule), /existing lobby CSS remains intact/);
});

test('source transform is strict, idempotence fails closed, and unrelated source is unchanged', () => {
  // Range owns the attract noBots expression and depends on installGame from
  // S3. Apply its real production predecessors before the final static pass.
  let preview = rawGame;
  for (const adapt of [adaptSource, adaptTouchLayout, adaptReliability, adaptQualitySource, adaptNetworkSource, adaptRange, adaptWeaponOpponentPreview])
    preview = adapt('src/main.js', preview);
  const changed = adaptStaticMenuArt('src/main.js', preview, replaceOnce);
  assert.match(changed, /INKWAVE_ART_MENU_SCREENS/);
  assert.throws(() => adaptStaticMenuArt('src/main.js', changed, replaceOnce), /expected exactly one connection/);
  const changedStyle = adaptStaticMenuArt('styles/ui.css', rawStyle, replaceOnce);
  assert.throws(() => adaptStaticMenuArt('styles/ui.css', changedStyle, replaceOnce), /applied twice/);
  assert.equal(adaptStaticMenuArt('src/game/match.js', 'match=1;', replaceOnce), 'match=1;');
});
