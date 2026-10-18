# Samurai fukigaeshi correction, 2026-10-18

Scope: explicit user red circles on both side wings in /workspace/shared/latest-user-reference/1000001369.png. Preserve approved crown, central crest, horns, body/hair, existing material palettes and lighting. PR1581 baseline e964a6036c92e1919c0197ffbc45cbce76dfcf80, recovered through GitHub connector. Protected samurai-helmet.baseline.js SHA256 b23fddf81a73ad87f815c6e6e2da82167b5a5e452740a52acd81eab9fac653a6.

Viewed source: actual Splatoon 3 front and rear screenshots in /workspace/shared/new-headgear-reference-review/S3_Samurai_Helmet_Front.jpg and S3_Samurai_Helmet_Back.jpg. Original URLs https://cdn.wikimg.net/en/splatoonwiki/images/e/ec/S3_Samurai_Helmet_Front.jpg and https://cdn.wikimg.net/en/splatoonwiki/images/5/52/S3_Samurai_Helmet_Back.jpg. Exact item Samurai Helmet / サムライヘルメット. Front viewer-right side-wing crop x500:713,y205:437 enlarged into source-wing-enlarged.png; cropping only, no generative reference.

Observed differences and correction:
1. Current small rounded card is too narrow. Source is a broad curved rectangular plate, with a relatively fixed upper/inner attachment but a larger outward/downward panel. Enlarged two local panel axes from .115/.082 to .135/.100 and .095/.145, reduced excessive corner rounding, and aligned tilt to retain upper attachment vicinity.
2. Source gold medallion occupies roughly half the panel width and has several major concentric relief rings around a convex center. Replace plain .028-radius dome with a .051-radius turned concentric radial profile. Rings share the physical gold material and actual panel normal, not a camera-facing decal. Far/game/hero angular samples 16/24/40; no extra draw batches.
3. Source has a dark outer binding, broad gold frame, narrow ink edge and mottled ivory cloth rather than uniform polka dots. Add outer dark binding, widen frame, and vary flat analytic cloth spots in location/size/shape using the unchanged ivory/dark/ink colors. Pattern remains flat shader shading with derivative fade; no per-dot meshes.
4. Lower/outer lip rolls back to a dark/ink underside. Existing shikoro crossed the front of the ivory panel. Correct panel placement and local outer-edge curl, add closed lower ink lip. Do not alter the shikoro/crown/crest geometry or hide overlap by recoloring.

Tests:
- Recovered production fixture passes: finite coordinates/indices, native headSurface+ctx contract, crown bounds, recolor, shader construction, disposal twice, monotonic LOD, 40 lifecycle rebuilds. Added two-medallion/two-lip assertions and rejection of old plain dome part.
- sidewing-review.mjs verifies all 64 non-wing geometry parts have EXACT position/index/normal/UV arrays unchanged at each LOD. All four material JSON properties unchanged (UUID excluded). Four merged draw batches preserved.
- overlap-check.mjs casts front-to-back rays through every hero ivory-field triangle centroid against the real skirt triangles. Baseline 11 front intrusions (max .06494); candidate zero among 68 field triangles overlapping the projected skirt. This is focused geometric proof, not an all-camera or gameplay/native acceptance claim.
- far 2740→3588, game5272→6712, hero16636→18860 triangles. Main cost is the explicitly requested large concentric medallions and full curved/closed wing surface. No unrelated detail added.

Next gate: actual native perspective front/side/rear with correct source lighting/reflection environment. Gold-lighting diagnosis remains independent; no gold RGB/metalness/roughness/envMap compensation in this change.


## Topology follow-up

# Samurai wing topology audit and bounded correction

Protected input: side-wing module SHA256 67867b78004bcfd933435c384f30e52e1303ded9fde1e9203133ea432b000b2e. No edits to that candidate or tested PR head.

## Findings
- All original wing nondegenerate triangles have consistent winding; no nonmanifold internal edges.
- Original medallion polar grid had 16/24/40 zero-area triangles per side at far/game/hero, and its outer boundary was open.
- Curved medallion relief sits ahead of the panel: minimum sampled front gap 0.001707–0.001850, maximum 0.019728. No relief vertex was buried. Small outer vertices extend beyond the ivory field onto the frame, not necessarily beyond the plate.
- Original wing front and back were separate sheets; only a lower lip joined them, with a 0.001 mismatch at its front join. Top/side thickness was open.
- Six-angle per-triangle ray audit (0,45,80,100,135,180 degrees) across all LODs: no guard crossing in front/45-degree views. Near edge-on, the guard can occlude the far wing; this is depth ordering, not proof of source mismatch. Rear views see black backing and no medallion. Native images still needed to adjudicate apparent source fidelity.

## Bounded correction
Closed top/side plate thickness, joined existing lower lip exactly to front/back and reduced its unnecessary 2-row segmentation to 1. Added a buried rear cap and outer wall to each medallion, removing zero-area polar faces. Existing visible medallion relief vertex positions are byte-identical. No new ornament/detail or material/color/light changes.

## Validation
Fixture passed all existing finite/index/LOD/native-fit/color/disposal/rebuild tests, plus welded edge incidence, opposite shared-edge winding, strictly nondegenerate triangles and positive signed volume for both closed plates and both closed medallions at every LOD.
Preservation test: 72 unaffected pieces retain byte-identical positions, indices, normals and UVs; all four material properties identical. Visible medallion relief position arrays unchanged.
Triangle counts far 3588 -> 3684, game 6712 -> 6856, hero 18860 -> 19084; four draw batches throughout.
Post-correction six-angle rays still show zero front/45-degree guard crossings and zero directly rear-visible medallion triangles. New buried medallion base vertices intentionally lie below the ivory face. Native capture review remains pending.

Reproduce from this directory:
INKWAVE_HEADGEAR_SITE=$PWD node --experimental-loader ./loader.mjs patches/local-quality/tests/headgear-samurai.fixture.mjs
node --experimental-loader ./loader.mjs preservation-check.mjs
node --experimental-loader ./loader.mjs wing-acceptance-audit.mjs
node --experimental-loader ./loader.mjs wing-angle-audit.mjs


## Native broad-shape correction

# Native 9851 wing review

Inspected actual hero front, left, right, back, top and isolated-head-under PNGs from /workspace/shared/newgear-9851-proof/headgear-shard-multi-8-9-9851e5587d687c6c0e30a6b5387b20276d298a5a/.qa-evidence/multi-8-9 against the recovered S3 front-source wing crop.

Confirmed: broad ivory fields and large concentric gold ornaments are present; gold relief carries highlights. The neck guard no longer covers the pale front in front view. Rear shows dark wing backing and no backwards medallion. The six-angle geometric visibility findings agree with these captures. No new catastrophic hole in hero front/side/rear is visible at this image scale. Top/under show thin sheet-like edges, motivating bounded closure rather than unsupported ornament detail.

Remaining source-fidelity caution: original lower/outer wing curls into a broader dark/ink underside and its gold perimeter reads heavier. Current plate remains comparatively flat and sharp-cornered in side/top views, with thin gold edging. The bounded topology correction is not claimed to remove this difference. Lighting differences prevent direct albedo/roughness inference.

These captures predate topology SHA7147a63e63db854832bf61692590583f4cd080996db147457e63ea2e968d33ca; final integration should verify the closed geometry in native scene. No source/material changes made during this visual review.
