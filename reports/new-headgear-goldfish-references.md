# キンギョマスケラ / Golden Gala Masque

## Sources inspected before modeling

- Identity/localization: https://game8.jp/splatoon3/587342 and https://splatoonwiki.org/wiki/Golden_Gala_Masque . Japanese item name is キンギョマスケラ; English name is Golden Gala Masque. Do not label it King Facemask.
- Front original in-game screenshot: https://cdn.wikimg.net/en/splatoonwiki/images/a/ae/S3_Golden_Gala_Masque_Front.png (local ref-front.png). 655×515. Gallery page https://splatoonwiki.org/wiki/File:S3_Golden_Gala_Masque_Front.png
- Right-profile original screenshot: https://cdn.wikimg.net/en/splatoonwiki/images/8/87/S3_Golden_Gala_Masque_Right.png (local ref-right.png). 565×505. Gallery page https://splatoonwiki.org/wiki/File:S3_Golden_Gala_Masque_Right.png
- Rear original screenshot: https://cdn.wikimg.net/en/splatoonwiki/images/f/f2/S3_Golden_Gala_Masque_Back.png (local ref-back.png). 665×545. Gallery page https://splatoonwiki.org/wiki/File:S3_Golden_Gala_Masque_Back.png
- Independent worn/menu appearance, published 2024-01-11: https://puromoderargneo.hatenablog.com/entry/2024/01/11/205922 . Image https://cdn-ak.f.st-hatena.com/images/fotolife/p/puromoderargneo/20240111/20240111200916.jpg (local ref-worn.jpg).
- Official Nintendo announcement identified by independent reference reviewer: https://splatoon.nintendo.com/en/news/put-on-your-fanciest-finery-for-frosty-fest-in-splatoon-3/ . Used for event provenance, not invented unseen rear detail.

All four saved original images were visually inspected. No AI-generated reference, extracted model, game texture, or ripped asset is used in the implementation. Downloaded public screenshots remain review references, not runtime dependencies. Screenshot patch version unspecified; menu photograph is January 2024 FrostyFest era, static standing/menu pose.

## Observed geometry and orientation

White/ivory lacquer mask, gold perimeter and fish outlines, with two genuine eye openings. Upper edge is asymmetric: tall curved coloured tail is on VIEWER-RIGHT in front image and therefore wearer's left. Local +X is that side for +Z front camera. Right-side photograph shows the short side. Wiki prose saying right is ambiguous; original images control orientation.

Goldfish bodies face one another across the nose, with eyes around wearer eyes. Fine gold pattern is flat inlay/paint, not beads. Tall tail has a darker ink-coloured mottled area. White coating is gloss/clearcoat separate from base colour; gold uses metallic material response rather than yellow emission. Nose bridge comes forward; mask curves backward toward temples. Top remains open: NO helmet crown.

Back shows broad flat ink-coloured ribbon, two hollow bow loops, two separate hanging ends. Teal spiky crest and rounded teal masses visible in the rear reference are wearer HAIR, not headgear. Implementation intentionally does not recreate, flatten or edit that hairstyle.

## Implementation decisions / uncertainty

Original simplified Bezier outline and fish artwork; texture is generated from these paths in DataTexture. Painted motifs are mapped onto the already-pierced shell and cannot bridge an eye aperture. Texture stores colour plus packed metalness/roughness; no luminous material. Mottling is original deterministic fine noise, not exact source texture. Reference gold/silver fine micro-decoration remains approximate at this geometry budget.

Bone-local mask is curved independently of hairstyles. Existing centre [0,.164,.014], +Z front; eye holes centred about x ±.08, y .168. Integration FIT explicitly preserveHair:true, no rim. Integration worker owns the neutral context path so face accessories do not trigger native under-hat strand variants.

Rear ribbon sits over an approximate skull envelope. Thick/back-hair style clearance and close eye fit require actual native character screenshots across hairstyles. Source rear shows only one hairstyle, so all-style fit is NOT claimed. No animation/ability/gameplay change: head-bone attachment follows existing animation; no gameplay statistical equivalence asserted.

## Verification

`goldfish-mask.test.mjs`, run via baseline `scripts/composer-target-three-loader.mjs`, passed all three LODs, finite geometry, decreasing complexity, bounds, ray-open eyes, ink recolouring, idempotent exact-once geometry/material/texture disposal, and invalid LOD rejection. Results in test-results.json.

Hero 6524 triangles / 19572 vertices; game 2444 / 7332; far 920 / 2760. Four meshes/draw calls, four materials, two textures (256² hero/game,128² far). No external dependencies beyond baseline Three and mergeGeometries.

`software-preview.png` is a CPU z-buffer geometry/texture inspection, NOT a WebGL lighting screenshot and NOT proof of native integration. It confirms silhouette, open holes, flat motifs, profile concavity and rear bow. Native renderer material/clearance review remains parent responsibility. A standalone neutral-light WebGL preview is supplied in preview.html. Own headless Chromium could not start: sandbox denied socket creation; permitted escalation failed at runtime with read-only mount setup. No actual native/browser render is claimed here.

Model source is solely goldfish-mask.js; no shared catalog, face, hair, body, camera or lighting files were changed.

## Native material regression and targeted correction (2026-10-18)

Native cabe8359 capture showed near-black ivory while the white shirt was correctly lit. Root cause was image-space Y inversion without reversing ShapeGeometry triangle winding: front panels geometrically faced -Z but supplied normals +Z. Three DoubleSide treated the visible front as a back face and flipped its lighting normals again. Texture colorSpace is correctly sRGB; packed material map remains linear; no albedo/lighting compensation was applied.

Corrected front panel winding and explicit reverse-facing lining, with geometric-normal fallback for very thin curved boundary triangles and tight trim corners where averaged tangents crossed a fold. Final regression tests require intended front/back orientation and strictly positive geometric-normal dot authored normal at EVERY triangle vertex of EVERY mesh for all three LODs. Geometry positions, palette, texture bytes, metallic/roughness/clearcoat settings and draw counts are unchanged. Native recapture is still required to establish the visual fix.

Stable corrected module SHA256: 1e044e7d0d821019ee263ff45741b9a3cf376cd6758fe36cea52dda2d96eb4d6.

## Bounded artwork aliasing pass (2026-10-18)

Native 79ce recapture confirms restored ivory after winding fix. Remaining stair-step motif contours were traced to binary single-point 256² artwork rasterization, not filtering or colorSpace. The existing bilinear magnification, trilinear mipmap minification, sRGB colour and linear packed PBR data were correct.

Hero colour/packed-PBR maps are now 512²; game stays256² and far128². A 2×2 subpixel scan-conversion retains quarter-pixel coverage for both colour and material maps. No raised motif geometry, new fine features, palette changes, lighting changes, or PBR interior-value changes. Scanline span fills keep full three-LOD focused tests at approximately0.42s in this executor. Tests find1686/844/416 fractionally covered edge texels, and verify filtering, resolutions, normal orientation and disposal.

GPU base-level texture budget: hero2MiB total (two512²RGBA maps), game512KiB, far128KiB; mipmaps add approximately one third. Four draw calls and triangle counts unchanged. Artwork PNGs are unlit generated-map inspection only. Material highlight fidelity is not claimed from unlit images; no unsupported material adjustment was made.

Stable aliasing-pass module SHA256: 6513c4f3ffb6badf151b7649342a68f6a4f8bb251e25a1c4c41cf62b7e78559e.

## Local dotted nose seam correction (2026-10-18)

Production cf247 front/oblique capture showed dark dashed diagonals on ivory near the nose. Inspecting the isolated shell found long, almost-collinear ear-clipped triangles across that exact area. Bending their vertices onto the nose surface made their geometric planes nearly sideways. The previous safe geometric-normal fallback consequently shaded these tiny faces dark; they had normal Z as low as0.019. This is a local triangulation defect, not a texture marking. Shell and lining are identically sampled surfaces separated by3.8mm in Z; coplanar shell/lining fighting is not supported by the geometry.

Correction improves only internal panel diagonals by constrained Delaunay flips before subdivision/bending. Polygon boundaries and eye holes are fixed. Nose vertex normals now have minimum Z0.9485(hero),0.9507(game/far), with zero sideways fallback faces in the nose region. Regression asserts Z>.9 throughout this region, every normal agrees with its geometric triangle, and projected area is unchanged. Comparison with the AA-fixed predecessor found projected shell area differences no larger than2.1e-17 and byte-identical colour/PBR textures. No palette, material, scene light, new ornament, or exterior silhouette changes.

Updated triangles: hero4596 / game1772 / far696. Four draws, four materials, two textures unchanged. Native recapture remains required to confirm disappearance of the dotted seam.

Stable local triangulation-fix SHA256: 955d013470f781552b9e1d4f5edf0210c2a0beae1741c0ca9d850fe824d100a5.

## Reproducible integrated regression
From repository root, build with `node scripts/build-inkwave.mjs inkwave-public _site`, then run `INKWAVE_HEADGEAR_SITE="$PWD/_site" node --experimental-loader ./patches/local-quality/tests/headgear-production-loader.mjs --test patches/local-quality/tests/headgear-goldfish.fixture.mjs`. Earlier candidate-folder commands and local image paths above document development history; this committed fixture is the reproducible emitted-module gate. Native capture and visual acceptance are recorded in the integration report.
