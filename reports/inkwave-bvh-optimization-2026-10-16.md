# INKWAVE native collision allocation and traversal optimization

Comparison baseline: main `ee06c87fc623cc793ebf9aaffd3ffc3a5081c60a`.
Scope: the public INKWAVE production composition and its native-triangle
collision backend, not the separate `game/` prototype.

## Changes

- `TriangleWorld.ray` and `queryBox` reuse numeric traversal stacks per active
  nesting depth. A nested box/ray query gets a separate stack, and `finally`
  empties/releases it after normal completion, Boolean early hits, interruption
  or exceptions. Only numeric node indices are stored, not actors or meshes.
- `ray` accepts an optional caller-owned hit object with independent point and
  normal vectors. `NativePhysics` supplies one internal result and one options
  object, then copies its result to the caller's `Hit` before any later query.
  The ordinary `ray` API continues to allocate independently owned results;
  misses return null and Boolean support queries retain true/null semantics.
- `queryBox` has opt-in `stopOnFalse`. `NativePhysics.bodyFits` enables it only
  after an actual obstruction is found. Existing callbacks returning false keep
  visiting all candidates unless they explicitly opt in. Nearest-hit rays and
  contact resolution retain their original traversal and tie ordering.

No ray intersection arithmetic, triangle geometry, contact tolerances, grate
filtering, dynamic-block precedence, shot cadence, simulation dt or rendering
quality is changed. In particular this does not reduce simulation frequency or
approximate the native geometry with bounding boxes.

## Reproducible verification

The two pre-change runtime bodies are frozen under native-stage test fixtures;
SHA-256 is asserted by the new tests. The baseline CPU fixture also loads those
bodies through the same production composition and VM setup as the candidate.
An initial experiment mixing a host-compiled baseline with VM candidate was
invalid and was discarded; the committed comparator uses matching contexts.

- Native-stage source suite: 98 cases, 83 pass, 0 fail, 15 existing optional
  source/asset cases skipped. Targeted query/Boolean-ground/slab suites: 25/25
  also pass against the actual minified emitted engine, with no skips.
- Negative control: the new eight-case suite on unchanged `ee06c87` has four
  passing behavior/oracle cases and four expected failures for the missing
  allocation/reuse/early-stop contracts. The candidate passes all eight.
- New tests: 7,000 mixed rays including nearest/Boolean queries, grates, misses,
  invalid coordinates, output ownership and every hit field; nested query
  ordering, default/opt-in callback semantics, exception recovery and repeated
  scratch reuse. Native contacts, positions and fit/ray results compare exactly
  over three seconds each at 30/60/120 Hz.
- Existing native suites additionally compare real weapon admission, damage and
  paint commands through the installed Actor/WeaponRunner/Projectiles path at
  30/60/120 Hz. Source and emitted tests retain the one-million-case scalar
  predicate and adversarial full-ray comparisons.
- Local-quality source suite: 1,005 pass, 0 fail, 9 existing optional skips.
- Workflow/packaging/focused-runner source tests: 24 pass, 0 fail, 5 optional
  emitted checks skipped in that source-only invocation.
- The full gameplay verifier initially stopped on an existing duplicate import
  of `normalizeViewSettings` in `issue-287-settings-reset.test.mjs`. Remove only
  the redundant import; both actual settings-reset tests pass. No assertions
  were removed or relaxed. The same fix subsequently landed in main through #1477; final integration
  retains main's single import exactly. Both settings tests also pass after
  that integration.

## Measured work

`benchmark-inkwave-bvh-queries.mjs` asserts real Vector3 construction/clone counts
using the exact runtime bodies with a counting THREE subclass. After warmup,
1,000 successful NativePhysics rays with caller-owned `Hit` allocate 2,000
Vector3s before and **zero additional Vector3s** after. This is a component
construction count, not a measurement of total heap or garbage-collection time.

The new source regression's mixed fit/margin cases visit **8,730 -> 3,262**
triangle callbacks while preserving every Boolean result.

`check-inkwave-bvh-browser.mjs` loads and verifies hashes of actual minified
production modules in Chromium 153.0.8010.0. Its explicit synthetic 196-triangle
overlapping-floor/wall/ramp/grate fixture compares 3,000 rays and 3,000 fit
queries, plus nested ordering and interrupted-query recovery. All match. In
its 300-input fit workload, callbacks are **25,644 -> 1,433**. These different
workload counts are not interchangeable or a universal reduction percentage.

CPU timings use warmed, alternating before/after windows with equal checksums.
Raw results include Node environment, browser/version, input geometry and
artifact identity. Timing is diagnostic because shared-executor load varies;
no mobile FPS or full-game speedup is inferred from these synthetic components.

## Actual native-shape replay

Fetch only the existing pinned Scorch OBJ/MTL and recursive source tree into
local test storage; do not commit the third-party geometry or texture pixels.
The harness verifies OBJ SHA-256, the tree SHA and MTL Git blob identity before
using the production converter, native NavGraph/Physics, Actor/BotBrain,
WeaponRunner, Projectiles and paint atlas owners.

Run the existing `measure-inkwave-native-slab.mjs` harness against separate
unchanged `ee06c87` and candidate checkouts, with identical seed/settings:

- Eight actors, 0.5-second warmup and 1-second sampled replay at each of
  30/60/120 Hz. At each rate, before/after actor state, paint grid, ownership,
  paint commands, recorded upload arguments, final state, random consumption,
  ray counts and triangle-test counts are exact matches. These are per-rate
  equivalence checks, not a claim that different dt values share one trace.
- Eight actors with ordinary damage enabled, 1-second warmup and 4-second
  sample at 60 Hz. Before/after traces match over **31,362 rays and 748,352
  triangle tests**, **17,761 paint quads** and **207 recorded paint render
  submissions**, including the uploaded-argument hashes. This replay records
  zero accepted hits/damage, so it does not independently establish combat
  damage equivalence; the existing real-damage regressions do that separately.

This is an actual-shape **CPU-only** replay with a recording renderer. Character
presentation, audio, FX and GPU raster/driver work are absent. The 207 recorded
submissions are not a count of real GPU uploads. The separate game-browser
smoke uses actual WebGL; neither test is mobile-device FPS evidence.
Raw before/after data are in `inkwave-bvh-2026-10-16/native-replays.json`.

## Splatoon 3 comparison

Keep the previously documented Splatoon 3 11.3.0 behavior/reference baseline in
`inkwave-splatoon3-behavior-2026-10-02.md`. This change preserves existing
INKWAVE shot, movement, ground, grate and damage decisions; it does not establish
Nintendo's internal BVH implementation or retail equivalence. The new fixed-dt
and real weapon replay results are logic tests, distinct from browser rendering
and a Switch/device comparison. No Switch/mobile hardware measurement was made.

## Integration

CI now runs targeted source and emitted native collision parity, and the active
Chromium shard runs the emitted component comparison. Existing gates remain.
The full source verifier completed: **5,890 cases, 5,865 pass, 0 fail,
25 optional skips**. Optional-source-motion VM import warnings were printed but
were not test failures. The final minified build's 25 targeted native cases
plus 10 packaging/offline-graph cases pass **35/35** with no skips.

Actual final-build Chromium game acceptance reports `full-active`,
`fullAcceptance: true`, 431 verified responses and zero page/console/request
errors, covering native menus/equipment, movement, firing, paint, HUD, input and
resource probes. This is WebGL software rendering in a test environment; it
is not a mobile hardware performance result.

Runtime commit `6897b3d4eaf7ed41437f038492c453a16be13255` has the exact Git tree
`2d613eaf85e950a016c425dd1d93ecd8739cfc48` transferred from the locally verified
candidate. Final emitted contentHash:
`80f8ddeae37ee0f8eb8514d8f3396c0c814e2470c69c0214da42485f80bc4d81`.
The subsequent evidence/report and upstream duplicate-import integration does
not change compiled product inputs.

A further Chromium component run after the full source suite finished retained
all result/work-count checks. For 15,000 queries per window, median ray time was
11.4 -> 11.6 ms (overlapping ranges: 10.1–15.1 vs 10.6–12.6 ms); median blocked-fit
workload time was 25.35 -> 18.30 ms. The earlier concurrent-load run is retained
as well: these are diagnostic synthetic-component timings, not a causal
whole-game speedup claim. Ray allocation reduction does not imply a guaranteed
reduction in ray latency.

Raw measurements and validation summary are under
`reports/inkwave-bvh-2026-10-16/`. GitHub checks were still queued during local
acceptance and are not described as successful. Main has no protected/required
status contexts; integration uses the ordinary merge operation with an expected
head SHA.
