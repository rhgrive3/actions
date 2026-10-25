# INKWAVE integration validation, 2026-10-25

Requested snapshot: `354f1c50955d60be5d3bc29c6f3712be505548f8`, tree `20c42a28e4736dff4a190462a25594cd5f565015`, 8,254 leaves. GitHub connector readback and local git checkout independently matched; recursive GitHub tree was not truncated. No substitute snapshot was used.

Current saved candidate: `5d76f049e832ada719407a940e8b9be59f263d81`, tree `0e9d7619b34641ae45f702eb6351397ffc9cb649`, branch `validation/354f1c5-full-browser`. Published and connector-read back. Contains MobileInput lock reconciliation, regression fixture updates, native checker boot binding, Transport repair from f556a29d429184645ef49d560ed3cf1532787020, and exact GPU checker repair from 6890cd67a8fc6287ab986bfca4595371013fbbd7. Central behavior journal received only the Transport 10-line addition. Receipt/anchor/epoch unchanged. No main/PR updates or workflow dispatches were performed.

## Passed

- Production build with Node v22.23.4: `build-final-node22.log`. Default minification/tree shaking retained. Initial exact snapshot failed closed on its stale mobile.js lock (`build.log`); this was not counted as a build pass.
- Strict source/manifest/artifact verification: `identity-successor.json`, 1,468 manifest inputs plus pipeline/verifier (1,470 source files), 2,164 artifacts. inputHash `1b3c82c25b5538e309c813ace3434d8532975331ab0c675d3c5a561929c325dc`; contentHash `4873d95918510609f9be570002b3cf96d807091c3c32f89049b4a0eabeeb9102`.
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

## 06:52 UTC update: complete repository dependencies

Normal repository LFS retrieval succeeded after local LFS setup: 405 native-prebuilt objects, 1,492,087,754 bytes. This did not retrieve the failed external raw OBJ through another endpoint. All 23 stages passed existing converter/integrity admission (`native-admission.json`). The earlier missing-native-dependency blocker is resolved for the repository prebuilt path.

Node22 production `_site-native-complete` passed (`build-native-complete.log`), contentHash `f75205126dc2f9830e2d3db5fa837bb9ed404af93d5a781e44f678cb09207311`. Strict manifest/source/artifact receipt is `identity-native-complete.json`; additionally, every one of the 405 original and emitted native files matched the committed LFS pointer SHA256 and size (`lfs-exact-output.json`). These 405 files live outside the version artifact list and were explicitly checked separately. Stable artifact comparison is `build-artifact-comparison.json` (only shell/config/service-worker/version URL metadata changed after enabling prebuilt; gameplay module bytes retained).

Real composed MobileInput: `mobile-native-events/result.json`, six cases passed with trusted touch, native resize and native physical rotation. Same-angle orientation and same-orientation resize retain the hold; physical angle change cancels it even without changed dimensions. The initial probe expected cancellation for same-orientation resizing, which contradicts the explicit composed runtime contract; that failed attempt is retained in `mobile-native-events/first-failure/`, not erased.

Booyah test retained-clock regression used a stale add-only stub. The test now uses actual ShapePool methods; all six original clock/negative assertions remain. Related Node22 tests 35/35 pass, minified condition 6/6 pass (`booyah-fixture-*.log`). The full suite's original six failures remain in its log, in addition to the earlier three repaired fixture failures.

Native lifecycle with complete prebuilt dependencies passed boot and quality authority/grid/triangle checks, then failed because the checker fault route targeted the old converted vertex URL. That attempt is preserved. Checker now selects the exact prebuilt chunk from a hash-verified stage record and retains all corruption/rollback assertions. Its full rerun is queued behind the Undertow native Canvas check to limit simultaneous render workloads.

Cosmetics diagnostic run also failed its unchanged 240000ms startup gate. Immediate post-timeout diagnostic (`cosmetics-diagnostic/startup-failure.json`) found predicate=true, a live range session and playing state, perf.now about244143ms, bootMs156254. This does not establish a pass at the deadline and no projectile image workload ran. No acceptance predicate or deadline was relaxed.

Current running tests: original intermediate-build rematch 4/10 completed; full source suite still running (default 1,117-file selection); complete-dependency Undertow checker running. The original rematch build is the pre-Transport intermediate contentHash b235a57a..., not the final f752... output. No reduced cycle count was used.

## Current saved candidate and checkpoint

Code head `7b732dddf630f323e3a89b0c735ce6ab4a003f7e`, tree `7319a85ee0c806e2875069be3f980883603c5023` (8,267 leaves). The boot race repair now has a single original 180000ms gate, not two sequential gates; context identity is checked after readiness.

Single-gate native lifecycle: boot and quality passed, injected prebuilt chunk was requested once, old level/paint/display retained, but terminal error was `Failed to fetch`, not the required integrity error. source-data.mjs catches the prebuilt error and attempts pinned source conversion. The original assertion was retained: full result FAIL; cancellation/mobile cases were not reached. Single-gate Undertow also failed its 180000ms startup gate.

Independent actual-game cancellation component also failed its 180000ms Scorch boot gate (screenshot warming83%, no boot error/pageerror). Cancellation/switch cases were not executed. No reduced workload or broad-suite pass was substituted.

Real WebGL2 checker-function probe passed capture/verify, trusted context loss rejection, and successful/failed listener cleanup (`gpu-identity-native-probe/`); it is not full-game idle acceptance.

At this snapshot the source suite remains running with its nine original fixture failures, which have separately passed their corrected focused regressions. Rematch remains running with six completed rounds on the older intermediate b235 build. The two log files in this evidence commit are checkpoint copies, not completed-run receipts.
