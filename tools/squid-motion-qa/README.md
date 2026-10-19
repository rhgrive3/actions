# Continuous native squid motion acceptance

This QA-only harness uses the manifest-verified emitted Actor, source animation bank, and existing production Environment. It does not change model, animation, physics, or human sources. Its ten-second sequence covers dry idle, a ballistic-input jump/landing, straight swimming,90/180-degree direction changes, stopping, emergence, a complete dive, and rapid direction reversals between forms. The original first eight seconds are unchanged. As with the existing multiview harness, inputs are driven; this is not a full match-physics recording.

Chromium's canvas MediaRecorder writes a native WebM at real wall-clock speed, with a nominal30fps capture stream and60Hz fixed simulation catch-up. There is no slow GIF, interpolated frame generation, or retimed playback. Every rendered frame records wall time, presentation time, simulation ticks, state, source clip/frame, position, gaze uniform, and render duration. The result reports achieved FPS and frame gaps. `smoothnessReviewEligible` is false below24fps or above70ms p95 gaps; a slow software capture must not be presented as proof of smooth gameplay.

The fixed720-square camera uses the same25-degree view and1.1m actor-bound sphere as existing QA. After recording, the exact simulation-tick sequence is replayed to check every rendered frame's actual posed vertex bounds. Coverage checking is kept out of the recording loop so it cannot create video stalls. Source-state replay must match. No new packages are required: MediaRecorder and canvas.captureStream are built into the existing Chromium dependency.

From a normal checkout with the existing native dependencies and built site:

    node --experimental-vm-modules --test tools/squid-motion-qa/timeline.test.mjs
    SOURCE_SHA="$(git rev-parse HEAD)" node tools/squid-motion-qa/run.mjs --site _site --out .qa-evidence/squid-motion-candidate

For a preserved fbaf105eb310daf10ef7bd72675805ccf3f5a8bc worktree, invoke the same current harness from its parent, with SOURCE_SHA set to that worktree's exact commit. This keeps the baseline runtime frozen while allowing one identical QA harness on baseline and candidate. Add both `squid-motion-baseline/**` and `squid-motion-candidate/**` to the existing artifact upload. Include timeline.test.mjs in source checks; it replays the actual Actor twice and verifies the entire300-frame-at30Hz sequence.

Local source timeline regression passes. Local native Chromium remains unavailable under the previously confirmed sandbox restriction; the WebM/coverage path requires the authorized native CI runner. Raw video byte hashes, build/source receipts, and pacing metadata are written to result.json. Native playback must still be inspected before visual acceptance.

## Uniform sampled trajectory review

`SOURCE_SHA="$(git rev-parse HEAD)" node tools/squid-motion-qa/run.mjs --site _site --out .qa-evidence/squid-motion-sampled --mode sampled`

This mode saves exactly 300 PNGs, one after every two actual 60 Hz Actor ticks. Each frame has a verified SHA256 and simulation timestamp; wall time, Actor advancement, rendering, PNG readback, coverage checks and file transfer are timed separately. Native visible-vertex coverage is checked on the exact captured state. The runtime is unchanged.

Playback at 30 fps lasts ten seconds and shows the actual animation trajectory at 1× simulation speed. It does NOT demonstrate real-time rendering performance. The first live attempt on the software-rendering CI runner achieved only ~1.9 fps, and its `smoothnessReviewEligible` flag correctly remained false. Sampled capture also keeps this flag false and uses `trajectoryReviewEligible` instead.

After verifying every artifact hash, use an existing local ffmpeg installation to assemble a review video without interpolation:

`ffmpeg -framerate 30 -i frame-%04d.png -c:v libx264 -pix_fmt yuv420p -movflags +faststart sampled-trajectory-1x.mp4`

No video package is added to CI. Do not infer gameplay collisions or full-match behavior from the driven-input harness.

## Spawn return scenario
`--mode sampled --scenario spawn` records 120 actual browser frames: source and fallback each run the shipped Actor respawn aim, launch, flight and landing for two seconds at 60 Hz, sampled at 30 fps. The launch input is applied at 0.5 seconds. The camera follows the actor; forms, flight positions, source poses and transition clocks are not overridden. Frame receipts retain gameplay state, return scales and visible skinned-vertex coverage. This candidate-only scenario exercises the newly integrated spawn lifecycle; the existing 300-frame paired comparison remains unchanged. The four-second playback is offline trajectory evidence, not measured real-time performance. Native visual acceptance is pending until exact-head artifacts are checked.
