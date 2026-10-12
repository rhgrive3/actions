# Weapon far-LOD material boundaries (separate draft)

## Scope and status

This is a shared LOD correctness candidate, separate from the unaccepted Quad/Explosher shape rebuild in PR1277. Production changes are limited to `inkwave-public/src/game/character-lod.js`; public APIs, spatial clustering, triangle selection, source geometry and the cache policy stay unchanged. No model builders, shaders, lighting, motion, anchors, gameplay or glass attachments are changed. Browser images and performance are pending exact-head CI; numerical budgets alone do not establish visual or performance acceptance.

Baseline: main `5ed08c6376696dd67391afed7c36463106959de8` (the sole change since `3165f4f` is the Pages workflow). CI compares both main's 65 models and an explicitly labelled diagnostic composition substituting ONLY the two family files from PR1277 `205d4e4e96864dda2e2c9e6a9194e9f7b47fa231` into both A and B. This second composition is not a claim that those draft models are accepted or included in this PR.

## Reproduced defect

The spatial cluster key preserves bones and clothing classes but ignores weapon `aMat` and RGB. A spatial representative can transfer a neighbouring print/metal/pale colour to a surviving green tank triangle. In the 205d Explosher, its 788-triangle far body has 521 mixed-material and 613 mixed-colour faces although the source has none. Green triangle area falls from 0.371921 to 0.076166 square model units; pale area increases from 0.117806 to 0.244006. Source normals on the straight front cage bumper were separately verified outward; that does not explain this far palette error or prove the near-metal appearance correct.

## Alternatives and chosen candidate B

A: split spatial clusters by material and quantized RGB. This removes most mixing but changes indexed positions of all 65 models and can double individual allocation. Rejected for this scope.

B: keep existing spatial clusters and surviving triangle order. Remember the source corner of each surviving triangle. Duplicate a cluster vertex only where the corner's authored material/colour differs, copying position, averaged normal, tint, skinning and all other attributes from the existing cluster result. This prevents accidental face interpolation while retaining deliberate source gradients. Full RGBA components, when present, participate in split identity. Nonweapon meshes take the existing path.

C: B plus removal of unused cluster vertices. It saved under 10 KB across all 65 cached definitions, adding unrelated compaction complexity. Not included.

Local Node24 scan of 205d: all 65 have identical indexed position sequences and total 53,784 triangles. Cached definition bytes change 1,216,584 → 1,433,864 (+217,280; 17.9%). This is the sum of all 65 definitions, NOT the simultaneously visible eight-player footprint. B restores Explosher far green/pale areas to 0.321303/0.112339 with the same 788 triangles, removing all its mixed-material/colour faces. Remaining 79 mixed-colour faces across the catalogue are bounded by authored source gradients, tested separately.

## Verification contract

- Synthetic indexed and non-indexed boundary collision reproduces the old failure; authored RGBA and material survive B corner-for-corner, including a gradient.
- Nonweapon output retains exact index and attribute bytes.
- All 65 main/draft models: exact indexed position, normal, tint and other noncolour attributes; source immutability; same triangle counts; cache identity. Memory caps are guardrails, not the acceptance criterion.
- CI builds the full normal production composition for baseline and candidate on the same Node22 runner. It stores immutable input SHA256s and build revisions.
- Same camera/environment/materials for front, side, back and oblique, orange and blue teams, all 65 models. Alpha silhouette hashes must match exactly; full images and catalogue contact sheets preserve material/colour differences for actual review.
- Eight real source-motion Actors (two each Quad, Explosher, native Dualies, native Slosher, both teams), game/far ABBA on one runner. Record actual draw calls, triangles, visible unique geometry bytes, animation CPU and render submit/completion percentiles plus raw samples. GPU timer queries are recorded only when available and nondisjoint; SwiftShader completion is not physical-device FPS.
- Fixed procedural seed/order; lighting is unchanged. Construction time is recorded separately from cached per-frame work. Host load is recorded to distinguish scheduler contention from a geometry allocation claim.

No adoption or main merge is authorized by these preliminary measurements. The parent will review exact-head images and timings alongside the model material diagnosis.
