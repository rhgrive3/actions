# Crab Tank rolling-trail lifecycle correction

Base: `354536b365ae54bac71c9ce2970a5c5f322c1304` (frozen PR1844). Candidate only; not published or accepted visually.

## Finding and narrow change

The Crab Tank director creates `t.d.rollRib` in ball mode, but previously only ended it when an observed frame switched back out of ball mode. Normal expiration, death, superjump, or actor removal can end the special without that frame. Generic `endTrack` only knows the generic `t.d.ribbons` list, not this separate field. The pool removes expired records only when `ended` is true, leaving an empty live record until eviction.

Add only `DIRECTORS.crabTank.end` to end that record. Existing points remain until their normal 0.5-second lifetime expires. No gameplay, physics, recoil, motion calibration, birth rate, shader, common pool or material changes. Inkjet and Reefslider are untouched.

## Regression evidence

Node v22.23.3, esbuild 0.28.2. Both test cases pass: source module and production `adaptBuildSource` plus esbuild minification. Test imports the complete actual Director/kit modules with test-only class exports. Unused gameplay dependencies and GPU buffer uploads are stubbed. This is source/transformed VM lifecycle verification, not WebGL, browser, full build, or rendered-frame acceptance.

Coverage in each mode: normal finish, death, superjump, direct actor-removal cleanup, repeated cleanup, no ball trail, live trail retention, and hook-removal negative control. Baseline negative control retains one expired empty unended ribbon; corrected termination retains zero. Point arrays are not erased on termination.

Command:

`ESBUILD_MODULE=/workspace/shared/portable-rainmaker-peer-20261022/source/node_modules/esbuild/lib/main.js /workspace/shared/portable-rainmaker-peer-20261022/node22/node_modules/node/bin/node --experimental-vm-modules --test patches/splatoon3/tests/special-crab-ribbon-lifetime.test.mjs`

Receipt: `reports/crab-ribbon-test.tap` (2 passed, 0 failed).

Frozen original verified unchanged: special-vfx.mjs Git blob `02e99beeb80a956c0ca894a169c7a0e36ca100f7`; SHA256 `69edbe6ea3cee441b072bf6ef799466bc540fb5029ae4df1cffdab883e5cb065`. Shared kit SHA256 `8c1dd55a8aad05c19df6b3a1f173ddfdbe2ad8eb7f8c579c3d47219f871e0630`.

## Reference and visual limit

Existing `patches/splatoon3/reference/special-vfx.md` records https://www.youtube.com/watch?v=PLxqXn_E898 as 320x180 storyboards approximately 1.98 seconds apart, not continuous frames. Chapters: Crab Tank 00:21, Inkjet 01:02, Reefslider 01:42. Retail version, native FPS and exact aligned frames are unknown. No new reference pixels or current candidate frames were observed. This fix is independently established lifecycle correctness, not a claim of closer retail animation. No retail motion timings were inferred.

## Overlap

PR1843 changes shared helpers in special-vfx.mjs but not this Crab director/endTrack branch. PR1848 overlaps special-motion.mjs, which is not touched. Existing character, shared material and other weapon work remains unchanged.
