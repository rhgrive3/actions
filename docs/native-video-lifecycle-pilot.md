# Native video lifecycle pilot

This is one native practice scene recording, not BEFORE/AFTER evidence. It checks
whether the continuous browser recording, actual game progression, media analysis,
provenance and cleanup lifecycle works. It does not compare character or materials,
claim physical-device performance, or demonstrate a gameplay improvement.

## Manual CI admission
Use the existing ink-volume workflow, select `video_lifecycle_pilot=true`, and
retain `game_sha=26a4db4123d23162a3dbf8a12150b1b5bc6ccf64`. Every other game revision
is rejected. This explicitly selects the pilot instead of the ordinary volume job.
Default manual runs and PR runs retain all existing volume commands unchanged.
No local browser or automatic dispatch is part of the harness.

The game is checked out separately at tree40cd5c2b6fe399b52b7b82c37ee546fc40f9abaf.
The QA checkout must equal the actual immutable GitHub event SHA. Both tracked
worktrees must remain clean. The build runs only from the fixed game checkout,
with its own GITHUB_SHA, and outputs outside that checkout. Source proof records
both identities, the actual build input/output hashes, run metadata, exact harness
bytes and tool versions. Every served emitted artifact is rehashed before and after
recording. External requests fail closed. The record is tied to these output bytes,
not to an unverified workflow branch label or another run's artifact.

## Workload and acceptance
The existing native `/?range&skipTitle` startup uses shipped assets, production
classes and normal Game RAF. Fixed seed0x49574b33,960x540, default shooter held for
eight real wall seconds. No manual physics stepping, generated still sequences,
interpolation, changed lighting/camera, substitute assets or alternate models.
Actual successful main-scene renderer calls, source clock ticks, G.time, live
unpaused state and changing owned-projectile state are required. Camera/light
fingerprints are checked during and after action. Legitimate native drift may
therefore reject this diagnostic workload; never compensate game behavior to pass.

A magenta QA strip changes green with fire(true), then blue with fire(false).
Decoded media timestamps must agree with the actual action interval. Motion checks
crop out the strip and normalize timestamps after trimming. Blank, frozen, missing
marker and stalled clips reject. A WebM file by itself is not success. This pilot
never composes a comparison. Raw WebM and JSON evidence remain unmodified.

## Bounds and prerequisites
Existing ubuntu-latest, Node22, pinned Playwright1.62.1/Chromium, Python3 Linux
subreaper+pidfd support, ffmpeg/ffprobe. No hardware GPU is promised. The reviewed
starting browser profile is default headless Chromium. No unsafe fallback flags or
local retry are added if the runner cannot render adequately.

Initial free disk4GiB and MemAvailable2GiB; immediately before recording free
disk128MiB and MemAvailable2GiB. One raw clip32MiB cap, sampled from page creation.
Native startup180s, lane work210s, close bounds10s/5s/3s. FFmpeg calls90s each,
one decoder/filter thread,8MiB diagnostics. Whole supervised recording+analysis600s,
1MiB child output cap. The unprivileged Linux child-subreaper identifies only its
owned descendants, including detached Chromium, verifies PID start times, signals
through pidfds and reaps them. Cleanup must complete. No system-wide setting changes.
The overall CI job has25min including dependency installation and one game build.

All evidence is capped at64MiB before upload, even on failure; oversized evidence
blocks upload. Artifacts have a unique lifecycle-only name and one-day retention.
Failed recordings and diagnostic receipts are preserved when within that bound.
No existing denied artifact is accessed or reproduced. CI artifact creation does
not prove user delivery; permitted Library materialization and a verified Library
ID remain separate.

Before first execution, run the guard tests and independently review this exact QA
head. Synthetic media decoder tests establish only guard behavior. Actual native
recording and live-scene feasibility remain unverified until this pilot runs.
