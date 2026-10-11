# PR1209 Slosher built-paint receipt correction

CI head 005eccedd9edb7ac3b099c83214308458cc91694, Validate run 38062948764, job 114244810942 failed only the built weapons golden: paint.bounds.maxZ 16.375 versus old 20.875. This is forward paint extent, not painted area.

The source DepthScale is dimensionless; native PaintSystem extends forward by radius * (1 + stretchAmt). PR1209 already corrects the conversion to ratio - 1. This change reconciles the stale deterministic receipt, without changing runtime, tolerances or removing verification.

Same seed 0x1a2b3c4d, same native full volley and 240-frame finish: corrected conversion produces maxZ 16.375, 1179 cells, area 73.6875; reverting ONLY the conversion minus-one in an isolated in-memory fixture reproduces the previous maxZ 20.875, 1647 cells, area 102.9375. All nine impact drops are 1.05, below ScaleStartFallDistance 1.5, so shrink is exactly one. The first impact at z 12.21858619445522 has radius 4.024884828332687 and DepthScaleNear/Far 1: correct stretch is zero; the old stretch one doubled the forward base extent.

A new independent oracle interpolates WidthHalf/DepthScale directly from each native projectile's pinned source PaintParam/AfterPaintParam, replaces only the native impact dimensions, and matches every scoring cell plus maxZ 16.375 and 1179 cells. It does not call fidelitySlosherImpactPaint. 1/1 passed.

A fresh isolated emitted build has contentHash e7c79fed4f06350e33a0b19e5b0a7e3ae6002f9aa9e17fdd7e6a5ff12da562a8, matching CI. The complete weapons verifier with the corrected receipt passed all 15 cases, source/build paint equivalence, 3 network modes, 4 wall-drop families and 6 wall-drop cases. Existing hit/full range and projectile count are unchanged.

These are native CPU/built implementation receipts, not retail Splatoon range measurements. Raw source archives are not included.
