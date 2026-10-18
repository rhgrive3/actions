# Paintball Mask bill detail refinement after actual 816 capture

## Evidence and bounded change
- Actual816 front/top/right and production IBL oblique show shoulder marks, but center reads as a broad smooth bulge and slot ends are too sharp/thin.
- Genuine S3 item: https://img.gamewith.jp/article_tools/splatoon3/gacha/ge429.png ; worn https://img.gamewith.jp/img/9a245d07c6dfa3b4460b237694dd6bba.png . Visible shoulder has three elongated dark rounded features, shortening toward temple; center has a shallow pale angular molded region.
- Exact underside depth, hidden-side count and center engraving boundary are not established by these low-resolution images. Opposite shoulder remains a mirrored inference; recess floors are an authored interpretation, not proof of through-holes.

## Implementation
- Replaced smooth center bump with a shallow angular seven-corner footprint: angular vertices (-.24,.65),(.24,.65),(.29,.56),(.21,.43),(0,.37),(-.21,.43),(-.29,.56). Inner ring is78% about(0,.52). Both rings are shared vertices in the original closed shell triangulation, not an overlay plate.
- Max relief .0035 head-local units; .028 angular bevel transition. Height vanishes at the footprint edge. Root and free tip retain their previous coordinates and silhouette.
- Shoulder recess angular half-width .022→.030; semicircular end sampling radius .030; three lengths and fan positions retained. No ink/material/lighting workaround.
- No new mesh, material, texture or shader.4batched draws/materials,1transparent lens,0textures. Hero9268/game6892/far5268triangles versus8169292/6928/5272. Allocation count unchanged.

## Verified
- node --loader ./loader.mjs headgear-face-goggles.fixture.mjs passes hero/game/far. Existing finite/nondegenerate, manifold closed edges, winding, single-bill continuity, overhang, native contract, inset/recess visibility and lifecycle checks retained.
- Added actual shell UV-vertex checks for all14center ring corners in each LOD, preventing a metadata-only center feature.
- node --loader ./loader.mjs audit-fit.mjs passes recorded native head-surface sampling: minimum skin clearance .022923; lens rays all visible (hero384/game240/far144), no backside/blocked rays. Audit is geometric evidence, not rendered acceptance.
- Software five-view construction is available in software-preview.png. Native rendering still required; CPU shading cannot establish center relief readability.

## Native gate
Compare actual top/front/right/oblique under neutral and production IBL with source at whole-mask scale. Center must read as a shallow molded panel/bevel without a renewed slab/root rail; recess ends must read rounded, with three separated shoulder features and intact white bridges. Preserve prior side/rear/lens and all LOD fit. Exact source fidelity and user acceptance remain open.
