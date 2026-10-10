import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { floorCoverage, indexedFloorCoverage } from '../runtime/scoring.mjs';
import { installTankThrottle, TANK_REDRAW_INTERVAL, warmScreenFX, SCREEN_FX_WARM_FLASH } from '../runtime/ui.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const composed = rel => adaptBuildSource(rel, fs.readFileSync(path.join(ROOT, 'inkwave-public', rel), 'utf8'));

test('composed paint shader keeps decoration inside the source radius (no far satellites/spatter)', () => {
  const paint = composed('src/world/paint.js');
  const reach = JSON.parse(paint.match(/const REACH = (\[[^\]]+\]);/)[1]);
  assert.ok(reach.every(r => r <= 1.75), `REACH ${reach}`);
  const rows = [...paint.matchAll(/return vec4\(([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\);/g)].map(m => m.slice(1).map(Number));
  assert.ok(rows.length >= 6 && rows.every(([, sat, spatter]) => sat === 0 && spatter === 0), JSON.stringify(rows));
  assert.match(paint, /float len = r \* \(0\.04 \+ 0\.16 \* h2 \* h2 \* h2\) \* tsp;/);
  assert.match(paint, /shapes: \[\[5, 0, 0, 3\], \[3, 0, 0, 2\], \[7, 0, 0, 4\], \[10, 0, 0, 5\], \[3, 0, 0, 2\], \[2, 0, 0, 1\]/);
  const ownership = fs.readFileSync(path.join(ROOT, 'patches/splatoon3/runtime/paint-ownership.mjs'), 'utf8');
  assert.match(ownership, /const len = r \* \(0\.04 \+ 0\.16 \* h2 \* h2 \* h2\) \* tsp;/, 'CPU ownership uses the same spike length');
});

test('indexed live coverage is bit-identical to the reference scan', () => {
  let s = 7; const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let trial = 0; trial < 20; trial++) {
    const faces = [], sizes = [];
    let base = 0;
    for (let k = 0; k < 6; k++) {
      const nu = 3 + Math.floor(rnd() * 20), nv = 3 + Math.floor(rnd() * 20);
      faces.push({ turf: rnd() > 0.2, n: { y: rnd() * 2 - 0.5 }, grid: base, nu, nv, cu: 0.25, cv: 0.1 + rnd() * 0.3 });
      base += nu * nv;
    }
    const grid = new Uint8Array(base).map(() => Math.floor(rnd() * 3)), dead = new Uint8Array(base).map(() => (rnd() < 0.1 ? 1 : 0));
    const paint = { paintFaces: faces, grid, dead };
    assert.deepEqual(indexedFloorCoverage(paint), floorCoverage(paint));
    for (let i = 0; i < 50; i++) grid[Math.floor(rnd() * base)] = Math.floor(rnd() * 3);
    assert.deepEqual(indexedFloorCoverage(paint), floorCoverage(paint), 'grid writes after the index is built');
    void sizes;
  }
});

test('HUD ink tank repaint is limited to 30 Hz and carries the elapsed time', () => {
  const calls = [];
  class HUD { _drawTank(dt, ...rest) { calls.push([dt, ...rest]); } }
  assert.equal(installTankThrottle(HUD), true);
  assert.equal(installTankThrottle(HUD), false, 'idempotent');
  const h = new HUD();
  h._drawTank(1 / 60, 'sub');            // first paint is immediate
  h._drawTank(1 / 60, 'sub');            // within 1/30 s: skipped
  h._drawTank(1 / 60, 'sub');            // 2/60 accumulated: painted
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], 1 / 60);
  assert.ok(Math.abs(calls[1][0] - 2 / 60) < 1e-12);
  assert.equal(calls[1][1], 'sub');
  for (let i = 0; i < 60; i++) h._drawTank(1 / 60);
  assert.equal(calls.length, 2 + 30, `one repaint per ${TANK_REDRAW_INTERVAL} s`);
});

test('ScreenFX warm-up enables the pass imperceptibly for the boot frames only', () => {
  const lens = [];
  const fx = { pass: {}, s: {}, debugHold: 0, force: null, lens: { droplet: (...a) => lens.push(a) } };
  assert.equal(warmScreenFX(fx), true);
  assert.ok(fx.debugHold > 0 && fx.debugHold <= 0.2);
  assert.equal(fx.force.flash, SCREEN_FX_WARM_FLASH);
  assert.ok(SCREEN_FX_WARM_FLASH < 0.01);
  assert.equal(lens.length, 1);
  assert.equal(warmScreenFX(null), false);
  const main = composed('src/main.js');
  assert.match(main, /this\._warmup\(\);\n\s*warmScreenFX\(this\.screenfx\);/);
});

test('SFX loop noise is pre-built after the audio context exists', () => {
  const audio = composed('src/audio/audio.js');
  assert.match(audio, /noiseBuffer,\n\} from '\.\/music\.js';/);
  assert.match(audio, /this\.ready = true;\n\s*if \(!this\.offline && typeof setTimeout === 'function'\) \['white', 'pink', 'brown'\]\.forEach/);
});
