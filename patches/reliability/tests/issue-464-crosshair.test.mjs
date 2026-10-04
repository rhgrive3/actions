// Focused native-path regression for INKWAVE issue #464.
//
// Runs the *actual* `HUD._updCrosshair()` body sliced out of the real
// `inkwave-public/src/ui/hud.js` (no hand-written stub of the logic), once with
// the raw source as the negative main control and once through the issue-464
// adapter. Proves presentation state composition only; no aim/range/damage math
// is involved anywhere in this test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptIssue464 } from '../issue-464-adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const UPSTREAM = process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public');
const readHud = () => fs.readFileSync(path.join(UPSTREAM, 'src/ui/hud.js'), 'utf8');

// Slice the real method out of the real file: start at the unique definition
// signature, stop at the next method definition, keep up to its closing brace.
function extractCrosshair(source) {
  const start = source.indexOf('  _updCrosshair(f, dt) {');
  const next = source.indexOf('\n  _updTank(f, dt) {', start);
  assert.ok(start >= 0 && next > start, 'real _updCrosshair method present');
  assert.equal(source.indexOf('  _updCrosshair(f, dt) {', start + 1), -1, 'unique method definition');
  const block = source.slice(start, next);
  return block.slice(0, block.lastIndexOf('}') + 1);
}

class FakeList {
  constructor() { this.names = new Set(); }
  add(...n) { n.forEach(x => this.names.add(x)); }
  remove(...n) { n.forEach(x => this.names.delete(x)); }
  contains(n) { return this.names.has(n); }
  toggle(n, on = !this.contains(n)) { on ? this.add(n) : this.remove(n); return on; }
}
const el = () => ({ classList: new FakeList(), style: { setProperty() {} } });

function makeHud(source) {
  const context = vm.createContext({ console, Math });
  const clamp = '(v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, +v || 0))';
  const Hud = vm.runInContext(`(() => { const clamp = ${clamp}; class Hud { ${extractCrosshair(source)} } return Hud; })()`, context);
  const hud = new Hud();
  Object.assign(hud, {
    _L: { weapon: 'shooter', kind: 'shooter' },
    xh: el(), ret: el(), shield: el(), subChip: el(), spIcon: {},
    _bloom: 0, _kick: 0,
    _local: () => null, _snd() {}, _restart() {}, _buildReticle() {},
  });
  return {
    frame({ onTarget, inRange }) {
      hud._updCrosshair({ weapon: 'shooter', crosshair: { spread: 0, onTarget, inRange } }, 1 / 60);
      const c = hud.xh.classList;
      return { target: c.contains('is-target'), far: c.contains('is-far'), farTarget: c.contains('is-far-target') };
    },
  };
}

const raw = readHud();
const adaptedSource = adaptIssue464('src/ui/hud.js', raw);

test('negative main control: raw HUD source reproduces issue #464', () => {
  const rawHud = makeHud(raw);
  const underCrosshairButFar = rawHud.frame({ onTarget: 'enemy', inRange: false });
  assert.deepEqual(underCrosshairButFar, { target: true, far: false, farTarget: false },
    'raw source forces the positive in-range target state for an out-of-range enemy and suppresses the out-of-range state');
  // No-target far state already worked in the raw source; that behavior must be preserved.
  assert.deepEqual(rawHud.frame({ onTarget: null, inRange: false }), { target: false, far: true, farTarget: false });
});

test('adapted HUD gates the positive target state behind authoritative reach', () => {
  const hud = makeHud(adaptedSource);
  // 1. In-reach enemy keeps the intended positive target state.
  assert.deepEqual(hud.frame({ onTarget: 'enemy', inRange: true }), { target: true, far: false, farTarget: false });
  // 2. Out-of-reach enemy must NOT get the same positive in-range target state.
  assert.deepEqual(hud.frame({ onTarget: 'enemy', inRange: false }), { target: false, far: true, farTarget: true });
  // 3. Out-of-range state remains available for a no-target frame.
  assert.deepEqual(hud.frame({ onTarget: null, inRange: false }), { target: false, far: true, farTarget: false });
  // 4. Reachable no-target frame is fully neutral.
  assert.deepEqual(hud.frame({ onTarget: null, inRange: true }), { target: false, far: false, farTarget: false });
  // 5. Unknown reach falls back to in-reach (matches main.js frame default) and is meaningful, not fabricated.
  assert.deepEqual(hud.frame({ onTarget: 'enemy', inRange: undefined }), { target: true, far: false, farTarget: false });
});

test('transitions recompose cleanly when reachability changes under the crosshair', () => {
  const hud = makeHud(adaptedSource);
  assert.deepEqual(hud.frame({ onTarget: 'enemy', inRange: true }), { target: true, far: false, farTarget: false });
  assert.deepEqual(hud.frame({ onTarget: 'enemy', inRange: false }), { target: false, far: true, farTarget: true });
  assert.deepEqual(hud.frame({ onTarget: 'enemy', inRange: true }), { target: true, far: false, farTarget: false });
});

test('adapter is presentation-scoped and fails closed off its anchor', () => {
  assert.equal(adaptIssue464('src/main.js', 'unchanged'), 'unchanged');
  assert.equal(adaptIssue464('src/ui/menus.js', ''), '');
  assert.throws(() => adaptIssue464('src/ui/hud.js', 'const tgt = 1;'), /Issue-464 HUD anchor mismatch/);
  // The real file changes and the change stays inside the crosshair block.
  assert.notEqual(adaptedSource, raw);
  assert.match(adaptedSource, /const inReach = ch\.inRange !== false;/);
  assert.match(adaptedSource, /classList\.toggle\('is-far-target', farTgt\)/);
});
