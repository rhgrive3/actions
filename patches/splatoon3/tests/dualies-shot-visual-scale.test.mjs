import test from 'node:test';
import assert from 'node:assert/strict';
import { dualiesShotVisualScale, DUALIES_SHOT_VISUAL_SCALE } from '../runtime/dualies-shot-visual-scale.mjs';
import { bodyParams } from '../runtime/s3-projectile-shapes.mjs';

test('Dualies main shots draw at 60%; other families, subs and specials unchanged', () => {
  assert.equal(DUALIES_SHOT_VISUAL_SCALE, 0.6);
  assert.equal(dualiesShotVisualScale({ type: 'shot', catalog: { r: { family: 'dualies' } } }), 0.6);
  assert.equal(dualiesShotVisualScale({ type: 'shot', wid: 'dualies' }), 0.6);
  assert.equal(dualiesShotVisualScale({ type: 'shot', owner: { weapon: { kind: 'catalog', catalogRecord: { family: 'dualies' } } } }), 0.6);
  assert.equal(dualiesShotVisualScale({ type: 'shot', catalog: { r: { family: 'shooter' } } }), 1);
  assert.equal(dualiesShotVisualScale({ type: 'shot', s3SpecialWeapon: 'x', catalog: { r: { family: 'dualies' } } }), 1);
  assert.equal(dualiesShotVisualScale({ type: 'bomb', owner: { weapon: { kind: 'dualies' } } }), 1);
});

test('S3 rod body radius of a Dualies shot is 60% of a Shooter shot', () => {
  const v = (x, y, z) => ({ x, y, z, distanceTo(o) { return Math.hypot(x - o.x, y - o.y, z - o.z); } });
  const shot = family => ({ type: 'shot', age: 1, start: v(0, 0, 0), pos: v(0, 0, 5), catalog: { r: { family } } });
  const a = bodyParams(shot('shooter'), 'shot', 20), b = bodyParams(shot('dualies'), 'shot', 20);
  assert.ok(Math.abs(b.R / a.R - 0.6) < 1e-9);
});
