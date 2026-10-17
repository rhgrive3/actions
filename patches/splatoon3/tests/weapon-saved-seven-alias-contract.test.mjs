import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// Alias contract only: opaque sentinels do not establish native or emitted acceptance.
const groups = {
  'roller-three': ['Roller_Normal_01', 'Roller_Wide_01', 'Roller_Wide_02'],
  'brush-two': ['Brush_Normal_01', 'Brush_Normal_02'],
  'starz-hornz': ['Roller_Heavy_02', 'Slosher_Double_02'],
};
for (const [name, rows] of Object.entries(groups)) {
  test(`${name}: exact saved factory objects, no wrapper or eager build`, async () => {
    let calls = 0;
    const manual = Object.fromEntries(rows.map(row => [row, Object.freeze({
      sourceRow: row, build() { calls++; return row; },
    })]));
    const context = vm.createContext({});
    const dependency = new vm.SyntheticModule(['VARIANT_MODELS'], function () {
      this.setExport('VARIANT_MODELS', manual);
    }, {context});
    const url = new URL(`../runtime/weapon-models/variants-accepted-${name}-followup.mjs`, import.meta.url);
    const module = new vm.SourceTextModule(fs.readFileSync(url, 'utf8'), {context, identifier: url.href});
    const imports = [];
    await module.link(specifier => {
      imports.push(specifier);
      assert.equal(specifier, './variants-melee.mjs');
      return dependency;
    });
    await module.evaluate();
    assert.deepEqual(imports, ['./variants-melee.mjs']);
    const actual = module.namespace.FOLLOWUP_MODELS;
    assert.deepEqual(Object.keys(actual), rows);
    assert.ok(Object.isFrozen(actual));
    assert.equal(calls, 0);
    for (const row of rows) {
      assert.equal(actual[row], manual[row]);
      assert.equal(actual[row].build, manual[row].build);
    }
  });
}
