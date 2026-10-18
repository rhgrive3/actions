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
