# Explosher native startup parity correction

## Preserved failed comparison

PR 1747 head `5203b33c46602a840d15809313defebbe41e80be`, run
`39668595475`, artifact `12379172269` produced both sets of 18 real PNGs.
Artifact SHA-256: `b27d9ffa21d36c659c09592597f71ef13a18feb6a233fa6ddf36247c80cee4aa`.
All 36 PNG hashes matched their manifests and all images were viewed individually.
All 288 checks ran. Only three resource limits failed: tick 22 triangles increased
by 50 in each view. This is an overall failure, not a performance acceptance.

The local player's ordinary startup style differed: baseline skin/outfit/eyes
7/5/1 versus candidate 5/0/6. Both had hair/hat/brows 0/0/3. Background foam,
birds and impact effects also differed in the PNGs. The flying core and physical
trajectory matched; the proposed close, smaller glitter was visible, but the
images are not a controlled isolated-VFX acceptance. No pixels are corrected.

## Narrow diagnostic changes

- Set the same existing six-field style in `inkwave.profile` before normal boot
  in both isolated diagnostic browser contexts. Native `main.js` loads it and
  passes it to `Match`; no Character geometry/material or color is edited.
- Validate both the loaded profile and actual Character style, then validate
  and record the actual Character style in every captured frame.
- Reuse the existing first-publication freeze and trusted range-menu entry.
  No variable-duration live RAF is admitted before deterministic stepping.
- Record actual game, environment, FX, paint, decor, prop and material clocks,
  including numeric time/clock uniforms. Preserve publication and entry clocks.
- Remove diagnostic assignments to game/rig time. Initial history is prevented,
  not concealed by changing clocks after it happened.
- Retain every former gate; add style, full scene clocks and startup parity.
  The full comparison now evaluates 342 checks and fails if any mismatch remains.

The startup clock reader follows the existing Roller diagnostic at blob
`83029eb55e5a9a2d7138528da44be5da5cee4b76`; the trusted menu-entry helper is
unchanged. The Explosher production runtime blob remains
`351427cd20c9726dd21c3be949078cbce23c81b`.

## Validation boundary

Nine real local Node tests passed, including wrong style, non-finite/missing
clock, late freeze installation, pre-entry clock advancement, and later-frame
style/clock mismatch negatives. These are not browser or GPU measurements.
The next exact-head CI must first pass the short native preflight, then the
full strict comparison and actual image review. Style alone is not asserted
to explain or fix the 50-triangle difference. Continuous video remains pending.
