# Independent Booyah browser evidence — 2026-10-23

**Outcome: browser acceptance remains OPEN.** Both builds produced the same actual rendered initial range frame. The fixed lifecycle attempt reached native Booyah activation, then its retained 240-second bound expired during charge-hover rendering. End-of-life particles, native retirement cleanup, and early cancellation were not observed. This report does not approve the cadence fix or close its browser gate.

Scope: read-only acceptance check of immutable `rhgrive3/actions` revisions. No implementation, runtime, main, PR, credential, or author-task changes. Native subagents were not used. The separate author task was neither contacted nor stopped.

## Identity evidence

The after revision is `97882010d8c3fa0c48e5a7cd2c852fc82d05374d`, parent `42e8ca5689c472d014b51bc0a02a3ba8acf8c361`, tree `8fea1e62474ed4baeb84972ab2aef73226a1da4f`. Its runtime special-vfx SHA-256 is `95aa1927bc81ec46cae73c5eee63adc3741b1cc760e94bbd9123c65968b9f3dd`.

Both revisions were built normally with the committed `scripts/build-inkwave.mjs`, esbuild 0.28.2, production minification, and no runtime edits. Each build has 2,110 manifest artifacts; every artifact was read back and checked against its manifest. The fixed content hash reproduces `5fee0f381775a10c34f261395ebe042a96ac94010db9b7610be207c0153f6c66`; the 42e8 control is `517945cd1f4de828d6a416e5e4b57f35846315f59e99b5e475be566b4f3116c0`. No third full build was performed.

See `source-build-identity.json` and both build logs. The isolated source trees have no tracked modifications; the only untracked entry is a dependency symlink.

## Browser method and limits

System Chromium 154.0.8037.57, headless, 800 × 600, device scale 1. The launch arguments are the existing repository browser-check settings: `--no-sandbox`, `--disable-dev-shm-usage`, `--use-angle=swiftshader`, `--enable-unsafe-swiftshader`. The browser launch arguments and the overall 240-second per-attempt bound were retained. Native boot and native range readiness were diagnosed as distinct phases, each using the repository's 180-second boot wait. No browser timeout configuration or GPU-flag workaround was introduced. The harness serves the complete normal built index, opens the supported `?range` entry, uses fresh browser contexts, seeded Math.random (7), native default avatar/gear/lighting/palette, and the unchanged built-in presentation RNG. A debug freeze is scheduled on the existing native game-ready hook, before controlled `_frame(1/30)` calls; there is no `_skipRender`, hidden-world suppression, shader edit, or pool substitution.

The precondition is completed native boot and a native range in `playing`, followed by a fully rendered 1/30-second game frame. The lifecycle probe uses native Booyah activation and throw controls; a planned charge-field fixture is explicitly described in its receipt. Endpoint emission, immediate cleanup, and early cancellation require the lifecycle to finish. Source tests, emitted VM tests, and component rendering cannot substitute for that actual-browser gate.

Every selected module response has a URL, byte count, SHA-256 and matching manifest hash in the browser JSON. This proves delivery, not completion of native boot, WebGL acceptance, hardware frame rate, or retail fidelity. No Nintendo/reference media was used or uploaded.

## Retained initial attempt

The first fixed attempt timed out at the combined native boot/range readiness predicate after 180,000 ms. Its retained screenshot showed the range scene. The refined diagnostic subsequently demonstrated slow but successful boot/range completion, so that initial failure is not classified as a confirmed renderer stall or a runtime regression. The partial baseline attempt was stopped to correct readiness diagnostics. Its status is explicitly `aborted`, not passed or classified as a renderer failure.

A second fixed attempt separates native boot from range readiness; the baseline diagnostic also reads the actual versioned ctx module on failure. All attempts and the matching harness versions remain in the isolated workspace; public report artifacts contain only own captures, logs and summaries. No failed attempt was rewritten into a pass.

## Concrete normal-browser checkpoints

Both immutable builds completed one normal native `_frame(1/30)` call, with `G.time = 0.08333333333333333`, frame counter 4, 196 render calls, match `playing`, and pause false. The native 30 Hz frame and screenshot completed within the retained 240-second attempt bounds. This is an application-render checkpoint, not a hardware 30 FPS measurement.

The two original 800×600 screenshots are **byte-identical**, SHA-256 `eebb73cfc40bcf2a289c5654ce32c75c11af6fae5e6336123acb118d19cccaa2`; decoded RGB changed pixels = 0. The initial range view, avatar, palette, lighting and camera therefore match in this controlled observation. Booyah was not active in those checkpoint images. See `initial-range-comparison.json` and `*-checkpoint-browser.json`.

## Bounded lifecycle result and exact blocker

One final fixed lifecycle attempt ran from `2026-10-23T14:16:12.428Z`. It used the same normal minified built index and renderer settings. Native range travel selected the special arena, the existing canonical `s3-shooter-blaze-01` (Aerospray RG) supplied Booyah Bomb, the existing native range resupply refilled resources, and the native existing avatar and gear were retained. Observer wrappers recorded spawner calls while passing original arguments and return values unchanged. Neither source/runtime module nor either RNG implementation was replaced.

The attempt reached trusted browser `KeyF` activation. The last completed sample is at `G.time = 0.18333333333333332`: `actorSpecial = booyahBomb`, `actorTrack = true`, `actorAlive = true`, `directorErrors = 0`, 192 render calls, 17 pooled sparks, 48 puffs, 4 shapes. There were no Booyah suction/scatter/burst calls in that last completed sample, and no native Booyah world object had been created. These are observations at activation, not endpoint or cleanup assertions. The full probe's recorded native palette and camera are in `fixed-lifecycle.json`; a paired full-special baseline was not completed, so equal full-special conditions are not claimed.

**Failed action/target:** Playwright `page.evaluate` running a batch of 18 ordinary `window.__inkwave._frame(1/30)` calls on the fixed normal built game; operation label `Booyah native charge hover`. Every requested game frame renders normally; no render-suppression flag was used.

**Reason and outcome:** the retained 240,000 ms per-attempt watchdog fired at approximately `14:20:12Z` and closed Chromium. The blocked `page.evaluate` then reported `Target page, context or browser has been closed`; the completion of that frame batch is unconfirmed. The receipt ended `blocked` at `14:20:42.743Z`. The post-failure readback/capture also reported the closed target. This is a bounded browser-execution failure, not an approval denial. The watchdog message is preserved verbatim in `browser-fixed.log`. No lifecycle operation was retried after that watchdog failure.

The existing `KHR_parallel_shader_compile extension not supported` warning occurred. It is a software-renderer limitation signal, not proof of the exact cause of the elapsed time. Native boot and range warmup consumed most of the bound. The earlier baseline control successfully booted the same normal app and completed its first 30 Hz frame, as retained in `before-checkpoint-browser.json`; that control is not a full Booyah lifecycle comparison. No additional browser probes were launched after the bounded lifecycle failure.

The planned full-charge fixture, native sub release/throw, natural 40F/80F observation, residual-fade captures and early actor-splat cancellation were **not reached**. The prepared lifecycle code was not modified or rerun to force a pass. No terminal counts or cancellation assertions are claimed.

## Evidence separation and remaining work

| Evidence | Result | Practical limit |
|---|---|---|
| Frozen source identity | Exact commit/parent/tree/runtime hash confirmed | Does not establish WebGL behavior |
| Production builds | Both pass; 2,110/2,110 artifacts match each manifest | Does not establish browser execution |
| Browser-delivered selected module graph | Recorded response hashes match each manifest | Delivery alone does not establish completed rendering |
| Normal native range frame | Both complete `_frame(1/30)`; original PNGs identical | One controlled rendered frame; no hardware FPS claim |
| Native Booyah activation | Observed on fixed build using trusted `KeyF` | No paired full-special baseline |
| Native end-of-life emission and 80F cleanup | Unverified | Lifecycle did not reach throw/burst/retirement |
| Early cancellation / no spurious burst / no lingering track | Unverified | Case not reached; browser close is not in-game cancellation evidence |
| Source/VM/component opportunities (53 source + 5 emitted / 39+39) | Prior evidence supplied by delegation; not rerun here | Not promoted to actual visual acceptance |
| Nintendo/retail comparison, hardware FPS | Not attempted or claimed | Outside this scoped original-vs-fix check |

Remaining browser gate: a paired 30 Hz full native Booyah lifecycle with matched scene conditions, visible endpoint emission and immediate record cleanup, plus the minimal early-cancel case. The initial range comparison and activation checkpoint are reusable evidence; they do not replace that gate.

## Artifact and repository preservation

Only this independent worker's captures, JSON receipts, logs and this summary are included. No runtime edits, main merge, PR #1854/other PR changes, access/credential changes, author-task contact, or native subagents. All local attempts, original captures, build outputs, isolated source trees and harness versions were preserved. An interrupted initial baseline receipt is explicitly marked `aborted`. The public branch is report-only relative to parent `97882010d8c3fa0c48e5a7cd2c852fc82d05374d`.
