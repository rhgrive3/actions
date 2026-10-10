import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptWeaponCatalog } from '../weapon-catalog-adapter.mjs';

const ROOT = new URL('../../../', import.meta.url);
const source = rel => fs.readFileSync(new URL(`inkwave-public/${rel}`, ROOT), 'utf8');

test('catalog IDs resolve to existing character and icon visual families', () => {
  const character = adaptWeaponCatalog('src/game/character.js', source('src/game/character.js'));
  assert.ok(character.includes("import { PLAYER, WEAPONS } from '../config.js';"));
  const familyLookup = 'kind = WEAPONS[kind]?.modelKind || WEAPONS[kind]?.kind || kind;';
  assert.ok(character.indexOf(familyLookup) < character.indexOf('if (!HOLD[kind])'), 'resolve catalog ID before checking HOLD families');

  const icons = adaptWeaponCatalog('src/ui/ui-icons.js', source('src/ui/ui-icons.js'));
  assert.ok(icons.includes('export const WEAPON_ICONS = {'), 'preserve the shared icon family map export');
  assert.ok(icons.includes("import { WEAPONS } from '../config.js';"));
  const start = icons.indexOf('export const weaponIcon = ');
  const end = icons.indexOf('\n};', start);
  assert.ok(start >= 0 && end > start, 'adapted weaponIcon helper is present');
  const weaponIcon = new Function('WEAPONS', 'WEAPON_ICONS', `${icons.slice(start, end + 3).replace('export const', 'const')}; return weaponIcon;`)(
    { catalog: { modelKind: 'roller' }, byKind: { kind: 'charger' }, direct: {} },
    { shooter: 's', roller: 'r', charger: 'c' },
  );
  assert.equal(weaponIcon('catalog'), 'r', 'modelKind takes precedence');
  assert.equal(weaponIcon('byKind'), 'c', 'kind is the family fallback');
  assert.equal(weaponIcon('roller'), 'r', 'existing family keys still work');
  assert.equal(weaponIcon('unknown'), 's', 'unknown IDs keep the established shooter fallback');
});

test('main passes an existing icon family to the unchanged mobile fire-icon lookup', () => {
  const mobileSource = source('src/core/mobile.js');
  const mobile = adaptWeaponCatalog('src/core/mobile.js', mobileSource);
  assert.equal(mobile, mobileSource, 'mobile.js remains independent of config.js');
  assert.ok(!mobile.includes("import { WEAPONS } from '../config.js';"));
  assert.ok(mobile.includes("WEAPON_ICONS[weapon] || WEAPON_ICONS.shooter"), 'mobile keeps its original family-key lookup');

  const main = adaptWeaponCatalog('src/main.js', source('src/main.js'));
  const connection = main.match(/this\.input\.mobile\?\.setHud\(\{[^\n]*weapon: ([^,]+), specialId:/);
  assert.ok(connection, 'main-to-mobile weapon field is present');
  const resolveMobileWeapon = new Function('w', 'a', `return ${connection[1]};`);
  assert.equal(resolveMobileWeapon({ kind: 'catalog', modelKind: 'roller' }, { weaponId: 'catalog-id' }), 'roller');
  assert.equal(resolveMobileWeapon({ kind: 'shooter' }, { weaponId: 'shooter' }), 'shooter');
  const icons = { shooter: 's', roller: 'r' };
  assert.equal(icons[resolveMobileWeapon({ kind: 'catalog', modelKind: 'roller' }, { weaponId: 'catalog-id' })], 'r');
});

test('reference weapon names are applied in the selected language', () => {
  const adapted = adaptWeaponCatalog('src/i18n.js', source('src/i18n.js'));
  assert.ok(adapted.includes("const lang = isJa ? 'ja' : 'en';"));
  const start = adapted.indexOf('export function localizeData() {');
  const end = adapted.indexOf('\n}\nlocalizeData();', start);
  assert.ok(start >= 0 && end > start, 'adapted localizeData function is present');
  const declaration = adapted.slice(start, end + 2).replace('export function', 'function');
  const makeLocalizer = new Function(
    'WEAPONS', 'SUB', 'SPECIALS', 'MAPS', 'DIFFICULTY', 'TEAM_PALETTES', 'COLORBLIND_PALETTE', 'TEAM_NAMES', 'isJa', 'LOOK',
    `let localized = false;
     const DATA_JA = { weapons: {}, sub: {}, specials: {}, maps: {}, difficulty: {}, palette: {}, look: {}, presets: {} };
     ${declaration}
     return localizeData;`,
  );
  const applyNames = isJa => {
    const weapons = {
      catalog: { name: 'placeholder', referenceNames: { en: 'English fixture', ja: 'Japanese fixture' } },
      legacy: { name: 'existing name' },
    };
    const localize = makeLocalizer(weapons, {}, {}, [], {}, [], {}, [], isJa, {});
    localize();
    return weapons;
  };
  assert.equal(applyNames(false).catalog.name, 'English fixture');
  assert.equal(applyNames(true).catalog.name, 'Japanese fixture');
  assert.equal(applyNames(false).legacy.name, 'existing name', 'entries without reference names are preserved');
});

test('catalog adapter fails closed when a required source anchor is missing or duplicated', () => {
  const original = source('src/game/character.js');
  assert.throws(() => adaptWeaponCatalog('src/game/character.js', original.replace("import { PLAYER } from '../config.js';", '')),
    /expected one exact connection/);
  const importAnchor = "import { PLAYER } from '../config.js';";
  assert.throws(() => adaptWeaponCatalog('src/game/character.js', `${original}\n${importAnchor}`),
    /expected one exact connection/);
});

test('bot, player, and HUD decisions use temporary catalog behavior families', () => {
  const helper = (code, name) => {
    const match = code.match(new RegExp(`const ${name} = \\(weapon\\) => \\{[\\s\\S]*?\\n\\};`));
    assert.ok(match, `${name} helper is present`);
    return new Function(`${match[0]}; return ${name};`)();
  };
  const localKind = (code, receiver, ending) => {
    const start = code.indexOf(`const family = ${receiver}?.behaviorKind`);
    const end = code.indexOf(ending, start);
    assert.ok(start >= 0 && end > start, `${receiver} behavior-family decision is local to its source section`);
    const declaration = code.slice(start, end + ending.length);
    return new Function(receiver, `${declaration}; return kind;`);
  };
  const bots = adaptWeaponCatalog('src/game/bots.js', source('src/game/bots.js'));
  const botKind = helper(bots, 'botBehaviorKind');
  assert.ok(!bots.includes('w.kind'), 'every bot weapon-kind decision uses the compatibility helper');
  assert.ok(bots.includes("botBehaviorKind(this.a.weapon) === 'charger'"), 'boss target selection also reads behaviorKind');

  const player = adaptWeaponCatalog('src/game/player.js', source('src/game/player.js'));
  const playerViews = [...player.matchAll(/const w = \(a\.weapon\?\.behaviorKind \|\| a\.weapon\?\.kind === 'catalog'\) \? \{[\s\S]*?\} : a\.weapon;/g)].map(m => m[0]);
  assert.equal(playerViews.length, 2, 'aim-assist and range checks read a local behavior-family view without mutating the weapon');
  const playerView = new Function('a', `${playerViews[0]}; return w;`);
  assert.equal(player.split('w.kind').length - 1, 4, 'preserve downstream adapter anchors in the range checks');

  const hud = adaptWeaponCatalog('src/ui/hud.js', source('src/ui/hud.js'));
  assert.ok(hud.includes('WEAPONS[w].modelKind || WEAPONS[w].kind'), 'weapon badges keep using their model family');
  assert.ok(!hud.includes('weaponBehaviorKind'), 'the extracted reticle method has no external catalog helper dependency');
  const hudKind = localKind(hud, 'W', ': family || w;');

  const main = adaptWeaponCatalog('src/main.js', source('src/main.js'));
  assert.ok(!main.includes('weaponBehaviorKind'), 'the extracted HUD update method has no external catalog helper dependency');
  const mainKind = localKind(main, 'w', ': family || w.kind;');
  assert.ok(main.includes('weapon: w.modelKind || w.kind || a.weaponId'), 'mobile receives the existing icon family');

  const cases = [
    [{ kind: 'catalog', behaviorKind: 'stringer', modelKind: 'charger' }, 'charger'],
    [{ kind: 'catalog', behaviorKind: 'splatana', modelKind: 'shooter' }, 'charger'],
    [{ kind: 'catalog', behaviorKind: 'brush', modelKind: 'roller' }, 'roller'],
    [{ kind: 'catalog', behaviorKind: 'brella', modelKind: 'shooter' }, 'shooter'],
    [{ kind: 'catalog', behaviorKind: 'splatling', modelKind: 'splatling' }, 'splatling'],
    [{ kind: 'catalog', modelKind: 'roller' }, 'roller'],
    [{ kind: 'dualies' }, 'dualies'],
  ];
  for (const [weapon, expected] of cases) {
    assert.equal(botKind(weapon), expected);
    assert.equal(playerView({ weapon }).kind, expected);
    assert.equal(hudKind(weapon, 'shooter'), expected);
    assert.equal(mainKind(weapon), expected);
  }
  assert.equal(playerView({ weapon: cases.at(-1)[0] }), cases.at(-1)[0], 'legacy weapon objects are not copied');
  assert.equal(adaptWeaponCatalog('src/game/weapon-runtime.js', 'fixture'), 'fixture', 'the catalog runtime is outside this adapter');
});

test('weapon menus and showcase route catalog IDs through modelKind', () => {
  const menus = adaptWeaponCatalog('src/ui/menus.js', source('src/ui/menus.js'));
  assert.equal(menus.split('weaponIcon(W.id || lo.weapon)').length - 1, 5);
  assert.equal(menus.split('weaponIcon(w.id || id)').length - 1, 2);
  for (const stale of [
    'weaponIcon(W.kind || lo.weapon)', 'weaponIcon(w.kind || id)',
    'weaponIcon((W && W.kind)', 'weaponIcon(W?.kind',
    'weaponIcon((this._weapons()[p.weapon] || {}).kind',
  ]) assert.ok(!menus.includes(stale), `menu icon no longer receives a kind: ${stale}`);
  assert.ok(menus.includes('weaponIcon((W && W.id) || tag.weapon)'));
  assert.ok(menus.includes('weaponIcon(W?.id || p.weapon)'));
  assert.ok(menus.includes('(this._weapons()[p.weapon] || {}).id || p.weapon'));

  const showcase = adaptWeaponCatalog('src/game/showcase.js', source('src/game/showcase.js'));
  const start = showcase.indexOf('const weaponKind = (id) =>');
  const end = showcase.indexOf(';', start);
  assert.ok(start >= 0 && end > start, 'showcase weaponKind helper is present');
  const weaponKind = new Function('WEAPONS', `${showcase.slice(start, end + 1)}; return weaponKind;`)({
    catalog: { kind: 'catalog', modelKind: 'charger' },
    legacy: { kind: 'roller' },
  });
  assert.equal(weaponKind('catalog'), 'charger', 'catalog modelKind takes precedence');
  assert.equal(weaponKind('legacy'), 'roller', 'legacy kind remains the fallback');
  assert.equal(weaponKind('unknown'), 'unknown');
});

test('menu and showcase family anchors fail closed on source drift', () => {
  const menus = source('src/ui/menus.js');
  assert.throws(() => adaptWeaponCatalog('src/ui/menus.js', menus.replace('weaponIcon(W.kind || lo.weapon)', '')),
    /expected 5 connections/);
  const showcase = source('src/game/showcase.js');
  const anchor = "const weaponKind = (id) => (WEAPONS[id] && WEAPONS[id].kind) || id || 'shooter';";
  assert.throws(() => adaptWeaponCatalog('src/game/showcase.js', showcase.replace(anchor, '')),
    /expected one exact connection/);
  assert.throws(() => adaptWeaponCatalog('src/game/showcase.js', `${showcase}\n${anchor}`),
    /expected one exact connection/);
});
