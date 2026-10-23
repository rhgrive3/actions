# #1671 / #1757: composed CPU follow-up (2026-10-23)

Base: `26a4db4123d23162a3dbf8a12150b1b5bc6ccf64` (latest main at checkout and subsequent fetch). Runtime candidate: PR #1851. Neither issue is closed: actual iPad mini 6 / Safari before-and-after measurements remain required.

## Scope and diagnosis

The target is the public `inkwave-public` input after **all** production adapters, including `patches/splatoon3`, in a normal esbuild-minified build. Authored-source timings alone were not used to identify new runtime work.

An initial low-quality, 1200-tick native Scorch workload (`measure-inkwave-native-sim.mjs`, 60Hz, seeded normal Turf, 8 actors / 7 bots) observed 19.34ms mean CPU work/tick, 7.98ms Character updates, 3.02ms paint advancement, 1.27ms TriangleWorld.ray and 0.75ms bot updates. Initial Tidewater 600-tick work was 11.73ms mean, 5.82ms Character, 0.23ms bot, 0.24ms physics.raycast. These inclusive timings overlap. The machine is Linux / AMD EPYC 9V74, Chromium 151 / SwiftShader, not an iPad.

The new opt-in CLI records emitted-runtime frame p50/p95/p99, simulation, Character/source-motion/render preparation, BVH ray/queryBox/sweep/contact, bot/nav, projectiles, paint, HUD, environment and render submission/shadow scopes. V8 GC pauses are observed via CDP tracing on the measured renderer thread, clipped to explicit measurement marks; nested events are merged. Heap values are CDP snapshots before/after the transaction, **not memory peak**. Full render submission requires `--render`; CPU-only workloads retain atlas drawing and visual preparation but skip final scene submission. They are not presented frame or GPU timings.

## Small optimization batch

`BodyBalance.apply` used to propagate intermediate world rotations through every source bone although only six gain joints and their ancestors have readers. Prepare their ancestor closure once and traverse it in the original skeleton order. Player00 intermediate rotation entries: **66 -> 8** (Player01 has 64 source bones). Final `pose.fk()` still visits **every** output bone. Keep the old full traversal for skeletons without parent-before-child ordering.

All coefficients, interpolation arithmetic on consumed entries, contact/IK paths, weapon muzzle, source triangles, collision, paint, bot decisions, fixed ticks and selected graphics settings remain unchanged. This touches no shaders, materials, geometry, texture/detail, shadow quality, network packets, audio or shot counts. Intermediate `BodyBalance.world` slots outside the ancestor closure are internal unused scratch; final pose/world/wp/wq outputs remain fully evaluated.

The actual paired component benchmark (`body-balance-component.json`) uses production-composed modules, the real lossless Player00 pack and identical THREE. ABBA x2, 40,000 calls/window: median **1355.69 -> 1287.01ms**. This is a small component CPU result with shared-host noise, not a game FPS percentage. The targeted component is only a small part of total Character/frame work; this does not establish recovery of the severe iPad issue.

A curve-descriptor predecode trial was rejected: two ABBA experiments differed by only about 1–2%, without a convincing timing signal. Upper-body intermediate FK elimination was already present in the composed main runtime and was not counted as new work.

## Regression evidence

- Source-loaded before/after comparison: **1260 frames**, both Player00/Player01, shooter/charger/roller, 30/60/120Hz, idle/weak input/moving/firing/jump/transform. Every final local/world pose, character bone matrix, skinning buffer, foot/contact target and muzzle position agrees exactly (cross-realm snapshots cloned without numeric normalization).
- Fresh normal minified candidate build: the same **1260 emitted-runtime paired frames** match. Ancestor-closure/fallback regression also passes; 27 vs 1593 intermediate quaternion multiplications across 27 balance inputs confirms actual work reduction. This is not just an array-length assertion.
- Existing motion regression: **1164** detailed comparisons pass, including held Roller release, source clip seeks, irregular/paused intervals and 30/60/120Hz.
- Direct-source ownership: 14 tests pass. Quick patch compatibility, normal build and startup budget pass. GC union and A/A comparison negative controls pass.
- Hosted CI is tracked on the PR; local checks do not substitute for a completed GitHub Actions result.

Resource-counter limitation: identical-baseline Tidewater transactions had the same per-frame game/paint digest, but different renderer.info.memory totals (338 geometries / 43 textures versus 323 / 44). These counters include resources GPU-initialized during earlier asynchronous menu frames; the CPU-only transaction does not render the new scene. Preserve all resource snapshots as diagnostics and do not call this a memory-budget, whole-geometry or whole-image acceptance result. This corrects an overstrict condition in the newly added draft comparator; existing production CI gates remain unchanged.

The completed full-runtime A/A/A-B receipts and render-submission observations are summarized in `runtime-summary.json`. The finite state hash reads actual `Actor.stats.turf` and throws on absent/nonfinite fields. Earlier captures accidentally hashed absent `Actor.turf` (NaN payload bits) and their state-comparison results were rejected; original failed receipts remain locally preserved. No ULP tolerance or retrospective numeric normalization was added. Failed harness attempts are not counted: initial private-asset serving rejected non-public assets, Cargo correctly fell back because it is online-only, dummy targets were initially mistaken for source-motion characters, and an early high-quality native-attract boot exceeded its timeout. The harness now authenticates local native integrity tables against the build, validates actual selected stages, awaits only real source characters, and starts from the ordinary menu before freezing and loading the requested stage. No runtime admission or quality gate was weakened.

## Reproduction

Install Node 22+, esbuild 0.28.2 and Playwright 1.62.1, then Chromium. Preserve a baseline checkout/build and candidate checkout/build separately. Normal CPU workloads need no original-stage assets; use Range, Tidewater and Kelpline. Native Scorch optionally uses the existing private source preparation described in `patches/native-stages/README.md`; never commit/deploy the original assets or local native build.

```sh
node scripts/build-inkwave.mjs inkwave-public _site
node --experimental-vm-modules --test patches/local-quality/tests/body-balance-work.test.mjs
INKWAVE_BUILT_SITE=_site node --experimental-vm-modules --test patches/local-quality/tests/body-balance-work.test.mjs
node --experimental-vm-modules scripts/benchmark-inkwave-body-balance.mjs component.json
node scripts/benchmark-inkwave-composed-cpu.mjs --site _site --source-sha FULL_COMMIT_SHA --frames 1800 --hz 60 --quality high --stages range,tidewater,kelpline --evidence-dir .browser-evidence/a1
# Repeat with the identical baseline build into a2; run candidate into b.
node scripts/compare-inkwave-composed-cpu.mjs .browser-evidence/a1/result.json .browser-evidence/a2/result.json .browser-evidence/b/result.json comparison.json
```

Use `--render` for a separate scene-submission sample, `--no-wrappers` for an instrumentation control, and `--hz 30` / `--hz 120` for other render intervals. Record the quality and frame count for every run. Retain failed receipts. The comparator rejects mismatched A/A states, roster, quality, geometry, per-frame gameplay digest, final paint ownership digest/counts, BVH counts and draw counts before reporting timing rows.

## Existing PRs and remaining device acceptance

Already-integrated #1733/#1734/#1741/#1748/#1764 are baseline work. Do not duplicate #1828 catalog/nearest, #1838 ground-column/gyro, #1833 device capture/support or #1848 HUD/swim-film/shader work. #1815 separately changes BodyBalance target storage; this change concerns the intermediate rotation loop, preserves that PR's branch and does not import its other changes. The constructor may require a small merge reconciliation if #1815 lands first.

On actual iPad mini 6 Safari, compare the same stage, location, camera, roster, weapon, difficulty, paint age, graphics settings and warm/cold conditions for at least 30s using `?profileRange=1&perf` and Safari Web Inspector for GC/memory. Record native source ID, frame/sim/render p50/p95/p99, source BVH query/triangle counters, draw calls/triangles, shadows/paint flush, memory, WebGL loss and recovery. Repeat legacy Turf and Range. No hardware FPS, battery, temperature, retail Switch parity or Nintendo-native collision data was measured here. Existing inferred display-triangle collision and placements remain qualified as before.

## Completed browser CPU evidence

Four stages × 300 measured ticks per capture (5 logical seconds at 60Hz), with 423 fixed warmup ticks before recording. A/A and A/B agree for **every recorded frame state**, final paint grid/ownership/counts, BVH counts and draw counters. Turf uses 8 actors / 7 bots; Range has one source character and 11 production dummy targets. These samples do not substitute for the 30s physical-device acceptance.

| Stage | A1 p50 / p95 ms | A2 p50 / p95 ms | B p50 / p95 ms |
|---|---:|---:|---:|
| tidewater | 10.40 / 25.20 | 12.60 / 28.10 | 10.30 / 24.10 |
| kelpline | 10.70 / 24.10 | 12.10 / 27.10 | 10.30 / 25.70 |
| range | 3.00 / 8.30 | 3.50 / 7.00 | 4.60 / 12.60 |
| scorch | 12.80 / 37.00 | 14.40 / 40.00 | 27.60 / 63.10 |

The broad run **does not establish a whole-game speedup**. Its candidate Scorch wall time worsened during overlapping software-render/recorder work. The environment exposes many logical CPUs but the observed cgroup budget is **4 CPU cores** (`400000 100000`), with throttling. Therefore a separate Scorch ABBA sequence ran without another benchmark and recorded renderer-thread CPU ticks alongside elapsed times. Do not hide the adverse broad results or convert either series to FPS.

| Order / variant | Mean wall ms/frame | p95 wall ms | Renderer thread TaskDuration ms / 300 frames |
|---|---:|---:|---:|
| s1 / base | 14.575 | 31.000 | 3920.783 |
| sb1 / candidate | 14.822 | 33.000 | 3882.782 |
| sb2 / candidate | 15.928 | 35.600 | 4097.700 |
| s2 / base | 17.403 | 38.200 | 4262.455 |

Both isolated candidate runs preserve the recorded state and BVH/draw counters exactly against both baseline runs. Baseline drift and the small component size prevent a reliable overall improvement claim. Thread counters cover the recorder interval (including digest/observer overhead), while wrapper scopes are elapsed times. With wrappers disabled, the first 30 Range state hashes still match the instrumented candidate prefix exactly.

High-quality baseline-only scene submission diagnostics: Range render submission 18.30ms/frame (shadow 1.36ms, 208 draw calls in the final frame); Tidewater render submission 24.66ms/frame (shadow 2.60ms). See the JSON for full counters. These SwiftShader submission costs can include driver waits; they are not hardware GPU time and are not an A/B quality/FPS proof.

The initial `1ebfb8e7` hosted dedicated source/emitted regression succeeded. Its A+ run failed because the historical inverse-reconstruction benchmark assumed BodyBalance would never receive later source changes. The repair freezes that old migration pair at an SHA-256-pinned main26a4 fixture, preserves its byte-identity assertion, and adds a strict exact-text admission of **only** this explicit new ancestor-closure delta. The real current source/emitted numerical regressions remain required. Local A+ then passes. Hosted final-head results are linked on the PR; the failed first attempt is preserved.

For actual Safari 30s capture, note that main currently retains a rolling diagnostic buffer; pending #1833 provides a separate bounded 30s capture. Use a complete Safari Web Inspector timeline or that separately accepted capture, rather than treating a copied rolling snapshot as a complete 30s series.
