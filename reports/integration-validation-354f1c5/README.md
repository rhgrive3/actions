# INKWAVE integration validation, 2026-10-25

Requested snapshot: `354f1c50955d60be5d3bc29c6f3712be505548f8`, tree `20c42a28e4736dff4a190462a25594cd5f565015`, 8,254 leaves. GitHub connector readback and local git checkout independently matched; recursive GitHub tree was not truncated. No substitute snapshot was used.

Current saved candidate: `cb3c6daad050183fb17aada74d0b0b566b47d59f`, tree `95badc6f2db54be80585c8f10fc2b64cd4b406e4`, branch `validation/354f1c5-full-browser`. Published and connector-read back. Contains MobileInput lock reconciliation, regression fixture updates, native checker boot binding, Transport repair from f556a29d429184645ef49d560ed3cf1532787020, and exact GPU checker repair from 6890cd67a8fc6287ab986bfca4595371013fbbd7. Central behavior journal received only the Transport 10-line addition. Receipt/anchor/epoch unchanged. No main/PR updates or workflow dispatches were performed.

## Passed

- Production build with Node v22.23.4: `build-final-node22.log`. Default minification/tree shaking retained. Initial exact snapshot failed closed on its stale mobile.js lock (`build.log`); this was not counted as a build pass.
- Strict source/manifest/artifact verification: `identity-successor.json`, 1,470 source inputs, 2,164 artifacts. inputHash `1b3c82c25b5538e309c813ace3434d8532975331ab0c675d3c5a561929c325dc`; contentHash `4873d95918510609f9be570002b3cf96d807091c3c32f89049b4a0eabeeb9102`.
- Startup budget: `budget-final.log` (deterministic gates, not browser timing).
- Source focused regressions: `source-tests.log` 55/55; `successor-source-node22.log` 14/14; `focused-fixture-regression-node22.log` 63/63. Zero skips.
- GPU checker regression: `gpu-checker-tests.log`, 171/171, zero skips. This is not GPU workload acceptance.
- Volume identity: `volume-identity-configured.log`, 4/4, including all 34 decoded RGBA frames and shipped source VTF equality. Repository shooter/roller binary payloads were present and readable.
- Real Chromium Canvas2D: `canvas.log`, 14/14; 40 legacy conditions, 90 native frames, nonblank and negative controls. This isolated canvas proof is not native-stage startup acceptance.
- Real emitted Input/MobileInput/Game/HUD fixture: `input-final/result.json`, 5 cases; screenshot `input-final/input-fixture.png`.
- Real emitted Transport and local WebSocket browser: `transport-final.log` and `transport-final/`; emitted Node Transport 4/4 in `transport-emitted-focused.log`.
- Related emitted gameplay: 9 passed in `emitted-focused.log`. Of the remaining tests in that mixed run, 37 were source-reading tests and one minimap setup failed; the whole run is not a pass.

## Failed / blocked

- Native Undertow/Hammerhead full browser: `undertow-recheck.log`, `hammerhead-recheck.log` and their JSON receipts. Pinned external OBJ `https://media.githubusercontent.com/media/kirakira-dev/KiTrix/0611f51b35c9736ee986fb2218461e2585b7875e/stages/Vss_Temple01/Vss_Temple01.obj` failed with `net::ERR_TUNNEL_CONNECTION_FAILED`; paired MTL aborted. Native prebuilt payloads were absent/unverified. No alternative asset/corpus/archive access was attempted. Loading cancellation and native full-stage rendering remain unverified.
- Emitted minimap fixture setup: missing `_site-final/patches/native-stages/runtime/rule-availability.mjs`; no dependency was fabricated or copied into the output.
- General browser: `browser/browser-result.json`, 180000ms startup timeout, 559 verified responses, zero reported page errors; screenshot `browser/browser-failure.png` shows warming at 87%.
- Cosmetics: `cosmetics.log` / `cosmetics-final.log`, unchanged full workload startup predicate timed out at 240000ms. Screenshots and startup-failure JSON are retained. Later post-screenshot state was playing; it does not prove the predicate at the timeout boundary. Diagnostic-only follow-up retains predicate, workload and deadline.
- Idle checker default browser: missing Playwright headless-shell executable. Installation failed with 403 `Domain forbidden` (`browser-install.log`). No alternate browser download was attempted.
- Idle checker using the already-installed system Chromium through `system-chromium.mjs`: `idle-system/idle-resources-result.json`, 180000ms boot timeout. GPU identity workload did not pass.
- Initial full source run was invalidated by an input change while running (`patches.log`); it was rerun under Node22. The rerun's original three fixture failures are retained, with the focused repairs separately tested. Full-suite completion remains pending in `patches-node22.log`.

## Running at this checkpoint

- Full source suite, default 1,117-file selection and unchanged isolated 14-body Turf suite.
- Original default 10-cycle rematch checker: one completed round recorded; subsequent rounds pending. No shorter cycle count substituted.
- Cosmetics full-workload follow-up with boundary diagnostics.

Linux Chromium software WebGL/SwiftShader is used. These results do not claim physical mobile/iPad/Switch performance or measured Splatoon 3 parity. Existing unverified Splatoon 3 Ver.11.3.0 comparisons remain unverified.
