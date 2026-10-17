# Grate backside lighting correction — Issue #1565 subset

Base: `d5265f73d9dad69f1afd9690e374caee45195f11` (main including PR #1564). This change corrects one measured lighting defect. It does not complete Issue #1565, improve general team-ink readability, or establish physical-device performance parity.

The level shader replaced Three's already-oriented normal and dropped the front/back facing sign. Grates use `DoubleSide`, so visible backsides incorrectly received front-face lighting. The correction now compiles **only under `DOUBLE_SIDED`**. The `#else` branch keeps the exact original two-normalization FrontSide expression, including the native source-stage ink overlay. There is no runtime branch and no new FrontSide use of `gl_FrontFacing`. The existing clearcoat normal receives the corrected double-sided normal.

Within the double-sided branch, normalization occurs after the linear view transform and uses Three's existing facing sign. The redundant earlier normalization is omitted there. This is a source-level algebra observation; no compiled GPU instruction reduction or speed gain is claimed. Three nonexecuting comment blocks in the same generated normal block are removed through guarded build-time replacements to offset the added inactive shader text. The documented upstream `inkwave-public/` source remains unchanged. The existing material cache identity is advanced through the practice-range composition.

## Current verification

The new narrower variant is awaiting its focused source tests, production rebuild, payload comparison, and exact-source Chromium/WebKit rerun. The browser verifier now requires zero changed pixels for all front-facing independent-original-normal controls; the former one-level rounding tolerance is removed because the FrontSide expression is preserved exactly.

The existing `active` CI browser shard retains both source-bound Chromium and WebKit commands immediately after post-depth checks. Both reports are mandatory in the existing source/content-hash evidence binding. No new job or timeout change is introduced.

## Preserved earlier experiments

The [global normalization experiment](global-normalization-experiment/README.md) and all its images, browser receipts, source/build logs, payload comparison and workflow test log are preserved unchanged. That broader variant altered FrontSide arithmetic, and WebKit showed one front-facing texlib pixel differing by 1/255. It is superseded by the double-sided-only implementation.

Whole-game calibration of that broader variant preserved workload/state/full pixels but observed about an 11% completed-time slowdown in a small software-rendered sample. Its cause was not established. A subsequent single-realm actual native Scorch ink/texlib shader diagnostic measured original/current GPU means 193.583/197.104 ms per overlay draw, with paired changes −6.60%, +6.61%, +2.99%, +3.04% and marked chronological variability. It did not consistently reproduce the whole-frame magnitude and did not establish nondegradation. The raw diagnostic, expanded shader source and failed-attempt scope notes remain in persistent scratch at `.ci-scratch/1565/normal-codegen-current-texlib/` and sibling attempt directories. No claim that the narrower fix resolves a demonstrated cause follows from those results.

The narrower version is preferred because the requested grate correction does not require changing the FrontSide/native-overlay normal expression. Full-game performance acceptance remains separate from source-level scope reduction.

## Comparison scope and remaining limits

The project's comparison reference remains Splatoon 3 Ver.11.3.0. The affected interaction is viewing a grate from below or through its openings while walking, swimming or jumping with the gameplay camera. This patch changes illumination only, preserving movement, collision, weapon, paint, recovery, damage, gear and animation rules.

Correctness is referenced to the shipped Three facing-normal contract and independently reversed authored-Level triangle geometry. No Nintendo internal shader curve, original-console timing or exact original-game pixel equivalence is inferred. Imported source-stage meshes, the complete texlib quality/resolution matrix, general gameplay ink readability, physical-device FPS/thermals/power, long matches and the wider Issue #1565 acceptance matrix remain separate. Current callers use FrontSide or DoubleSide; BackSide behavior is not claimed.
