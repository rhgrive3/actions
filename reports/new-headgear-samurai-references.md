# Samurai Helmet original procedural candidate

## Exact identity and sources actually viewed, 2026-10-18
Splatoon 3 サムライヘルメット / Samurai Helmet, amiibo Inkling Boy reward. Not Octavio's helmet, Squinja gear, or a generic samurai kabuto.

- https://splatoonwiki.org/wiki/Samurai_Helmet : identification, S3 gallery links; retrieved HTML and followed actual linked filenames.
- https://cdn.wikimg.net/en/splatoonwiki/images/e/ec/S3_Samurai_Helmet_Front.jpg : S3 equipment-menu frontal photograph. Large gold sheet horns, central squid-shaped crest, low studded black/gold bowl, diamond-shaped side wings with pale mottled fields and gold roundels, substantial purple chin bow.
- https://cdn.wikimg.net/en/splatoonwiki/images/5/52/S3_Samurai_Helmet_Back.jpg : S3 equipment-menu rear three-quarter photograph. Broad, shallow outward-flaring neck guard with colored horizontal lacing, upturned side corners. Black/gold dome and rear horn faces. This is not an orthographic side reference.
- https://cdn.wikimg.net/en/splatoonwiki/images/4/4a/S3_Gear_Headgear_Samurai_Helmet.png : S3 inventory icon, corroborates angle/shape and whole-object silhouette.
- https://game8.jp/splatoon3/480324 and linked https://img.game8.jp/7209351/d40a4df9b53d8be2da7a29b2ea8a3c2c.png/show : paired S3 front/rear worn views, teal color variation confirms ink-responsive cord and guards.

The source screenshots are local research references only; no game mesh, texture, source screenshot or AI image enters the shipped module. No exact dimensions are claimed. True side orthographic proportions remain inferred from the actual rear three-quarter and inventory views. Fine ornamental engraving is deliberately simplified into a broad squid crest and two relief curls; fidelity to individual source ornamental strokes is not claimed.

## Implementation and checks
Only new patches/local-quality/headgear/samurai-helmet.js. Factory contract agreed with integration reviewer: ID 9, key samurai-helmet, SAMURAI_HELMET_FIT, createSamuraiHelmet. Uses existing headSurface and offIn callbacks, head-bone local pivot [0,1.05,-.002]. No existing face/body/hair/catalog files changed.

Four material batches at every LOD; flat analytic wing mottling and rear lacing avoid per-dot/per-thread geometry. Physical studs, broad thin gold horns, body-following chin cord are silhouette-bearing geometry. setInkColor changes cloth and wing border. Owned geometry/material disposal is idempotent.

Run node --experimental-loader ./loader.mjs test.mjs in this candidate folder. This loader reads the protected snapshot's Three runtime; it does not alter that snapshot. Tests cover finite geometry and indices, bounded width/depth/height, monotonic LOD counts, native callback consumption, recolor, shader source construction, double disposal and 40 repeated game builds. Results in test-results.json. Geometry-only CPU preview is supplementary, not a native WebGL material/occlusion pass; original S3 comparison is visual and not a measured asset reconstruction. Parent owns actual character hair clipping, lighting, shader compile, motion and native CI acceptance. No gameplay/ability behavior is changed; S3 Quick Super Jump is not implemented by this cosmetic module.

## LOD allocation review (2026-10-18)
Initial far 3,776 / game 6,376 triangle counts spent too much on nearly planar wing tessellation, sphere rounding and evenly high tube segment counts. Revised far 1,556 / game 3,084 / hero 10,528; four draw batches unchanged. Exact before/after part costs in triangle-allocation.json, concise categories in allocation-summary.txt.

Far: crown 304, studs 256, neck guard 288, horns 96, side wings 100, front crest 172, cord/bow 340. Game: crown 680, studs 576, neck guard 616, horns 96, side wings 216, crest 276, cord/bow 624. Horn profile polygons unchanged at all LODs; hero geometry entirely unchanged. Far remains above the older simple helmet's 1,100 triangles because this item has two-sided wing panels, a wide visible rear/under guard and a looping chin bow in addition to the main shell. These major silhouettes were retained rather than removed merely to meet another item's count.

Near-planar wing grids reduced to 3x1 far, 5x2 game; tiny spheres reduced; cord segments now follow path complexity (tails 3/4 vs loops 8/12); guard radial subdivisions reduced while its full outline and front/back faces remain. Back/underside geometry retained at lower sampling because rear and underside angles are actually visible. Flat lacing/wing pattern shader remains independent of LOD subdivisions. Native-shaped context regression added: clearance is an offset function and analyseHat context exposes fit at ctx.hat, not at ctx.rim. Tests pass with that actual call shape and clearance-only fallback.

## Actual native screenshot review and correction (2026-10-18 06:33 UTC)
Inspected cabe8359 native hero front/back/left/oblique/under screenshots. Rear gold studs/ribs and white patterned side fields were present: their absence in CPU preview was painter ordering / missing procedural shader, not missing source geometry. Native proof did confirm excessively polygonal narrow horns, a flat skirt with a rectangular grid, overly thin chin ties, and overly flat sharp side wings.

Revised only meaningful forms/material pattern: wide smooth Bézier horn contours with planar slanted fronts (removes kinked triangular highlights); shikoro side ends curl upward while rear extent stays -0.317; rounded curved wing fields with domed gold roundels; chin cord radius .011→.015 and bow .009→.014; dark plate shading with flat diagonal ink stitches replaces the broad teal grid. Existing rear studs unchanged. No micro-detail geometry added. Native camera cropping is a separate integration issue and not fixed by shrinking the helmet.

New counts far 1,720 / game 3,460 / hero 11,072, four draws. Added triangles are justified by actual curved outline and domed major roundel, rather than tiny pattern geometry. Focused regression suite rerun and passing; latest native WebGL validation is still required after this change. Earlier hero-byte-identity claim applies only to the preceding optimization revision, not this deliberate shape correction.

## Native revision 2 crest / metallic-surface correction (06:46 UTC)
Inspected 79ce full-frame native hero frontal against actual S3 front. The original plate was only .186 wide and a simple point with two bottom curves, giving a small smiling icon rather than the broad embossed crest at the horn base. Revised base is approximately .282 wide including its bevel, with high central mantle, broad lateral scrolling flanges, convex raised squid mantle (.026 relief), and two sweeping tentacle strokes. This is an original broad-form interpretation, not a claim of reproducing the source's minute engraving.

Gold studs already exhibited specular highlights under native lighting, so the gold albedo stayed 0xcda32f and lighting was not touched. Horn and crest edge bevels now provide non-coplanar surfaces for highlights; the central mantle supplies broad curved front normals. Gold uses a modest physical clearcoat over the same .78 metallic base, roughness .26, coat .65 / coat roughness .18. Planar horns remain thin sheets; no fake emission or painted highlights. Three shallow overlapping shikoro plates replace the single continuous surface, preserving flat diagonal lacing and the existing major outline.

Latest focused suite passes. far 2,304 / game 4,548 / hero 13,624 triangles, four draws; increase is physical broad relief/beveled silhouettes and three plate lips, not dense pattern geometry. Native re-capture is required to judge highlights and crest overlap. Bow, dome, side wings, character, scene lighting and ink-color update ownership remain unchanged.

## Reproducible integrated regression
From repository root, build with `node scripts/build-inkwave.mjs inkwave-public _site`, then run `INKWAVE_HEADGEAR_SITE="$PWD/_site" node --experimental-loader ./patches/local-quality/tests/headgear-production-loader.mjs --test patches/local-quality/tests/headgear-samurai.fixture.mjs`. Earlier candidate-folder commands and local image paths above document development history; this committed fixture is the reproducible emitted-module gate. Native capture and visual acceptance are recorded in the integration report.
