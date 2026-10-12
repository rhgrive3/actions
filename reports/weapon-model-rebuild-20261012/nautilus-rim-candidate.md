# Nautilus rolled-rim candidate

Diagnostic comparison only; PR1276 remains frozen at `42505752ceb5a5e8480c6e8882563c58ba1cf189` until this candidate is visually reviewed. That is this candidate's immutable before baseline, rather than main.

The inspected PNG and turntable do not justify painting the whole shell silver: the PNG is reflective silver, while the rotation sheet is dark with gold trim. However, the thin near-side rim has a concrete geometry cause. The previous gold band sat behind the dark outer shell on +X; in the opposite view the band was broad, while only the outer 1mm extended past the dark shell on the near side. The shell also had one smooth shoulder instead of the reference's stamped concentric relief.

This candidate changes only the two Nautilus shell lathe profiles: roll the existing gold rim around both faces, keep the black-disc side smooth and give the opposite hub face a shallow convex backing with stepped annular shoulders. The existing deformation contour, maximum radial and axial envelope, hubs, middle shroud, nozzle, colors/materials, grips and muzzle remain. No global silver repaint, no shared material change.

- Latest candidate Nautilus triangles: 6604 → 7396 (+792); rejected d13ad182 was 7324
- Mini and the four other splatlings retain every geometry byte from 42505752
- Envelope stays 0.104 × 0.3215 × 0.525m in authored weapon space
- A scalar ray/triangle test confirms visible gold on both sides at four rear-hemisphere rim samples, and the convex hub-side backing with two shoulders, while keeping the other face smooth
- Existing geometry/hand/socket/projectile tests: 4/4 pass; new shape tests: 2/2 pass
- Revised exact-head fixed-camera front/back/top/side/oblique and actual held images are pending; d13ad182 images are preserved below
- Eight mixed Actors at game/far LOD use controlled ABBA against 42505752; results pending

The dimensions are reconstruction choices inferred from images, not measured retail values. The candidate is not yet accepted into PR1276 and must not be confused with its earlier measurements.

## Multi-direction comparison protocol

The first five generic views are insufficient on their own for all-around reference acceptance. The candidate gallery also renders twelve headings at 30-degree intervals (from +Z toward -X), a fixed 10.2-degree elevation and 30-degree FOV, with identical framing for the frozen before and candidate. Each distinct turntable reference direction will be paired to the closest heading by nozzle/front-face, shell hub, inner/outer face and neck landmarks. The retail camera is unknown, so these are explicitly approximate orientation pairs; camera mismatch, lighting/material mismatch and actual geometry mismatch will be listed separately. No silhouette or pixel-parity score is claimed.

## d13ad182 multi-view review and rejected relief

The exact production render passed at https://github.com/rhgrive3/actions/actions/runs/38221605291 (artifact 11735125087). The 12 headings exposed a reconstruction error: the two new pronounced grooves on the outer pan did not match the reference's broad smooth outer face (rotation cells 1, 5, 6), while the reference's raised hub face (cells 3 and 4) needs the concentric relief. This candidate is therefore not adopted into PR1276.

The next limited correction keeps the rolled gold lip, restores the smooth original outer-face profile and places the two shallow stamped shoulders on the opposite hub face. Envelope, hubs, colors/materials and all other parts stay fixed. Orientation pairs are nearest visual matches, not an assertion that the retail camera is known. Highlights in the silver PNG cannot establish material color under this gallery's different environment. The visible side-face relief difference is assessed across the rotation sheet instead.

## Face-orientation diagnosis (before publication of the next candidate)

The muzzle axis, central hub identity and neck attachment distinguish the faces even though exact retail yaw is unknown. Rotation cells 3/4 have the muzzle left, a silver projecting hub and the neck left/below that hub; these correspond to the candidate +X face. Cells 1/6 have the muzzle right, a black central disc and neck at the rim's right; these correspond to -X. Thus the deep +X bowl is not explained by selecting the opposite side of the camera orbit. The old profile puts the +X center at x=-0.019 and its rim at x=0.025; the reference hub side instead reads as a shallow raised backing with stamped shoulders.

The revised candidate changes only the hub-side plate to a shallow convex backing within the original x bounds, and restores the smooth black-disc-side profile. It does not reverse both faces or move either hub, neck, grip or muzzle. This face-depth diagnosis is based on multiple landmarks and profiles; silver-versus-dark reflections remain a separate lighting/material uncertainty. The reference rotation sheet is the alternate Nautilus 79 finish, while the silver still is Nautilus 47. The geometry is used across both, not the rotation sheet's finish as exact 47 color evidence.

Parent requested validation against newer main `1fca80b32c98455924afbbffeccd952fd0122b71` before final adoption. This isolated candidate measurement remains against frozen 42505752; it is not the final current-main integration check.
