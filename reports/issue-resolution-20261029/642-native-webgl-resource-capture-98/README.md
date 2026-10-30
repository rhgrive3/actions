# Issue #642: software resource capture and acceptance mapping

Source `98ccd1c6ea143ea402319c6637cd1bca5d075a6e`, build content `5d8b116b9dbb804c21aaa0f92fadd5e9298f1f7a7ecd0a81c3fcc42541524a5a`, input `6c8108b2fb71150e7f0bdf7d7e365b27d0a594cc7b52d3cfb6c1da91301c0fd9`. Both 98 composer invocations used `verifyRuntimeBuild` before and after the run, checking all 1,550 inputs and 2,267 artifacts against the source and manifest. Independent full postflight is archived; its SHA-256 is `e0c69086ee606aefec32ded39964ec0b103e38b4102475fd52c3135b4a109f8c`. The checkout was clean at completion. No source or gameplay changes were made for this capture. These are controlled software-browser observations, not physical GPU memory or FPS measurements.

The original test and the instrumented diagnostic each passed all 48 actual emitted Renderer/ScreenFX cases, with the complete original result rows identical after removing the observer's additional attachment fields. Both retain all original image, format, framebuffer, context and disposal assertions. The observer is a scratch copy that instruments native WebGL2 calls before context creation and forwards the original function with its original receiver and arguments; it adds color/depth attachment queries to the fixture and records only primitive IDs and properties. The original source, diagnostic copies and logs are all archived and hashed in `manifest.json`. Zero observer events were dropped.

All 192 pair observations (48 cases × two textures × reference/candidate) link to 64 distinct native texture IDs. Every ID has a matching real `texImage2D` allocation with the expected dimensions and internal format, a `framebufferTexture2D` color attachment, and a later `deleteTexture` followed by `isTexture` false. The event log contains 385 calls: 100 creates, 109 `texImage2D`, 88 framebuffer attachments and 88 deletes. No `texStorage2D` occurred in this run. These numbers describe the observed calls, not an accounting of all GPU resources. The original fixture's own live-texture count reaches at most five and returns to zero at its disposal boundary.

| Real observed example, LOW idle | Color targets | First target GL allocation | Second target GL allocation | Depth attachment |
| --- | --- | --- | --- | --- |
| Fixed-HDR reference | ID 7, ID 6 | 720×540, RGBA16F `34842`, RGBA `6408`, HALF_FLOAT `5131` | 720×540, RGBA16F `34842`, RGBA `6408`, HALF_FLOAT `5131` | post `NONE`; scene `RENDERBUFFER` |
| Current candidate | ID 12, ID 10 | 720×540, R11F_G11F_B10F `35898`, RGB `6407`, UNSIGNED_INT_10F_11F_11F_REV `35899` | 720×540, RGBA16F `34842`, RGBA `6408`, HALF_FLOAT `5131` | post `NONE`; scene `RENDERBUFFER` |

At the MEDIUM and HIGH idle cases the same native format distinction was observed at 180×240. During active effects, the candidate selected RGBA16F for both colors, matching the fixed-HDR reference. All illustrated IDs were attached and later deleted with `isTexture` false. Equal target dimensions permit a color-format byte comparison; the capture does not determine allocator overhead, driver memory, bandwidth or a physical device's resource usage.

## Original criteria mapping

1. **LOW/MEDIUM/HIGH target dimensions/types and resource capture:** all three touch profiles have the actual software WebGL target-allocation/attachment/deletion capture above, in a controlled fixture with an explicitly fixed-HDR reference. Physical-device GPU capture was waived. Actual dimensions in these rows are fixture dimensions, not a tablet measurement.
2. **Material reduction in idle/menu and normal battle:** the earlier native local-Turf, touch-emulated samples on source `39c2060fe5d27ea1d8182861a07e79da99e8915e`, content `f27791906bcf7a0a1c7e6c6520dbfc513157b6ca1c98b89f5de3029915375308`, input `427e1471ed7225bd6cd7508b2b9960b9893857dcf7a4b4adb3bf91ab3cee5cf0`, observed null lazy menu targets and, in 12 movement observations per profile, packed plus HDR targets 3/12 LOW, 4/12 MEDIUM and 5/12 HIGH. At equal integer target dimensions that pair has 25% fewer estimated color bytes than two HDR targets; active ScreenFX uses two HDR targets. Observations can repeat frame IDs and are short post-start/movement windows, not a time-weighted or whole-match measurement. The three runs had no page, HTTP or request failures. The 39c and 98 emitted Renderer, ScreenFX, Three module, EffectComposer and config bytes match exactly, but the entire application graph is not represented as identical; the native results retain their 39c identity.
3. **Grade/tone map, FXAA, damage/lens, swim/special/flood and color equivalence:** current 98 controlled 48-case render comparison passed all existing tests; all 33 active/negative-grade HDR rows were exact, and the 15 packed idle rows had maximum mean 0.376953, maximum p99 2 and zero alpha differences. Engineering review accepted the existing mean ≤1.25 / p99 ≤3 budget for this work; no claim is made that the issue owner personally agreed to those numbers. Earlier separately retained actual WebGL failure controls demonstrate that a packed active-effects path violates this budget; the failure threshold was not relaxed.
4. **Dynamic resolution, orientation and resize cleanup:** current 98 rows cover orientation, dynamic scale, idle/active transitions, inactive release, reset and disposal, with actual attachment identities and subsequent deletion. Current-graph 39c Chromium and WebKit post-depth checks also covered the corresponding 78 scenarios each, source-bound to their named build.
5. **Desktop HIGH/ULTRA HDR where needed:** the original 78-case per-browser post-depth gate retains the desktop/fallback HDR controls and passes on 39c; selected Renderer/ScreenFX/config/Three/EffectComposer hashes are unchanged in 98. This is component evidence, not a claim that every 39c app file matches 98.
6. **Context stability and post-processing:** 98 controlled composer lost/restored the actual WebGL context, retained the production pause/reload policy, unchanged frame and target, and passed no-GL-error assertions. The 39c Chromium and WebKit depth gates passed their six actual context-loss/restoration/fresh-reconstruction controls and scene-depth negative control. This does not claim physical device stability.

The original fixed-HDR rendering reference is a same-fixture software counterfactual, not a recorded old physical-device baseline. The issue is a software completion candidate; retain it open until required CI succeeds on the final published head. No whole-match, physical-device, physical VRAM or FPS claim is made.

## Invocation and evidence

Node 22.23.4, source root checked out at the named SHA. Each of the following ran once after its prerequisite environment was available:

```sh
node scripts/check-inkwave-offscreen-hair-reentry.mjs --composer-lifecycle --site SITE_98 --source-sha SHA_98 --out ORIGINAL_OUT
node /workspace/scratch/issue642-resource-capture/runner.mjs --composer-lifecycle --site SITE_98 --source-sha SHA_98 --out OBSERVED_OUT
node scripts/check-inkwave-post-depth-browser.mjs --site SITE_39 --source-sha SHA_39 --browser chromium --out CHROMIUM_JSON
INKWAVE_WEBKIT=WEBKIT_WPE_LAUNCHER node scripts/check-inkwave-post-depth-browser.mjs --site SITE_39 --source-sha SHA_39 --browser webkit --out WEBKIT_JSON
node /workspace/scratch/issue642-native-39c-probe.mjs low
node /workspace/scratch/issue642-native-39c-probe.mjs medium
node /workspace/scratch/issue642-native-39c-probe.mjs high
```

A first 39c composer invocation failed before browser launch because its output path was outside the permitted persistent roots; a first WebKit attempt without the required local library launcher also failed before testing. Both logs are retained. `manifest.json` hashes both the uncompressed original files and gzip files. The logs include unfiltered errors and diagnostics. The depth, composer and native samples have overlapping scopes and must not be summed as independent coverage.
