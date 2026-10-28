# Brush head contact geometry follow-up

Stable reviewed base: `bbc4a19b9778306b4ebd3f92b630964e612670dc`.
Original comparison: `4ce9768e6177b19f11f17e28f086a4da36f35fcd`.
Branch: `fix/brush-contact-geometry-20261027`.

The reviewed fix eliminated stale matrix feedback, but sampled a virtual
contact point at cfg.tip/cfg.thick. The actual head rotates about its ferrule
with speed-dependent flex. The virtual point stayed about 1.5 cm above a floor
while actual bristles penetrated it by 3–6 cm. Extending the foot's slope plane
past the bottom edge could hide a larger penetration of the actual next floor.

Only the Brush weapon presentation changes. While fully lowered and outside
the sweep, project the standing plane into the two existing deformed head
meshes and find their actual supporting vertex. A single local reused physics
probe identifies the surface under the head, including a different ramp-edge
surface and solid grates. Solve the pitch angle from the supporting vertex in
weapon space. The equation is
`n · (off · Rx(delta) · vertex - floor) = 0.015 * n.y`.
The weapon-space plane includes parent scale; no character or rig transform is
authored. The previous 1.5 cm target and [-0.7, 0.5] correction limits remain.
There is no new height calibration or tuned gain. Carry/sweep transitions keep
the existing bounded feedback. Current body motion and the head's next flex
update can leave a small one-update residual, checked by displayed vertices.

The runtime reuses vectors, matrix, hit result and the two existing meshes.
There is one local ray per eligible update and two scans of the existing head
vertices (886 Inkbrush / 2,120 Octobrush / 1,434 Painbrush). No geometry, particle,
mesh, material or per-update vertex array is added. Physics, collision,
movement, paint and ink rules are unchanged.

[diagnostic-summary.json](diagnostic-summary.json) compares original, reviewed
and corrected code using the same actual vertex/surface metric on real
Actor/Physics. Deterministic starting poses are diagnostic setup, not browser
acceptance. The independent oracle evaluates each vertex against the exact
piecewise collision heights; it does not use the runtime contact proxy. The
reviewed code's moving flat clearance is -3 to -6 cm; the correction stays
positive around the existing 1.5 cm target. Original actual-vertex measurements
also establish that penetration existed, but its oscillating amount differs;
the old browser's negative AABB bound alone did not prove that.

New source regression and prior transform regression pass (2 tests). The new
test covers all three heads, actual entry/exit surfaces and 1/15 updates per
draw, with identical movement/payment/shot traces. Observed actual surface
clearance spans 0.58–1.76 cm including first transition frames. The same final
test fails against the reviewed emitted runtime (actual penetration at tick
122). The existing five-Roller/three-Brush 30/60/120 Hz held/jump/landing
compatibility test passes. [Source](source-tests.txt), [emitted](emitted-tests.txt),
[reviewed negative control](reviewed-negative.txt), [compatibility](held-compat.txt)
and [build](build.txt) logs preserve the executed results.

Code commit: `3d720d4b106cbb462b52ba5c4381da6459e9705e`.
The final optimized emitted runtime passes both tests with 0.58–1.76 cm actual
surface clearance across all three heads and the first transition frames.
[build-identity.json](build-identity.json) binds 1,490 inputs and 2,194 artifacts
to that code commit, zero mismatches. Content hash:
`1b04d881b8591bace8cec11988d7ba784166d82710a64821002ce2260592f0c2`.

Normal-input Chromium 154 verification uses the established readiness-aware
title/Skip/loadout/range/Resume flow, real pointer lock, held left mouse,
normal R reset and W movement. At the same saved entry position, the reviewed
head has **14.5739 cm** normal clearance and the correction **1.6401 cm**.
All old head bounds are inside the range ramp x[-3,3], z[-15,-11], so the old
vertical clearance is exactly normal clearance / normal.y = **15.0225 cm**;
the independent corrected per-vertex physics probes measure **1.6905 cm**.
At the same exit position, actual vertical clearance changes from **-6.0285 cm**
to **+1.3841 cm**. Later held captures measure **1.5035 cm** on the ramp and
**1.4969 cm** on the flat, rather than a 4 cm penetration. There are no missed
surface probes. These are sampled geometry measurements around actual rendered
frames, not a continuous-browser peak/duration measurement.

Fresh turf remains **0 → 2.992923 → 9.662021**, paint cells **0 → 48 → 159**,
and all five ramp points become own ink. Both checkpoints stay grounded and
rolling with zero flight projectiles. The initial flick/return is preserved:
the held-before-reset capture belongs to that transition, before settled drag
contact. It is not claimed to obey the settled constraint. The rear camera
partly occludes the head; normal before/after rendered images are retained
locally with [hashes only](capture-hashes.json). No character comparison is
performed. [browser-validation-summary.json](browser-validation-summary.json)
contains non-image metrics. The new browser run has no page, HTTP or failed
request errors. Browser/server close and the port returns ECONNREFUSED (111).
The original/reviewed private images and raw receipts are not republished.

Reproduce focused regressions:

```sh
node --experimental-vm-modules --test patches/splatoon3/tests/brush-head-contact-geometry.test.mjs patches/splatoon3/tests/brush-rolling-transform-cache.test.mjs
INKWAVE_BUILT_SITE=/absolute/built-site node --experimental-vm-modules --test patches/splatoon3/tests/brush-head-contact-geometry.test.mjs patches/splatoon3/tests/brush-rolling-transform-cache.test.mjs
node --experimental-vm-modules --test --test-name-pattern='all five Rollers and three Brushes' patches/splatoon3/tests/roller-brush-held-motion.test.mjs
node reports/brush-head-contact-geometry-20261027/normal-input-capture.mjs /absolute/built-site /tmp/brush-head-capture SOURCE_SHA
```

The normal-input verifier is the executed script with fixed local paths made
portable and passes `node --check`. It requires Playwright and Chromium
(`CHROMIUM_PATH` can override the executable). Observers read state and query
surfaces without injecting gameplay state. A per-vertex observer query is
verification cost, separate from the runtime's one local probe.

No original-game media, screenshots, raw browser receipts or private storage
references are included. No original-game frame/geometry agreement, hardware
performance, all-LOD or native triangle browser acceptance is claimed. Nintendo's
qualitative Brush reference remains dragging its head along the ground while
painting; the internal 1.5 cm target is not an original-game measurement.
