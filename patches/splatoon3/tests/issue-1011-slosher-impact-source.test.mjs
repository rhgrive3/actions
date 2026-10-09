import assert from 'node:assert/strict';
import { slosherImpactPaintSource } from '../runtime/weapons-fidelity.mjs';
const u1={
  PaintParam:{DistanceXZNear:5,DistanceXZFar:15,WidthHalfNear:4.44,WidthHalfFar:3.84,DepthScaleNear:1,DepthScaleFar:1},
  AfterPaintParam:{DistanceXZNear:8.5,DistanceXZFar:12,WidthHalfNear:1.44,WidthHalfFar:1.92,DepthScaleNear:1.3,DepthScaleFar:1.2},
};
const u2={
  PaintParam:{DistanceXZNear:2,DistanceXZFar:8,WidthHalfNear:1.2,WidthHalfFar:1.2,DepthScaleNear:1.4,DepthScaleFar:1.4},
  AfterPaintParam:{DistanceXZNear:2,DistanceXZFar:8,WidthHalfNear:.96,WidthHalfFar:1.14,DepthScaleNear:1.4,DepthScaleFar:1.4},
};
assert.equal(slosherImpactPaintSource(u1,0,0,.2).radius,4.44*.2);
assert.equal(slosherImpactPaintSource(u1,0,100,.2).radius,3.84*.2);
assert.equal(slosherImpactPaintSource(u1,1,0,.2).radius,1.44*.2);
assert.equal(slosherImpactPaintSource(u1,3,100,.2).radius,1.92*.2);
assert.equal(slosherImpactPaintSource(u2,0,0,.2).radius,1.2*.2);
assert.equal(slosherImpactPaintSource(u2,3,0,.2).radius,.96*.2);
assert.equal(slosherImpactPaintSource(u2,3,100,.2).radius,1.14*.2);
assert.equal(slosherImpactPaintSource(u1,1,0).source,'AfterPaintParam');
assert.equal(slosherImpactPaintSource(null,0,0),null);
console.log('Slosher per-unit first/after impact paint source tests passed');

// Unit conversion is an explicit caller contract. The default matches the
// fidelity profile's 1 WU/source-unit baseline, never implicit range-line units.
for(const scale of [.2,1,2]) {
  assert.equal(slosherImpactPaintSource(u1,0,5*scale,scale).radius,4.44*scale);
  assert.equal(slosherImpactPaintSource(u1,0,15*scale,scale).radius,3.84*scale);
  assert.equal(slosherImpactPaintSource(u1,0,10*scale,scale).t,.5);
}
assert.equal(slosherImpactPaintSource(u1,0,5).radius,4.44);
assert.equal(slosherImpactPaintSource(u1,0,5,0),null);
assert.equal(slosherImpactPaintSource(u1,0,NaN,1),null);
