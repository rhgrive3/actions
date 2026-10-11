# Wall-paint performance diagnostic protocol

Purpose: quantify the cost of PR1235's 23-main wall-drop connection before adoption, against immutable main 74785de066e6ccd2dc1c3a588529db758c266b97. This instrumentation does not change the game or the existing validation workflow.

The standalone workflow is manual-dispatch or dedicated same-repository diagnostic-PR only, read-only and checks full immutable checkout SHAs. It builds each selected revision with its own production build script, verifies every emitted artifact hash, and records both complete manifests. The same diagnostic fixture runs in one runner/browser in AB, BA, AB order, three independent warmed repetitions per revision. Page reloads isolate module/runtime state. The actual loaded runtime files and fixture/probe hashes are recorded.

Workload: eight actual Actors/WeaponRunners using Sploosh-o-matic, 180 firing frames plus 60 settling frames, fixed 60 Hz simulation, 20 Hz actual NetMatch._sendTick JSON transmission, constant seed, identical 4096 paint atlas and 0.25 CPU cells. Actual Physics, PaintSystem GPU rendering, native Level geometry and native level material are used. Character display, match/UI and whole-game postprocessing are excluded equally. This measures a controlled paint-workload transaction, not whole-game frame rate.

Per-frame outputs separate body CPU, growth CPU, inclusive splat and simulation-paint time, atlas submission time, and gl.finish wait. Nested inclusive timing columns are not summed. p50/p95/p99 and raw samples, draw/quad counts, outgoing JSON bytes/rows, peak queue/slides and before/after PNGs are retained. SwiftShader software WebGL results are not hardware GPU time or retail FPS.

Initial offline evidence motivating this gate: eight shooters/240 frames changed from 864 paint calls and 1,440 protocol rows to 4,560 and 5,136; peak outgoing queue 32 to 96 rows (capacity 512), 112 active slides. Candidate event-array JSON alone was 792,496 bytes over four seconds before peer fan-out. The diagnostic records complete tick JSON (actors, clock and paint events), event-array bytes separately, payload bytes/second at the sender and linear 3-peer/7-peer fan-out estimates. WebRTC/DTLS/SCTP/IP overhead is excluded; timestamp width in both event rows and tick envelopes may vary across repetitions; byte totals are reported per repetition, while draw/quad/event counts must repeat exactly. Queue capacity alone is not a performance pass. Node VM total elapsed test time is deliberately not used as a game performance metric.

The PR trigger is restricted to the exact diagnostic head branch and instrumentation paths. PR runs use fixed baseline 74785de066e6ccd2dc1c3a588529db758c266b97 and candidate 45c73a490234cd0c593441046535c37bf2bf3355; dispatch accepts validated full SHAs. No unrelated PR starts this job.

Local status: script syntax and immutable-input/workflow contract tests pass. Browser execution is not locally available under the verified sandbox restriction; no browser result is claimed. Manual CI measurements and independent variance review are required before treating the performance question as resolved.

## Second phase: CPU basis cache

The diagnostic now builds four immutable revisions on the same runner: adopted main 31703a906b4f19fd5f46dea08d06615113008492 versus cache e929eb71d4321a14e2bd599ffb4407a9da01e68b, then held wall-drop 45c73a490234cd0c593441046535c37bf2bf3355 versus that candidate plus cache only 834ed1e27f37491b2cfbadf69e873e395aa65fc6. Each pair retains AB/BA/AB. Grid SHA-256, row/quad/draw/cell counts and rendered PNG bytes must match across the optimization pair.

The first 60 cold frames are recorded separately, including shader startup, with their CPU sub-timings; they are not mixed into warmed timing quantiles. CDP garbage collection and heap snapshots occur outside measured frames before warmup, after warmup/reset, and after the workload. These snapshots measure the whole fixture heap, not only cache memory, and preserve backing-storage information where Chrome supplies it.

Transport clarification: broadcast sends one JSON message to the WebSocket relay; peer-count multiplication is relay egress, not client uplink. Each receiver receives one copy. Prefix and WebSocket/TLS/TCP/IP overhead are excluded. The first-phase raw report mentioned WebRTC in a metadata note; measured bytes came from actual NetMatch tick JSON and remain valid.
