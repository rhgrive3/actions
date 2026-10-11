# Slosher impact depth-ratio conversion

## Confirmed defect and bounded correction

`fidelitySlosherImpactPaint` forwarded the source dimensionless depth ratio as
PaintSystem's additive elongation. At zero drop, Unit[1] first DepthScale=1
therefore became forward scale 2; later ratio 1.3 became 2.3. The intermediate
paint path already uses the correct ratio-minus-one conversion.

The impact path now converts its existing computed depth ratio at the API boundary:
`stretchAmt = max(0, interpolatedDepthRatio * existingDropScale - 1)`.
Radius, source near/far interpolation, impact center, headings, seed, ownership,
actor-motion handling, and the existing drop-scale calculation are unchanged.
Three production CPU-grid tests compare native impacts to an independently
specified ratio-minus-one stamp, including first and later globs in both live units.

## Evidence and limits

Drive archive `part02.zip`, extracted parameter member
`Splatoon3-resources/splat3/data/parameter/1130/weapon/SlosherStrong.game__GameParameterTable.json`,
member SHA256 `1d20043ad7efaf2831801afbce601fb1e14bfd11947063903c6fadd6c98f5298`.
The repository source manifest pins Leanny/splat3 commit
`7280ff9cde8bb1c5dcef46c700c326471584d2e6`. These are extracted parameters,
not Nintendo executable implementation. DepthScale is dimensionless; width
continues to use the profile's one world unit per source unit calibration.

The local renderer's CPU formula is forward `1 + stretchAmt`, rear
`1 + .25 * stretchAmt`. Correcting the conversion does not establish that this
asymmetric blob matches Nintendo's shape. The existing fall-distance curve is
still a local calibration; it has not been inferred from executable code. When
its computed depth ratio drops below one, the existing renderer cannot express
compression and this adapter saturates at a circular base. No new aspect-vs-drop
law is asserted. Hardware footprint comparison remains open.

## Validation

New native CPU-footprint tests: baseline 3 failures, patched 3 passes.
Slosher wildcard suite plus Charger motion/time admission suite: 102/102 pass.
Additional kit-paint admission, fist-height/replication/runtime, and #1040
time-coherent projectile suites: 46/46 pass.
Existing #1011 and #1140 expectations now encode additive API units rather than
repeating the old ratio-as-elongation mistake.

Command (sparse local workspace uses symlinks):
`node --experimental-vm-modules --preserve-symlinks --preserve-symlinks-main --test patches/splatoon3/tests/*slosher*.test.mjs patches/splatoon3/tests/charger-motion-time-admission.test.mjs`

## Separate open replication defect

The legitimate Unit[1] first near impact radius 4.44 exceeds the untagged network
paint cap 3.744. A native impact -> sender PaintSystem -> recSplat -> receiver
_play reproduction paints on the sender and is discarded on the receiver.
This correction does not relax admission or add a causal main-weapon ledger.
That defect was handed to the network owner; arbitrary cap increases and radius
splitting are not part of this patch. Existing kit ledger supports kit sources,
not proof of a Slosher main-weapon impact.
