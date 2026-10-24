# Residual-capacity candidate — independent review pending

Protected parents: original PR1857 source/evidence head `d7cc9dd3aecc9dcc70cf38372fc045f03a6aa68d`, diagnostic `84075c76710e767b59b9774dabdd67f573b012d2`. Their refs/builds/failures are retained. This new branch does not update PR1857, main, or PR1854/1855/1856.

## Production delta

Only `patches/splatoon3/firing-cosmetics-adapter.mjs` changes production behavior: skip Splatling in the initial generic draw traversal, then append its one-bead representation after all previous native bodies, InkFlight/Charger drops, sourced falling drops and S3 supplemental effects. Shooter muzzle beads stay last. Both new cosmetics can consume only leftovers in the existing 700-slot mesh. No increase to shared capacity, 32-burst Shooter records, volume capacity, geometry, material, shader, paint, physics, weapon timing or networking. The existing smaller Splatling dimensions and Shooter recipe are unchanged. At zero leftovers the new visuals are deliberately omitted.

## Regression preservation and fix

The exact independent-review fixture is preserved: 32 Splatling rounds (baseline 96/128 old volume parts), 660 ordinary legacy blasts, 48 sourced drops, shared cap700. Native state remains identical. Baseline retains40, original d7cc retains8 (**failed**), residual candidate retains40. Original failing TAP is in `logs/budget-contention-d7cc.log` and the diagnostic parent commit.

Five source/emitted tests cover that saturation, mixed effects, partial capacity, zero capacity, clear/reuse, immutable pre-existing matrix/color/shape/look/petal prefixes, and fixed resource/buffer identities. At zero residual all 700 native slots are unchanged; at two residual slots, all698 previous slots survive and the additions submit one Splatling and one Shooter bead. With normal free capacity, two smaller Splatling beads and three Shooter muzzle beads remain visible. This adds no per-draw constructor or resource allocation.

Validation: **55 source regressions** (15 family/wire/budget +40 existing history/shape/volume), **33 actual minified-module regressions**; stronger prefix assertions rerun5/5 in each mode. Build passes. The source and emitted test counts contain no skip/fail. The first budget-browser harness failed because it called GPU PaintSystem.clear in a CPU-only paint fixture; that failure is retained, and the corrected fixture constructs a fresh CPU PaintSystem as the existing probe already does.

## Native setup diagnosis and controlled comparison

The former native screenshot driver seeded only after variable-duration live boot and kept the pre-existing Character/FxHooks phase. The new diagnostic freezes the ordinary native loop at the documented `__inkwave` handoff, before its first RAF, and awaits the normal source-motion loader. It does not set Game/Actor/Character clocks. Both saved builds then enter at G.time=.05, Character.t=0 and native clock tick3.

For the final candidate, real full-Game Practice Range A/B agrees on input/update ticks, native birth positions, velocities, fields, fire payloads and RNG sequences: Shooter258 draws, Splatling957. Prepared gear loadout/AP/modifiers, profile, palette and character phase are explicitly captured and equal. `phase-residual-gear` contains compressed raw traces and fixed-camera views. The failed old visual pair and earlier diagnostics remain available. This establishes controlled native gameplay equality for these two bounded standing scenarios, not Nintendo visual parity or full-game jump/movement coverage.

The separate real emitted-component browser compares four ordinary/moving-jump60Hz cases (960 fixed simulation steps). All native gameplay traces, firing events, ink state, paint writes, CPU paint grid and counts are exactly equal. `residual-checkpoint.json` contains SHA256 records. These use actual Actor/Character/Physics/FX with CPU paint; they are not a native full-Game or hardware substitute.

## Resource/performance evidence

Real Chromium/SwiftShader draws the six synthetic occupancy conditions and two-actor Shooter/Splatling continuous firing. The original high-particle128-part volume budget and 700 shared cap are identical on both sides; the 400×225 fixture samples submission at30Hz and simulates at60Hz. Existing40/48 drops remain present at saturation/partial capacity. No WebGL errors occurred.

Steady geometry/material/GPU resource counts stay unchanged through each six-second native component scenario, and all rounds, FX drops and added bursts drain to zero. Shooter steady scene190 geometries/60 materials; Splatling188/60, equal to baseline. Burst records remain32 and matrix capacity700. Source tests also retain the exact existing typed-array/resource objects across full/partial/clear/reuse cycles. Heap samples after GC show no persistent growth in the candidate, but do not establish zero JS allocations throughout the pre-existing game.

An initial parallel-run Splatling submit-p95 of21.8ms versus6.3ms baseline is preserved. A bounded sequential follow-up measures Shooter mean submission .70→.92ms / p95 1.5→2.1ms, Splatling .84→.83ms / p95 1.4→1.4ms. CPU means .85→1.03ms and1.18→1.00ms respectively. These are noisy software submission/CPU samples, not hardware GPU timing or a universal FPS guarantee. No new mesh/material/shader/draw call is introduced; added Shooter instances increase triangles within the existing cap, and the removed Splatling volume lowers the mixed fixture's total submissions/triangles.

## Remaining gates

Parent independent review and approval before PR1857 update. Exact-head hosted CI is not claimed. The source-media CONNECT403 remains denied without bypass; retail art measurements/parity and phone/tablet GPU/thermal acceptance remain open. This candidate fixes the proven visual eviction regression without changing native gameplay or expanding scope.
