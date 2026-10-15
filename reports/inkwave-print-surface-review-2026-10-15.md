# Isolated Bulbz print surface and Squiffer temporal review

Baseline: immutable009a9e54898b0ed48e38f5ede105077a736e7a0b. This diagnostic changes only Bulbz authored marble veins from raised cords to flat print ribbons. It does not modify the adopted model branch, other weapon work, character assets, gameplay, or shared validation workflows.

## Depth diagnostic correction

An initial corresponding-vertex depth comparison was superseded. It compared different projected screen positions and therefore overstated grazing-angle risk. It must not be cited as observed flicker or used to tune the offset. The replacement intersects each print vertex's view ray with the supporting shell plane before comparing conventional24-bit quantized depths.

Superseded estimate: Squiffer at8m/85degrees had508/972 equal vertex-depth bins; Bulbz at4m/85degrees had36/90 per limb. These numbers are retained only to identify the rejected method.

Corrected same-ray diagnostic, near0.15/far6500/FOV60:
- Squiffer150µm minimum layer: no ties through16m in tested0/45/75/85-degree views; ties first seen at32m.
- Bulbz50µm normal offset: no ties through8m; ties at16m in front/45-degree views.
- No reversed depth ordering observed.

This analytical check assumes conventional24-bit depth. It does not establish actual renderer precision, finite-facet fragment coverage, LOD behavior or GPU temporal acceptance. The capture receipt records actual depth bits and depth mode. No offset change follows from the diagnostic alone.

## Exact inputs and bounded change

- Bulbz baseline SHA256:029ee01b39fb223d120882360dc7752f29ccb8d6df594d45c83b800989a6617f.
- Bulbz candidate SHA256:95f0f7d3f9a10de6309097e66e3e45d7515b6c36ef425fb6d1ea7f6d24df9d23.
- Squiffer unchanged SHA256:288505b0dbe7991f487239edf73804af1c264322c1bdf6d9614d100ac278c9ff.

Bulbz retains all non-vein vertex attributes, material assignments, ink/glow/animated channels and native anchors. The six existing approximate vein paths and their0.9mm widths remain; flat ribbons sit50µm above each rear limb plane. All180 vertices satisfy plane clearance within1.273e-8m. All168 triangles have outward winding; minimum normal alignment0.99999999974. No degenerate triangles.

Squiffer geometry, print traces and palette are unchanged. A separate CPU qualification partitions all internal print-edge intervals, including T junctions:1,324 intervals and3,972 paired points have zero geometric gap.11,487,024 moving-perspective comparisons at720x600/1920x1080/3840x2160 and0.5/1/2/4m also have zero geometric gap. Removing one triangle or lifting one vertex0.1mm fails the checks. This is not GPU rasterization evidence.

## Source, emitted and image gates

Dedicated workflow:
-11 capture-harness cases, including affine native matrix restoration, material restoration on failure, and blank framebuffer rejection.
-20 source and20 emitted cases: inheritedSquiffer9, inheritedBulbz8, flat-print3. All must pass with zero skips/cancellations/todo.
-Separate immutable-baseline and candidate builds with pinned compiler and identical build pipeline sources.
-48 PNGs at1920x1080: two builds, two weapons, two teams, one charge close-up lit/unlit and four consecutive release-motion lit frames.
-Print-target framing uses baseline geometry; Bulbz upper/lower limb selection is split across teams. Camera matrices and native pose/muzzle/clock receipts must match exactly between builds.
-Release motion includes tiny camera drift, but does not pretend to exercise player admission: runner state is set, the native release event is used, and projectile calls are stubbed. Only weapons are mounted in the render scene.
-Each frame must contain at least250 foreground pixels and16 sampled quantized colors. The intended print also requires finite projected ROI,75% of selected vertices inside the viewport, and32 visible pixels in a depth-occluded white-print/black-weapon mask. Both camera basis and ROI use the actual body matrixWorld, including in-hand/off transforms. All PNG dimensions/hashes are verified. Unchanged Squiffer pixels must match exactly; at least one Bulbz pair must show the intended surface difference.
-Full emitted artifact maps and build input/content hashes bind the results. Test logs must identify the same emitted contentHash.

## Remaining limits

The original Bulbz marble pattern is not traced; tube proportions, engraving and calibrated retail material response remain open. Squiffer's central burst lettering and some rear graphic interiors are intentionally absent rather than invented. Existing official and candidate lighting/cameras differ, so their colors do not justify a material retune. These capture gates do not confer whole-model retail fidelity, native gameplay admission, physical-device acceptance, or merge approval. Fresh images require human inspection after workflow completion.
