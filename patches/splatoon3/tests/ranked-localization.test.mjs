import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { objectiveText } from '../runtime/ranked/ui.mjs';
import { rankedText, RANKED_JA } from '../runtime/ranked/strings.mjs';

for (const lang of ['ja', 'en']) test(`composed game dictionary translates ranked menus in ${lang}`, async () => {
  const context = vm.createContext({ localStorage: { getItem: () => JSON.stringify({ lang }) } });
  const raw = readFileSync(new URL('../../../inkwave-public/src/i18n.js', import.meta.url), 'utf8');
  const module = new vm.SourceTextModule(adaptBuildSource('src/i18n.js', raw), { context });
  await module.link(spec => {
    const exports = spec.includes('config')
      ? { WEAPONS: {}, SUB: {}, SPECIALS: {}, MAPS: [], DIFFICULTY: {}, TEAM_PALETTES: [], COLORBLIND_PALETTE: {}, TEAM_NAMES: [] }
      : spec.includes('device') ? { touchPrimary: false } : {};
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  for (const source of ['SPLAT ZONES', 'TOWER CONTROL', 'RAINMAKER', 'CLAM BLITZ', 'BOSS BATTLE', 'RANKED', 'CHECKPOINTS', 'Choose a mode · you and the bots', 'TIME · LOWEST COUNT WINS']) {
    assert.equal(module.namespace.tx(source), lang === 'ja' ? RANKED_JA[source] : source);
  }
  assert.equal(module.namespace.t('PENALTY {n}', { n: 12 }), lang === 'ja' ? 'ペナルティ 12' : 'PENALTY 12');
});

test('live rule text uses Japanese templates, palette names and input values without translating player names', () => {
  const G = { palette: { names: ['オレンジ', 'ブルー'] }, match: {
    actors: [{ nid: 'p', name: 'Player <1>', team: 0 }], local: { nid: 'p', team: 0 },
  } };
  const api = { LANG: 'ja' };
  assert.equal(objectiveText({ mode: 'zones', frame: {}, rule: { state: { controllingTeam: 0 } } }, G, api), 'オレンジが全エリア確保中');
  assert.match(objectiveText({ mode: 'tower', stage: {}, rule: { state: { controllingTeam: 1, progress: 0.5 } } }, G, api), /ブルーのヤグラ/);
  assert.match(objectiveText({ mode: 'rainmaker', rule: { state: { carrier: 'p', holderRemaining: 23, charge: { value: 0.8 } } } }, G, api), /残り23秒 · Player <1> · チャージ80%/);
  assert.equal(objectiveText({ mode: 'clams', rule: { state: {
    inventories: { p: { team: 0, small: 3 } }, scoredPoints: [4, 0], baskets: [{ barrierOpen: true, openTimer: 8 }],
  } } }, G, api), 'アサリ 3/8個 · 4点獲得 · バリア開放中 · 残り8秒');
  assert.equal(rankedText('en', '{team} WINS!', { team: 'BLUE' }), 'BLUE WINS!');
});
