# Additional distinct frontend screenshot states

QA-only supplement to PR1931. Fixed product: `379533f541d86346a068e397f879cb6c13590ffd`; no product modifications or main merge intended.

CSS viewport/DPR1: phone390x844,844x390; iPad mini744x1133,1133x744. Chromium emulation, not physical-device/Safari certification.

- Editor batch (4 sizes,5 images each): actual touch layout editor via Settings; native stick selector and expanded X/Y position disclosure; synthetic storage-save failure (only touch-layout key, restored immediately); Cancel restores prior layout; first press of settings reset confirmation (not accepted). No layout or settings persistence requested.
- Variant batch (4 sizes,20 images each): repository offline menu fixture; code entry, held connecting Promise, six local API error outcomes; six synthetic loss/failed results; online guest/host results plus leave confirmation; online pause plus leave confirmation; connection-loss handler. None are proof of a real online room, connection or match result. No real room is created/joined.
- Battle batch (2 landscape sizes,4 images each): actual local Turf bot match started through existing API,native setup duration, source-supported autopilot and bounded existing audit-clock freeze/step. HUD,pause,unaccepted quit confirmation,actual final result. No injected winner/result/match.time. Portrait remains the existing rotate-to-landscape prompt already captured, not forcibly bypassed.

Only loopback GET/HEAD HTTP requests are permitted and WebSockets are disabled in the isolated browser context. Product files, CSS and capture pixels are not rewritten. Every output is a native browser JPEG quality80 with bytes,SHA256,SOF dimensions and scope metadata.2.5MiB job-log transport budget; every original also stays in the artifact even if omitted from log transport.

This closes distinct-state omissions, not every weapon,slider,text value,language,device/browser or live-network permutation. Scroll-range coverage belongs to the separate gap QA. Any timeout/missing state remains explicit and keeps its manifest incomplete.

## Scoped recovery

Initial run preserved all successful editor/fixture captures. Recovery workflow runs ONLY two landscape battle lanes (native START gesture after valid menu setup; native duration and bounded audit-clock simulation) and six phone-landscape error-banner bottom continuations. It does not repeat successful batches. Bounded console and failure-state diagnostics retained. Initial public API returned without admission; missing native gesture is a candidate cause of audio admission failure (not proven by the original incomplete diagnostics). This is QA-only, not a product fix.

The initial phone-landscape battle artifact retains three verified actual HUD/pause/quit-confirm images. Recovery captures only its missing final result (one image); iPad landscape still requires all four. Recovery starts through the native START button; final results are audit-clock-advanced actual local bot simulation, not fixture previews or real-time-duration proof.


## Native intro recovery

The local software renderer admitted the native START action but stayed in the
real intro longer than the wall-clock readiness deadline. After confirming that
the actual match exists in intro/playing (and is not attract mode), recovery now
uses the already supported `debug.freeze/step` at 250ms per call to complete the
native intro, capped at 5 simulated seconds. It records those steps separately.
The main match uses 2000ms calls; the helper still advances every 1/60s simulation
frame and renders once per call. No state, winner, match duration or result is
assigned by the QA. These are simulated-time captures, not wall-clock pacing or
real-device performance evidence.


The recovery uses the originally requested 20-second Turf input. A single-use
wrapper passes duration 20 to the original startMatch API when the native START
button invokes it, and restores the API before delegation. The real match must
report duration 20. It does not overwrite a running match clock or fabricate
a result. This explicit QA API input differs from the UI's normal 180-second
default and is recorded in the receipt.
