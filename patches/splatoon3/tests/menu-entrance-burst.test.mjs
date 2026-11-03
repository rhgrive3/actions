// The capped entrance stagger used to start every element past the cap on the
// same frame (~146 weapon cards at once on each loadout re-open). Elements far
// past the cap now render in their final state instead of joining that burst.
// DOM-free semantic check of the shipped module; not a browser frame timing.
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source = fs.readFileSync(new URL('../runtime/menu-layout.mjs', import.meta.url), 'utf8');
async function load() {
  const context = vm.createContext({ console });
  const mod = new vm.SourceTextModule(source, { context });
  await mod.link(spec => new vm.SyntheticModule(spec.includes('i18n') ? ['isJa', 't'] : ['GLYPHS'], function () {
    if (spec.includes('i18n')) { this.setExport('isJa', false); this.setExport('t', x => x); } else this.setExport('GLYPHS', {});
  }, { context }));
  await mod.evaluate();
  return mod.namespace;
}
function node(i) {
  const style = new Map([['--i', String(i)]]), classes = new Set(['iw-in']);
  return { style: { getPropertyValue: k => style.get(k) || '', setProperty: (k, v) => style.set(k, v) },
    classList: { add: c => classes.add(c), contains: c => classes.has(c) }, i };
}
test('stagger is capped and far elements skip the simultaneous entrance burst', async () => {
  const { capEntranceStagger, ENTRANCE_STAGGER_CAP, ENTRANCE_ANIMATED_LIMIT } = await load();
  const nodes = Array.from({ length: 160 }, (_, i) => node(i));
  const capped = capEntranceStagger({ querySelectorAll: () => nodes });
  assert.equal(capped, 160 - ENTRANCE_STAGGER_CAP - 1);
  for (const n of nodes) {
    assert.ok(Number(n.style.getPropertyValue('--i')) <= ENTRANCE_STAGGER_CAP);
    assert.equal(n.classList.contains('s3-in-static'), n.i > ENTRANCE_ANIMATED_LIMIT, `card ${n.i}`);
  }
  const animatedTogether = nodes.filter(n => !n.classList.contains('s3-in-static') && Number(n.style.getPropertyValue('--i')) === ENTRANCE_STAGGER_CAP).length;
  assert.ok(animatedTogether <= ENTRANCE_ANIMATED_LIMIT - ENTRANCE_STAGGER_CAP + 1, `burst size ${animatedTogether}`);
});
test('short screens keep their full staggered entrance', async () => {
  const { capEntranceStagger } = await load();
  const nodes = Array.from({ length: 12 }, (_, i) => node(i));
  assert.equal(capEntranceStagger({ querySelectorAll: () => nodes }), 0);
  assert.ok(nodes.every(n => !n.classList.contains('s3-in-static')));
});
test('the shipped stylesheet disables the entrance animation for skipped elements', () => {
  const css = fs.readFileSync(new URL('../ui.css', import.meta.url), 'utf8');
  assert.match(css, /\.iw-ui \.s3-in-static \{ animation: none !important; \}/);
});
