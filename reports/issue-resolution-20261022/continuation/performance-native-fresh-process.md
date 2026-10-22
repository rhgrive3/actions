# #1434 fresh-process strict control (2026-10-22)

The four same-native C/B/B/C trials **failed** strict endpoint image repeatability. Three images have SHA-256 `9fa1b417e6d97bcf0379c5946781ef7d2bd947c813c77ceaf42e26a0bc17b2c4`; trial 2 has `aa1eb4e0a32fc3e9d230de973e9c257d1427a3b410307dc8c118d04187b68957`. Exactly one green channel at x=270, bottom-origin y=128 changes 60→59. Tolerance remains zero.

Each trial launches its own Chromium 143 / SwiftShader browser and GPU process ownership scope. All recorded PIDs/start ticks were checked after close; all four scopes ended before the next trial. Thus process isolation alone does not fix the fixture. This does not establish a driver defect.

The source is unchanged F9 `f9d744eba5cbd86ef9a4a77e9a4dbd61c48d4d90`, production content hash `46e01879c9e4facd3ef99bdeb095b5962098036021ff6dd1a4685f44b8a0a3c4`. Tidewater, normal 1 PlayerController + 7 BotBrains, medium desktop, 480×300, fixed 1/60 simulation, 30 rendered warmups and six completed frames per trial; all eight actors survive. Natural PWA activation/offline-cache readiness and real audio/music-worker paths remain enabled. All start/end state, draw-call/triangle/RNG workload and background invariants pass.

Actual shader sources, CPU geometry/texture upload bytes, materials, lights, camera and endpoint GPU color targets are retained in raw evidence. Actual per-draw GL uniforms, current GPU vertex-buffer contents and shadow/depth contents remain unobserved. Further localization must inspect these inputs; unchanged CPU state does not prove unchanged GPU inputs.

No historical pair timing comparison was run after this failure. No speedup, current-main percentage, device FPS or Splatoon 3 performance equivalence is claimed. Historical f11/3acf clean worktrees are prepared only. #1434 remains open. Physical-device acceptance for #1757/#1671/#642 is separate.

Raw JSON, four PNG/RGBA files and exact pixel differences: `.browser-evidence/continuation-performance/native-fresh-process-control/`. Harness: `.ci-scratch/continuation-performance/native-fresh-process-control.mjs`. The JSON companion pins their receipts.
