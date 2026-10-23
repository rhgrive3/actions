# Fixed 9cee focused browser observations

Production commit remains `9cee2c425bf7d31ac5312c1e108fab10afc36c8a`; worktree clean. No runtime, PR or main write. All browser settings/viewport/180000ms waits/60000ms screenshot timeout match the preceding saved browser checker. Chromium uses the existing software-renderer flags. Read `summary.json` first.

## Actual Game observation

`candidate-game-r3/receipt.json` records real rendered Tidewater, local team 0, 8 actual Characters. Setup uses existing Game.startMatch/spawnAt/freezeBots hooks. Native requestAnimationFrame/FixedClock/Match/PlayerController run normally; there are no manual Game._frame calls or skipped renders. Inputs are actual keyboard W/S and mouse events. Pointer lock is established with real KeyP and RESUME-button interaction. Each recorded gameplay tick is 1/60, with valid native terrain-capsule endpoints.

All five per-case assertions completed: enemy side ingress and ingress from a real backwall corner remain at radius 4.6; the latter starts 0.4 from the actual wall. Allied exit distance is 6.786, return distance 0.672. Real splat/death countdown leads to aim, then mouse-driven 60-tick flight and a living grounded touchdown. This verifies functional launch, not the separately owned landing weapon animation. The two screenshots were inspected as actual Game images.

The combined checker then **exited with a postflight error**: its final manifest fetch used document.baseURI, placing `inkwave-build.json` under the version directory (404/JSON error). The original receipt/exit are preserved, not relabeled as a clean CLI pass. `postflight.json` separately revalidates the unchanged 1423 source inputs, all 2112 artifacts and 576 actual Game response hashes. A Playwright APIRequestContext read of the correct root `/inkwave-build.json` returns 200 and exactly the saved 579240 bytes. This supplement uses no Game or renderer. The QA script's future root lookup is corrected; the Game run's original `harness.mjs` remains intact.

Actual Game page errors were zero. The only HTTP error in that run is the checker's final wrong manifest URL. DevTools evicted one large Roller cosmetic-volume response body before capture; that response is explicitly unavailable, not byte-attested. This is separate from the successful filesystem artifact hashes and actual Actor/spawn-module response checks.

## Separate browser component diagnostic

`before-component-r2` and `candidate-component-r2` use identical fixture HTML/input and no Game/renderer. They load the actual installed Actor, Physics and Character (sourceMotion ready), with paint/audio/FX stubs. From `[15.39,20,0]`, zero initial velocity, right intent, box `[13,0,-2]..[15.1,2.2,2]`, enemy pad `[20,0,0]`, radius 4.2, 180 explicit 1/60 Actor updates:

- 07a: first invalid index 66 at `[15.4,1.5891632460844727,0]`, 114 invalid endpoints; last `[15.4,0,0]`.
- 9cee: zero invalid endpoints. Native terrain radius is 0.35; the legacy 0.38 diagnostic is separately retained.
- Both final component runs have zero page/HTTP errors; 402 served responses per run are byte checked. These diagnostics are not represented as actual Tidewater Game trajectories.

## Preserved failed attempts and limits

- `candidate`: initial observer threw at its 1200-record bound while launch input was not established. It was terminated; its launch is not accepted. Earlier four Game cases were superseded by the r3 observations. The replacement observer retains the same bound and stops recording instead of throwing into gameplay.
- `candidate-r2`: menu-entry wait timed out at the unchanged 180000ms; mode stayed menu/attract. No Game result is counted. Subsequent Game setup uses the existing Game API; menu navigation itself is not accepted by this focused test.
- The first component runs without a data favicon produced one console 404 each; the final identical component fixtures declare a data favicon and record all HTTP failures explicitly. Old results remain preserved.

The existing no-outside-candidate behavior is unchanged. This one real-map backwall route does not establish that all eight candidates can never be blocked along ordinary paths on every stage. No universal spawn-exclusion claim, full PR1860 acceptance, new network/CI/retail/device or landing-visual acceptance is made.

## Published evidence snapshot

This evidence-only branch adds this report and result JSON to unchanged 9cee runtime. Compressed final receipts and exact executed harnesses retain the failed combined Game-check status and the independent component comparison. `local-evidence-index.json` pins all retained local attempts. Full local evidence archive: `respawn-browser-focus-9cee-evidence.tar.gz`, SHA256 `46fc842fd41aa16a66bdca66f1a8efa2fc2a511c227021296a7086484b4fefd3`. No PR/main update or new runtime/CI acceptance is implied.
