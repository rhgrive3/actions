# Torpedo/Fizzy splash GPU upload prefix

Baseline: `e0072a749df0ec8c2d368e383bdf337baa7b44ad`. `torpedo-splashes.mjs` shares one 768-entry instanced mesh for detached Torpedo/Fizzy drops. Its matrix uploads previously transferred all 768 slots every active step. Color uploads transferred all slots on birth/removal compaction. The new cached update ranges submit only the live prefix, preserving the existing dirty-only color upload policy. Initial allocation, capacity, draw count, lifetimes, last-user disposal, birth colors, bounds, simulation, paint, collision and network behavior remain unchanged.

Actual Chromium WebGL/SwiftShader measurements (not hardware FPS): an eight-drop steady frame transfers 512 matrix bytes instead of 49,152 (98.96% fewer), with no color transfer. At 16 live drops with dirty colors, total transfer is 1,216 bytes instead of 58,368; at 64 it is 4,864; at one it is 76. Empty frames transfer zero. Capacity transfers remain unchanged. First allocation and post-empty pool recreation still allocate full 49,152-byte matrix and 9,216-byte color buffers.

The opt-in browser regression calls the production spawn/step/clear functions for both Torpedo and Fizzy, records actual `bufferData`/`bufferSubData`, reads GPU live buffer values, and compares rendered pixels with legacy full-range transfers. Sequence `8→8→16→64→1→0→3→768→1` exercises steady frames, mixed birth colors, growth, compaction, disposal/reactivation and capacity. GPU live values and pixels match exactly; visible states draw non-background pixels; GL error is zero. Browser temp/profile storage remains under the persistent workspace. Raw numeric results and source/harness/runtime hashes are stored in `.ci-scratch/torpedo-upload/result.json`, overridable with `INKWAVE_UPLOAD_EVIDENCE`.

```sh
node --experimental-vm-modules --test patches/splatoon3/tests/added-weapons-allocation-parity.test.mjs
node scripts/build-inkwave.mjs inkwave-public _site-torpedo-upload
INKWAVE_BUILT_SITE=_site-torpedo-upload INKWAVE_TORPEDO_UPLOAD_BROWSER=1 node --test patches/splatoon3/tests/torpedo-splash-upload-browser.test.mjs
```

All 11 existing allocation/parity tests pass, including the added live matrix/color range assertions; normal build and the built-site browser probe pass. `CHROMIUM_PATH` selects another installed browser executable. Existing S3 11.3.0 numeric references and unverified retail calibration remain unchanged. This reduces transfer work without changing gameplay or adding a new retail/mobile performance claim.
