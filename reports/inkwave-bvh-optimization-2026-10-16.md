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
  were removed or relaxed. Full-suite final status is recorded below.

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
Final source commit, full gameplay results, build/packaging and game-browser
status are recorded in the follow-up integration entry after verification.
