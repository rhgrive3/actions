# Sub-gear isolation fixture lifetime, 2026-10-19

This is a test-only change to `patches/splatoon3/tests/sub-gear-isolation.test.mjs`. Production gameplay, model generation, geometry and caches are unchanged. It makes no new claim about Splatoon 3 equivalence or physical-device performance.

## Scope and measurements

Fixed source: `1bd140b91e506b84defc4a3d3bdbd1aa22af2172`.

| Source-bound run | Cases | Wall time | Peak RSS |
| --- | ---: | ---: | ---: |
| Original test | 6/6 | 47.79 s | 566200 KiB |
| Canonical production composition, original cold lifetime | 6/6 | 48.93 s | 782404 KiB |
| Reused realm, independent actors and explicit cleanup | 6/6 | 8.76 s | 354444 KiB |
| Candidate repeat after resumption | 6/6 | 9.34 s | 353152 KiB |

A separate latest-source acceptance at `67db773cf2d2ef49bea7a6187cc412c3c5590ef9` passed 6/6 in 9.32 s, peak RSS 347444 KiB, with all 629 actual source reads Git-blob bound and zero mismatches. Nine consumed production/composition inputs changed since 1bd; this latest run is an acceptance result, not a same-input performance comparison. The target test's official blob remains `46572b691011f521b018ddce1674c27a9d09d582`.

The measured repeated work was six independent cold VM realms, each spending about 7.1–7.2 s constructing its first Character; the second Character took about 2 ms. The candidate evaluates the normal production source dispatcher once and retains only the first real Character between scenarios. All 21 original Actor, Character and Skeleton instances remain independently constructed and checked with WeakSets. All 34 original assertion calls remain byte-identical, including nested callbacks, preview failure cleanup, gear AP curves, kit swaps and authoritative throws.

Each of six scenario boundaries gets fresh mutable world inputs, projectiles and physics hooks. Geometry array hashes, shared sub definitions, retained actor state and reference counts are checked. Non-keeper Characters are disposed after each scenario; the last keeper is disposed after the test file. Final cache entries/liveUsers are both zero (42 acquisitions/releases, one shared build).

## Negative controls and coverage

Six candidate-only mutations fail at their intended guards: a prior scenario's `recBomb` callback survives; an Actor is reused; final release is omitted; a geometry position byte changes; a shared sub definition changes; or a later scenario changes the retained actor. The callback mutation reaches the second scenario after two original Actors and one completed cleanup, avoiding an initial-undefined false positive. The earlier initial-undefined experiment is retained but excluded from these six controls. Shell exits are recorded separately because Node's after-hook error can be reported after an earlier process-exit receipt callback.

Existing `issue-483.test.mjs` is unchanged (blob `37d6254c287e4d0b238e2e1d1e9e717c5e00e002`): it covers last-release disposal and a fresh geometry after full teardown, native rematch/quality cycles and cold-cache controls. Its source and CI inclusion were checked; its entire native suite was not rerun for this change. The normal patch-test discovery and required eight-shard fan-in include both test files. No workflow or runtime file changes are proposed.

These are source-only CPU tests. No browser, emitted-site, GPU or physical console comparison was performed. The original optional source-motion VM dynamic-import warning also occurs in the candidate and is not treated as a successful motion-bank load.
