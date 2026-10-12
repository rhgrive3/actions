# Quad and Explosher procedural reconstruction

Base: `b078c37907351f1bbc13d0e7d4b5cbeb0a330009`. Scope is only `s3-maneuver-stepper` (Dark Tetra Dualies / クアッドホッパーブラック) and `s3-slosher-washtub` (Explosher / エクスプロッシャー).

## Source and design

Both the stored 3D render and the twelve-view rotation sheet were opened and visually inspected before rebuilding:
- `reports/inkwave-weapon-model-workspace/refs/s3-maneuver-stepper.3d.png`
- `reports/inkwave-weapon-model-workspace/rotsheets/s3-maneuver-stepper.rot.jpg`
- `reports/inkwave-weapon-model-workspace/refs/s3-slosher-washtub.3d.png`
- `reports/inkwave-weapon-model-workspace/rotsheets/s3-slosher-washtub.rot.jpg`

The same `Pieces`, lathe, box, cylinder and pipe pipeline as the accepted Splatling is used. No imported retail mesh or Blender asset is introduced. The Quad is one pistol used in both hands. Its distinguishing elements are the vertically stacked front discs, open pull loop, thin receiver, wide swept shoe and separate rebound pods. The Explosher has a pressed jerrycan with X ribs, rear electrical box, separate protective rails and shocks, and a large open bronze burner with horizontal grille bars and recessed ink.

## Preserved contracts

No changes to kit, registry, hold profiles, motion, gameplay, projectile origin or runtime integration. Main hand transforms, muzzle coordinates, dual flag and part pivots are pinned for all twelve Dualie and Slosher models. Geometry hashes additionally pin the ten untouched models. The native slosh surface pivot is preserved.

## Initial local verification

- Exact production composition build: `0b2c47214301b8ee2ebbcca1bcde8e6056cca10d16dc7280c5197389b05b010e`.
- Six emitted-runtime tests pass, including real Actor carry/fire at 30/60/120 Hz and preservation of all twelve models' gameplay frames.
- Static body + ink triangles: Quad 2,477 → 5,123; Explosher 5,541 → 9,585.
- Static body + ink geometry bytes: Quad 65,102 → 131,098; Explosher 142,886 → 248,910.
- Being inside the geometry budget is not a performance verdict. CI captures exact before/after viewpoints, real Actors, and same-runner eight-Actor game/far ABBA render and animation measurements. Visual review and measured performance remain pending until that evidence has been inspected.

## Limitations

Reference images have their original cameras; candidate and baseline use identical fixed cameras. The comparison is visual design evidence, not a pixel-matching or retail gameplay-parity claim. Retail physical sizes are not documented, so native hand and muzzle frames constrain the reconstruction.

## Review iteration and deterministic validation

A CPU-only geometry diagnostic exposed small gaps between the Quad's receiver, grip and heel. Those junctions are now continuous geometry, and the pull-loop return joins its front plate. The Explosher throat was moved forward within the burner so the intact can wall cannot obscure the recessed ink. This diagnostic is explicitly not the emitted-shader/Actor proof; CI images remain required.

Refined static body + ink: Quad 5,279 triangles / 135,314 bytes; Explosher 9,729 triangles / 251,774 bytes. Four focused source tests pass after the revision, including exact same-runtime unchanged geometry and real Actor checks at 30/60/120 Hz. An additional 31 existing Dualie/Slosher motion and timing regressions pass.

The first CI run (`38216994596`) reproduced the production hash and passed Actor/shape checks but rejected the precomputed unchanged Tri-Slosher binary geometry hash. The precomputed snapshot came from local Node 24.19.0, while CI uses Node 22. No model-builder, kit or geometry primitive in this path reads random, date or performance values. Local forward/reverse construction order produces identical hashes for all twelve models. The workflow now creates the immutable before build's geometry twice, in forward/reverse order on the same runner, and compares the ten untouched models byte-for-byte against that actual baseline. It also prints both hashes so the old mismatch can be diagnosed rather than hidden. The precise cross-environment cause remains unconfirmed until that control runs.

## Fidelity rejection and second reconstruction

The owner rejected the fidelity of `bdda231` on 2026-10-12. Its successful CI and performance measurements are retained as intermediate evidence; they do not approve that visual result for integration.

The second reconstruction changes the Quad's narrow straight parts into layered curved rear and front frames, a short receiver with visible twin chambers, broad ankle housings, a swept shoe with varying three-dimensional width/pitch, three thick rebound cushions and broad paired front faces. The Explosher gets a long can with a real sloped shoulder, lower cast handle slots, a proportioned rear electronics box, a larger carry aperture, an open machined burner yoke and rectangular-section silver cage with diagonal shocks. These changes are derived from separate front, side, rear and oblique inspections of the stored turntable and official render.

Reference camera settings and cropped source windows are now recorded per view. The comparison outputs contain four explicit reference/baseline/candidate pairs per weapon; the Quad's official two-pistol oblique render is compared to two instances of the same definition. The Explosher display tilt is matched in the review camera basis and is not baked into its native held geometry. Source camera calibration remains approximate, so no pixel-parity claim is made.

The native rear hand grip on Explosher has no clearly visible counterpart in the standalone reference. It remains as a subdued black attachment behind the electrical box to honor the unchanged native hand frame. Its placement is a gameplay-interface adaptation, not a claimed retail detail. Tiny dial marks, warning-panel print and hidden inner fastening details are approximate; the visible can, frame, burner and cushion construction are the primary reference targets.

Correction to the first snapshot inventory: `sloshers.MODELS` excludes the legacy native Slosher. `bdda231` actually tested eleven registered models and nine untouched geometry hashes, not the previously stated twelve/ten. The second reconstruction adds legacy Slosher explicitly so the executed inventory is now twelve models and ten unchanged geometry comparisons.

Second reconstruction source metrics: Quad 11,715 static body+ink triangles / 303,290 bytes; Explosher 11,989 / 306,614. Draw groups remain merged and no cache, LOD, animation, hold or emission code changes. New emitted images and eight-Actor performance evidence must be reviewed before judging this candidate.
