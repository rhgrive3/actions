# Slosher initial falling-splash distance, 2026-10-26

Base: accepted `67ea07501387f282464ac8b76d93842650c976d1`, in an independent worktree/branch `codex/slosher-initial-phase-20261026`. The rejected blanket visibility candidate `ebae611653380060dabba5ba0bb5da5ba9919cac` and its uncommitted evidence remain preserved in the original worktree; this branch is not its descendant. Remote main was observed at `d88aa683074f8c85765308b274a04a03feeb99f6` during this pass. Parent coordinates integration.

## Established field-wiring defect

The pinned Leanny/splat3 numerical records are version 11.3.0, commit `7280ff9cde8bb1c5dcef46c700c326471584d2e6`. `source-rows.json` retains the exact relevant numerical spawn/draw/combination records and their original row paths and hashes. All three affected families select `UnitGroupParam.Unit[0].SplashAndSplashWallHitSpawnPrm.SplashParam[0]` through `Combination.OrderNum:0 / SplashArrayOrderNum:0`. Their `SpawnParam` has no `SpawnNearestLength`; that is a different family's field. The existing catalog path consequently initialized all three to the literal fallback distance **1**. It did not consume their explicit `FirstSplashRateForLengthMin/Max`.

| Actor | First-rate min/max | Spacing | Correct first-distance interval | Existing first | Count / visible draw radius |
| --- | --- | --- | --- | --- | --- |
| Sloshing Machine (`WeaponSlosherLauncher`) | .1 / .35 | 3.6 | .36–1.26 | 1 | 4 / .2 |
| Bloblobber (`WeaponSlosherBathtub`) | 1 / 1 | 3 | 3 | 1 | 5 / .2 |
| Explosher (`WeaponSlosherWashtub`) | .5 / .55 | 3.1 | 1.55–1.705 | 1 | 7 / .1 |

The first rate multiplies `SpawnBetweenLength`, using the same interpretation already installed in `slosherIntermediateSpec` for the native Slosher owner. Reusing the admitted main-glob seed chooses a value within the declared rate interval without consuming another random sample. This is the existing INKWAVE deterministic sampling policy, not a recovered Nintendo RNG algorithm. In particular, Machine's old constant 1 happens to lie inside its interval but discards its declared variation; Bloblobber and Explosher's old constant 1 is outside their intervals.

Source row SHA-256 values:

- Launcher: `3b6d7326f487efd5f8999c7286d0688e97cc5bb9d1e3938fba5e4ea6c69c9a9a`
- Bathtub: `203ff1f8b529bcda8224d4cd5b247aeb3ebb1b54a62f1838c980957a4718d4af`
- Washtub: `d7b73f92338b9e2fa320092b56ca768c395d9a26ec1f0e90ccf1be2dc0fbcf1b`

## Implementation and limits

The sole production edit is eight added lines in `patches/splatoon3/runtime/main-weapon-catalog.mjs`, initializing the existing non-Tri/non-Dread Slosher falling-drop owner from the two first-rate fields and existing spacing. Missing/invalid rates keep the prior fallback. Tri-Slosher and Dread Wringer keep their existing selected-combination resolver.

Main trajectory, birth, speed, lift, drag, gravity, damage, collision, life, range, RNG budget and source drop count/spacing/radius/depth are retained. Positive `DrawRadius` and the sole airborne drop renderer are retained. Falling-drop release locations and downstream painted locations intentionally change with the corrected phase. Total painted-cell equivalence is not claimed. The current generic path-distance convention is retained; this patch does not assert that its three-dimensional-versus-horizontal metric matches Nintendo's implementation.

This is a numerical spawn-phase correction. It does not establish original-game silhouette, falling-drop shape, or Hissen main-blob diameter. The previously reviewed Hissen reference frames are post-impact or partly occluded and do not justify an early-flight size calibration. No original media is included.

## Verification

`emitted-before-tests.log` runs the new endpoint checks against the accepted, freshly built `67ea075` runtime (`a064cdee…`). All three fail on the actual initialized distance 1, establishing the defect in emitted code rather than a stale generated directory.

Fresh production-minified build: `/workspace/slosher-initial-phase-site`, esbuild 0.28.2. Content hash `9ffcb90467b8553f2c825a5805ad7a021d91421a60ca6184e01b3cafeff5aa96`; input hash `60b784f26026273fbb8c66d8421152ff3b587322305616cb442a580643f787ff`; revision `71c1f399cfa445cbabcb8f9a716b87bf5fce1f014170fcc4e1f84f0c9f1da88a`. `build.log` retains the build receipt and its pre-existing native-stage asset limitation. `startup-budget.log` verifies artifact hashes, module/dependency completeness and deterministic startup budgets; it is not a timing benchmark.

Implementation commit: `f41a35346caff97b5eed55a953c7893b344acf09`. `build-verification.json` checks all 1,481 build inputs against that exact Git commit and all 2,180 emitted artifact hashes. Only `patch/runtime/main-weapon-catalog.mjs` differs among build inputs versus the accepted build. Seven protected emitted modules, including projectile presentation/visuals, falling physics, the native Slosher resolver, weapons and bomb cues, are byte-identical. Build-only recipe inputs are also unchanged.

- `source-tests.log`: **28/28**, the new nine phase tests plus existing flight contact/range/life/ghost clipping, Machine outer damage, four independent Bloblobber attacks, native Mop births and Hissen draw/physical-paint checks.
- `emitted-tests.log`: **9/9**, all new phase tests against the fresh production-minified site.
- `source-visibility-tests.log` and `emitted-visibility-tests.log`: **3/3 each**, after strengthening the visibility assertion to prove each positive-radius drop adds its own instance beyond the main-only draw. This is a focused rerun of the changed assertion, not another full suite.

Phase regressions cover min/mid/max source rates, no new RNG calls during flight, count/spacing/dimensions, first admitted release age and exact interpolated coordinates at 30/60/120 Hz, and immediately before/at/after lifetime and head-contact boundaries. At level aim with fixed seed .5 in the isolated production fixture, first releases occur at flight frames 1 / 6 / 2 (Machine / Bloblobber / Explosher). Fixtures stub terrain/paint and use an elevated actor; these are numerical source/emitted checks, not original-game visual proof.

Source reproduction:

```sh
node --experimental-vm-modules --test \
  patches/splatoon3/tests/catalog-slosher-initial-splash.test.mjs \
  patches/splatoon3/tests/catalog-slosher-flight-contact.test.mjs \
  patches/splatoon3/tests/tri-slosher-floor-visual.test.mjs \
  patches/splatoon3/tests/catalog-dread-wringer-origin.test.mjs
```

Build with `node scripts/build-inkwave.mjs inkwave-public <separate-output>`. Set `INKWAVE_BUILT_SITE=<separate-output>` when running the new test file to verify emitted behavior. No manual CI, PR or merge is launched by this worker.

## Normal browser observation

One completed Chromium 154.0.8037.57 / SwiftShader run used the actual emitted site, normal live rAF/fixed clock, trusted menu and touch controls, and the existing pause weapon picker. No input flags, physics, aim, RNG, time, animation or visibility were forced. `browser-observer.mjs` retains the exact observer executed here (its absolute imports name this executor's installed Playwright and repository helper). `browser-live.json.gz` retains the complete receipt; `browser-summary.json` makes the observations readable. Four loaded runtime responses were hashed against the versioned emitted manifest.

| Family | Actual first threshold | Source-rate result from actual seed | First native flight age | Draw radius |
| --- | --- | --- | --- | --- |
| Sloshing Machine | .9655204624973586 | .9655204624973586 | 1F | .2 |
| Bloblobber | 3 | 3 | 6F | .2 |
| Explosher | 1.6572307285216674 | 1.6572307285216674 | 2F | .1 |

The live first releases lie inside their actual source crossing steps. Every family retains a positive-radius falling-drop record. Machine / Bloblobber / Explosher produced 18 / 84 / 14 `_draw` callbacks; these can include multiple fixed ticks per presented frame and are not independent GPU-image counts. All 17 recorded control gestures and both menu-entry gestures were trusted. All cases were unpaused, the live simulation advanced through their waits, and page/pointer-lock errors were zero. Audio was running with 15 play admissions, zero dropped voices and no loader errors; this is engine telemetry, not listening or original-game audio proof. Audio code/media are unchanged.

All four committed PNGs were personally inspected. Machine's ordinary asynchronous screenshot catches painted terrain after flight; Bloblobber's screenshot shows a main bubble in flight; Explosher's shows a later spray/contact effect. The separate Machine `native-render.png` is the actual 720×480 canvas copied immediately after an unmodified render at first-main age .05 s, when a real source-radius .2 falling record is also present. It shows the current attack presentation, but overlapping main/trail effects do not support assigning a precise pixel diameter to that drop. Bloblobber/Explosher missed the narrow early-flight canvas window; no replay/freeze was used to fabricate it. These images establish actual rendered behavior and its capture limits, not matched retail shapes or Hissen dimensions.

The production-minified catalog grows from 81,376 to 81,663 bytes (+287), with no new per-frame pass or RNG draw. Initial JS remains 2,021,663 bytes, the same as the accepted build. Physical device performance and original-game visual parity remain unverified. No original media is added, and the rejected visibility candidate is not published or integrated.
