# Native Turf paint and motion optimization evidence

The paint atlas previously uploaded four copies of each quad's shared attributes on every submission. Native paint now keeps the original CPU arrays and packs eligible quads into a 20-float (80-byte) instance instead of four vertices totaling 64 floats (256 bytes). It validates the original rectangles, indices, shared attributes and relevant render state, falling back to the original draw path when those conditions do not hold. The original geometry and material are restored after a draw, including when it throws.

For offline native Turf, the fixed-clock integration also coalesces eligible atlas submissions within a clock slice without removing or reordering quads. It flushes at drying, capacity and final-tick boundaries; unknown states retain the original path. The body-balance change evaluates only needed mixed-centre world rotations and their ancestors, retaining the canonical FK when the skeleton, FK implementation, callbacks or math implementation are outside the supported case.

## Measurements and limits

The earlier baseline and candidate builds were based on `b60a2216a4a553be9ffa6b80f2c30c325aebfd55`. In a deterministic native Scorch, eight-actor, offline Turf replay (30 Hz presentation, 60 Hz fixed simulation, 120 presentation frames), scene display rendering was disabled but the paint atlas was actually rendered via Chromium/SwiftShader. The already-batched baseline made 200 atlas render calls and 1,000 `bufferSubData` calls totaling 13,908,480 API-specified bytes. With transfer packing, atlas renders remained 200, and uploads became 200 calls totaling 4,346,400 bytes (68.75% fewer bytes). The per-frame actor/bone/muzzle hashes, final grid/ownership/counts and full 2048×2048 atlas SHA-256 at frames 60 and 120 matched baseline A/A/B, with no page or GL errors. These are API argument byte counts, not measurements of physical GPU traffic; this replay does not measure full-game frame time or device FPS.

The body-balance component measured 14–21% less time in the tested isolated `BodyBalance.apply` workload. This is not a measured whole-game gain. A separate scene-disabled 1,200-tick match timing comparison varied enough that no overall improvement could be established. Splatoon 3 hardware/behavior comparisons, full-screen visual parity, online matches, other stages and real device FPS remain unverified.

On the integration PR base `77b670f2fe2db1096caab254797690ee3be97db2`, the built `src/world/paint.js` and both new paint runtime modules were byte-identical to the previously tested candidate. A fresh synthetic WebGL atlas test on this integration build passed single, overlapping and mixed splats, 6,000-quad capacity, 6,001-quad overflow, a 36-frame growth/drying timeline and custom-vertex fallback, with byte-identical pixels and no GL errors. For 240 quads it observed 61,440→19,200 specified bytes and 5→1 upload calls. See [integration fixture](pr1983-paint-fixture.json) and [prior native match comparison](paint-transfer-comparison-final.json).

The current integration base reports the locally available Scorch prebuilt record as stale; its build therefore uses the native browser-conversion fallback. That is a property of the integration baseline's native stage converter/record, not evidence of a full native match replay on this latest build. The PR's CI and valid native asset pipeline must assess the final integration.

## Local checks

```sh
node scripts/check-inkwave-patches.mjs --quick
node --experimental-vm-modules --test --test-concurrency=2 \
  patches/local-quality/tests/native-paint-transfer.test.mjs \
  patches/local-quality/tests/native-paint-tick-batch.test.mjs \
  patches/local-quality/tests/paint-hotpath.test.mjs \
  patches/local-quality/tests/native-paint-dry-regions.test.mjs \
  patches/local-quality/tests/paint-mipmaps.test.mjs \
  patches/splatoon3/tests/paint-queue-regressions.test.mjs
node --experimental-vm-modules --test --test-concurrency=2 \
  patches/local-quality/tests/motion-fk-hotpath.test.mjs \
  patches/local-quality/tests/motion-queue-parity.test.mjs \
  patches/local-quality/tests/balance-center-rotation-fk.test.mjs \
  patches/local-quality/tests/body-balance-work.test.mjs
```

For the synthetic browser probe, build a baseline and the candidate, set `INKWAVE_PAINT_BASELINE` and `INKWAVE_PAINT_EXPERIMENT` to their respective built `src/world/paint.js` files, and run `node scripts/check-inkwave-paint-transfer-browser.mjs <candidate-site> <output.json>`. Chromium and Playwright are required. The full native replay and A/A/B receipt comparator are `scripts/check-inkwave-paint-batch-work.mjs` and `scripts/compare-inkwave-paint-transfer-work.mjs`; run each build with `--trial-only` to generate receipts, then compare them; the replay requires a valid native Scorch asset set.
