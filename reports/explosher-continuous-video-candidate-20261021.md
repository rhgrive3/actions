# Continuous native Explosher comparison video candidate
This branch is preparation only. It does not mean the current physical preflight passed.
Do not run long capture until same-head native preflight passes strict equality.
Use EXPLOSHER_VIDEO=1 with the existing diagnostic wrapper on both already-built sites, then scripts/encode-inkwave-explosher-comparison.mjs before-dir after-dir comparison.mp4 before-sha after-sha.
No extra build, no production runtime edits. Capture all integer ticks 0 through 60 from the first real projectile birth at fixed 60Hz, behind camera only. It is not footage of the trigger wind-up and not retail Splatoon.
The encoder refuses sparse/duplicate/missing frames, wrong source identities, changed PNG hashes, unequal physics/camera/lighting, non-consecutive simulation clocks and increased render resources. ffprobe must report H.264 1600x450, 60fps,61 decoded frames and 61/60 seconds.
It uses no interpolation, no invented transition frames and no audio. Inputs and receipts remain intact. Nonblank frames are not a substitute for viewing the final clip.
Pure guard execution with fixture data, not actual media:
[
  {
    "name": "61 consecutive pair accepted",
    "status": "pass"
  },
  {
    "name": "sparse18 rejected",
    "status": "rejected"
  },
  {
    "name": "duplicate/missing frame rejected",
    "status": "rejected"
  },
  {
    "name": "tampered PNG hash rejected",
    "status": "rejected"
  },
  {
    "name": "physics mismatch rejected",
    "status": "rejected"
  },
  {
    "name": "stale source SHA rejected",
    "status": "rejected"
  },
  {
    "name": "sparse mode cannot claim video",
    "status": "rejected"
  },
  {
    "name": "non-consecutive simulation rejected",
    "status": "rejected"
  },
  {
    "name": "encoded61frame accepted",
    "status": "pass"
  },
  {
    "name": "encoder frame duplication rejected",
    "status": "rejected"
  }
]
Actual FFmpeg/ffprobe, images and user-facing video have not been executed or delivered. CPU/GPU acceptance remains separate; GPU elapsed time is unmeasured.
