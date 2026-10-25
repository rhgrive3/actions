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
// Model the DOM behavior materializeArt depends on: assigning nonempty markup
// creates a child, and reading firstChild preserves that node's identity.
function artContainer(markup = '') {
  let html = markup, child = markup ? {} : null, writes = 0;
  return {
    get innerHTML() { return html; },
    set innerHTML(value) { html = value; child = value ? {} : null; writes++; },
    get firstChild() { return child; },
    get writes() { return writes; },
  };
}
function card(id, deferred = true, { equipped = false, blobHTML = '' } = {}) {
  const parts = { '.iw-wcard__icon': artContainer('before'), '.iw-wcard__blob': artContainer(blobHTML) };
  const classes = new Set(equipped ? ['is-equipped'] : []);
  return { _wid: id, _weaponArtIndex: 23, _artDeferred: deferred, dataset: deferred ? { artDeferred: '1' } : {},
    classList: { contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name) },
    querySelector: selector => parts[selector], parts };
}
test('full production deferred icon matches eager catalogue id and fallback', () => {
  assert.equal(expression, 'weaponIcon(w.id || id)', 'test the actual catalogue expression');
  const Ws = { kit: { id: 'canonical-kit' }, fallback: {} };
  const run = hydrate(Ws, weaponIcon, () => assert.fail('unequipped card must not draw decoration'));
  for (const id of Object.keys(Ws)) {
    const c = card(id), eager = new Function('weaponIcon', 'w', 'id', 'return ' + expression)(weaponIcon, Ws[id], id);
    run(c);
    assert.equal(c.parts['.iw-wcard__icon'].innerHTML, eager);
    assert.equal(c._artDeferred, false);
    assert.equal('artDeferred' in c.dataset, false);
    assert.equal(c.parts['.iw-wcard__blob'].innerHTML, '', 'unequipped decoration stays empty');
    const count = calls.length; run(c); assert.equal(calls.length, count, 'hydrate once');
  }
  const changed = card('old-id'); changed._wid = 'kit'; run(changed);
  assert.equal(changed.parts['.iw-wcard__icon'].innerHTML, 'icon:canonical-kit', 'read current card ownership at hydration');
});
test('equipped deferred and eager cards draw only a missing decoration and preserve its node', () => {
  for (const deferred of [true, false]) {
    for (const blobHTML of ['', '<svg>existing</svg>']) {
      const icons = [], decorations = [];
      const run = hydrate({ kit: { id: 'canonical-kit' } },
        id => { icons.push(id); return 'icon:' + id; },
        options => { decorations.push(options); return '<svg>new</svg>'; });
      const c = card('kit', deferred, { equipped: true, blobHTML });
      const blob = c.parts['.iw-wcard__blob'], existing = blob.firstChild;
      run(c);
      assert.equal(c.parts['.iw-wcard__icon'].innerHTML, deferred ? 'icon:canonical-kit' : 'before');
      assert.deepEqual(icons, deferred ? ['canonical-kit'] : []);
      assert.equal(c._artDeferred, false);
      assert.equal('artDeferred' in c.dataset, false);
      assert.equal(blob.innerHTML, blobHTML || '<svg>new</svg>');
      assert.equal(blob.writes, blobHTML ? 0 : 1);
      assert.deepEqual(decorations, blobHTML ? [] : [{ seed: 109, cls: 'iw-fa', r: 58, arms: 8, drops: 0 }]);
      const child = blob.firstChild;
      assert.ok(child, 'decoration has a child after materialization');
      if (existing) assert.equal(child, existing, 'existing decoration node is not replaced');
      run(c);
      assert.equal(blob.firstChild, child, 'repeated hydration keeps the cached decoration node');
      assert.equal(blob.writes, blobHTML ? 0 : 1);
      assert.equal(decorations.length, blobHTML ? 0 : 1);
      assert.deepEqual(icons, deferred ? ['canonical-kit'] : [], 'icon is never redrawn');
    }
  }
});
test('equipping an already hydrated card creates only its missing decoration', () => {
  for (const deferred of [true, false]) {
    for (const blobHTML of ['', '<svg>existing</svg>']) {
      let icons = 0, decorations = 0;
      const run = hydrate({ kit: {} },
        () => { icons++; return 'icon:kit'; },
        () => { decorations++; return '<svg>new</svg>'; });
      const c = card('kit', deferred, { blobHTML }), blob = c.parts['.iw-wcard__blob'];
      const existing = blob.firstChild;
      run(c);
      assert.equal(decorations, 0, 'unequipped cards do not draw decoration');
      assert.equal(blob.innerHTML, blobHTML);
      assert.equal(blob.firstChild, existing, 'unequipped existing decoration is preserved');
      assert.equal(blob.writes, 0);
      assert.equal(icons, deferred ? 1 : 0);
      c.classList.add('is-equipped');
      run(c);
      assert.equal(blob.innerHTML, blobHTML || '<svg>new</svg>');
      assert.equal(decorations, blobHTML ? 0 : 1, 'equipping also decorates non-deferred cards');
      const child = blob.firstChild;
      c.classList.remove('is-equipped'); run(c);
      c.classList.add('is-equipped'); run(c);
      assert.equal(blob.firstChild, child, 're-equipping does not replace the decoration');
      assert.equal(blob.writes, blobHTML ? 0 : 1);
      assert.equal(decorations, blobHTML ? 0 : 1);
      assert.equal(icons, deferred ? 1 : 0, 'equipping does not redraw the icon');
    }
  }
});
test('non-deferred unequipped and absent cards do not render or mutate', () => {
  const run = hydrate({}, () => assert.fail('must not render'), () => assert.fail('must not draw'));
  run(null); run(undefined); const c = card('missing', false); run(c);
  assert.equal(c.parts['.iw-wcard__icon'].innerHTML, 'before');
  assert.equal(c.parts['.iw-wcard__icon'].writes, 0);
  assert.equal(c.parts['.iw-wcard__blob'].writes, 0);
  assert.equal(c._artDeferred, false);
  assert.deepEqual(c.dataset, {});
});
test('expression preservation does not rewrite member names, strings or object keys', () => {
  const expr = "weaponIcon(w.id || id, { id: 'id' })";
  const grid = "        h('span', { class: 'iw-wcard__icon', html: " + expr + " }),";
  const out = deferPrimaryWeaponIcon(grid, (s, a, b) => s.replace(a, b));
  assert.equal(out.hydration, expr);
});
