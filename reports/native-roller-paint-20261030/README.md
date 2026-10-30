# Native roller continuity and full-resolution contours

The owner reported holes inside the rolled band and missing irregular edges on **externally imported/native stages**. Custom stages and the practice range already worked. This patch fixes the shared native path.

## Causes and changes

1. A native floor is split into many paint charts. The roller's struck-face restriction stopped both CPU claims and GPU stamps at an internal chart boundary. Native `ink-contact` now crosses nearby coplanar turf charts using one event and the same seed. Walls, different heights, NoPaint, ordinary projectile restrictions and legacy-stage behavior are covered by negative tests.
2. Native atlas allocation reduced the resolution until all source charts fitted. Merely raising the requested density was insufficient: hash-checked Barnacle metadata contains 75,857 charts and still fits at only 3.2768 pixels per world unit in a 2048 atlas. A bounded detail cache now renders nearby floors at **30 pixels per world unit**, independently of the global packing density.

The detail cache uses the existing splat shader and source triangles, including sloped floors. Sixteen 8m tiles occupy a fixed 1024×1024 RGBA8 texture (4 MiB); vertex buffers add approximately 2 MiB each on CPU and GPU. Match-scoped CPU coverage history permits evicted tiles to replay when the camera returns. Rebuild work is limited to 128 records per visual flush, with coarse coverage available while replay completes. Guard pixels and matching derivatives preserve tile boundaries. The native stencil mask reads the same coverage as the visible material.

The cache retains coverage only. Existing atlas data remains authoritative for team color/wetness and the CPU grid remains authoritative for gameplay. Clear/dispose discard the history and graphics resources. The shared 18/30-density request also retains the old 4/8 fallback candidates, so raising the ceiling cannot accidentally select a worse global layout. Existing global atlas size limits remain in place.

## Validation

- Real source composition: coplanar roller continuity, height/wall/NoPaint negatives, ordinary-impact isolation, single-event network replay and unchanged custom-stage scope.
- Detail lifecycle: immutable records after growth-pool reuse, fixed 16 resident tiles, eviction and replay, cleanup, inclined source planes and the actual game-camera fallback.
- Existing native chunk visibility, paint cache, quality queue and static source rendering regressions. After integration with the current native mobile budgets and sparse drying, 68 tests pass and 5 asset-dependent cases are skipped. Exact artifact identity is in [validation.json](validation.json).
- Browser test uses actual composed and minified emitted PaintSystem/native materials, verifies emitted file hashes, and makes shader failures fatal. It covers horizontal and inclined source geometry, the real stencil target, camera travel and replay.
- Chromium and Playwright WebKit both pass with touch/mobile context. Each case samples 391 interior points: no CPU holes, no atlas-alpha holes, no stencil-clipped holes and no GL/page errors.
- At the real crowded-atlas density of 3.2768, the Chromium edge variation rises from 24 pixels to 218; the independent 30-density reference is 215. The silhouette intersection-over-union is 99.82%. WebKit measures 29 → 220, reference 220 and 99.75% overlap. These are controlled render measurements, not game frame-rate measurements.

[Chromium measurements](browser.json) · [WebKit measurements](browser-webkit.json) · [real-stage packing evidence](real-stage-density-final.json).

The screenshots are unedited Chromium renders: [coarse control](native-coarse-control.png), [detail enabled](native-detail.png), [30-density reference](native-reference.png), [inclined floor](native-slope-detail.png). Earlier 8/18/30 screenshots and `contours.json` record the initial density-only investigation; the final correction is the independent detail cache described here.

## Reproduce

```sh
node --experimental-vm-modules --test patches/native-stages/tests/roller-paint-continuity.test.mjs patches/native-stages/tests/native-paint-detail.test.mjs patches/native-stages/tests/native-quality-world.test.mjs patches/native-stages/tests/native-queue-behaviour.test.mjs patches/native-stages/tests/native-render-static.test.mjs patches/native-stages/tests/ink-chunks.test.mjs patches/native-stages/tests/paint-cache.test.mjs patches/native-stages/tests/native-quality-queue.test.mjs
node scripts/build-inkwave.mjs inkwave-public _site-native-detail-final
node scripts/check-inkwave-startup-budget.mjs _site-native-detail-final
node scripts/check-inkwave-native-roller-paint.mjs --ipad --evidence-dir .browser-evidence/native-roller/source
node scripts/check-inkwave-native-roller-paint.mjs --site _site-native-detail-final --ipad --evidence-dir .browser-evidence/native-roller/chromium
node scripts/check-inkwave-native-roller-paint.mjs --engine webkit --site _site-native-detail-final --ipad --evidence-dir .browser-evidence/native-roller/webkit
```

## Reference and scope

The comparison target is the owner's working custom-stage/practice-range roller. Splatoon 3 11.3.0 contact width/depth and the existing shared silhouette parameters are unchanged. No Nintendo shape or frame values are inferred. Browser geometry is a controlled source-mesh fixture; the separate Barnacle measurement uses real chart data. Full-map playthroughs, actual iPad hardware and matched Switch captures have not been performed. WebKit with touch emulation is not an iPad hardware measurement.
