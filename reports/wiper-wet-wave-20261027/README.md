# Charged Wiper-family wet wave candidate (2026-10-27)

Baseline: `5a760775d4925de250bb5f8445104f92c2d68f73` (frozen integrated Hissen candidate). This change is **implementation verified, visual acceptance pending**, not retail equivalence.

## Reference and scope

The user supplied a private side-by-side promotional screenshot and INKWAVE “charged wave, frame 1”. Its SHA-256 is `75ce4d5f2d11009ce915b0c58f7e1a501e6088edd676d200610db6c85bf77e38`. Both implementer and independent reviewer inspected the actual image. No reference image, Nintendo asset or derived texture is committed or loaded at runtime.

The retail side has broad wet irregular lobes and unequal peeling volume; the INKWAVE side has near-identical pointed parallel blades with dense corduroy stripes. The screenshot does not establish exact weapon ID, retail version, gear, camera/FOV, timing, speed or world scale. The historical render script defaults to `s3-saber-normal` (Stamper), not `s3-saber-lite` (Wiper), so the fix explicitly covers **charged WeaponSaberNormal + WeaponSaberLite and their kits**. Taps and the source-aware horizontal charged WeaponSaberHeavy/Dental remain unchanged.

## Actual production ownership and fix

`catalog admission → native Projectiles → installS3ProjectileShapes/_draw → drawS3Shapes` reads one physical catalogue projectile. The two old crescents were **two render instances**, not two physical projectiles. `fireInk → createInkSheets` separately owns the short launch/root sheet.

- Bake a broad asymmetric, rolled, blunt-ended wet contour at the existing 28×12 topology and span. A lazy `wetSlashV` InstancedMesh uses actual positions/normals in color, native shadow and scene normal/depth override passes. A rejected color-shader-only geometry plan was discarded because shadow/AO would retain the old blades.
- Keep two render lobes but shorten the peel to `.58` span and `.72` depth instead of a near-copy `.82` slab. Keep native position, travel direction, born/late scales, lifetime and source-derived plane.
- The wet material uses broad sparse surface patches and low emissive rim, retaining physical clearcoat. Legacy slash geometry/material/shader remain on the original paths.
- Select a rolled launch edge and softer broad-body bump through the existing sheet instance data. Existing radius, age, sweep, layers, specks and texture ownership remain; no new texture or particle pool.
- Both vertical meshes share the original 16-instance list-order cap, not 16+16. Clipped targets do not allocate the lazy mesh.

No weapon physics, charge/recovery, timing, range, damage, paint, RNG, physical projectile count, particle count, character/hair/rig, source weapon data or packaged media changes.

## Bounded cost (not a mobile/GPU benchmark)

Only after first selected visible charged wave: +1 mesh, +1 geometry, +1 material; five additional GPU buffers backed by **13,600 bytes** of typed arrays (positions/normals/Uint16 indices + 16 instance matrices/colors). No additional textures, topology complexity or triangle/instance ceiling. Dispose and reuse are tested.

An ordinary single target wave still submits one projectile mesh. Mixed target + Heavy charged waves can require **one additional draw per participating render pass**, with the same combined 16-instance/triangle ceiling. Native GPU time/actual renderer calls remain pending.

A local Node presenter-only microdiagnostic (30 retained samples per lane after two warmups) measured first-render initialization p50 2.603→3.131 ms, p95 3.566→4.604 ms. Warm presenter p50 0.002916→0.002805 ms/call is noise-scale, **not a performance improvement claim**. This measures CPU preparation, not WebGL submission, shaders, browser frametime, iPad or FPS.

## Verification and remaining visual work

- Production-composed source tests cover Normal/Lite+alternate kits, Heavy/taps, actual geometry/shadow-pass ownership, lazy/reuse/disposal, shared saturation cap, shader isolation, repeated draw/clear and zero presentation RNG at 30/60/120 Hz.
- A deterministic baseline/candidate fixture audit covers 27 weapon/rate cases (Normal/Lite/Heavy + kits, Shooter, Machine and Explosher ×30/60/120 Hz); gameplay/ink/HP/stats/projectile/paint/RNG/drop traces match. The fixture uses native catalogue/projectile code but frozen actor integration and a no-hit collision world; it is **not** browser gameplay or retail measurement.
- Local CPU geometry diagnostic uses exported actual geometry/matrices and identical 55-degree perspective; it demonstrates the duplicate silhouette removed and Heavy unchanged. It does **not** render the game material, launch shader or native scene. Reviewer noted potentially coarse lobe edges/central kink; do not hide this or pursue speculative detail before real pixels.
- Real browser/material/shadow/AO rendering, correctly framed launch+projectile first/later frames, mobile performance and retail camera/timing comparison remain pending. The known native Chromium sandbox block was not retried or bypassed. Old `WIPER_SOURCE=c0938a3` receipts do not verify this candidate.

A separate additive automatic PR browser route is being prepared; it must bind source head, exact emitted bytes/build hashes, sourceActor, first/later physical ages, full camera and raw PNGs. No manual CI, push, new PR, merge or release is performed by this local implementation task.

## Existing PR overlap (read-only audit)

Current open #1882 and #1897 touch both runtime files. #1882 edits Machine drill reuse/static sweep caching and Explosher sparkle harmonics; no Wiper shape conflict. #1897 edits tracked color uploads, lazy/empty renderer and pooled bursts. Preserve those optimizations on integration: include `wetSlashV` in any later empty-mesh hide fast path; reset pooled burst `wetWave` metadata if adding alternate admission routes; use tracked colors on the new mesh when applying its color helper. #1900 and #1898 have no exact target-file overlap. This is an overlap review, not a claim those PRs were merged.
