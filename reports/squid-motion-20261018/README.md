# Squid source-motion binding correction

Baseline: `da97926a21e0e7c6170d76864f896123d979f915`.

This bounded presentation patch repairs four reproduced integration defects. It does not change the squid model, material, movement physics, aim, collisions, source animation assets, clip clocks or clip selection.

- Production swim composition overwrote the source rig's zero shader wiggle with a second procedural deformation. Source-active squid now retains zero shader wiggle; fallback retains its existing motion.
- Existing S3-look geometry places long feelers at k0/k9, while source retarget weights still treated k4/k6 as long arms. Binding now follows the actual composed geometry.
- Source mesh replacement discarded the existing authored half-turn shared by body and eyes. The source skeleton root now retains the original body transform, keeping skeleton deformation and facial geometry in the same authored frame.
- Native LOD geometry already has placeholder skin attributes, so the previous attribute-presence check skipped source rebinding. A WeakSet now distinguishes genuinely source-bound geometry from native placeholders.

Per-rig scratch vectors/Euler replace the existing swim/climb temporary allocations. No extra render batches, materials, textures or vertices are introduced. Existing shared geometry caches/disposal ownership remain unchanged.

## Evidence and limits

The existing production source-motion bank is Wii U-derived; it is not an S3 keyframe dataset. No new extracted assets are introduced. Official S3 visual reference (Nintendo gameplay pages and `ikahito_pc.mp4`, collected by the companion shape review) supports mantle-first glide and compact transformation qualitatively, not guessed numerical oscillation tuning. These changes repair alignment and ownership rather than claiming a complete S3 animation match.

`patches/local-quality/tests/squid-source-presentation.test.mjs` loads actual fully composed Actor/Character and awaits the real source bank. It covers three LODs and 30/60/120 Hz, long/short skin chain ownership, source-only deformation, finite pose during turns/stops, emergence and preserved native fallback. Result: 2/2 tests, 2,625 driven Actor frames, 1,260 source deformation checks, no skips. Existing swim-motion, motion-five-regression and source-motion-assets suites: 16/16 pass, including native physics/gameplay clocks/pose channels and existing action-pose boundaries.

The fixture drives Actor presentation on an isolated own-ink floor; this is not full-match parity. Browser before/after capture with exact emitted artifact receipts is required before visual acceptance. Local Chromium execution is blocked by the environment, so native captures are delegated to the dedicated CI workflow. No browser result is claimed here.

## Follow-on: eye-band skin alignment

Native 8d597 before/after images showed restored band orientation but a jagged upper edge. The overlay used `Sqd_head0/Sqd_forehead` weights while the adjoining mantle uses `Sqd_head0/1/2`. An identical-position comparison at the actual dry `Sqd_Wait` frame45 measured max6.8075mm (mean4.2735mm) differential displacement; swimming `Sqd_Walk` frame4.72 measured max1.0190mm. This is material relative to the authored band's embedded5mm perimeter.

The bounded follow-on routes the band through the same y-based mantle weighting, without changing geometry, surface offset, topology, materials or any human rig. Corrected same-position differential is below5.8e-9 host units (Float32 weight rounding) in both sampled poses. The regression asserts every band vertex's exact chain and interpolated weights at each LOD/rate. This proves skin alignment, not the final quality of the deliberately intersecting perimeter: native visual acceptance remains required.

## Follow-on: retain authored dry orientation in the source path

The actual Character returns from `_updateSquid` as soon as its source rig succeeds. This skipped the existing S3-look adapter's flat dry coordinate frame entirely: the native fallback used pitch `PI/2-.52`, while source `Sqd_Wait` and slow `Sqd_Jump` retained an upright identity pivot. Actual airborne Actor input reproduced `Sqd_Jump` frames0/2/5/11 at16.7/50/100/200ms with that identity pivot. Comparing the upright idle to Nintendo's forward-leaning jump therefore conflated pose with shape.

This repair retains the already authored dry resting axis and offset in the source path. The source bank continues to own hop/deformation; no native bob or procedural wave is stacked on it. Fast airborne dry movement uses the existing native flight-direction pitch formula. Manual source-clip previews, swim/climb, source clip selection/timing and humanoid paths are unchanged. This does not claim that the existing bank is S3-identical. A matched existing-jump native comparison is still required before shape proportions or motion quality can be accepted.

## Connected eye field binding (2026-10-18)

The user-supplied frontal figure calls for one continuous white eye field with a thin outline. The new geometry explicitly tags `userData.squidConnectedEye`. Only tagged geometry follows the same y-interpolated head0/head1/head2 deformation as the mantle and dark outline. Untagged geometry preserves the original left/right eye-bone path. The source clip selection, timing, locomotion, collisions, and human geometry are unchanged.

Actual source Wait/Walk/Jump poses exposed a 1.446 mm center discontinuity in the old sign-of-x eye-bone split. On the connected grid, old eye-bone deformation differed from mantle deformation by up to 12.39 mm. The replacement matches independent mantle interpolation within 9e-9 m. A 2 μm-wide center strip stays continuous across 3 LODs and 30/60/120 Hz (3,402 vertex checks). The committed regression also tests the actual connected grid in nine source poses per LOD, normalized finite normals, reused weight arrays, and unchanged legacy eye behavior.

Weights are precomputed once per LOD (one Uint8 segment plus one Float32 blend per vertex, 4,225 bytes across the current three LOD variants). Two scratch vectors and three normal matrices are allocated once per rig; the connected deformation path allocates no per-frame objects. Existing three owned eye geometries and one skeleton still dispose exactly once across repeated equips and 36 LOD switches. The new eye grid has fewer vertices than the prior pair of disks. No textures or draw batches were added.

Separate shape acceptance audit: all vertices of each short-lobe root ring are enclosed by the deformed mantle in nine Wait/Walk/Jump samples at each of three LODs (2,124 root-point checks), supporting the raised, hidden joins without changing their semantic chain assignments. This does not establish final reference fidelity; native captures remain required.
