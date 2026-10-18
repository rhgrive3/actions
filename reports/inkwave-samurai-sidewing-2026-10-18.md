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
