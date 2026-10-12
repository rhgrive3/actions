# Weapon far-LOD material boundaries (separate draft)

## Scope and status

This is a shared LOD correctness candidate, separate from the unaccepted Quad/Explosher shape rebuild in PR1277. Production changes are limited to `inkwave-public/src/game/character-lod.js`; public APIs, spatial clustering, triangle selection, source geometry and the cache policy stay unchanged. No model builders, shaders, lighting, motion, anchors, gameplay or glass attachments are changed. Exact80a4 browser comparison and fixed-source loading diagnostics are complete below. The final test/report head still requires all mandatory CI. Numerical budgets alone do not establish visual or performance acceptance.

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

## Correcting the diagnostic environment, not production material

The original 32×16 gallery equirectangular map yields an 8px PMREM cube (`maxMip=3`, output336×32). The bundled Three CubeUV sampler assumes minimum mip4/tile16, so this is below its supported layout. In PR1277's exact-geometry comparison, both native and unpatched standard PBR metal are equally dark (mean23.09/23.15), while a nonmetal control is180.13. Independent normals and environment uniforms were verified. This evidence does not justify changing production metal into plastic.

This harness now records 32/64/256/1024 input-width controls, keeping angular radiance, intensity, colours and direct lights fixed. The primary old/new comparison uses1024×512 (cube256), matching the game's native PMREM resolution. It also attempts the actual `Environment` day IBL and native sun/hemisphere lights on the identical source metal triangles of Explosher, Mini and Nautilus; this is explicitly a pre-postprocessing material control, not a full game screenshot. Environment probe errors are retained in the JSON and are not a pass. Old small-environment evidence is preserved separately. Production `Environment` uses fromScene size256; the lobby uses128. No production lighting or material is altered here.

## First-use loading cost

The normal game's `_warmCharacters` awaits every Actor's `warmAll` inside the loading fade (8-second safety timeout). `Character.warmAll` constructs far weapon geometry before the first game/far switch. The hot ABBA intentionally warms before sampling and cannot certify first-use cost.

The independent diagnostic PR1290 at d130a21c1919b645d4394bc6687093231abb9663 mirrors the native eight-Actor `warmAll` path after source motion is ready: total loading wall time, each Actor's inclusive wall time, completion at the game's8-second boundary, browser long tasks/rAF gaps, and the first far updates after warming. Tier meshes and shader compilation are included, so this is real setup cost rather than an isolated LOD algorithm microbenchmark. All-65 algorithm measurements and actual four-model/eight-Actor visible workload remain separate.

Independent review additionally verified every surviving source corner, Uint32 index promotion above65,535 vertices, normalized Uint8 RGBA, skin/tint attributes and10,000 cache hits. A warm final-cell-only cluster microbenchmark rose by about38ms across65 models (median90.6→129.1ms); this deliberately emphasizes splitting cost, is not complete `farGeometry` construction and is not hot-frame timing. The complete browser loading result is recorded below; it does not remove the observed cost.


## Completed exact-source browser results

Source candidate80a4e1e641de49fcf3378e7a5ee750c29c8a6875, baseline5ed08c6376696dd67391afed7c36463106959de8. Dedicated review run38240539003 passed both main and205d diagnostic compositions; each is65 models ×2 team colours ×4 views,520 exact alpha matches, identical triangle/indexed-position/noncolour-attribute hashes and immutable source geometry. All five catalogue sheets were visually inspected. Body colour/material patches recover toward source; existing coarse spatial faceting remains, since this change deliberately preserves spatial LOD. The distinct PR1277 shape drafts remain unaccepted.

Actual eight-player footprint (two each Quad/Explosher/native Dualies/native Slosher):

| Composition | Near draw/tri/visible bytes | Far draw/tri | Far visible bytes before→B |
|---|---|---|---|
| main | unchanged112 /295,572 /2,122,312 | unchanged64 /82,438 |607,886→619,526 (+11,640;1.9%)|
|205d shapes|unchanged112 /343,708 /2,496,204|unchanged64 /83,810|603,588→627,908 (+24,320;4.0%)|

Far Actor CPU p95 ABBA (ms): main9.8 /8.1 /9.7 /9.6;205d8.0 /7.8 /8.9 /7.7. This does not show a consistent large hot-frame regression. It is a fixed-size SwiftShader CI workload, not a physical-device FPS guarantee.

GPU timer queries are supported/nondisjoint, but only38 of120 near samples and23 of120 far samples were available when collected. Valid-sample far GPU p95 ABBA (ms): main514 /517 /513 /528;205d485 /479 /489 /463. These incomplete subsets are NOT whole-run GPU percentiles. SwiftShader's absolute durations and queued render-submit/completion timings must not be represented as real GPU/frame-rate evidence. The harness now explicitly reports requested/missing sample counts. This limitation remains open for hardware profiling; it does not conceal an observed memory or loading cost.

Native warmAll loading-fade ABBA, fixed80a4 source, PR1290 run38242982538:

| Composition | A / B / B2 / A2 wall ms | Long-task ms |
|---|---|---|
|main|422 /445 /503 /472|412 /434 /493 /462|
|205d shapes|432 /533 /525 /418|422 /522 /515 /408|

The205d case adds approximately100ms during initial loading. All8 Actors finished before the game's8-second ready boundary. This is a genuine cost, not a cache-hit claim. First post-warm far updates also include the first-ever Actor pose application in this isolated harness (old/new109–165ms); they do not isolate weapon LOD and are not called a new in-match hitch. The actual game invokes warmAll while the loading fade is still active.

Construction-only browser sums across65 definitions: main262→400ms (largest single definition43→72ms);205d227→309ms (largest38→47ms). Sequential single-pass/JIT order affects these cold samples, so the real8-Actor loading ABBA is the stronger user-visible bound. None of these all-catalogue sums are simultaneous visible geometry.

## PMREM result and material decision

At identical camera/source metal geometry, unchanged angular radiance/intensity/direct lights, Explosher native mean SRGB rises39.15→156.93→158.49→160.37 for equirect widths32/64/256/1024. Standard PBR rises39.30→156.39→157.94→159.82. Nautilus native rises60.97→133.75→133.93→134.01. Supported cube16+ restores reflection; the original cube8 environment was invalid. Actual native Environment day IBL/lighting also initializes successfully (PMREM768×1024, environmentIntensity.45), with Explosher native/standard means89.52/89.30 under the same ACES pre-postprocessing diagnostic.

This establishes a diagnostic-environment defect, not a justification for changing production metal to satin. No production material/lighting change is in this PR. PR1290 separately supplements the fixed7d8 shape images using supported studio PMREM and native day IBL/lights with NeutralToneMapping, still explicitly before the full game poststack.
