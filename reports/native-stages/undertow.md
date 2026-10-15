# マテガイ放水路 / Undertow Spillway

This adds revised-stage `Vss_Temple01` to the native stage catalog. The public 11.3.0 `SceneInfo.json` distinguishes `マテガイ放水路（改修後）` / `Vss_Temple01` from the earlier `Vss_Temple00`. That table verifies identity only; it does not date the KiTrix extraction or supply native collision, paint masks, spawns or rule placements.

The input revision is `0611f51b35c9736ee986fb2218461e2585b7875e`, stage tree `4f42953ce879e1e65a44342239eccfa728f8fa8f`, and OBJ SHA-256 `a32cff26b1a142d31e7658ebc48f213059b3ea42e86d32ed12cb80de5b03d046`. The 43,263,289-byte OBJ contains 375,948 aligned position/normal/UV records, 259,698 triangles and 278 objects. An independent text-stream comparison verifies every float32 attribute, triangle index and object range. All 230 MTL/PNG inputs match their pinned Git blob hashes; the 184 copied material textures retain their exact source bytes.

Interactive bounds and spawn pads are local calibration. Pnt objects use `_PntSet_`, while ranked variants use `_VarSet_`, `_VlfSet_`, `_VglSet_` and `_VclSet_`. Only Pnt and common display surfaces participate in this stage's inferred collision. `Fld_BG*` scenery renders without becoming collision. Original render buffers retain all source objects; inactive rule variants remain excluded from the rendered display and gameplay.

The directed navigation component used for local play spans x ±29.5 and z ±61. Its supported lower floor supplies pads `[0, 7.58, -58]` and `[0, 7.58, 58]`; interactive bounds are x ±30 and z ±61.5. These choices preserve the complete source render buffers. The higher rear platforms lie in different mutually reachable components, so local pads use the connected lower floor. Native spawn, bounds and barrier placement remain unverified.

## Verification

Numeric results are recorded in [undertow-verification.json](undertow-verification.json). Source models, derivatives and screenshots remain in ignored `.codex-stage-sources/` and `.browser-evidence/` directories. `inkwave-public/` remains unchanged.

The latest native Node suite passes 23 tests; its optional Mincemeat asset fixture is skipped because this stage's private catalog contains Undertow only. Undertow verifies browser-worker/Python equality for render attributes, indices, collision triangles, normals, flags, object IDs, triangle-to-chart mappings and polygon masks. Source support, body fit, friendly wall climbing, enemy-wall release and floor motion pass at 30, 60 and 120 Hz. Spawn approaches have 121- and 119-node directed paths, and all local ranked targets are reachable from both teams.

The five-mode Chromium gameplay run passes with eight actors, seven bots, initial spawn launch/landing, source-floor paint and zero errors. Static render comparisons change zero pixels in gameplay, center and overhead views. A separate 12-frame moving-camera probe measures culling and index upload while retaining gameplay authorities. Source ink uses 184 chunks; gameplay submitted ink triangles decrease from 53,550 to 51,948. The overhead view sees the enclosed source ceiling; the gameplay and center views inspect the interior floor.

Shared source-layer selection and ranked component fixes are in the foundation. Undertow also found overhead collision surfaces obscuring playable minimap layers. Shared fix `e6e981367bcc9d757a62a9e86d9584e029e654a8` attaches navigation to the prepared level, then projects the map to exact supports near floor layers reachable from either spawn. It retains obstacle silhouettes when no reachable floor exists and does not change world triangles, collision or CPU paint. Layered-roof, stale-navigation and obstacle regressions pass; 81 Undertow samples and 406 samples across the original five stages retain source support. Five Undertow samples select playable floors beneath unreachable cover.

The real Chromium minimap probe confirms a painted source floor at height 7.55 remains visible beneath cover at 10.55: CPU ownership value is 1 and Canvas2D alpha is 255. The level references its own current navigation; eight actors and seven bots remain present with zero page errors.

Real WebSocket tests pass across all five modes with 1,536 relay packets and matching source/runtime fingerprints. The controlled Turf test waits for paint replay and growth queues to settle: both complete 2,601,065-byte CPU grids have SHA-256 `67cdfda011f86e185342dd5031048f930e30557a661ca7146f09ce50193831f1`, including the catalog Nova paint radius 3.84. The four ranked tests verify equal authoritative counts. Their sampled paint queues are not required to settle, so those cases make no settled-grid parity claim.

Lifecycle verification passes through the exported production `engine.buildNativeWorld` seam for single-stage corruption and cancellation. One corrupted vertex request rejects with an integrity error while retaining the native level, paint and display. Pending preparation cancels when Tidewater loads; native display groups return to zero. Native→legacy→native→legacy switching returns to the same legacy resource counts. High/low quality changes retain navigation, source triangles and CPU ownership. The 844×390 touch viewport has eight actors, a 2048 atlas and a grounded local player after launch. Six CLI tests reject invalid stage/mobile selections. Same-map user starts legitimately reuse their live world; the checker forces detached preparation through the public production export rather than changing layout IDs. Shared checker fix `60cbfb497beb7ebcbe57efd0c2e4c96f85c3f2ea` is in the foundation.

The public build loads the exact pinned OBJ through the actual stage-selection button, runs eight actors/seven bots, claims source-floor ink and lands the initial spawn. Revisiting the stage uses the derived cache with zero additional OBJ downloads. A corrupted OBJ preserves the previous valid world, removes loading progress and returns to setup with zero page errors. The checker starts a real Tidewater match before the corruption test so actor state belongs to the retained world.

The complete gameplay/WebSocket/render/lifecycle/public-source measurements use the immutable minimap-enabled build created before the later pad-axis helper. The release build and 23-test Node run also include `78a7da7d`'s arena orientation helper; Undertow's `[0, 7.58, ±58]` pads derive the same +Z/+X forward/lateral basis as its earlier landing policy. This shared delta changes no source buffers. Timing results are retained as diagnostic measurements for their stated builds.

```sh
python patches/native-stages/tools/build-native.py \
  --source .codex-stage-sources/raw --out .codex-stage-sources/prepared --stages undertow
python scripts/compare-inkwave-native-undertow.py \
  .codex-stage-sources/raw/Vss_Temple01/Vss_Temple01.obj \
  .codex-stage-sources/prepared/undertow \
  --repository /workspace/actions/.codex-stage-sources/KiTrix \
  --out .browser-evidence/undertow-source-equality.json
INKWAVE_NATIVE_STAGE_SOURCE="$PWD/.codex-stage-sources/raw" \
INKWAVE_NATIVE_STAGE_ASSETS="$PWD/.codex-stage-sources/prepared" \
UNDERTOW_NODE_EVIDENCE="$PWD/.browser-evidence/undertow-node.json" \
  node --experimental-vm-modules --test patches/native-stages/tests/undertow.test.mjs
INKWAVE_NATIVE_STAGE_ASSETS="$PWD/.codex-stage-sources/prepared" \
  node scripts/build-inkwave.mjs inkwave-public _site-native-undertow-release
node scripts/build-inkwave.mjs inkwave-public _site-native-undertow-public-release
flock /workspace/actions/.ci-scratch/native-stage-browser.lock \
  node scripts/check-inkwave-undertow-minimap.mjs \
  _site-native-undertow-release .browser-evidence/undertow-minimap-browser
```

Browser checks use `/usr/bin/chromium` and serialize on `/workspace/actions/.ci-scratch/native-stage-browser.lock`. Use `NATIVE_STAGE_IDS=undertow` with the existing native gameplay, render, lifecycle, source-browser and online checkers. Software GL measurements describe Chromium SwiftShader on this executor; they are not Nintendo Switch or mobile device FPS measurements.

## Comparison limits

Reference: Splatoon 3 version 11.3.0 stage identity. The source export supplies display geometry and textures. The Node and Chromium probes measure this INKWAVE implementation; no retail frame timings, weapon/gear setup or controlled console capture were available for a behavioral equality claim.

Walking, swimming, ink recovery, wall climbing, spawn launch, camera and ranked systems reuse the shared INKWAVE runtime on exact display triangles. Inferred triangle collision and polygon paint masks are local replacements for unavailable native physics and masks. Ranked objectives use reachable Pnt floor calibration across five modes. Retail ranked layers, zones, tower paths, checkpoints, goals and clam placements remain unverified. Shader channel decoding and native material behavior also remain unverified. `version1130Verified` stays `false`.
