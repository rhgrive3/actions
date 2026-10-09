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
assert.equal(slosherImpactPaintSource(u1,0,0).radius,4.44*.2);
assert.equal(slosherImpactPaintSource(u1,0,100).radius,3.84*.2);
assert.equal(slosherImpactPaintSource(u1,1,0).radius,1.44*.2);
assert.equal(slosherImpactPaintSource(u1,3,100).radius,1.92*.2);
assert.equal(slosherImpactPaintSource(u2,0,0).radius,1.2*.2);
assert.equal(slosherImpactPaintSource(u2,3,0).radius,.96*.2);
assert.equal(slosherImpactPaintSource(u2,3,100).radius,1.14*.2);
assert.equal(slosherImpactPaintSource(u1,1,0).source,'AfterPaintParam');
assert.equal(slosherImpactPaintSource(null,0,0),null);
console.log('Slosher per-unit first/after impact paint source tests passed');
