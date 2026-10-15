# Defense candidate selection helper extraction

Private review candidate against main `aac58ce4cb395df197932486a9da61c233909dab`. Not published or adopted.

Only runtime change: move the per-query `consider` arrow closure to a module-level `chooseDefenseCandidate(best, candidate, length)` helper. Validation order, provider invocation order, strict less-than tie selection, callback identity and caller ownership remain unchanged. No target cache, range, damage, RNG, visuals or scheduling changes. The source no longer evaluates a capturing function expression on each call; actual optimized heap allocations have not been measured.

## Verification
- Exact current-main runtime inputs are overlaid on immutable base 45780e3a. Each read input is Git-blob hash checked; current-main runtime deltas include Tenacity, HUD, Bubbler and health-recovery changes.
- Existing real caller/source suites: 18 passed, 0 failed/skipped. Includes native projectile steps, charger interception, actual Bubbler damage/ghost/terrain ownership, blast shielding, Slosher and full production Curling identity.
- New portable VM-graph suite: 3 passed, 0 failed/skipped in source mode. It checks 2,197 candidate combinations (invalid values, equal distances, earliest winner, callback identity, inert query and provider order), then actual composed native `_step` against real Bubbler deployment in owned/ghost/nearer-wall modes, and a native Curling producer through the full production installer.
- Runtime installers and candidate providers used by the new suite come from the fixture VM graph. No direct source-runtime import substitutes for the emitted helper. With INKWAVE_BUILT_SITE, the test verifies the artifact-map contentHash, every emitted artifact SHA256, and the current helper source-input SHA256 against the manifest.
- A dedicated draft workflow pins the PR checkout SHA, runs all 21 source cases, builds exact production composition and runs all 3 new cases against emitted modules. The source and emitted gates require exact TAP totals (21 and 3 passes respectively), zero failures/skips, and explicit shell pipefail. Shared workflows remain unchanged.
- Actual candidate emitted execution, hosted CI and browser checks remain unrun. Disk is tight and local browser execution is unavailable. The portable source pass does not substitute for these.
- 18 permitted active PR changed-file lists had no overlap at 20:18 UTC. Character-scoped PRs 401/1442 were excluded. Recheck before publication.

## Bounded selection costs
Node module-lexical VM execution with actual baseline/candidate helper code and stub providers. Three warmup windows of 1,000,000 calls per side, then 15 alternating windows of 1,000,000 calls. Baseline/candidate share the same workload; timing is outside the parity checks. Empty roster, eight eligible enemy actors with no valid contact, and mixed valid/invalid contacts are included.

Latest wall-time medians (milliseconds per 1,000,000 queries): empty 51.952→40.004; eight-enemies 141.333→129.808; mixed-contacts 199.686→185.726. The two earlier processes also had lower candidate medians for all three paths (empty 27.458→21.025 and 28.364→20.152; eight-enemies 108.968→103.770 and 117.400→103.765; mixed 154.686→136.199 and 304.702→262.379).

Absolute timings vary greatly under shared-machine load. These isolate selection overhead with stub candidate providers; they do not measure complete collision-query costs, retained heap, total allocations, browser/GPU/FPS or iPad performance. Eligible-path slowdown did not appear in these three runs; that is not a guarantee for every real workload. The original script-global VM harness was invalid for module lexical lookup and is excluded from evidence. Raw samples are retained privately.
