# Nautilus rolled-rim candidate

Diagnostic comparison only; PR1276 remains frozen at `42505752ceb5a5e8480c6e8882563c58ba1cf189` until this candidate is visually reviewed. That is this candidate's immutable before baseline, rather than main.

The inspected PNG and turntable do not justify painting the whole shell silver: the PNG is reflective silver, while the rotation sheet is dark with gold trim. However, the thin near-side rim has a concrete geometry cause. The previous gold band sat behind the dark outer shell on +X; in the opposite view the band was broad, while only the outer 1mm extended past the dark shell on the near side. The shell also had one smooth shoulder instead of the reference's stamped concentric relief.

This candidate changes only the two Nautilus shell lathe profiles: roll the existing gold rim around both faces and add stepped annular shoulders to the dark shell. The existing deformation contour, maximum radial and axial envelope, hubs, middle shroud, nozzle, colors/materials, grips and muzzle remain. No global silver repaint, no shared material change.

- Nautilus triangles: 6604 → 7324 (+720)
- Mini and the four other splatlings retain every geometry byte from 42505752
- Envelope stays 0.104 × 0.3215 × 0.525m in authored weapon space
- A scalar ray/triangle test confirms visible gold on both sides at four rear-hemisphere rim samples, and nonzero front/back shoulder relief
- Existing geometry/hand/socket/projectile tests: 4/4 pass; new shape tests: 2/2 pass
- Exact-head fixed-camera front/back/top/side/oblique and actual held images are pending
- Eight mixed Actors at game/far LOD use controlled ABBA against 42505752; results pending

The dimensions are reconstruction choices inferred from images, not measured retail values. The candidate is not yet accepted into PR1276 and must not be confused with its earlier measurements.

## Multi-direction comparison protocol

The first five generic views are insufficient on their own for all-around reference acceptance. The candidate gallery also renders twelve headings at 30-degree intervals (from +Z toward -X), a fixed 10.2-degree elevation and 30-degree FOV, with identical framing for the frozen before and candidate. Each distinct turntable reference direction will be paired to the closest heading by nozzle/front-face, shell hub, inner/outer face and neck landmarks. The retail camera is unknown, so these are explicitly approximate orientation pairs; camera mismatch, lighting/material mismatch and actual geometry mismatch will be listed separately. No silhouette or pixel-parity score is claimed.
