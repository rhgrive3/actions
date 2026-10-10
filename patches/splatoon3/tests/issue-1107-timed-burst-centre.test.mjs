import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// #1107: a normal timed airburst paints SplashPaintRadius centred on the burst
// point (sphere), not a downward floor probe. Source-bound: the live path needs
// the composed game, so this pins the branch text and the geometry it relies on.
const src = fs.readFileSync(new URL('../runtime/weapons-fidelity.mjs', import.meta.url), 'utf8');
const start = src.indexOf('export function applyFidelityBlasterBurstPaint(');
const end = src.indexOf('\n}\n', start);
const body = src.slice(start, end);
const timed = body.slice(body.indexOf('if (!collision) {'), body.indexOf('queueTimedBlasterDrop(system,p,point,burst);'));

test('#1107 timed airburst splash is centred on the burst point, not a downward floor probe', () => {
  assert.ok(start > 0 && end > start, 'applyFidelityBlasterBurstPaint located');
  assert.doesNotMatch(timed, /raycast/, 'no downward floor probe in the timed branch');
  assert.match(timed, /const at=point\.clone\(\);/);
  assert.match(timed, /api\.G\.paint\.splat\(at,burst\.timedSplashRadius,p\.team/);
});

test('#1107 paint.splat tests faces by plane distance to the centre (sphere semantics)', () => {
  const paint = fs.readFileSync(new URL('../../../inkwave-public/src/world/paint.js', import.meta.url), 'utf8');
  assert.match(paint, /const dn = _rel\.dot\(f\.n\);\s*if \(dn > radius \|\| dn < -0\.12\) continue;/);
  assert.match(paint, /const rr = Math\.sqrt\(Math\.max\(0, radius \* radius - dn \* dn\)\);/);
});
