# フェイスゴーグル / Paintball Mask

## Identity and evidence (checked 2026-10-18)
- https://gamewith.jp/splatoon3/390028 explicitly names フェイスゴーグル, Forge/フォーリマ, Comeback, 10,000. S3 item and worn images were downloaded solely as visual reference and directly inspected.
- S3 item three-quarter reference: https://img.gamewith.jp/article_tools/splatoon3/gacha/ge429.png (local refs/item.png).
- S3 worn near-frontal reference: https://img.gamewith.jp/img/9a245d07c6dfa3b4460b237694dd6bba.png (local refs/worn.png).
- https://splatoon.fandom.com/wiki/Paintball_Mask maps Japanese フェイスゴーグル to English Paintball Mask.
- https://splatoonwiki.org/wiki/Paintball_Mask describes full-face mask, cap-like visor, clear lens, light gray shell, angular patterns and two crossed black/ink-color straps. Direct page open was 403, public search index returned description. Its S2 rear gallery must not be mislabeled S3.

## Design
Original procedural surfaces only, no ripped mesh, extracted texture, imported game data or external runtime texture. Distinctive full-face cage, 3 stacked central triangular vent spaces, forward nose/chin chevrons, projecting brow visor, one continuous blue-clear lens, light gray cage and ink-color side rectangles, two crossed rear straps. Forehead badge is an original simplified graphic; no claim to exact logo reproduction.

Native headSurface(az,elevation,normalOffset,out) controls face fit; conversion to bone space subtracts [0,1.05,-.002]. Fallback uses native head dimensions. preserveHair descriptor has no rim and requires integration neutral clearance; never edits face, hair or body. Existing ink-color lifecycle sets just colored accents. Rear straps can follow supplied clearance. Full hairstyles can occlude or intersect rear straps and require integrated review; no hidden hairstyle change allowed.

## Performance and tests
Four merged material meshes per LOD, no geometry groups, 0 textures, 1 transparent FrontSide lens (alpha .19; depthWrite false; no transmission framebuffer, refraction or double-side pass). Hero/game/far triangles 4918/3086/1878, vertices 6287/4366/2894. Rail tessellation drops by tier; far omits fine dark central grille members. Broad vents and silhouette retained.

Run node --loader ../main-a505-snapshot/scripts/composer-target-three-loader.mjs face-goggles.test.mjs from this directory. Focused tests passed: all finite attributes, zero collapsed triangles, headSurface exercised, material/triangle budget, strictly decreasing LOD triangles, ink-color update, exact-once geometry/material disposal, invalid LOD / nonfinite clearance rejection.

## Acceptance boundaries
- Local actual browser execution unavailable: sandbox socket denied; escalation failed with bwrap read-only mount. Do not treat the software orthographic preview as native browser QA.
- Native CI must render front, 3/4, side, rear, gameplay and hero using latest native face on all hairstyles, then check straps, eye visibility through lens, cage depth and shadows.
- S3 rear buckle, internal padding and hidden inner surfaces are unverified. Back straps are reference-informed, not a claim of measured S3 geometry.
- No gameplay abilities, speed, hitbox or facial expressions changed; cosmetic similarity is not a gameplay parity claim.

Module SHA256: 8515379a751a60a6db01c1b7030405652e5c14f0dbe198f6d836d4bab9d812ed.


## Native QA correction, 2026-10-18
The first native render (cabe8359) failed visual review: native sculpt-normal offsetting folded the lens and central rail geometry. The original finite/nondegenerate tests did not catch that because they used an ellipsoidal headSurface. This version samples only four zero-offset native anchors, fitting a smooth rigid envelope; it never maps rigid shell vertices along local facial normals. The peak is now closed, and lower chevrons/cheek rails are continuous joined solids rather than mirrored half-boxes crossing other rails. New tests require closed edge incidence and consistent directed winding, outward lens and mirrored graphics, and prohibit nonzero native offset sampling. Reference historical S2 rear image /workspace/shared/new-headgear-reference-review/goggles-S2-back.png shows broad crossed straps: widened them and offset one by .007 to overlap cleanly. Source https://splatoonwiki.org/wiki/File:S2_Paintball_Mask_back.png; not evidence of identical S3 rear construction. Latest native rerender remains required; software preview only demonstrates smooth construction.


## Source silhouette correction, rev3
Native 79ce corrected structural folding but remained too skeletal, with a flat shelf-like peak and isolated pointed chin pieces. Compared the actual S3 worn/item pixels again. Rev3 raises the middle of brow and peak into an arch, widens the coherent white frame/cheek rails, reduces cage spacing, adds alternating triangular lattice in side and center vent gaps, and closes the chin with one rounded continuous rail. The physical lens bows forward between fixed frame edges to clear the native eyeball region; lens material color/opacity remain unchanged. Additional tests enforce arched aperture, forward lens bulge, persistent triangle web and single closed chin, alongside previous welded-edge and winding tests. Latest native render still required for visual acceptance. Rear construction unchanged from rev2.

## Reproducible integrated regression
From repository root, build with `node scripts/build-inkwave.mjs inkwave-public _site`, then run `INKWAVE_HEADGEAR_SITE="$PWD/_site" node --experimental-loader ./patches/local-quality/tests/headgear-production-loader.mjs --test patches/local-quality/tests/headgear-goggles.fixture.mjs`. Earlier candidate-folder commands and local image paths above document development history; this committed fixture is the reproducible emitted-module gate. Native capture and visual acceptance are recorded in the integration report.


## User-requested solid-shell revision

# Face goggles solid-shell rebuild

Baseline: rhgrive3/actions commit 6eb64043ca9e06d584ffe7f8ce4e9ab45990a9b9, exact GitHub connector recovery. Original module saved as face-goggles.js.baseline. Baseline SHA256 8515379a751a60a6db01c1b7030405652e5c14f0dbe198f6d836d4bab9d812ed. Only module + focused fixture are candidate deliverables; no other gear, face, hair, body or lifecycle code changed.

## Pixels inspected
- S3 near-frontal worn source: https://img.gamewith.jp/img/9a245d07c6dfa3b4460b237694dd6bba.png (worn.png).
- S3 item 3/4 source: https://img.gamewith.jp/article_tools/splatoon3/gacha/ge429.png (item.png).
- Japanese identity/source page: https://gamewith.jp/splatoon3/390028 . フェイスゴーグル = Paintball Mask, Forge.
- Actual emitted native front/right/top from e964a6036c92e1919c0197ffbc45cbce76dfcf80: examined as rejected current result. Source/current composition from reference reviewer corroborates broad-form differences.

## Diagnosis and changes
Rejected current asset had a large face window exposing brows, shallow top rail, narrow repeated cage rails and long face-wide chevrons. Actual source has a tall solid white forehead with short vents, broad projecting brim, compact framed blue-gray lens, molded cheek shell with ink squares and one vent band, and a distinct compact central three-chevron vent block.

New construction uses fully closed triangulated curved shell panels with real punched apertures and recessed dark inner lining. No horizontal-rail skeleton is hidden with opaque fill. Side cheeks are solid with one row of 6 triangular vents each side and two ink-square bands. The central 3 rows of short alternating triangular apertures sit in a protruding, compact region with raised sidewalls; lower outline is curved. Forehead is a domed full panel. Lens stays one simple alpha surface, bows outward, and eye opening height is reduced; alpha .30 replaces .19, blue-gray material color unchanged, metalness0 for dielectric plastic, no transmission/refraction framebuffer. Neutral signal adapter was independently verified to preserve opacity, depthWrite and transparency.

## Validation
Run node --loader loader.mjs headgear-face-goggles.fixture.mjs. PASS finite positions/normals/UV, closed edge incidence2 and consistent winding for forehead/lower perforated panels, nondegenerate triangles, native zero-offset anchor-only fitting, compact eye window, feature counts, strict decreasing LOD,4 material batches,1 alpha lens, color update and exact-once disposal.
Hero/game/far triangles:7216/3112/2312. Textures0, meshes4. Hero extra topology supports perforated solid shells rather than many independent details. No external assets imported; source images are reference-only.

## Boundaries
CPU software-preview.png is shape inspection only and is not native shading, fitted hair/face, or gameplay validation. Parent must run native new-head QA and inspect genuine perspective+IBL front/3/4/side, visor hair fit, eye visibility, center mask coverage and source comparison before acceptance. Current candidate has not passed that review. No verified S3 rear orthographic source; existing rear construction deliberately unchanged. Hidden padding/buckle and exact dimensions remain approximations. No gameplay parity claim.

Candidate module SHA256:89499687c7bfd950e2bd96d73399a19363f5a92d189bdc2d0473d138fed55b14.


## Bounded aperture and clearance follow-up

# Face goggles solid-shell rebuild

Baseline: rhgrive3/actions commit 6eb64043ca9e06d584ffe7f8ce4e9ab45990a9b9, exact GitHub connector recovery. Original module saved as face-goggles.js.baseline. Baseline SHA256 8515379a751a60a6db01c1b7030405652e5c14f0dbe198f6d836d4bab9d812ed. Only module + focused fixture are candidate deliverables; no other gear, face, hair, body or lifecycle code changed.

## Pixels inspected
- S3 near-frontal worn source: https://img.gamewith.jp/img/9a245d07c6dfa3b4460b237694dd6bba.png (worn.png).
- S3 item 3/4 source: https://img.gamewith.jp/article_tools/splatoon3/gacha/ge429.png (item.png).
- Japanese identity/source page: https://gamewith.jp/splatoon3/390028 . フェイスゴーグル = Paintball Mask, Forge.
- Actual emitted native front/right/top from e964a6036c92e1919c0197ffbc45cbce76dfcf80: examined as rejected current result. Source/current composition from reference reviewer corroborates broad-form differences.

## Diagnosis and changes
Rejected current asset had a large face window exposing brows, shallow top rail, narrow repeated cage rails and long face-wide chevrons. Actual source has a tall solid white forehead with short vents, broad projecting brim, compact framed blue-gray lens, molded cheek shell with ink squares and one vent band, and a distinct compact central three-chevron vent block.

New construction uses fully closed triangulated curved shell panels with real punched apertures and recessed dark inner lining. No horizontal-rail skeleton is hidden with opaque fill. Side cheeks are solid with one row of 6 triangular vents each side and two ink-square bands. The central 3 rows of short alternating triangular apertures sit in a protruding, compact region with raised sidewalls; lower outline is curved. Forehead is a domed full panel. Lens stays one simple alpha surface, bows outward, and eye opening height is reduced; alpha .30 replaces .19, blue-gray material color unchanged, metalness0 for dielectric plastic, no transmission/refraction framebuffer. Neutral signal adapter was independently verified to preserve opacity, depthWrite and transparency.

## Validation
Run node --loader loader.mjs headgear-face-goggles.fixture.mjs. PASS finite positions/normals/UV, closed edge incidence2 and consistent winding for forehead/lower perforated panels, nondegenerate triangles, native zero-offset anchor-only fitting, compact eye window, feature counts, strict decreasing LOD,4 material batches,1 alpha lens, color update and exact-once disposal.
Hero/game/far triangles:7216/3112/2312. Textures0, meshes4. Hero extra topology supports perforated solid shells rather than many independent details. No external assets imported; source images are reference-only.

## Boundaries
CPU software-preview.png is shape inspection only and is not native shading, fitted hair/face, or gameplay validation. Parent must run native new-head QA and inspect genuine perspective+IBL front/3/4/side, visor hair fit, eye visibility, center mask coverage and source comparison before acceptance. Current candidate has not passed that review. No verified S3 rear orthographic source; existing rear construction deliberately unchanged. Hidden padding/buckle and exact dimensions remain approximations. No gameplay parity claim.

Candidate module SHA256:89499687c7bfd950e2bd96d73399a19363f5a92d189bdc2d0473d138fed55b14.

## Native 9851 audit and bounded correction (09:16 UTC)
Actual front/right/top/isolated-under captures confirm coherent broad shell. Remaining source discrepancies: tall narrow forehead slots and diamond-like central block. Final candidate shortens forehead apertures, flattens chevron slope and central depth, and widens rounded lower block sidewalls. Eye aperture, lens material and rear straps unchanged.

Native raw character-face.js at 9851 was fetched through GitHub and saved as native-face-snapshot.mjs with only the ctx import replaced by a static quality context for Node. Its headSurfFace/headShape functions are unchanged. audit-fit.mjs uses the four real zero-offset anchors, tests radial native-sculpt clearance at vertices and triangle centroids, and casts front rays toward every lens triangle centroid. This is a geometry audit, not full emitted animated face/hair intersection proof.

Found reproducible game forehead triangle chord penetrating sculpt by 0.014701 before correction. Forehead panels now subdivide twice at every LOD. Final minimum front radial clearance is 0.021361 for all three LOD. Added fixture centroid-envelope regression to prevent long-chord regression. Lens first-hit samples: hero376/384, game236/240, far142/144; remaining samples intercepted by frame edges, zero missing/back-facing lens hits.

Old→new triangles: hero4918→7216; game3086→3796; far1878→2868. Geometry buffer bytes:230692→365312,158228→218584,103876→179480. Materials and mesh batches remain4; textures0; transparent batch1. Temporary part geometries796/700/544→137 each; these are disposed after merge. Bytes are persistent typed geometry buffers, not complete JS heap or renderer memory measurements.

Known unchanged limitation: rear straps intersect analytic scalp estimate by up to0.01764/0.01935/0.02826 across LOD, identical to old module. Far strap triangle interiors also enter native skull by0.01120. No new rear construction claim or universal hair-clearance pass. S3 true-back still unverified. Review actual native hair variants before changing routing.

Commands (candidate folder):
node --loader ./loader.mjs headgear-face-goggles.fixture.mjs
node --loader ./loader.mjs audit-fit.mjs > audit-fit-results.jsonl
Both exit0. Audit baseline uses unchanged baseline geometry code, replacing only merge helper import with equivalent batching for local dependency availability. Baseline source remains intact in face-goggles.js.baseline.

Final module SHA256:315453ebff2871792af71cda1c2c8022979489dd416bbe6e8395a14d70aade76.
Native screenshot gate remains pending for this correction. No CPU preview acceptance.


## Connected-slot candidate 84f1e19a (09:51 UTC)
Inspected actual270e315453 front and oblique. Three separated triangle-hole rows remained unlike source's continuous short dark chevron slots. New bounded geometry: three full six-corner chevron apertures across central block with18 thin recessed diagonal webs, continuous rounded oval perimeter, shallower crown silhouette and gently bulged forehead, closed underside return joining projecting brim to eye-frame top. Compact forehead aperture dimensions, eye aperture/lens material, cheek construction and rear routing unchanged. Broad pattern, not added engraving.

New counts hero/game/far6652/3784/2848;4draw batches/materials,0textures,1transparent lens. All fixture topology/index/normal/lifecycle/LOD checks pass. Added closed consistent welded-edge topology for complete brim and triangle-centroid envelope clearance across allLOD. Actual raw9851 headShape audit passes at every front triangle vertex/centroid. This does not establish animated hair/face universal clearance; prior unchanged rear caveat remains.

Module SHA25684f1e19af3e184ce8494ed4605ac63a32391e097dcffeecb8d0c20551f306ae3.
Fixture SHA256e9a19f8327ccc3b4b3f8f229165c03e8198ad40a0e745e479efbf10977f7f4fd.
New native rendering is pending. Software preview proves construction only; no visual acceptance claim.


## Native8fa lip diagnosis
The material/winding were not the cause of the black wedge: the authored white lip faced downward. The new underside path preserves closed topology but returns through the inner frame before ending directly below the outer peak, making a short vertical front lip. Gold appearance remains independently unresolved; no lighting or material compensation is used.


## Coherent wrap revision after user oblique/side review

# Coherent S3 Paintball Mask wrap reconstruction

Reference pixels: S3 isolated item three-quarter https://img.gamewith.jp/article_tools/splatoon3/gacha/ge429.png and S3 worn near-front https://img.gamewith.jp/img/9a245d07c6dfa3b4460b237694dd6bba.png, item page https://gamewith.jp/splatoon3/390028. Original procedural geometry, no copied mesh/texture. True S3 side/back remains unverified; historical S2 back is contextual only.

## Why reconstructed
Actual f336 front/oblique/right showed a nearly horizontal shelf above thin side posts, parallel cheek bands, and a separately projecting oval mouth ring. Source oblique instead has a sloping molded brow with broad temple wings and continuous rounded cheek-to-chin cup. Earlier bounded lip correction did not establish full shape fidelity. f336 module preserved as face-goggles-f336.js.

## Implemented coarse form
One closed molded-wrap-shell contains the panoramic eye opening, three connected central breathing slots, side vents and two grouped forehead windows. Thick sloping brow flows into solid temples; lower outline curves inward/up toward temples and rounds into chin. No separate visor shelf, eye-side posts or oval mouth perimeter. Central relief is0.020 over cheek depth. Upper window lowered approximately0.08rad while retaining nose saddle. Lens material unchanged.

Center brow crosssection elevation/depth: e0.90/d~0.046; e0.65/d~0.056; e0.45/d~0.085; e0.32/d0.096. Lower toward lens is also forward; broad slope replaces horizontal shelf. Outer azimuth about±1.28 versus window±1.04 leaves broad temple wings. Lower outer contour narrows to±1.12 and rises at sides; center chin elevation−0.70. Source35/28/37% broad height proportions are observational, not exact measurements.

Curved shell uses conforming shared-edge angular subdivision. Zero-area parameter triangles are filtered before emission; final global nondegenerate and closed welded-edge incidence/opposite winding tests pass. Surface normals use finite differences of the actual molded-depth function, not an unrelated radial normal. All three LODs have genuine curved geometry, not merely normal smoothing.

## Side/back repair and uncertainty
Rear X bands originally entered raw native scalp/skull at low LOD. Their base radial offset is now0.042/0.049 and minimum rear longitudinal steps24/20/16 across hero/game/far. Native analytic scalp estimate now has positive clearance at vertices and triangle centroids. Band endpoints blend to the molded shell depth at az±1.20,e±0.23, overlapping the solid temple wall; no floating end assumption. Hair strands can still lie over bands. This is not an all-animation/hair clearance guarantee; actual native left/right/back and multiple hair styles remain acceptance gates. No hair/head/face edits.

## Tests and budget
node --loader ./loader.mjs headgear-face-goggles.fixture.mjs
node --loader ./loader.mjs audit-fit.mjs > audit-fit-results.jsonl
Both exit0. Fixture checks four batches, one transparent lens, finite data, valid indices, global nondegeneracy, outward lens winding, closed full-shell topology, triangle-centroid envelope clearance, monotonic down/forward brow crosssection, shallow central relief, overlapping temple anchors, LOD reduction and exactly-once disposal. Audit uses fetched raw9851character-face.js headSurfFace/headShape (only Node context import stubbed), not a synthetic ellipsoid alone. Native emitted QA remains required.

Triangles hero6964/game4844/far3400. Four materials/batches; zero textures; one transparent lens. No additional framebuffer/transmission pass.

Module SHA2564c5958e21735a39f0240b27ef3068cfc9f4d3e923dd82959b87d0476b2f5c863.
Fixture SHAcc65e442ca0881482830189ecae077b81c9c9eadd99ea05164cb0a8c4b34acdf.

## Pending rendered gate
Inspect actual front, oblique, both sides, rear, top, isolated underside, allLOD and alternate hair: coherent sloping brow/temple profile; integrated cheek/chin transition; readable three slot bands; no open seams; rear bands meet anchors and do not cut exposed skull; lens remains readable. CPU construction preview is not native visual acceptance. No exact-match claim.


## User-marked cap bill and lateral shell revision

# Marked-reference cap visor and lateral shell correction

Authority/reference: user's marked image1000001371.png, explicitly identifying a cap-like forward brim and the outer white lateral shell. Original S3 item pixels https://img.gamewith.jp/article_tools/splatoon3/gacha/ge429.png and worn front https://img.gamewith.jp/img/9a245d07c6dfa3b4460b237694dd6bba.png. True S3 rear remains unverified.

## Changed construction from944
944 was a single broad sloping forehead ending near the shield. It lacked a distinct cap bill. New closed shallow curved canopy has a rooted seam below forehead windows, a free curved leading edge,0.010 thick lip and underside. Center bone-local profile: root[0,.29519,.21861]→tip[0,.26605,.31211], lens upper[0,.24956,.26175]. Thus tip projects0.05036 beyond shield and drops0.02915 from root. Edges sweep lower toward temples. This is geometric projection, not opacity or color compensation.

The outer lateral white shell extends rearward to azimuth1.70, then curves downward into cheek. An ear aperture and two broad ink inset patches per side distinguish this white shaped shell from the rear green securing straps. Lower integrated cheek/chin and three connected breathing slots preserved. Rear strap endpoints moved to solid side-shell areas: upperaz±1.62,e+.23; loweraz±1.52,e−.23, radialdepth matched to shell. A radial ray regression confirms each end hits solid shell within0.02, not the new ear aperture. Existing raised scalp-clearing rear band routing retained behind anchors.

## Verification
Commands in this folder:
node --loader ./loader.mjs headgear-face-goggles.fixture.mjs
node --loader ./loader.mjs audit-fit.mjs > audit-fit-results.jsonl
Both exit0. Tests cover closed consistent shell/canopy topology, nondegenerate triangles, indices/finite normals, lens outward faces, vertex/triangle-centroid native-sculpt clearance, positive analytic scalp margin, root/tip slope and overhang, anchor solid-shell hits, four batches and idempotent disposal. Original944 module preserved in face-goggles-944.js.

Hero/game/far8132/5516/3932 triangles, four batches/materials, zero textures, one transparent lens. Budget increased for actual closed cap bill and extended lateral shell; no additional render pass. Less-visible canopy tessellation reduced to keep increase bounded.

Module SHAc825d6c758807089cd785920cbe85e0a07daac8e88c86d45757f4db772dff8e6.
Fixture SHA5bac992a841ea61c9fa07eef4d67a70fe643919ef3134f35593eb4efb10e67a7.

## Pending actual rendered gate
Reference reviewer inspected construction front/oblique/side/back and confirms direction addresses both marked regions. This is not native acceptance. Inspect actual source-comparable oblique, left/right/back: bill visibly ahead of shield, distinct curved root and tip, lateral white shell reads as substantial swept structure rather than two thin posts around an oversized opening; strap endpoints closed; no exposed-head penetration or problematic ear/hair clipping. No full-exact-match claim.


## Resumed rounded-body and rear-band correction

# Rounded-body candidate (native capture pending)

## Source pixels inspected
- User red/green annotation: 1000001375.png. Green follows the rounded main mask; red encloses the distinct projecting bill.
- S3 item: https://img.gamewith.jp/article_tools/splatoon3/gacha/ge429.png
- S3 worn front: https://img.gamewith.jp/img/9a245d07c6dfa3b4460b237694dd6bba.png
- S2 historical rear: https://cdn.wikimg.net/en/splatoonwiki/images/6/6f/S2_Paintball_Mask_back.png
- Compared actual 23a native oblique/right/back. S2 rear is historical structural evidence, not confirmation of unchanged S3 construction.

## Implemented geometry
- Removed unsupported large polygonal through-open ear hoop. Side shell is closed, shortened and curved around two compact dark/ink insets.
- Rounded lower envelope with a flatter central chin arc rather than the previous narrowing tip. Existing continuous cheek-to-central shell retained.
- Bill has narrower tapered corners, center-weighted projection and retained closed rounded lip. Center root y/z .295/.219, tip .268/.317; tip ahead of upper lens by .055.
- Replaced flat rectangular rear ribbons with closed elliptical-section bands, .015 total radial thickness, dark rolled margins and curved longitudinal routing. Unequal .016 layer offset at rear crossing; ends return to solid side anchors.
- Ink bands include low-amplitude broad corrugation in hero/game only. No extra draw/material/texture.
- Lens material, body/hair/face geometry and other gear untouched.

## Tests
Commands run from this candidate:
- node --loader ./loader.mjs headgear-face-goggles.fixture.mjs
- node --loader ./loader.mjs audit-fit.mjs

All three LODs pass index/finite/nondegenerate tests, shell and bill closed edge continuity, newly added closed rear-band edge continuity and positive signed-volume winding, outward lens normals, actual fitted native-anchor contract, attachment ray tests, disposal and ink-color API.
Native face snapshot audit tests vertex and triangle-centroid radial clearance against sculpted head plus analytic scalp. Minimum skin .02453; rear scalp .02253/.02253/.02211. Lens rays 384/240/144 visible, zero blocked/backside in this analytic test. Animated hair is not covered by that proof.
Triangles hero/game/far: 9232/6068/4212. Four mesh/material batches, one transparent lens, zero textures. Previous23a: 8132/5516/3932. Increase is mainly the convex rear-band sections.
Authored/emitted parity and production capture remain integration gates.

## Native visual gates, not passed by software preview
Capture front, oblique, both true sides and rear in actual fitted native scene, all LODs; rear also hair5/6. Compare source/item at comparable gear width.
1. Rounded forehead/cheek/chin perimeter without a long pointed lower stack.
2. Bill visibly projects ahead of lens, tapered outer corners return into body.
3. Compact closed side body replaces the large ear hoop; no disconnected strap endpoints.
4. Rear bands show curved volume and unequal overlap, no scalp/hair cutting or floating returns.
5. Check actual gasket occlusion at bill/temple and mouth relief. The software preview includes uncullled far-side faces and is not evidence of depth-order correctness or material appearance.


## Rounded bill/vent and far-inset follow-on, 2026-10-18 13:19 UTC

# Rounded-body candidate (native capture pending)

## Source pixels inspected
- User red/green annotation: 1000001375.png. Green follows the rounded main mask; red encloses the distinct projecting bill.
- S3 item: https://img.gamewith.jp/article_tools/splatoon3/gacha/ge429.png
- S3 worn front: https://img.gamewith.jp/img/9a245d07c6dfa3b4460b237694dd6bba.png
- S2 historical rear: https://cdn.wikimg.net/en/splatoonwiki/images/6/6f/S2_Paintball_Mask_back.png
- Compared actual 23a native oblique/right/back. S2 rear is historical structural evidence, not confirmation of unchanged S3 construction.

## Implemented geometry
- Removed unsupported large polygonal through-open ear hoop. Side shell is closed, shortened and curved around two compact dark/ink insets.
- Rounded lower envelope with a flatter central chin arc rather than the previous narrowing tip. Existing continuous cheek-to-central shell retained.
- Bill has narrower tapered corners, center-weighted projection and retained closed rounded lip. Center root y/z .295/.219, tip .268/.317; tip ahead of upper lens by .055.
- Replaced flat rectangular rear ribbons with closed elliptical-section bands, .015 total radial thickness, dark rolled margins and curved longitudinal routing. Unequal .016 layer offset at rear crossing; ends return to solid side anchors.
- Ink bands include low-amplitude broad corrugation in hero/game only. No extra draw/material/texture.
- Lens material, body/hair/face geometry and other gear untouched.

## Tests
Commands run from this candidate:
- node --loader ./loader.mjs headgear-face-goggles.fixture.mjs
- node --loader ./loader.mjs audit-fit.mjs

All three LODs pass index/finite/nondegenerate tests, shell and bill closed edge continuity, newly added closed rear-band edge continuity and positive signed-volume winding, outward lens normals, actual fitted native-anchor contract, attachment ray tests, disposal and ink-color API.
Native face snapshot audit tests vertex and triangle-centroid radial clearance against sculpted head plus analytic scalp. Minimum skin .02453; rear scalp .02253/.02253/.02211. Lens rays 384/240/144 visible, zero blocked/backside in this analytic test. Animated hair is not covered by that proof.
Triangles hero/game/far: 9232/6068/4212. Four mesh/material batches, one transparent lens, zero textures. Previous23a: 8132/5516/3932. Increase is mainly the convex rear-band sections.
Authored/emitted parity and production capture remain integration gates.

## Native visual gates, not passed by software preview
Capture front, oblique, both true sides and rear in actual fitted native scene, all LODs; rear also hair5/6. Compare source/item at comparable gear width.
1. Rounded forehead/cheek/chin perimeter without a long pointed lower stack.
2. Bill visibly projects ahead of lens, tapered outer corners return into body.
3. Compact closed side body replaces the large ear hoop; no disconnected strap endpoints.
4. Rear bands show curved volume and unequal overlap, no scalp/hair cutting or floating returns.
5. Check actual gasket occlusion at bill/temple and mouth relief. The software preview includes uncullled far-side faces and is not evidence of depth-order correctness or material appearance.

## Follow-on front-only bill/vent refinement (13:10 UTC)
This separate candidate derives from c1bb/8ca29c and is not yet published.
Confirmed actual c1bb front/oblique still showed an inflated smooth bill and isolated triangular cheek holes.
- Reduced bill top bulge .010 to .003; closed lip thickness .010 to .007. Root/tip projection and side/rear routing unchanged.
- Replaced 12 isolated cheek holes with 2 continuous curved perforated bands, each with 6 slender diagonals.
- Reduced central inset web width .012 to .009; retained three connected central slots.
Fixture now expects 7 recesses (3 central,2 cheek,2 forehead),12 cheek webs.
All topology/normal/index/API/clearance/lens-ray checks pass.
Updated triangle counts hero/game/far9504/6084/4340, four material batches.
Full c1bb sides/rear and new emitted/native evidence remain pending. No full visual acceptance.

## Actual c1bb full-angle review and bounded LOD fix (13:19 UTC)
Inspected hero right/left/back/under, far right/back, game hair5/6 back.
Side shell joins and band return volumes survive fitted native views. Gasket stays under eye opening. Historical S2 rear still has stronger ribs/rolled edges and a less regular overlap; no exact rear fidelity claim.
A real far-LOD inset defect was found: the right temple inset was sliced by white diagonal shell chords. Follow-on fix tessellates both temple inset layers at subdivision3 in every LOD and maintains radial separation .0105/.012 versus shell thickness .012 (outer .006).
Added front-facing inset triangle-centroid ray test: the first opaque surface must be the ink batch at every LOD. Before correction two far triangle samples hit the shell; now all pass.
Final triangle counts: hero9712/game6436/far4692;4batches,0textures.
These supersede prior counts in this chronological report. Module remains pending emitted/native capture.


## User-directed arch and bill planform revision, 2026-10-18 13:35 UTC

# Marked forehead and central-unit correction

Isolated successor to 7da688 (native534 pending). User's green annotation1000001380 and enlarged S3 worn/c1bb comparison identify two remaining broad structural errors. No full visual acceptance.

Sources actually viewed:
- https://img.gamewith.jp/img/9a245d07c6dfa3b4460b237694dd6bba.png (S3 worn front)
- https://img.gamewith.jp/article_tools/splatoon3/gacha/ge429.png (S3 item oblique)
- User red/green1000001375 and green1000001380.
- Exact c1bb native front, oblique, left/right/back/under, far right/back, hair5/6 back.
- Historical S2 rear: https://cdn.wikimg.net/en/splatoonwiki/images/6/6f/S2_Paintball_Mask_back.png

Changes:
1. Raised forehead into a broad cosine arch with zero center tangent; raised shoulders to avoid a pointed roof. Forehead aperture groups follow that contour and have deeper angular height.
2. Central slot halfwidths .32/.30/.28 → .28/.26/.24. Rounded aperture corner returns, steeper chevron slope .10→.13, preserved three rows. Lowered oversized nose peak by reducing angular nose bump .215→.165.
3. Added three broad source-visible ink chevrons on the central separators. No invented fine lettering/engraving.
4. Preserved distinct projecting bill, compact side shell, rear bands, connected cheek aperture bands and far inset correction from prior candidate.
5. Reduced hidden dark recess tessellation and retuned shell refinement to keep hero under10k. No material/draw increase.

Tests run:
node --loader ./loader.mjs headgear-face-goggles.fixture.mjs
node --loader ./loader.mjs audit-fit.mjs

Pass allLOD topology, nondegenerate/index/normal checks, native callback, shell/bill/rear closure, positive rear volume, outward lens, native radial head/scalp clearance, inset ray visibility and disposal. Added rounded-crown center-tangent/height checks, three ink-chevron count, and front-facing ink triangle visibility for both temple and central inlays.
Counts hero9720/game6948/far4980 triangles;4mesh/material batches,1transparent lens,0textures.
Source/emitted parity and native captures still required.

Limits/gates:
- Source frontal/oblique perspectives differ; observations do not establish exact dimensional ratios.
- Genuine S3 true-top and rear views remain unverified. No fabricated overhead projection. True source top is unavailable; user clarified bill shape was the goal. Planform correction uses only directly supported relative center projection and lateral recession.
- S2 rear supports rounded layered crossed bands, not exact S3 identity; native rear remains smoother/more regular than historical reference.
- Compare actual next native closeups: forehead should read rounded (not trapezoid/roof), central unit narrower/taller with rounded slot corners and visible chevron separators. Also recheck left/right/back and far inset.

## Bill planform clarification
No slot/ridge decoration added. Root-to-tip reach now tapers smoothly from100% at center to56% halfway and12% at outer corners. This replaces the uniform wrapping-crescent character with a front-focused cap bill. Center projection and closed lip retained. Actual construction top is included in software-preview.png, not a synthesized source view.
Added allLOD planform reach monotonicity regression. Exact retail overhead dimensions remain unknown. Native front/oblique/right/left/top must jointly validate this relative shape.


## Central aperture width restoration, 2026-10-18 14:13 UTC

# Marked forehead and central-unit correction

Isolated successor to 7da688 (native534 pending). User's green annotation1000001380 and enlarged S3 worn/c1bb comparison identify two remaining broad structural errors. No full visual acceptance.

Sources actually viewed:
- https://img.gamewith.jp/img/9a245d07c6dfa3b4460b237694dd6bba.png (S3 worn front)
- https://img.gamewith.jp/article_tools/splatoon3/gacha/ge429.png (S3 item oblique)
- User red/green1000001375 and green1000001380.
- Exact c1bb native front, oblique, left/right/back/under, far right/back, hair5/6 back.
- Historical S2 rear: https://cdn.wikimg.net/en/splatoonwiki/images/6/6f/S2_Paintball_Mask_back.png

Changes:
1. Raised forehead into a broad cosine arch with zero center tangent; raised shoulders to avoid a pointed roof. Forehead aperture groups follow that contour and have deeper angular height.
2. Central slot halfwidths .32/.30/.28 → .28/.26/.24. Rounded aperture corner returns, steeper chevron slope .10→.13, preserved three rows. Lowered oversized nose peak by reducing angular nose bump .215→.165.
3. Added three broad source-visible ink chevrons on the central separators. No invented fine lettering/engraving.
4. Preserved distinct projecting bill, compact side shell, rear bands, connected cheek aperture bands and far inset correction from prior candidate.
5. Reduced hidden dark recess tessellation and retuned shell refinement to keep hero under10k. No material/draw increase.

Tests run:
node --loader ./loader.mjs headgear-face-goggles.fixture.mjs
node --loader ./loader.mjs audit-fit.mjs

Pass allLOD topology, nondegenerate/index/normal checks, native callback, shell/bill/rear closure, positive rear volume, outward lens, native radial head/scalp clearance, inset ray visibility and disposal. Added rounded-crown center-tangent/height checks, three ink-chevron count, and front-facing ink triangle visibility for both temple and central inlays.
Counts hero9720/game6948/far4980 triangles;4mesh/material batches,1transparent lens,0textures.
Source/emitted parity and native captures still required.

Limits/gates:
- Source frontal/oblique perspectives differ; observations do not establish exact dimensional ratios.
- Genuine S3 true-top and rear views remain unverified. No fabricated overhead projection. True source top is unavailable; user clarified bill shape was the goal. Planform correction uses only directly supported relative center projection and lateral recession.
- S2 rear supports rounded layered crossed bands, not exact S3 identity; native rear remains smoother/more regular than historical reference.
- Compare actual next native closeups: forehead should read rounded (not trapezoid/roof), central unit narrower/taller with rounded slot corners and visible chevron separators. Also recheck left/right/back and far inset.

## Bill planform clarification
No slot/ridge decoration added. Root-to-tip reach now tapers smoothly from100% at center to56% halfway and12% at outer corners. This replaces the uniform wrapping-crescent character with a front-focused cap bill. Center projection and closed lip retained. Actual construction top is included in software-preview.png, not a synthesized source view.
Added allLOD planform reach monotonicity regression. Exact retail overhead dimensions remain unknown. Native front/oblique/right/left/top must jointly validate this relative shape.

## Whole-mask central-width restoration after actual050 review
The prior independently enlarged detail crops were not valid width measurements. An equal-whole-mask-width comparison showed original central outer body roughly35–40% of the mask while050 was about25–28%, with perspective uncertainty. Do not confuse body width with aperture width.

This candidate changes ONLY central slot/diagonal/ink-chevron horizontal extent: angular halfwidths .28/.26/.24 → .35/.325/.30. Height, rounded corner shape, lowered nose peak, bill arch/planform, sides, rear and material settings remain unchanged.
The actual geometric top aperture spans29.7% of the complete shell's front-projected width; the surrounding central white body is broader. Added full-shell-normalized aperture regression .28–.32, explicitly an authored construction bound rather than a claimed exact retail measurement.
AllLOD source topology/normal/closure/inlay-visibility/lifecycle and native radial fit audit pass. Counts hero9608/game6976/far4976,4mesh/material batches,0textures.
Actual050 top/left/right/back confirms broad bill lobe with receded sides and continuous joins, no obvious pinched tongue. Remaining bill root-step and historical rear detail differences disclosed; no further speculative bill changes.
Native next front/oblique whole-mask normalization is required before central-width acceptance.
