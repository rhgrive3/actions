import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../adapter.mjs';
// #709: Blaster spread (--sp) may widen only the OUTER dashed ring, never the inner thin ring.
// Logic-only: a small cascade over the real CSS text (specificity + source order). No browser/GPU claim.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const HUD = read('inkwave-public/styles/hud.css'), PATCH = read('patches/splatoon3/ui.css');

function rules(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = []; let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i), semi = css.indexOf(';', i);
    if (open < 0) break;
    if (semi >= 0 && semi < open && css.slice(i, semi).trim().startsWith('@')) { i = semi + 1; continue; } // @import
    let depth = 1, j = open + 1;
    while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    const prelude = css.slice(i, open).trim(), body = css.slice(open + 1, j - 1);
    i = j;
    if (prelude.startsWith('@')) continue; // @media/@keyframes are not part of the base cascade under test
    const decl = {};
    for (const d of body.split(';')) { const k = d.indexOf(':'); if (k > 0) decl[d.slice(0, k).trim()] = d.slice(k + 1).trim(); }
    for (const selector of prelude.split(',')) out.push({ selector: selector.trim(), decl });
  }
  return out;
}
function compound(text) {
  const not = [...text.matchAll(/:not\(\.([\w-]+)\)/g)].map(m => m[1]);
  const plain = text.replace(/:not\(\.[\w-]+\)/g, '');
  return { tag: /^[a-z][a-z0-9]*/i.exec(plain)?.[0] || null, classes: [...plain.matchAll(/\.([\w-]+)/g)].map(m => m[1]), not };
}
const matches = (c, el) => (!c.tag || c.tag === el.tag) && c.classes.every(x => el.classes.includes(x)) && c.not.every(x => !el.classes.includes(x));
const specificity = parts => parts.reduce((s, c) => s + 100 * (c.classes.length + c.not.length) + (c.tag ? 1 : 0), 0);
// el = { tag, classes, parents: [nearest..root] }; descendant combinators only (all selectors under test use them).
function cascade(sheets, el) {
  const win = {};
  for (const sheet of sheets) for (const r of rules(sheet)) {
    if (/[>+~[]|:(?!not)/.test(r.selector)) continue;
    const parts = r.selector.split(/\s+/).map(compound);
    if (!matches(parts.at(-1), el)) continue;
    let p = 0, ok = true;
    for (let k = parts.length - 2; k >= 0 && ok; k--) {
      while (p < el.parents.length && !matches(parts[k], el.parents[p])) p++;
      if (p >= el.parents.length) ok = false; else p++;
    }
    if (!ok) continue;
    const spec = specificity(parts);
    for (const [prop, value] of Object.entries(r.decl)) if (!win[prop] || spec >= win[prop].spec) win[prop] = { spec, value };
  }
  return Object.fromEntries(Object.entries(win).map(([k, v]) => [k, v.value]));
}
const reticle = (kind, far) => [{ tag: 'div', classes: ['iw-ret', `iw-ret--${kind}`] }, { tag: 'div', classes: ['iw-xh', `iw-xh--${kind}`, ...(far ? ['is-far'] : [])] }];
const svg = (kind = 'blaster', far = false) => ({ tag: 'svg', classes: ['iw-ret__svg'], parents: reticle(kind, far) });
const circle = (classes, kind = 'blaster', far = false) => ({ tag: 'circle', classes, parents: [svg(kind, far), ...reticle(kind, far)] });
const SPREAD = /var\(--sp, 0\) \* \.012/;
const hasSpreadTransform = d => ['transform', 'scale', 'translate', 'rotate'].some(k => d[k] && d[k] !== 'none');

test('negative control: upstream hud.css alone scales the whole svg (both rings) with --sp', () => {
  assert.match(cascade([HUD], svg()).transform, SPREAD);
  assert.equal(hasSpreadTransform(cascade([HUD], circle(['iw-ret__ring', 'thin']))), false, 'the inner ring only scales through its parent svg');
});

test('#709 after the patch stylesheet the blaster svg no longer carries the spread transform', () => {
  const sv = cascade([HUD, PATCH], svg());
  assert.equal(sv.transform, 'none');
  assert.equal(sv.transition, 'none');
});

test('#709 only the outer ring carries the --sp scale, about its own centre; factor and easing unchanged', () => {
  const outer = cascade([HUD, PATCH], circle(['iw-ret__ring'])), upstream = cascade([HUD], svg());
  assert.equal(outer.transform, 'scale(calc(1 + var(--sp, 0) * .012))');
  assert.equal(outer['transform-box'], 'fill-box');
  assert.equal(outer['transform-origin'], 'center');
  assert.equal(outer.transition, 'transform .1s linear');
  assert.equal(outer.transform, upstream.transform, 'same factor as upstream');
  assert.equal(outer.transition, upstream.transition, 'same duration/easing as upstream');
});

test('#709 inner thin ring has no spread transform in any state', () => {
  for (const far of [false, true]) {
    assert.equal(hasSpreadTransform(cascade([HUD, PATCH], circle(['iw-ret__ring', 'thin'], 'blaster', far))), false, `far=${far}`);
    assert.equal(cascade([HUD, PATCH], svg('blaster', far)).transform, 'none');
  }
});

test('#709 other reticles are untouched by the override', () => {
  for (const kind of ['shooter', 'dualies', 'splatling', 'charger', 'roller']) {
    assert.deepEqual(cascade([HUD, PATCH], svg(kind)), cascade([HUD], svg(kind)), kind);
    for (const classes of [['iw-ret__ring'], ['iw-ret__ring', 'thin']])
      assert.deepEqual(cascade([HUD, PATCH], circle(classes, kind)), cascade([HUD], circle(classes, kind)), kind);
  }
});

test('#709 --sp is set on the .iw-ret ancestor (inherits to the circle) and the ring markup is unchanged', () => {
  const hud = read('inkwave-public/src/ui/hud.js');
  assert.match(hud, /this\.ret\.style\.setProperty\('--sp'/);
  assert.ok(hud.includes('r.className = `iw-ret iw-ret--${kind}`;'));
  assert.ok(hud.includes('<circle r="23" class="iw-ret__ring" pathLength="100" style="stroke-dasharray:19 6;stroke-dashoffset:9.5"/><circle r="9" class="iw-ret__ring thin"/>'));
});

test('#709 the patch stylesheet is linked after the upstream stylesheets in the built page', () => {
  const html = adaptSource('index.html', read('inkwave-public/index.html')), at = needle => html.indexOf(needle);
  assert.ok(at('styles/ui.css') >= 0);
  assert.ok(at('patches/splatoon3/ui.css') > at('styles/ui.css'));
  assert.ok(at('patches/splatoon3/ui.css') > at('styles/mobile.css'));
});
