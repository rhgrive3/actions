import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Source-method CPU reproduction only: controlled fixed hand, target, phase,
// RNG, and hook timer. This does not execute minified modules or a browser.
if (process.env.INKWAVE_BUILT_SITE) throw Error('This reproduction executes raw source, not BUILT_SITE');
const base = process.env.INKWAVE_BASE_ROOT || '/workspace/zipcaster-browser-base';
const candidate = process.env.INKWAVE_CANDIDATE_ROOT || '/workspace/zipcaster-browser-candidate';
const { harness } = await import(pathToFileURL(path.join(candidate, 'patches/splatoon3/tests/zipcaster-vfx-cadence-harness.mjs')));
const relative = 'patches/splatoon3/runtime/special-vfx.mjs';
const original = fs.readFileSync(path.join(base, relative), 'utf8');
const current = fs.readFileSync(process.env.INKWAVE_PROPOSAL_SOURCE || path.join(candidate, relative), 'utf8');
function moving(code, hz) {
  const f = harness({ code, random: () => .25 });
  const s = f.actor._s3AllSpecialState;
  s.phase = 'ready'; f.step(1 / 60); // Same track before the hook begins.
  s.phase = 'hookFlight'; s.hookFlightDuration = .2;
  for (let i = 1; i <= hz / 10; i++) { s.hookFlightT = i / hz; f.step(1 / hz); }
  return f.rows.filter(r => r[0] === 'drop');
}
const baseline = moving(original, 60);
test('candidate source preserves all original 60 Hz moving-hook recipe rows', () => {
  assert.deepEqual(moving(current, 60), baseline);
});
test('30 Hz catchup origins follow the original native-60 hook path (known red on frozen candidate)', () => {
  const low = moving(current, 30);
  assert.equal(low.length, baseline.length, 'same six presentation opportunities');
  assert.deepEqual(low.map(r => r.slice(2)), baseline.map(r => r.slice(2)), 'same non-origin recipe and RNG order');
  const distances = low.map((r, i) => Math.hypot(...['x', 'y', 'z'].map(k => r[1][k] - baseline[i][1][k])));
  console.log('moving-hook source origin deltas WU', JSON.stringify(distances));
  assert.ok(distances.every(d => d < 1e-6), 'catchup uses the current head twice; fixed-phase count tests do not cover the moving origin');
});
