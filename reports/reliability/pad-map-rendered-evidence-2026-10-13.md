# Pad-map evidence must show the selected target

## Reproduction and scope

At #1359 head `30ad6119c1d061532027885d0b63027055f7c5e7` (main base `ee9fbbab5883f20d1968e36a4b6b2faeb1f748fe`), the UI artifact `11799987250` reports reliability success while its WebKit pad-map PNG contains no visible map and its Chromium PNG captures a dark entrance frame. Both original 2048×1536 images have zero pixels with all RGB channels ≥160 inside the map-interior rectangle `(280,220)–(1400,1300)` (1,209,600 pixels). The maximum channel there is 31 in WebKit and 68 in Chromium. This is a verifier gap, not evidence that ordinary gameplay fails to show its map.

The old verifier creates a HUD, calls native `setVisible(true)`, assigns `_mapT=1`, updates once with zero dt, asserts selected CSS classes and immediately takes a screenshot. Native `setVisible` restarts `is-enter`; `inkwave-public/styles/hud.css` applies `iw-hud-slide` to the map for 0.7 seconds with a 0.1-second delay and backwards opacity-zero fill. A selected class does not prove painted visibility during that transition.

This correction changes only the verifier, its evidence helper/tests, one existing CI source-test command and this record. It does not change HUD animation, gameplay, input mappings, map spring coefficients, target-life rules or Nintendo/Splatoon 3 tuning. The existing five native queued-target-life cases are byte-for-byte unchanged.

## Stronger acceptance

- Feed D-pad up then right edges into the actual built `PlayerController.updatePadMapSelection`. Check edge consumption, selected actor identity and the matching single beacon/legend row for each target. Do not assign `padJumpIndex` to manufacture selection.
- Start the real HUD through `setVisible` and update its own map spring on actual `requestAnimationFrame` opportunities. Do not set the spring to its endpoint.
- Retain the real `iw-hud-slide` animation handle, require actual completion, and wait for all native finite animations/transitions to finish (including paused or separately pending states), fonts, opaque ancestors and the settled spring. Native infinite beacon pulses are allowed. The bounded timeout only fails the test; it is not a fixed readiness sleep. No animation is disabled, finished, cancelled or restyled to pass.
- Save both full screenshots before asserting their pixels. Decode those exact PNG bytes with the browser's native image/canvas path and inspect the actual selected beacon, native label `<b>`, inset native icon, guide and row-border regions. Check the exact `Target + index` label. Require native bright text/icon pixels inside those narrow text/icon regions rather than accepting white decorated boxes/rings and orange selection-border pixels, with the unselected row remaining distinct. Finite positive bounds must lie inside the screenshot.
- Write `ENGINE-pad-map-evidence.json` plus per-engine result entries before pixel acceptance so blank, faded and wrong-target failures keep useful evidence. Restore all temporarily owned input/world/controller fields after the probe, including queued respawn and map-gyro fields with their original property descriptors (or original absence). Callback errors such as missing native DOM produce bounded recorded failure rather than leaving the browser Promise pending.

After the two positive captures, a browser negative hides only the selected text/icon, keeps decorated boxes/rings and selection borders, captures another PNG, requires both narrow regions to independently lose their bright pixels, and verifies the colored beacon/selection border remain. These styles are restored; positive acceptance uses untouched native presentation. The readiness and pixel contract has negative controls for paused/pending/cancelled finite animation, missing DOM and native update exceptions, hidden/faded classes, blank screenshot regions, incorrect selection, missing border and off-screen bounds. Helper unit tests are added to the normal source gate. These tests verify the acceptance logic; they do not count as browser rendering evidence.

## Verification status

- Syntax and diff checks pass; helper/negative controls: 6/6. The adjacent motion/workflow contract tests also pass. The pre-existing runtime-evidence test is locally blocked because its required `/mnt/workspace` persistent directory is absent; its path contract was not weakened.
- The existing five life-token cases remain unchanged; their original #1359 source and Chromium/WebKit proof is retained.
- Fresh local browser capability check: both configured Playwright executables are absent; system Chromium fails to launch because `process_singleton` socket creation returns `EPERM`. No permission or platform restriction was bypassed.
- New genuine Chromium/WebKit pixel acceptance is pending the single centrally owned #1359 final reconciliation/CI head. Do not call the corrected screenshots verified until that exact-head artifact is inspected. The artifact remains a focused built-HUD/input fixture, not the full game renderer, physical iPad, live relay or retail S3 comparison.
