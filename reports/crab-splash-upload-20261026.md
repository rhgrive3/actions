# Crab splash GPU upload prefix

Baseline: `e0072a749df0ec8c2d368e383bdf337baa7b44ad`. The detached Crab visual pool allocates 512 matrix/color slots, but previously submitted every slot on every active update regardless of its live count. Only the live prefix is now submitted. CPU arrays, first GPU allocation, instance count, geometry, materials, colors, bounds, simulation, paint, collision and network behavior are unchanged.

Actual Chromium WebGL/SwiftShader API measurements (not mobile hardware FPS): first allocation still uses 32,768 matrix bytes and 6,144 color bytes. Subsequent one-drop frames submit 76 bytes instead of 38,912 (99.8% fewer); two drops submit 152 bytes; 64 submit 4,864; capacity submits 38,912; empty frames submit zero. The test records `bufferData`/`bufferSubData`, reads actual GPU buffer contents, and compares rendered pixels with the same visual state using legacy full-array uploads. Counts `1→2→64→1→0→3→512→1` cover growth, compaction, hide/reactivation and capacity. Live GPU values and pixels match exactly, and GL error is zero. First allocation remains full sized.

Validation:

```sh
node --experimental-vm-modules --test patches/splatoon3/tests/crab-tank-splash-visual.test.mjs
node scripts/build-inkwave.mjs inkwave-public _site-crab-upload
INKWAVE_BUILT_SITE=_site-crab-upload INKWAVE_CRAB_UPLOAD_BROWSER=1 node --test patches/splatoon3/tests/crab-splash-upload-browser.test.mjs
```

The nine existing tests pass, including the composed production update/clear owner test; the built-site browser probe passes. Use `CHROMIUM_PATH` to select another installed browser executable. Existing S3 11.3.0 reference and unverified shooter draw-radius fallback remain unchanged; this patch changes transfer work only and makes no new retail parity or iPad performance claim.
