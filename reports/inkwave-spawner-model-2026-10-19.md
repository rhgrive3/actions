# Spawner model comparison, 2026-10-19

## Scope and reference

This changes only the original procedural spawner prop, its material separation, and construction resource cleanup. The player waits at the same position; launch input, flight, protection, landing, camera aim, marker, trail and disappearance timing remain unchanged.

Comparison baseline: `3839b61a6c6c4d5ac998b82168f37b802bc55099`, `patches/splatoon3/runtime/squid-spawn-presentation.mjs`, Git blob `aa46c091080a551933b73750145fcb05a5b9ae09`. The local source/data dependencies were reconciled against the verified clean main3839 tree. Only the spawner runtime differs in source; no character, hair, equipment, Ranked rules, or networking changes belong to this model patch.

Reference pixels were visually inspected on 2026-10-19:

- [Official Splatoon 3 announcement trailer](https://youtu.be/GUYDXVDLmns), [archived front screenshot and source record](https://splatoonwiki.org/wiki/File:Team_2_spawnpoints_(Trailer).png). The large projecting cylindrical group head, low-left dial, downward-facing handle with team-colour cap, thin tray, upper corner guard bars, and closed lower skids are visible.
- [Official first-preview rear screenshot and source record](https://splatoonwiki.org/wiki/File:S3_first_twitter_preview_-_spawner.jpg). The file records Nintendo's Squid Research Lab/Twitter/Tumblr preview as its source. It shows a largely flat stainless rear case, lid, narrow seam, side bars, and low access-label area.
- [Nintendo in-game locker decoration icon, archived](https://splatoonwiki.org/wiki/File:S3_Decoration_spawner.png). Its three-quarter view corroborates the inset lower-front well and skid geometry. This icon is supporting visual evidence, not proof that every shader value matches the playable object.

Nintendo textures, meshes, logos, audio, or reference images are not included in the implementation or QA artifact. Dimensions are original INKWAVE calibration by eye, not Nintendo extraction or measured real-world units. The release model and 2021 preview may differ. A full orthographic side reference, underside, and retail-version direct comparison remain unverified.

## Model changes

| Feature | Old model | Candidate |
|---|---|---|
| Main shell | Unbeveled upper box plus filled lower box | Narrow-chamfer stainless rear case and side cheeks, low separate lid |
| Front | Flat box with central white disk | Silver fascia, projecting round brew head, inset dark well and low-left ticked gauge |
| Handle | Side-offset thin cylinder | Central forward/downward handle, team-coloured end cap |
| Upper bars | Absent | Four corner guards with outward bends and bright tips |
| Lower rails | Four isolated thin legs | Two closed trapezoidal skids |
| Tray/lid | Plain box/pad | Thin projecting slotted tray and low gridded lid |
| Rear | Blank side of box | Low original access-seam and abstract serial-label markings |

The fascia is silver, matching the trailer's reflective face. It is not made black to imitate a dark reflection in the decoration icon. No extra illumination is added to fake metal highlights. The new serial marks and badge are original abstract marks, not a copy of Nintendo typography.

## Cost and resource ownership

CPU geometry measurements, one pod:

| Quantity | Before | Candidate |
|---|---:|---:|
| Visible mesh batches | 5 | 5 |
| Triangles | 912 | 2720 |
| Geometry attribute/index bytes | 63,328 | 293,760 |
| Distinct materials per pod | 4 | 5 |
| Added textures | 0 | 0 |

The four non-team materials are shared. For both teams together there are six pod materials, including one tip material per team; before there were five. All actors share the same five geometries. Eight simultaneous pods still have 40 mesh batches, excluding the unchanged marker and shadows. The triangle and byte increase is explicit; GPU render cost is not inferred from CPU numbers. The additional rail material separates polished bars from the brushed case.

The geometry generator now disposes both the indexed construction original and its temporary non-indexed expansion. Only the five shared results remain cached for the installed presentation's lifetime. No geometry or material is created in the frame-sync path.

## Verification and limits

- `spawner-geometry-fidelity.test.mjs`: 7/7, including finite attributes/bounds, five batches, zero textures, genuinely recessed well, lower gauge/head silhouette, disposal, eight-actor geometry sharing, 30/60/120 Hz wait/launch/disappearance/re-entry.
- Related spawner/lifecycle/pose/armor tests: 86/86 on the reconciled clean source.
- Separate historical owner-admission/receipt tests have 4 failures out of 8, identically on clean main3839 and this candidate. All 10 implicated test/library/fixture/runtime input blobs match the official tree, with no missing input. Their historical source-hash admission does not accept the current install, roller, adapter and paint-catalog sources. They are recorded as a separate existing review item; no unrelated fixture is changed to hide them. The normal production build gates are retained.
- Source from `const sync =` through the end of the module is byte-for-byte unchanged versus the fixed main3839 baseline. All `SPAWNER_LOOK` timing and gameplay-related values are unchanged.
- The cloud browser could not reach the executor-local QA server (`ERR_CONNECTION_REFUSED`). Local browser execution is not claimed. No denied local Playwright route was retried.
- A native GitHub QA candidate is supplied. It builds production once for spawner/Rainmaker/Clam suites, verifies exact source and emitted identities, renders with the real Environment PMREM and Renderer post stack, and validates each saved 900×900 PNG. Each suite counts all output files, including receipts and failure diagnostics, below 496 MiB, leaving 16 MiB for ZIP/metadata. Frame payloads have a separate 480 MiB limit. Boundary tests cover hidden/nested files and rejected over-budget writes. An always-run final inventory also counts CPU/failure logs before upload; only individually eligible suites can be uploaded, including after a failed build or browser run. Official writeBuildIdentity input hashes, including the two new ranked runtime modules, receive one-byte-change negative tests; actual emitted manifests must list all required source and emitted runtime files.
- Shared contracts also require each historical runtime overlay to link in the real composed module graph. The Clam comparison explicitly fixes Clams mode, verifies that Rainmaker remains inactive even with carrier-like unrelated data, and compares the ordinary pose under old/new shared handoff. Every captured PNG has one receipt; the optional Clam pre-event/0/16.7/33.3 ms contact sheets retain the original PNG hashes and exact simulation times as separate bounded supplementary artifacts, not videos; all frames use identical lighting/post and each before/after pair uses an identical camera.
- Spawner QA expects 24 images: before/after × isolated prop/native-fallback Actor/real Player00 source-loaded Actor × front/side/rear/oblique, with fixed camera rules. The same emitted Player00 bank must reach ready; actual source activity/upper-owner decisions, character seed, foot-bone coordinates and pod bounds are recorded without forcing an ownership override. The selected Player00 controller must be naturally active and its human rig visible. Source-loaded frame names require complete receipts, explicit owner types and three finite coordinates per foot. Before/after source readiness, activity, upper ownership, bank variant, finite seed and both foot coordinates must match exactly; changed pod bounds are excluded from that pose-equality check. The source-loaded views specifically expose foot/guard fit under the final composed rig. The before namespace passes the exact old spawner source through the same current production adapters and serves it unminified over the same composed candidate systems. Original blob/hash and served composed hash are both recorded. Spawner composition is a no-op; the shared Clam installer does require the native-stage adapter, so that adapter is preserved on both sides. It is **not** labeled a complete previous-main build.
- The first native run is recorded below. Final uncropped actor-side framing is pending a second exact-head run. Full-match input, retail Nintendo timing and image-perfect fidelity are not claimed by model-only tests.


## First exact-head native result and remaining framing check

[PR1627](https://github.com/rhgrive3/actions/pull/1627) at `62cd3a08fcc43fce60fba77392beae418ce2258c` used merged main1cbe, including the native-stage and squid-form changes. The [native run](https://github.com/rhgrive3/actions/actions/runs/39204093958) saved all 24 spawner images. The [spawner artifact](https://github.com/rhgrive3/actions/actions/runs/39204093958/artifacts/12165777220) ZIP SHA256 is `4f6fcb669e192a45f0a015ec3c3d1f42289b93ddb094e320b43bdb9c37e83e4b`; its expanded original evidence is 4,683,149 bytes. Build revision is `ae8541829bef1f4987d0516a68f0fbba1662d7261ee2fbe0874230db0578ba85`. All saved PNG hashes and source/emitted identities were independently rechecked.

All 12 before/after pairs have matching camera and production lighting/post receipts. The real Player00 source owner, seed and both foot-bone positions match exactly. The projecting head, recessed mouth, guards and closed skids visibly improve the official-reference silhouette. The fascia reflects blue-grey in the unlit front/side views and bright neutral metal on the oblique lit surfaces. No shoe/guard intersection is visible in the sampled fallback or source-loaded pose. This is a limited fixed-pose appearance check; it is not acceptance of every continuous source clip or exact Nintendo dimensions.

Measured native costs for the isolated model were scene calls 10 → 10 and complete-post calls 39 → 39, including shadow rendering. With either actor the scene calls were 25 → 25 and complete-post calls 69 → 69. Geometry/texture object counts were unchanged. Shader programs increased from 46 → 48 for the isolated model, 56 → 58 with the native actor, and 68 → 69 after the source-loaded actor. The 230,432-byte shared geometry increase and material 4 → 5 change remain explicit.

The new lower skid is cropped at the bottom of both actor-side after images. The isolated side image and other actor angles retain it, so the model improvement is only partially accepted until the full actor-side outline is recaptured. The QA-only follow-up increases the shared actor-camera distance from 6.3 to 6.9 for both comparison versions. Before each image it projects every actual pod vertex, rejects clipping outside NDC ±0.98, and records the bounds. A CPU negative reproduces the old side crop (minimum NDC y −1.012956); the revised side framing reaches −0.919645, leaving about 36 pixels at 900px output. Independent projection checks retain roughly 91–92% of the previous foot-scale resolution. These are geometry/projection results; the revised native images remain pending. The model, materials and flight path are unchanged by this framing adjustment.

The three standard model-related workflows and the full Validate INKWAVE update run completed successfully at this head. The combined object-native workflow remains failed because Rainmaker source-shooter left-grip residual was 0.01057013985801478 world after 88/120 saved images. The spawner pass and Clam 70-image pass do not erase that unrelated suite failure, the known Clam throw-boundary defects, or the outstanding motion review. This pull request remains a Draft until the remaining gates are resolved.
