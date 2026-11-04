import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { adaptUiFeedback20261104 } from '../ui-feedback-20261104-adapter.mjs';
import { replaceOnce } from '../adapter.mjs';

const ROOT = new URL('../../../', import.meta.url);
const read = rel => fs.readFileSync(new URL('inkwave-public/' + rel, ROOT), 'utf8');
const menus = adaptBuildSource('src/ui/menus.js', read('src/ui/menus.js'));

test('owner feedback composes once into the production menu, icons, results and audio', () => {
  assert.match(menus, /ZEVANT owner feedback 20261104/);
  assert.throws(() => adaptUiFeedback20261104('src/ui/menus.js', menus, replaceOnce), /applied twice/);
  assert.doesNotMatch(menus, /^      desc,$/m, 'the main-menu description is not mounted');
  assert.match(menus, /iw-screen iw-main iw-main--tiles/);
  const icons = adaptBuildSource('src/ui/ui-icons.js', read('src/ui/ui-icons.js'));
  for (const family of ['splatana', 'brush', 'stringer', 'brella']) assert.match(icons, new RegExp('WEAPON_ICONS\\.' + family + ' = svg'));
  const main = adaptBuildSource('src/main.js', read('src/main.js'));
  assert.match(main, /preloadFile\?\.\(won \? 'results_win' : 'results_lose'\)/);
  assert.match(main, /this\._playMusic\(won \? 'results_win' : 'results_lose', 0\.35\)/);
  const audio = adaptBuildSource('src/audio/audio.js', read('src/audio/audio.js'));
  assert.match(audio, /def\('clam_pickup', \{ gain: 0\.24, max: 3, jitter: 0/);
  const css = adaptBuildSource('styles/ui.css', read('styles/ui.css'));
  for (const hidden of ['.iw-main__desc', '.iw-mode__blurb', '.iw-ss__blurb', '.iw-native-unavailable']) assert.ok(css.includes(hidden), hidden);
  assert.match(css, /mask: url\("data:image\/svg\+xml/);
});

test('weapon list order groups classes and keeps base kits before their variants', () => {
  const start = menus.indexOf('  _weaponOrder() {'), end = menus.indexOf('\n  }', start) + 4;
  const Menu = vm.runInNewContext('class M {' + menus.slice(start, end) + '}; M', { WEAPON_ORDER: [] });
  const W = {
    shooter: { kind: 'shooter' }, 'shooter-01': { kind: 'shooter' }, dualies: { kind: 'dualies' }, roller: { kind: 'roller' },
    'saber': { kind: 'catalog', catalogRecord: { family: 'splatana' } }, 'brush': { kind: 'catalog', catalogRecord: { family: 'brush' } },
    'blaster2': { kind: 'catalog', catalogRecord: { family: 'blaster' } }, 'shooter2': { kind: 'catalog', catalogRecord: { family: 'shooter' } },
  };
  const m = new Menu();
  m.api = { weaponOrder: ['shooter', 'shooter-01', 'dualies', 'roller', 'saber', 'brush', 'blaster2', 'shooter2'] };
  m._weapons = () => W;
  assert.deepEqual([...m._weaponOrder()], ['shooter', 'shooter-01', 'shooter2', 'blaster2', 'roller', 'brush', 'dualies', 'saber']);
  assert.equal(m._weaponOrder(), m._weaponOrder(), 'cached while the registry is unchanged');
  m.api.weaponOrder.push('later');
  assert.equal(m._weaponOrder().at(-1), 'later', 'unknown classes stay last and a grown registry re-sorts');
});
