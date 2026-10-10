import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as fidelity from '../runtime/weapons-fidelity.mjs';
import { slosherYawOffset } from '../runtime/weapons-fidelity.mjs';

// Source record: Bucket Slosher Unit 1 (RandomRotateYOffOrderNum [0]) and Unit 2,
// RandomRotateYDegree 4.5, RandomRotateYBias 0.65 (Leanny 7280ff9c). The bias
// sampling law is 未確認; these checks pin only the INKWAVE calibration contract.
const deg = v => v * Math.PI / 180;
const u = { RandomRotateYDegree: 4.5, RandomRotateYBias: .65, RandomRotateYOffOrderNum: [0] };

// Exempt index: zero yaw and no random number consumed.
let draws = 0;
const counting = () => { draws++; return .75; };
assert.equal(slosherYawOffset(u, 0, counting), 0);
assert.equal(draws, 0);
// Non-exempt index: exactly one random number consumed.
slosherYawOffset(u, 1, counting);
assert.equal(draws, 1);

// Bias 0 is the uniform control over the source 4.5-degree range.
assert.ok(Math.abs(slosherYawOffset({ ...u, RandomRotateYBias: 0 }, 1, () => .75) - deg(2.25)) < 1e-12);
// Edges of the draw reach exactly the source range, in both directions.
assert.ok(Math.abs(slosherYawOffset(u, 1, () => 1) - deg(4.5)) < 1e-12);
assert.ok(Math.abs(slosherYawOffset(u, 1, () => 0) + deg(4.5)) < 1e-12);
// A nonzero bias changes the distribution (narrower than uniform here) and never exceeds the range.
const biased = slosherYawOffset(u, 1, () => .75);
assert.ok(biased > 0 && biased < deg(2.25));
for (const r of [0, .1, .3, .5, .9, 1]) assert.ok(Math.abs(slosherYawOffset(u, 1, () => r)) <= deg(4.5) + 1e-12);

// Single live yaw law: the unverified parallel curve must not come back.
assert.equal('biasedSourceYaw' in fidelity, false);
// The launch path consumes the live law with the source unit and index.
const src = fs.readFileSync(new URL('../runtime/weapons-fidelity.mjs', import.meta.url), 'utf8');
assert.match(src, /\+slosherYawOffset\(u,index\)/);
console.log('Bucket Slosher source yaw bias regression passed');
