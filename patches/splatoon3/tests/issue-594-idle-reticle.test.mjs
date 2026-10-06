import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';

// #594: Splatoon 3 withholds the charge-reticle cluster of charging weapons (Charger,
// Heavy Splatling) while they are idle. The lifecycle gate must live in the installed
// (composed) HUD source, not in a mirror of the helper.
const root = new URL('../../../', import.meta.url);
const read = rel => fs.readFileSync(new URL('inkwave-public/' + rel, root), 'utf8');
const compose = (rel, code = read(rel)) => adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))));
const uiCss = () => fs.readFileSync(new URL('../../../patches/splatoon3/ui.css', import.meta.url), 'utf8');

function section(code, start, end) {
  const a = code.indexOf(start), b = code.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `boundary: ${start}`);
  assert.equal(code.indexOf(start, a + start.length), -1, `unique: ${start}`);
  return code.slice(a, b);
}

class Classes {
  constructor() { this.names = new Set(); }
  add(...ns) { ns.forEach(n => this.names.add(n)); }
  remove(...ns) { ns.forEach(n => this.names.delete(n)); }
  contains(n) { return this.names.has(n); }
  toggle(n, on = !this.contains(n)) { on ? this.add(n) : this.remove(n); return on; }
}
class El {
  constructor() { this.classList = new Classes(); this.style = { setProperty: (k, v) => { this.style[k] = v; } }; this.innerHTML = ''; }
  set className(v) { this.classList.names = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return [...this.classList.names].join(' '); }
  querySelector() { return new El(); }
}

// Real `_buildReticle` + `_updCrosshair` sections from the installed composed HUD source,
// evaluated with only the DOM-ish members they touch as fixtures.
function rig({ local = null } = {}) {
  const source = compose('src/ui/hud.js');
  const methods = section(source, '  _buildReticle(kind) {', '\n  _updCrosshair(f, dt) {')
    + section(source, '  _updCrosshair(f, dt) {', '\n  _updTank(f, dt) {');
  const WEAPONS = Object.fromEntries(['shooter', 'blaster', 'charger', 'splatling', 'roller', 'dualies', 'slosher']
    .map(k => [k, { kind: k, special: 'slam' }]));
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const Hud = vm.runInNewContext(`class Hud {\n${methods}\n}; Hud`, { WEAPONS, clamp, specialIcon: () => '<svg></svg>' });
  const h = new Hud();
  Object.assign(h, {
    _L: {}, _bloom: 0, _kick: 0, ret: new El(), xh: new El(), spIcon: new El(), shield: new El(), subChip: new El(),
    _local: () => local, _restart() {}, _snd() {},
  });
  return h;
}

const idle = h => h.ret.classList.contains('is-idle');

test('#594: idle Charger shows no charge-reticle cluster; charging shows it, release hides it again', () => {
  const h = rig();
  h._updCrosshair({ weapon: 'charger', charge: 0 }, 1 / 60);
  assert.ok(h.ret.classList.contains('iw-ret--charger'));
  assert.equal(idle(h), true, 'idle Charger must be gated');
  h._updCrosshair({ weapon: 'charger', charge: 0.45 }, 1 / 60);
  assert.equal(idle(h), false, 'charge in progress must reveal the reticle');
  assert.equal(h.ret.classList.contains('is-charging'), true);
  h._updCrosshair({ weapon: 'charger', charge: 1 }, 1 / 60);
  assert.equal(idle(h), false, 'full charge stays visible');
  h._updCrosshair({ weapon: 'charger', charge: 0 }, 1 / 60);
  assert.equal(idle(h), true, 'release back to zero must re-gate');
  assert.equal(h.ret.classList.contains('is-charging'), false);
});

test('#594: idle Splatling hides the charge meter; charging and the active stream keep it, stream end re-gates', () => {
  const runner = { streaming: false };
  const h = rig({ local: { weaponRunner: runner } });
  h._updCrosshair({ weapon: 'splatling', charge: 0 }, 1 / 60);
  assert.ok(h.ret.classList.contains('iw-ret--splatling'));
  assert.equal(idle(h), true, 'idle Splatling must be gated');
  h._updCrosshair({ weapon: 'splatling', charge: 0.3 }, 1 / 60);
  assert.equal(idle(h), false, 'spin-up must reveal the meter');
  runner.streaming = true;
  h._updCrosshair({ weapon: 'splatling', charge: 0.2 }, 1 / 60);
  assert.equal(idle(h), false, 'streaming keeps the drain UI');
  runner.streaming = false;
  h._updCrosshair({ weapon: 'splatling', charge: 0 }, 1 / 60);
  assert.equal(idle(h), true, 'empty meter after the stream ends returns to idle-hidden');
});

test('#594: shooter, blaster, roller, dualies and slosher reticles are never gated', () => {
  for (const weapon of ['shooter', 'blaster', 'roller', 'dualies', 'slosher']) {
    const h = rig({ local: { weaponRunner: {} } });
    for (const charge of [0, 1]) h._updCrosshair({ weapon, charge }, 1 / 60);
    assert.equal(idle(h), false, `${weapon} reticle must stay visible while idle`);
  }
});

test('#594: weapon switches rebuild the reticle without a stale gate in either direction', () => {
  const h = rig();
  h._updCrosshair({ weapon: 'charger', charge: 0 }, 1 / 60);
  assert.equal(idle(h), true);
  h._updCrosshair({ weapon: 'shooter', charge: 0 }, 1 / 60);
  assert.equal(h.ret.className.includes('is-idle'), false, 'shooter rebuild drops the gate');
  h._updCrosshair({ weapon: 'charger', charge: 0 }, 1 / 60);
  assert.equal(idle(h), true, 'switching back re-applies the gate in the same frame');
  h._updCrosshair({ weapon: 'splatling', charge: 0 }, 1 / 60);
  assert.equal(idle(h), true, 'splatling rebuild gates in the same frame');
});

test('#594: visibility decision is deterministic across 30/60/120 Hz render steps', () => {
  const frames = [{ weapon: 'charger', charge: 0 }, { weapon: 'charger', charge: 0.5 },
    { weapon: 'splatling', charge: 0 }, { weapon: 'splatling', charge: 0.75 }];
  for (const frame of frames) {
    const results = [30, 60, 120].map(hz => { const h = rig(); h._updCrosshair(frame, 1 / hz); return idle(h); });
    assert.deepEqual(results, [results[0], results[0], results[0]], JSON.stringify(frame));
  }
});

test('#594: installed patch CSS hides the gated charge-reticle clusters', () => {
  const css = uiCss();
  assert.match(css, /\.iw-ret--charger\.is-idle[^{]*\{[^}]*visibility:\s*hidden/);
  assert.match(css, /\.iw-ret--splatling\.is-idle[^{]*\{[^}]*visibility:\s*hidden/);
});

test('#594: composed HUD source carries the gate and fails closed without its anchor', () => {
  assert.match(compose('src/ui/hud.js'), /ret\.classList\.toggle\('is-idle'/);
  const raw = read('src/ui/hud.js');
  const anchor = "    if (L.kind === 'slosher') {";
  assert.throws(() => adaptSource('src/ui/hud.js', raw.replace(anchor, '')), /idle charge reticle lifecycle/);
  assert.throws(() => adaptSource('src/ui/hud.js', raw.replace(anchor, `${anchor}\n${anchor}`)), /idle charge reticle lifecycle/);
});
