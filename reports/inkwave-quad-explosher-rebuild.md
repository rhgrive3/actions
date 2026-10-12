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
