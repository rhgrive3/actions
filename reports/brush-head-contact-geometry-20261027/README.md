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
compatibility test passes. Final emitted and normal-input verification are
recorded in the follow-up evidence commit after execution.

Reproduce focused regressions:

```sh
node --experimental-vm-modules --test patches/splatoon3/tests/brush-head-contact-geometry.test.mjs patches/splatoon3/tests/brush-rolling-transform-cache.test.mjs
INKWAVE_BUILT_SITE=/absolute/built-site node --experimental-vm-modules --test patches/splatoon3/tests/brush-head-contact-geometry.test.mjs patches/splatoon3/tests/brush-rolling-transform-cache.test.mjs
node --experimental-vm-modules --test --test-name-pattern='all five Rollers and three Brushes' patches/splatoon3/tests/roller-brush-held-motion.test.mjs
```

No original-game media, screenshots, raw browser receipts or private storage
references are included. No original-game frame/geometry agreement, hardware
performance, all-LOD or native triangle browser acceptance is claimed. Nintendo's
qualitative Brush reference remains dragging its head along the ground while
painting; the internal 1.5 cm target is not an original-game measurement.
