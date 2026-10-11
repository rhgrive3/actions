# INKWAVE paint parity: first integration checkpoint

Baseline: `f2c870859d637fccba88031c3786ecec4d95248d`, public production source composed through `scripts/inkwave-source-composition.mjs`. This is an intermediate checkpoint, **not completion of the requested 65-main / 14-sub / 19-special retail paint audit**.

## Verified existing work retained

- Issue #1165's permanent Roller band CPU/GPU edge discrepancy is already repaired by `issue-batch-1171-adapter.mjs`; its original unpatched upstream text is not the deployed code.
- #264/#268's ancillary ownership, exact seed hash, floor-only credit, temporal order, and fixed 60 Hz simulation already exist. Initial focused regression run: 41 passed, zero failed.
- PR #1220 remains an independent projectile presentation Draft; no projectile geometry changes are included here.

## New reproduced defect and correction

The hidden-document gate in native `flush()` stopped **all paint simulation**, although online authoritative simulation continued. A 2.7-radius seed-0.37 floor stamp remained at age/clock 0 and 383 owned cells after 240 calls to `advanceSimulation(1/60)`; the same visible run reached 398 owned cells. Late turf/special charge and wall growth consequently depended on whether the document was visible.

Changes:

- Keep fixed simulation/CPU growth running when called while hidden; rendering remains suppressed.
- Guard both atlas draw and the separate local-quality mipmap regeneration path. Guarding only `_drawQuads()` was insufficient: the real composed mip path still submitted four hidden renders in the reproduction.
- Retain one presentation snapshot per authoritative stamp rather than one batch per hidden simulation frame. Copy the pooled flat entry array (stable level face objects plus six numeric coordinates per entry), release Actor references, and discard obsolete snapshots in batched ownership sweeps.
- Resume presentation without mutating the CPU grid or credit. Clear/dispose discard retained masks.
- No wall-clock delta is synthesized: an offline pause that does not call `advanceSimulation` remains paused.

## Local validation

- New source-composed tests: 6/6 passed. Floor/wall, local/network order, 30/60/120 Hz equal visible grid/order/count/credit/clock; hidden actual PaintSystem submits zero renderer calls including mip rebuilds; restoration does not double-credit.
- 600 hidden alternating overwrite stamps exercise pooled reuse and retained-snapshot pruning (at most 128 retained in this test).
- An exploratory full-runtime Actor/Projectile/PaintSystem sweep emitted positive floor paint for all 65 main weapons, with zero ownerless gameplay stamps, nonfinite radii, or thrown errors. This verifies reachability only, not retail shape/area/clock equality. It will be promoted into a reproducible source audit in the next checkpoint.
- Added a real WebGL atlas restoration test to the existing source-and-built paint-mask CI verifier. **Not yet executed locally:** Chromium fails at process socket creation with EPERM, including the approved escalated attempt. CI result is pending.
- Production build passes; upstream protected bytes remain unchanged.

## Scope and remaining work

Pinned retail reference remains Splatoon 3 11.3.0, [Leanny source commit](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130). The hidden-clock change is an INKWAVE consistency repair, not a newly measured Nintendo timing constant.

Still required: complete 65/14/19 paint-parameter-to-runtime mapping, source units/projection/angle and slope/edge audit, actual emitted browser coverage and restoration results, visual comparison against controlled retail footage, and CPU/GPU/memory performance measurements. Existing catalog limitations include calibrated raster shape, sparse inherited defaults, incomplete wall drips and Slosher spiral behavior. Those are not declared solved by this checkpoint. Merging and publication are parent-owned and not yet complete.
