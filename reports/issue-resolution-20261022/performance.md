# Performance issue resolution evidence — 2026-10-22

Baseline: `rhgrive3/actions` main `26a4db4123d23162a3dbf8a12150b1b5bc6ccf64`.

| Issue | Verified disposition | Remaining acceptance |
|---|---|---|
| #1757 | #1748 menu GPU retention/SVG optimization already merged (`35399aad`). | Matched physical iPad mini 6 legacy Turf CPU/GPU/frame-time capture. |
| #1671 | #1764 native paint exclusion optimization already merged (`391ec2b8`). This change repairs missing full-window export in the opt-in profiler. | Actual-device source-stage trace, dominant CPU fix and matching before/after device p50/p95/p99. |
| #642 | Lazy composer, mixed packed-grade/RGBA16F-scene and one removed post depth attachment already shipped. | Physical iOS/Android GPU memory, FBO/visual/orientation/context acceptance. |
| #845 | Remote/offline budgets already ship; this change fixes a reproduced false source-ground shortcut for native worlds. | Physical camera-away/reentry trace and broader native-stage muzzle/render validation. |
| #1434 | Previous strict calibration failed exact repeated pixels even in native/native control. | Fix deterministic calibration before ABBA/BAAB measurements; keep diagnostic benchmark out of production. |

These five issues remain open acceptance work. No device FPS, successful visual comparison or whole-game improvement is inferred from source fixtures.

## Added bounded capture for #1671

Open the production-composed game with `?profileRange=1&perf`, enter the intended native Turf scene, fix stage location/camera/weapon/roster/quality, then run in the connected device console:

```js
const frameTrace = await globalThis.__inkwaveRangePerf.ready;
frameTrace.startCapture();
```

Run the intended 30-second workload. Use the existing **Copy frame trace** button, or retrieve `globalThis.__inkwaveRangePerf.report()`. The report adds a `capture` object containing all admitted frame rows. For only the compact bounded capture JSON:

```js
frameTrace.captureReport();
```

`stopCapture()` ends early; `startCapture()` deliberately replaces a previous capture; the existing profiler reset releases it. Recording is explicit: ordinary profiling still keeps only its rolling window. Each executed and recorded `Game._frame` is captured; rAF callbacks skipped by the existing frame cap are excluded. No extra simulation steps are run and no frames are resampled. Each row retains stage ID, mode, elapsed time, CPU scopes, source BVH counts, method counts and fixed-clock metadata. The rolling HUD and its 240-frame summary are unchanged.

Default bounds are 30,000 ms, 4,000 frames and 4 MiB UTF-8 for the compact capture object, whichever completes first. 4 KiB is reserved for fixed metadata. The outer existing rolling report is outside that byte bound. Exports state the stop reason (`duration-limit`, `frame-limit`, `byte-limit`, `manual`, `disposed`), admitted count and observed count; capacity exhaustion must not be called a full 30-second result. The duration window excludes frames completing at/after its deadline. If rendering pauses, the next frame/export observes completion; no timer modifies gameplay.

Frame snapshots are immutable at recording time. Pending GPU samples and asynchronously delivered long tasks are not backfilled into the capture, although the existing rolling summary continues its native asynchronous behavior. GPU command samples are not presentation timings. Capture admission performs JSON/UTF-8 work only while explicitly recording; its instrumentation overhead has not been measured on physical hardware.

For before/after evidence, save both capture JSONs with their exact build/ref, device, stage, inputs, roster, weapon, graphics quality and repeated run conditions. Reject captures stopped by frame/byte capacity when a complete 30-second period is required. Compute whole-capture p50/p95/p99 from `capture.frames`, rather than treating the rolling HUD summary as that full interval. Physical-device recording and any resulting optimization are still outstanding.

## Verification

- Baseline focused performance/diagnostic source fixtures: **48 passed / 0 failed / 0 skipped**, Node 24.19.0, 512 MiB heap, serial test files, 34.044 s. Existing optional source-motion dynamic-import fixture warnings occurred; test process exited 0.
- Modified tracer suite: **15 passed / 0 failed / 0 skipped**, Node 24.19.0, 0.630 s. New checks cover a 1,799-frame half-open 30-second window beyond the HUD capacity; exact frame retention; frame/UTF-8 byte caps including Japanese metadata; explicit capacity rejection; unchanged game calls; deadline/manual/reset/disposal behavior; and normal opt-out.
- Existing tests additionally preserve native BVH/method counters, frame wrapper return/exception behavior, hook restoration, GPU query bounds, stage-switch cleanup and lazy opt-in installation.

Physical iPad Safari, Android GPU, emitted browser execution and strict whole-game calibration were not run by this agent. No issue closure, remote write, merge or deployment was performed.

## #845 native source-ground correction

The offline foot-ground shortcut previously intersected `level.blocks` as solid OBBs. `NativeLevel` explicitly represents static paint charts and source-object bounding boxes in that list, while `NativePhysics` owns original triangle collision. A real half-square triangle with a square chart/object bound reproduces the defect: at the empty half `(1,1)`, the original source ray misses and Character ground stays at root Y **0.2**, while the old offscreen shortcut invents support at the bounding-box top **0.0**. The new regression failed on the unchanged helper with `0 !== 0.2` before repair.

`queryStaticGround` now returns its existing fallback sentinel for native worlds. Character therefore uses its unchanged `NativePhysics.raycast`, including exact source triangles and dynamic supports. The legacy OBB shortcut, all authoritative Actor simulation, source geometry, camera budgets and core rig pose are unchanged. This is a correctness repair; native foot rays are retained, so no native-device CPU improvement is claimed.

The full offline suite passed **11/11** after repair (Node 24.19.0, 512 MiB heap, 19.322 s); after adding the dynamic-support assertion, the final focused source regression separately passed **1/1** (10.836 s). The source regression compares both actual legal triangle support and the hole against the real native ray oracle, asserts normals/geometry unchanged, and checks dynamic support above the hole. Existing tests retain legacy skipped-ray counts, terrain muzzle equality, left-hand Dualies muzzle, 30/60/120 Hz clocks, authoritative movement/collision and render reentry.
