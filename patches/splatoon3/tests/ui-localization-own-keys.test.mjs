import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { makeUiTranslator, UI_JA, UI_EN } from '../runtime/ui-strings.mjs';

async function fixture(lang, mode) {
  const document = {
    documentElement: {},
    createTextNode: value => ({ textContent: String(value) }),
    createElement: tag => ({
      tag, children: [], attributes: {},
      appendChild(child) { this.children.push(child); return child; },
      setAttribute(key, value) { this.attributes[key] = String(value); },
      get textContent() { return this.children.map(child => child.textContent).join(''); },
      set textContent(value) { this.children = [{ textContent: String(value) }]; },
    }),
  };
  const context = vm.createContext({ document, localStorage: { getItem: () => JSON.stringify({ lang }) } });
  const source = fs.readFileSync(new URL('../../../inkwave-public/src/i18n.js', import.meta.url), 'utf8');
  const locale = new vm.SourceTextModule(adaptBuildSource('src/i18n.js', source), { context });
  await locale.link(spec => {
    const exports = spec.includes('config')
      ? { WEAPONS: {}, SUB: {}, SPECIALS: {}, MAPS: [], DIFFICULTY: {}, TEAM_PALETTES: [], COLORBLIND_PALETTE: {}, TEAM_NAMES: [] }
      : spec.includes('device') ? { touchPrimary: mode === 'touch' }
        : spec.includes('ui-strings') ? { makeUiTranslator, UI_JA, UI_EN } : {};
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
  });
  await locale.evaluate();
  locale.namespace.setTextMode(mode);
  const rawUtil = fs.readFileSync(new URL('../../../inkwave-public/src/ui/ui-util.js', import.meta.url), 'utf8');
  const util = new vm.SourceTextModule(adaptBuildSource('src/ui/ui-util.js', rawUtil), { context });
  await util.link(spec => {
    assert.equal(spec, '../i18n.js');
    return locale;
  });
  await util.evaluate();
  return { ...locale.namespace, h: util.namespace.h };
}

for (const lang of ['ja', 'en']) for (const mode of ['kbm', 'pad', 'touch']) {
  test(`unknown prototype-key names remain literal through composed translations and DOM (${lang}/${mode})`, async () => {
    const { t, tx, tu, h } = await fixture(lang, mode);
    for (const name of [...Object.getOwnPropertyNames(Object.prototype), 'Player <1> & "A"']) {
      assert.equal(tx(name), name, `tx(${name})`);
      assert.equal(t(name, { n: 1 }), name, `t(${name})`);
      assert.equal(tu(name), name, `tu(${name})`);
      assert.equal(t('Hello {name}', { name }), `Hello ${name}`);
      assert.equal(tu(`Waiting for ${name}`), lang === 'ja' ? `${name}を待っています` : `Waiting for ${name}`);
      const label = h('span', null, name);
      assert.equal(label.textContent, name);
      assert.equal(label.children.length, 1);
      const button = h('button', { text: name, title: name, 'aria-label': name, placeholder: name });
      assert.equal(button.textContent, name);
      for (const attribute of ['title', 'aria-label', 'placeholder']) assert.equal(button.attributes[attribute], name);
    }
  });

  test(`authored translations and touch variants remain active (${lang}/${mode})`, async () => {
    const { t, tx, tu, h } = await fixture(lang, mode);
    const menu = lang === 'ja' ? 'オプション' : 'SETTINGS';
    assert.equal(t('SETTINGS'), menu);
    assert.equal(tx('SETTINGS'), menu);
    assert.equal(h('span', null, 'SETTINGS').textContent, menu);
    assert.equal(tx('Weapon appearance / ブキの見た目'), lang === 'ja' ? 'ブキの見た目' : 'Weapon appearance');
    assert.equal(t('PENALTY {n}', { n: 12 }), lang === 'ja' ? 'ペナルティ 12' : 'PENALTY 12');
    assert.equal(tu('Connecting to room B7J9K…'), lang === 'ja' ? '部屋 B7J9K に接続中…' : 'Connecting to room B7J9K…');
    const tip = 'Your special gauge fills as you ink. Press [F] when it glows!';
    const expected = lang === 'ja'
      ? mode === 'touch' ? '塗るとスペシャルゲージがたまる。光ったらスペシャルボタンで発動！' : '塗るとスペシャルゲージがたまる。光ったら [F] で発動！'
      : mode === 'touch' ? 'Your special gauge fills as you ink. Tap SP when it glows!' : tip;
    assert.equal(t(tip), expected);
    assert.equal(tx(tip), expected);
  });
}
