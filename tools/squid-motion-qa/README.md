# Continuous native squid motion acceptance

This QA-only harness uses the manifest-verified emitted Actor, source animation bank, and existing production Environment. It does not change model, animation, physics, or human sources. Its eight-second sequence covers dry idle, a ballistic-input jump/landing, straight swimming,90/180-degree direction changes, stopping, and emergence. As with the existing multiview harness, inputs are driven; this is not a full match-physics recording.

Chromium's canvas MediaRecorder writes a native WebM at real wall-clock speed, with a nominal30fps capture stream and60Hz fixed simulation catch-up. There is no slow GIF, interpolated frame generation, or retimed playback. Every rendered frame records wall time, presentation time, simulation ticks, state, source clip/frame, position, gaze uniform, and render duration. The result reports achieved FPS and frame gaps. `smoothnessReviewEligible` is false below24fps or above70ms p95 gaps; a slow software capture must not be presented as proof of smooth gameplay.

The fixed720-square camera uses the same25-degree view and1.1m actor-bound sphere as existing QA. After recording, the exact simulation-tick sequence is replayed to check every rendered frame's actual posed vertex bounds. Coverage checking is kept out of the recording loop so it cannot create video stalls. Source-state replay must match. No new packages are required: MediaRecorder and canvas.captureStream are built into the existing Chromium dependency.

From a normal checkout with the existing native dependencies and built site:

    node --experimental-vm-modules --test tools/squid-motion-qa/timeline.test.mjs
    SOURCE_SHA="$(git rev-parse HEAD)" node tools/squid-motion-qa/run.mjs --site _site --out .qa-evidence/squid-motion-candidate

For a preserved3b4bb02e53d057fedffb1c3f641fad3453ae0451 worktree, invoke the same current harness from its parent, with SOURCE_SHA set to that worktree's exact commit. This keeps the baseline runtime frozen while allowing one identical QA harness on baseline and candidate. Add both `squid-motion-baseline/**` and `squid-motion-candidate/**` to the existing artifact upload. Include timeline.test.mjs in source checks; it replays the actual Actor twice and verifies the entire240-frame-at30Hz sequence.

Local source timeline regression passes. Local native Chromium remains unavailable under the previously confirmed sandbox restriction; the WebM/coverage path requires the authorized native CI runner. Raw video byte hashes, build/source receipts, and pacing metadata are written to result.json. Native playback must still be inspected before visual acceptance.
