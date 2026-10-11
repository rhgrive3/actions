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
- Retain one presentation snapshot per authoritative stamp rather than one batch per hidden simulation frame. Copy the pooled flat entry array (stable level face objects plus six numeric coordinates per entry), release Actor references, and discard obsolete network-clipped snapshots in batched ownership sweeps. Local sub-cell visuals are retained even without CPU ownership; local hidden event history is not globally bounded.
- Resume presentation without mutating the CPU grid or credit. Clear/dispose discard retained masks.
- No wall-clock delta is synthesized: an offline pause that does not call `advanceSimulation` remains paused.

## Local validation

- New source-composed tests: 6/6 passed, plus the subsequent network-only pruning and local sub-cell preservation checks (2/2). Floor/wall, local/network order, 30/60/120 Hz equal visible grid/order/count/credit/clock; hidden actual PaintSystem submits zero renderer calls including mip rebuilds; restoration does not double-credit.
- 600 hidden alternating network overwrite stamps exercise pooled reuse and retained-snapshot pruning (at most 128 retained in this test).
- An exploratory full-runtime Actor/Projectile/PaintSystem sweep emitted positive floor paint for all 65 main weapons, with zero ownerless gameplay stamps, nonfinite radii, or thrown errors. This verifies reachability only, not retail shape/area/clock equality. It will be promoted into a reproducible source audit in the next checkpoint.
- Added a real WebGL atlas restoration test to the existing source-and-built paint-mask CI verifier. **Not yet executed locally:** Chromium fails at process socket creation with EPERM, including the approved escalated attempt. CI result is pending.
- Production build passes; upstream protected bytes remain unchanged.

## Scope and remaining work

Pinned retail reference remains Splatoon 3 11.3.0, [Leanny source commit](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130). The hidden-clock change is an INKWAVE consistency repair, not a newly measured Nintendo timing constant.

Still required: complete 65/14/19 paint-parameter-to-runtime mapping, source units/projection/angle and slope/edge audit, actual emitted browser coverage and restoration results, visual comparison against controlled retail footage, and CPU/GPU/memory performance measurements. Existing catalog limitations include calibrated raster shape, sparse inherited defaults, incomplete wall drips and Slosher spiral behavior. Those are not declared solved by this checkpoint. Merging and publication are parent-owned and not yet complete.

## Additional authoritative paint-credit regression

Actual production Actor/Projectiles/PaintSystem exposed 46.125 points of unwanted
special-gauge recharge on the native Booyah projectile burst before its dedicated
no-special paintDisk. The generic terrain impact also had the same missing
classification. Both synchronous return credit and delayed growth now select
no-special only when the projectile carries its dedicated s3SpecialWeapon descriptor.
Ordinary main blaster credit remains unchanged.

Seven real-module tests cover timed burst and terrain impact, living/dead owner,
late expansion, floor-only turf counted once, and duplicate network ownership
stamp replay. This is an ownership replay test, not a live two-browser match.
Eight visibility tests now additionally cover a network stamp initially owning
zero coarse cells, being pruned, and subsequently regaining a retained GPU
presentation when a delayed satellite first claims a cell.

Fresh pinned 11.3.0 source audit has retrieved all 65 main and 33 sub/special
parameter tables. All 65 main source hashes match the catalog hashes. The audit
contains 3,433 numeric paint/splash leaves; presence in the source is explicitly
separate from use in the current runtime and from measured retail parity.
A large-special disk envelope candidate remains under terrain review and is not
part of the accepted fixes in this checkpoint.

## Added-main airborne splash contact

The added catalog previously called floorPaint at splash release: a downwards
ray immediately owned floor under an airborne round. For the 22 base catalog
records with explicit MoveParam.FreeGravity and SplashSpawnParam/SplashPaintParam,
release now enters the existing fixed-60Hz falling-drop owner and only paints on
actual terrain contact. These are 11 shooters, 6 blasters and 5 dualies; other
families/modes without the required fields retain their previous path.

Source gravity converts frames squared to seconds squared by 60^2. Depth-height
endpoints and explicit random velocities use the retained source values. Sparse
shooter depth/random-velocity defaults and drag reuse the existing documented
blaster-flight-paint contract. The use of weapon gravity for splash motion and
linear height interpolation remains a model choice, not extracted Nintendo code.
Existing fractional spawn counts, split schedules and missing family physics are
not certified by this change.

Actual Actor/projectile tests: high airborne shot does not own floor at release;
wall contact before the floor is honored; wall area gives no turf credit;
owner death does not erase in-flight paint; remote ghosts enqueue no duplicate
authoritative splash. 30/60/120Hz final CPU grid and turf match. All 65 main
Actor reachability tests and 22 existing main-catalog tests still pass. Local
browser launch remains blocked; exact-head CI WebGL results remain required.

## Follow-up candidate: distance-accurate catalog splash admission

The 22 catalog records with explicit falling-splash physics previously released at most one drop at a fixed step's endpoint and returned on contact before admitting earlier crossed distances. The candidate now visits every existing release threshold on the unobstructed segment, samples the actual threshold position, and excludes releases beyond the first world/actor/defense contact. Each record's explicit `SpawnNearestLength` replaces the hardcoded initial distance 1. The remaining fractional `SpawnNum`, split scheduling and forced-nearest arrays retain their existing behavior and are not certified as retail parity.

Tests exercise eight thresholds in one fixed step, clipped contact at distance 2.5, remote-authority exclusion, explicit nearest distance for all 22 real Actors, actual earlier-wall collision, owner death and 30/60/120 Hz final-grid parity. Source and correctly selected `INKWAVE_BUILT_SITE` each passed 8/8. The wall fixture moved from z=2.65 to z=1.65 to intersect the corrected release path rather than the old endpoint sample; the required wall-before-floor assertion remains. This follow-up is staged in PR1224, separate from the unpublished queue-budget and depth-envelope candidates.
## Special projectile pool and direct-only credit safety

A real Booyah throw recycled through `Projectiles.clear()` into an ordinary blaster retained `s3AllSpecial` and a 13.5 WU disk radius, resurrecting a Booyah object and 13,485 floor cells. All fields owned by the all-specials projectile layer are now reset at `_new()`. Regression checks cover all 11 main class tags, missile steering/damage metadata, and no inherited large disk or special object.

Crab rapid rounds intentionally omit the explosive special descriptor. They now carry an explicit launch-owned no-special-paint flag that also resets on pool reuse. Native immediate and delayed ownership credit honors this flag. Actual Crab rounds landing after special expiry or owner death still award floor turf exactly once and award zero special gauge. Ordinary main bursts continue charging their gauge. These are lifecycle/credit safety fixes, not certification of retail Crab trajectory or all special mechanics.

Independent review also found Crab direct-only rounds inheriting the equipped main's gravity (4 becoming 57.6 for a Shooter owner) because they had no special descriptor. Direct rounds now keep a non-explosive shot descriptor, and every launched special sets its own wire weapon ID. Actual JSON packet replay restores the Crab direct descriptor without authoring duplicate paint. All four canonical Crab kits preserve gravity 4, drag .04, radius .22 and zero blast radius in regression coverage.

Validation correction: `source-fixture.mjs` selects published output with `INKWAVE_BUILT_SITE`, not `INKWAVE_BUILT_ROOT`. Runs using the latter were source rechecks and are not built evidence. The fixture now rejects that misspelled switch and prints the built manifest content hash when the real built site is loaded. Corrected composed-build safety coverage was rerun: 49/49 passed on content hash `ca90d8a447b93d1060f0be4e94e8e6f954081e99a077cf49d75068b8b40c4ae2` before the final JSON replay test was added; the final head is separately CI-gated.


The combined canonical-kit/safe-paint/catalog-contact revision passed source 45/45 plus contact 11/11, and correctly selected built-site 56/56. Release admission is additionally clipped to remaining lifetime as well as range and the first collision; range 2.5, lifetime 1/240 second and their combination each admit only distances 1 and 2 in a 10-unit synthetic step. Eight-actor runs across all 22 records at height 16 retained a maximum 224 queued drops and 85-frame landing time, with no eviction, lifetime expiry or remaining queue; this is an authored-stage stress receipt rather than a universal custom-map bound.

## Added catalog nominal floor-depth envelope (separate follow-up candidate)

The interpreter had supplied stretch=max(0,depth-1), although the native forward
smear has total length r*(2+1.25*stretch). Thus a source half-depth r*depth was
shortened, and depths below1 were silently made circular. The candidate uses
stretch=1.6*(depth-1) with the matching centre offset. For depth<1 it reduces the
radius by depth and stretches on the perpendicular tangent, preserving the
nominal half-width, half-depth and area using the existing CPU/GPU/wire fields.
Only floor-like contacts use this interpretation; wall projection is unchanged
because its distinct source depth law remains unverified. A nominal ellipse is
not a Nintendo stencil; procedural wobble and fine texture remain calibration.

Catalog gameplay stamps no longer all force seed0. The actual chosen seed is
recorded full precision by the existing network paint adapter; receivers replay
it without choosing a new pattern. Pure envelope checks cover .25/.5/.8/1/1.25/
2.62, and actual Actor paint replay retains the same CPU grid. The real-WebGL
body probe gains18 additional compressed/elongated cases, but has not been run
locally because of the verified browser-process restriction.

The large special-disk boundary candidate was rejected after slope coverage regressed; special disk slope projection and retail stencil matching remain unresolved. The soft splash-queue candidate is not included.

Rebased depth-only follow-up: source ellipse/contact/falling 18/18; actual production-built ellipse/contact/falling/sub-authority 31/31. Build contentHash `55189a959b924af77b6ea492cbbd759b6ae3e202f974ae6f374cb17a09d38885`. The 18 additional GPU body cases are pending GitHub WebGL CI; no local browser success is asserted.
