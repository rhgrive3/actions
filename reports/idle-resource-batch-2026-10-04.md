# INKWAVE: inactive music and render-resource lifetimes

## Scope and baseline

Base: `17602ab094da6efb663d872934458e818ae3c93e` (2026-10-04 main). Initial checks used f1f98db9; the intervening two-file CI optimization is retained unchanged apart from this batch’s added acceptance gate. Its five updated workflow regressions were rerun.
Public pipeline: immutable `inkwave-public/` → Splatoon 3 → touch → reliability → local quality. This batch changes only the final quality adapter and its explicit runtime modules; no original game source is rewritten on disk.

Four defects: #366 (duplicate #370), #375, #384, #395. The two music reports are one implementation, not two fixes. Existing movement, weapon timing, paint scoring, 90/180-second choices and gameplay profile remain unchanged.

These are INKWAVE resource/lifecycle policies. Nintendo does not publish a corresponding WebGL texture budget, browser scheduler cadence or offline-pause rendering rate. The sizes below are not asserted to be Splatoon 3 / Switch parameters; no S3 motion/logic parity is inferred from lower allocations.

## Verified baseline and changes

- #366/#370: native `MusicEngine._init()` starts the 25 ms scheduler even without a current Player. Music volume only controls a bus gain. Muted music continues scheduling voices. The new music-only owner terminates the Worker/interval and disposes Players when Music becomes zero. It retains the latest requested track/options and restarts the track on unmute (musical phase is intentionally restarted, not preserved). All installed tracks, null/stop and the boss director's remapping continue through native `play()`. SFX keep their shared running AudioContext. Persisted volume is applied before any audio-init path. Scheduler startup is demand-driven, and worker-error/interval fallback cannot create a second live timer.
- #375: native cloud RGBA16F target is 2048×640 on every device. LOW or touch now uses 1024×320; desktop MEDIUM/HIGH/ULTRA retain 2048×640. RGBA16F precision, repeat/clamp, filtering, no mipmap/depth/stencil remain unchanged. Nominal color storage is 10,485,760 → 2,621,440 bytes (10 → 2.5 MiB). Bake strips use the actual dimensions, not stale global constants. Budget changes call Three's `setSize`, update the resolution uniform, and rebake cloud/PMREM together once. Equivalent effective budgets do no work.
- #395: non-marina transition now disposes the far cubemap once, clears target/camera/sampler and disables sampling. Marina re-entry lazily recreates it. LOW/touch uses 256; other desktop tiers retain 512. Full RGBA16F color mip storage is 4,194,288 vs 16,777,200 bytes. Depth/driver bookkeeping is excluded. This is distinct from PR326's planar-reflection cadence, which is not copied here.
- #384: offline true-pause skips environment, decor, props, rig, paint flush and other world presentation updates. It renders the frozen backdrop once, then only after viewport/DPR, settings, dynamic scale, theme, stage, match or explicit revision invalidation. Failed/skipped draws do not commit the stamp. Context loss/restoration invalidates it even when the platform stops RAF during loss; two bounded listeners follow the current canvas owner. Input, networking, DOM/menu updates and the simulation clock remain on the existing control path; `Match` retains its own paused simulation guard. Dynamic-resolution headroom no longer samples the paused scene. Online menu overlays remain live.

## Primary implementation and API evidence

Inspected current published source, not the removed `game/` prototype:

- [Environment cloud/far allocation and stage/theme lifecycle](https://github.com/rhgrive3/actions/blob/f1f98db94af412fd584a459b11fc97346466a063/inkwave-public/src/world/environment.js)
- [Music scheduler, Player and disposal](https://github.com/rhgrive3/actions/blob/f1f98db94af412fd584a459b11fc97346466a063/inkwave-public/src/audio/music.js)
- [Audio buses and setVolumes](https://github.com/rhgrive3/actions/blob/f1f98db94af412fd584a459b11fc97346466a063/inkwave-public/src/audio/audio.js)
- [Game frame, settings, pause and stage transition](https://github.com/rhgrive3/actions/blob/f1f98db94af412fd584a459b11fc97346466a063/inkwave-public/src/main.js)
- [Three RenderTarget dispose/setSize](https://threejs.org/docs/pages/RenderTarget.html): GPU resources have an explicit owner and disposal lifecycle. Bundled Three implementation is used by source/minified tests.
- [MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices): per-pixel resource budgeting and eager deletion of unused objects.
- [MDN AudioContext suspend](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/suspend): context suspension affects audio processing for the shared context, hence this fix does not use it to mute only music.

All external pages were opened on 2026-10-04. No measured mobile wattage, FPS or total process/VRAM saving is claimed.

## Verification

- Dedicated source tests: 12/12; native Environment/AudioEngine/MusicEngine/CubeCamera/RenderTarget with only WebGL/audio-node boundaries stubbed. Includes original-main negative controls, 40 cloud budget transitions, 8 marina exits, Worker and interval paths, 400 muted tick attempts, 20 mute toggles, every native track and actual composed `Game._frame`.
- Emitted/minified graph mode: same 12/12 (native environment/audio paths are loaded from emitted modules; pure policy, extracted frame and negative-control cases are explicitly source-side).
- Full local-quality + rejection/workflow gate cases: 35/35. Negative gates reject missing themes, NaN, blank images, missing GPU deletion, stale samplers, duplicate disposal, paused work, frozen online behavior and muted music work.
- Public build completed; contentHash `886e4f1082add86dc6489c067e3905f4edb0eeea630b1b22d5aed845ef0b8747`.
- Pinned 11.3.0 source verification: 11 files /126 extracted values /14 unknown, unchanged.
- Complete gameplay/reliability suite: **742/742 passed**, zero failures/skips (400.93 seconds), on final persistent-workspace run. An initial temporary-workspace run correctly failed two persistent-storage guards and four test processes terminated without full per-test diagnostics; these are not treated as passing. No guard was weakened. The final run uses the same test command on persistent storage with two-CPU process affinity to avoid unbounded local parallel load.

## Actual browser acceptance added to CI

`scripts/check-inkwave-idle-resources.mjs` loads the complete published app, verifies loaded bytes and exact source, and collects actual WebGL / Web Audio evidence:

1. Persisted zero music → real key gesture → SFX while music remains idle; audible→mute→unmute, callback/node counts, repeated toggles.
2. Day, sunset (dusk UI theme), golden cloud targets. Same-theme high-resolution repeat must be byte-identical; fixed 256×80 GPU samples compare high/low with mean per-channel absolute error ≤8/255 and >32-error fraction ≤10%. Six PNGs are retained for visual review. These tolerances are an explicit project regression gate, not human/Switch equivalence.
3. Four actual Halyard↔Tidewater world rebuilds, real CubeCamera rendering and actual `deleteTexture` observation, preserved Environment owner and cleared sampler.
4. Real offline match pause, 120 frames: one world render, zero environment/paint/shadow refresh requests, responsive menu updates and unchanged match/actors. Resize redraw and resume are checked. The online-presence comparison is a control-plane fixture, not two-peer validation.

Browser results, PNGs, source SHA and build digest are required by the active-suite success receipt. Failure diagnostics are separate. No CI scheduling/dependency optimization from PR396 is duplicated. Local Chromium remains unavailable because of the previously verified Unix-socket restriction; the new browser gate must run on Actions and is not yet claimed successful here.

## Pending-PR composition and limits

- PR60 `fae8fda380f663b1e6ee325238e46a1975a3fa62` (also in PR329): actual platform adapter and music lifecycle loaded. 59 assertions/source checks cover repeated page suspend/resume while muted and unmuting while suspended, without reactivating muted timers or leaking subscribers. Actual production audio/main/environment compositions parse.
- PR326 `a6873e0dfdb56e194214f298f03f8d2ac3e5657a`: its real resource adapter composes with this batch's environment hooks; both far-cube disposal and independent planar-reflection policy remain present. This is scoped source composition, not a whole-PR/GPU merge claim.
- PR184 `4e331e3bd27dc5f3341dd1321fbaeb3eb9b98716` /PR339 changes menu-owner lifetime, not this frame/render policy. Inspected current changed files; no duplicate implementation. Shared adapter/identity lists require explicit merge resolution preserving both installers.
- This branch stays based on main and does not copy another Draft's gameplay or resource fixes.
- Physical iOS/Android memory/performance captures and long-session audio profiling remain unperformed. Exact browser evidence must be reviewed before fully resolving the resource claims. References remain non-closing until that acceptance is established.
