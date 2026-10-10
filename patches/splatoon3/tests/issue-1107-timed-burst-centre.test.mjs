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
const sphereStart = body.indexOf('const sphereRadius =');
const sphereEnd = body.indexOf('if (burst.timedDropOn',sphereStart);
const sphere = body.slice(sphereStart,sphereEnd);

test('#1107 timed airburst splash is centred on the burst point, not a downward floor probe', () => {
  assert.ok(start > 0 && end > start, 'applyFidelityBlasterBurstPaint located');
  assert.ok(sphereStart > 0 && sphereEnd > sphereStart,'burst sphere branch located');
  assert.doesNotMatch(sphere, /raycast/, 'no floor probe inside the sphere stamp');
  assert.match(sphere, /burst\.timedSplashRadius/, 'timed splash uses its own radius');
  assert.match(sphere, /centre\.copy\(point\)/, 'burst point is the paint centre');
  assert.match(sphere, /api\.G\.paint\.splat\(centre, sphereRadius, p\.team/,
    'the real production branch paints a source-radius burst sphere');
  assert.match(body, /spawnSplashDrop\(api\.G/, 'the falling drop is queued separately');
});

test('#1107 paint.splat tests faces by plane distance to the centre (sphere semantics)', () => {
  const paint = fs.readFileSync(new URL('../../../inkwave-public/src/world/paint.js', import.meta.url), 'utf8');
  assert.match(paint, /const dn = _rel\.dot\(f\.n\);\s*if \(dn > radius \|\| dn < -0\.12\) continue;/);
  assert.match(paint, /const rr = Math\.sqrt\(Math\.max\(0, radius \* radius - dn \* dn\)\);/);
});
