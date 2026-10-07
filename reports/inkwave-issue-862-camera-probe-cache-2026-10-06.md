# INKWAVE Issue #862 — stationary follow-camera probe cache

chosen_issue: 862
resolved_issues:
  - 862
baseline_sha: f31f5da439134fe49bb89018dad5557671a49c67
branch: inkwave/c-add100-codex3-residual-r42
source_status: implemented locally; parent integration and final review pending

## Root and implementation

The published native source calls `G.physics.cameraProbe(this.pivot, _back, this.wantDist, 0.62, _probe)` every `CameraRig._follow` update. Native `Physics.cameraProbe` uses 15 rays against `Physics.level`'s Level broadphase. Once the camera springs settle, unchanged inputs and static stage geometry produce the same `{hard, soft, floor}` result, but the full ray fan still runs every rendered frame.

`patches/local-quality/adapter.mjs` now adapts only the `src/game/cameraRig.js` call site. The per-rig cache stores the three scalar result fields and the input/context values that made them. It refreshes when the followed actor, mode, global Level, Physics object or probe/raycast function changes; when the Physics Level, blocks, hash, or block-stamp arrays are replaced; when the pivot or wanted distance changes by more than 1 mm; when the boom direction vector changes by more than 0.001; or after 250 ms. The mode/target transition clears the cache before the next follow update.

The 250 ms accumulated-follow-time bound catches in-place geometry mutations that keep all Level objects and arrays; refresh occurs on the first follow update at or after that time. Normal stage collision geometry is static. Camera shoulder-clearance raycasts remain on their existing per-frame path. `inkwave-public/` remains byte-locked; the installed source is produced by the normal build adapter chain.

## Splatoon 3 behavior comparison

Reference condition: this repository's curated comparison label is Splatoon 3 Ver. 11.3.0; normal follow camera; player stationary after camera springs settle; no weapon or gear-specific behavior. Nintendo's camera collision ray count and query cadence are not documented in the checked source set, and no Switch hardware run was performed. This is an INKWAVE duplicate-work fix, not a claim that the internal S3 camera algorithm has the same ray structure.

For identical camera inputs and an unchanged static Level, the cached native output preserves the same `hard`, `soft`, and `floor` limits. Material motion toward a wall invalidates the result in the current update, so the existing boom fast-in/slow-out response continues. The only intended play impact is lower main-thread collision-query work while that camera state is stationary. No actor speed, movement collision, damage, weapon timing, ink accounting/distribution, or battle/online state is changed.

## Acceptance and limits

`patches/local-quality/tests/issue-862-camera-probe-cache.test.mjs` loads the real `inkwave-public/src/game/cameraRig.js` and `Physics.cameraProbe` as raw baseline and after the build adapter chain. Its 30/60/120 Hz checks compare the complete camera position/orientation/boom state frame by frame. The raw baseline asserts 15 probe rays on every stationary frame; the adapted output must preserve camera state while using at most 6 full probes in one second (at least 75% fewer probe rays). Additional checks cover first-frame refresh on movement toward a simulated wall, Level collection/instance rebuild, Physics instance and probe/raycast function replacement, target and mode changes, unchanged actor/weapon/HP/damage/ink fields, and the separate shoulder-ray call count. A same-context fixture changes the collision response without replacing Level objects and verifies that the next update after the 250 ms follow-time bound observes it (with the expected one-frame scheduling quantum).

Focused native module result: 4/4 tests passed. `git diff --check` passed. This is logic-level evidence; browser frametime/CPU measurement, full build, physical devices, and Splatoon 3 hardware parity remain unverified. In-place mutation of collision block contents without any camera-input change is observed on the first follow update at/after 250 ms of accumulated follow time; Level, blocks, hash, or block-stamp replacement invalidates immediately.
