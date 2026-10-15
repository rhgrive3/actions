# Skip rain queries when HP recovery is already ineligible

Baseline main: `45780e3a1f19945753f21c9cd2b169a19cc45ac7`.
Runtime change: only `updateHealthRecovery` in `patches/splatoon3/runtime/resources.mjs`.

The function previously ran `stormRecoveryState` before checking full HP, post-damage delay or enemy-ink contact. Rain cannot enable recovery when any of those gates rejects it. Move the same comparisons ahead of the rain query, retaining the original `<` and `>=` comparisons under negation to preserve NaN behavior. There is no cached eligibility: newly injured actors immediately query live clouds.

## Gameplay and query ownership

Healing amount, max HP, delay, cloud-order iteration, friendly/enemy classification, submerged behavior, the turf-combat gate and all special states/timers remain unchanged. This does not change `storm-effects.mjs`, Tenacity, native stage collision or weapon behavior.

`stormRecoveryState` returns booleans without writing actor/cloud fields. `cloudCoversActor` only constructs temporary positions and calls LOS. The native `Physics.los` writes internal query scratch and its private `_losHit` cache, not actor gameplay state or events; `_losHit` is not consumed elsewhere. Later raycasts initialize their result fields afresh. The reduced query count is deliberate; no caller-visible collision result is retained from this recovery check.

All permitted open PR changed-file lists were checked on 2026-10-14: no overlap with `resources.mjs`. The separate overlapping Wail candidate remains unpublished and is not included.

## Verification

- 2,352 paired actual-Actor cases at 30/60/120 Hz cover HP and delay boundaries/NaN/Infinity, enemy ink, submerged state and absent/friendly/enemy/mixed clouds. Every enumerable Actor field graph matches the original function. Ineligible queries make zero LOS calls/clones; eligible queries retain exactly the original counts.
- 60 additional paired transitions cover alive/dead actors, Storm/Ink Vac state, super-jump state and unrelated ink/gauge/timers, reversed cloud order, vertical cutoffs and an actual native-Physics occluding roof. Injured-after-full and cloud-removal transitions remain live.
- Paired matrix avoided 12,816 native LOS calls while preserving outputs.
- Existing Storm and vertical-cutoff tests plus the first parity case:16/16 passed. Final portable file passed2/2, including an independent fixture-graph lifecycle/allocation guard; together with the15 unchanged adjacent cases this is17 passing tests. Original-main negative control fails that functional guard with8 native LOS calls instead of0 on the full-HP tick.
- Final functional test supports `INKWAVE_BUILT_SITE`: exported helper comes from the fixture's VM graph. It checks current source SHA against build-input receipt and actual emitted helper SHA against artifact receipt. Its source-only baseline transformation is explicitly skipped for emitted runs. Actual emitted execution and final hosted/browser CI remain pending.
- 172 unique exact-main fixture inputs were hash-verified. Production-composed Actor/Physics are used for the paired test, with controlled empty/roof geometry and cloud records; this is not a full live-match or retail replay.

## Bounded allocation/CPU evidence

In 1,000 full-HP helper calls with eight overlapping friendly clouds, original native LOS calls were8,000 and Vector3 clones16,000; candidate counts were both zero. Timing is a separate uninstrumented phase: real native LOS with the same roster/cloud inputs, 100,000-call warmup each, eleven alternating100,000-call windows on Node v24.19.0.

Original median2,384.277ms (range1,993.311–4,348.682); candidate median2.861ms (range2.324–7.306). Both leave HP100. This intentionally isolates the fully ineligible/eight-cloud case, not the frequency or cost of that situation in actual matches. No browser FPS, match-wide CPU, GPU, retained-heap or iPad improvement is claimed. Raw sample values are retained with the local evidence.

Eligible-path tradeoff checks (HP reset50 before every call; seven alternating10,000-call windows) measured no-cloud medians4.032→4.230ms, eight-friendly-cloud217.936→209.834ms and eight-enemy-cloud198.587→216.865ms. The initial enemy-cloud median was9.2% higher, so an extended same-process21×20,000-call comparison was run. Its wall medians were459.095→450.746ms and process-CPU medians453.277→450.717ms, with identical HP50 and LOS counts. The earlier slowdown did not reproduce; eligible-path timing remains within observed variability, not a claim that every path is faster. The early gate adds eligibility comparisons before the enemy-rain rejection on eligible ticks.

The existing Splatoon3 11.3.0 friendly-rain recovery rule and calibrated cloud geometry are unchanged. No new retail-equivalence claim. Independent review accepted the bounded helper proof. The dedicated workflow pins checkout identity, runs source/adjacent tests, builds production code and explicitly invokes the emitted functional case with source/artifact hashes; shared validation workflows are untouched. No merge/deployment included.
