import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { deferPrimaryWeaponIcon } from '../static-menu-adapter.mjs';

const native = fs.readFileSync(new URL('../../../inkwave-public/src/ui/menus.js', import.meta.url), 'utf8');
const composed = adaptBuildSource('src/ui/menus.js', native);
const materializer = composed.match(/    const materializeArt = \(card\) => \{([\s\S]*?)\n    \};/);
assert.ok(materializer, 'full production composition includes deferred hydration');
const expression = composed.match(/class: 'iw-wcard__icon', html: deferArt \? '' : (.+) \}\),/)[1];
const calls = [];
const weaponIcon = id => { calls.push(id); return 'icon:' + id; };
const hydrate = new Function('Ws', 'weaponIcon', 'splatSVG', 'return (card) => {' + materializer[1] + '}');
function card(id, deferred = true) {
  const parts = { '.iw-wcard__icon': { innerHTML: 'before' }, '.iw-wcard__blob': { innerHTML: '' } };
  return { _wid: id, _weaponArtIndex: 23, _artDeferred: deferred, dataset: { artDeferred: '1' },
    querySelector: selector => parts[selector], parts };
}
test('full production deferred icon matches eager catalogue id and fallback', () => {
  assert.equal(expression, 'weaponIcon(w.id || id)', 'test the actual catalogue expression');
  const Ws = { kit: { id: 'canonical-kit' }, fallback: {} };
  const run = hydrate(Ws, weaponIcon, () => 'blob');
  for (const id of Object.keys(Ws)) {
    const c = card(id), eager = new Function('weaponIcon', 'w', 'id', 'return ' + expression)(weaponIcon, Ws[id], id);
    run(c);
    assert.equal(c.parts['.iw-wcard__icon'].innerHTML, eager);
    assert.equal(c._artDeferred, false);
    assert.equal('artDeferred' in c.dataset, false);
    assert.equal(c.parts['.iw-wcard__blob'].innerHTML, 'blob');
    const count = calls.length; run(c); assert.equal(calls.length, count, 'hydrate once');
  }
  const changed = card('old-id'); changed._wid = 'kit'; run(changed);
  assert.equal(changed.parts['.iw-wcard__icon'].innerHTML, 'icon:canonical-kit', 'read current card ownership at hydration');
});
test('non-deferred and absent cards do not render or mutate', () => {
  const run = hydrate({}, () => assert.fail('must not render'), () => assert.fail('must not draw'));
  run(null); run(undefined); const c = card('missing', false); run(c);
  assert.equal(c.parts['.iw-wcard__icon'].innerHTML, 'before');
});
test('expression preservation does not rewrite member names, strings or object keys', () => {
  const expr = "weaponIcon(w.id || id, { id: 'id' })";
  const grid = "        h('span', { class: 'iw-wcard__icon', html: " + expr + " }),";
  const out = deferPrimaryWeaponIcon(grid, (s, a, b) => s.replace(a, b));
  assert.equal(out.hydration, expr);
});
