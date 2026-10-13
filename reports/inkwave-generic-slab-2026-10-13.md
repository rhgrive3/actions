# Generic native-ray arithmetic, 2026-10-13

## Scope and adoption dependency

This is a small CPU-work correction on top of #1366 at `a6b5b63ae7302dff4a959e4354b799f7bddab915` (main `14f9f913`). It changes only the generic/nonvertical slab arithmetic inside `TriangleWorld.ray`. The already-reviewed vertical specialization, traversal, triangle tests, division/read order, filters, ties, hit objects and Boolean-ground option remain unchanged. Held network/bomb changes from #1321/#1368/#1364 are not imported.

For primitive directions, the near-parallel predicate uses the equivalent open interval. Non-number inputs retain the original `Math.abs` coercion. Ordinary numeric slab intervals avoid redundant `Math.min`/`Math.max` calls. NaN, coercing reach values and ambiguous signed-zero cases use the original expression. The running lower endpoint starts at positive zero and only increases or becomes NaN; no reciprocal multiplication, approximate epsilon or cross-query cache is introduced.

This preserves INKWAVE's current source-triangle behavior. The display export's scale, inferred collision/masks/spawns and retail Splatoon 3 parity remain unverified. No retail coefficient is changed or newly claimed verified.

## Correctness

The permanent generic oracle compares exact hit fields, counters, ties, near-parallel boundaries, signed zeros, any-hit/filter controls and getter/coercion/exception order. Its candidate is the actual `NativeLevel` constructor from the production engine bundle in emitted mode. An initial test incorrectly imported a standalone module omitted by the bundler; that failure is preserved, and the loader was corrected rather than substituting source for the emitted class.

The private diagnostic composition passed 26 source cases. Its first emitted run passed 24 controls and failed the two loader cases; final loader-specific source 2/2 and emitted 2/2 pass against unchanged runtime. The older downward test evaluates source classes even in emitted mode; the new generic test and existing Boolean/vertical integrated oracles use actual emitted classes. Source-only quota helper limits from the separate bomb fixtures still apply.

Independent parent review found no static correctness blocker. Full source and emitted A/B chronological checks on the corrected Scorch input preserved every recorded step, query/counter, owner/life, RNG event and all 600 state frames, with 161 births/explosions/releases. Grounded runs execute 11,592 bomb steps and 20,930 native rays, including 9,338 exact-down queries and 7,889 vertical hits. Separate active-local victim cases preserve one damage event, one next-phase death and 11 native death-paint calls. Future-life cases preserve zero bomb damage/deaths/paint; ordinary enemy-ink damage independently reaches its native 60-HP cap. Paint calls were observed; no GPU atlas was rendered.

The clean extraction at `e678f7c6` passed 44 source cases with 15 pre-existing asset-conditional skips, all 19 actual emitted oracle cases, and the separately required real-Scorch source 1/1 and emitted 1/1 with no skips. Production content hash: `a673cf1cdc266ffbfcdfc9b6b1dd93f69cc2ce81dffeccb09690d2aa92c646b8`. The pinned test assets were regenerated from retained originals after shared temporary storage loss; every binary hash matches the retained historical attribution receipt. Maximum observed child RSS was 448,184 KiB. These overlapping correctness runs are not additional performance measurements. The workflow preserves every existing test and adds the actual emitted generic oracle plus mandatory pinned-Scorch source/emitted execution of the existing physics/paint/wall-swim/navigation/landing assertions. The opt-in core-only fixture changes exports only and leaves default fixtures and assertion bodies intact. Explicit passing-TAP checks reject a missing, skipped or renamed Scorch case. Test geometry remains outside the public build and upload artifact.

## One frozen five-pair experiment

The separate private workload includes current main posture, the existing #1366 optimization and held bomb-authority corrections in BOTH variants. Those held corrections exist only to retain all attacks in the burst diagnostic; they are not production dependencies of this ray patch. The 23 correctly identified native Splat births are replicated across seven remote actors, yielding 161 arrivals. Input SHA-256: `6bc7215b971b071cd287219426747ba20ba2ab8171e413ed8ecb6dc263cbe308`.

All five alternating pairs favor the new arithmetic for total process CPU, active-frame p95 and maximum measured processing time:

| Median metric | Existing #1366 | Generic arithmetic |
|---|---:|---:|
| Total CPU | 1660.387 ms | 684.700 ms |
| Active-frame p95 | 228.145 ms | 59.163 ms |
| Maximum frame processing | 327.996 ms | 158.917 ms |
| Longest consecutive >16.67 ms frames | 6 | 6 |
| Maximum owner-clock admission wait | 100 ms | 100 ms |
| Sampled peak heap | 210.43 MB | 214.84 MB |

All ten trials admit/explode/retire 161 bombs with no lost or pending attacks. Sampled peak heap increases about 4.4 MB; post-GC heap growth falls slightly (1.843 to 1.819 MB). This is not evidence of a memory improvement.

**The predeclared stutter acceptance condition fails.** Six consecutive over-budget frames and the 100-ms admission wait remain in every row. #1321/#1368 remain held on that separate problem. The arithmetic has independent CPU value but does not solve the burst freeze or justify gameplay-delay acceptance.

This is a cold-process source Node-VM result on actual Scorch triangles, with no renderer, physical device or browser FPS measurement. No normal-realm timing confirmation was run for this hunk. Older eight-bot percentages and ordinary-floor results cannot be reused as this result. The complete ten-trial frame/admission records, original hashes, all rows and unchanged prospective rule are in [the machine-readable evidence](evidence/inkwave-generic-slab-2026-10-13.json). The independent reviewer rechecked all 10×600 frames, hashes and admission records; receipt SHA-256 is `01c632231616b551d3ce5b4b1182424b85d0bc0bb443c9e74a2458abf334cc6d`.

## Coordinated integration boundary

Active #1324 also edits the shared fixture and integration test. The final gate uses a separate `INKWAVE_RAY_TEST_STAGE_ASSETS` root and explicitly selects Scorch. Ordinary `INKWAVE_NATIVE_STAGE_ASSETS`, complete catalog-derived IDs and sealed catalog preparation remain unchanged; setting both roots is rejected. No partial catalog is passed to the production builder.

A private merge against #1324 at `784f2b64` preserves its complete assertion body, `includeCharacter`, all default exports (including Jump Attach), sealed catalog adapter and wall/landing/tower controls. A bounded test-plumbing probe confirms the test-only root does not enter full-catalog preparation, while ordinary full-catalog IDs/read paths remain intact. This is not execution of the complete #1324 runtime. The extraction's final no-asset default control passes 1 case with the existing 5 optional skips; isolated Scorch source 2/2 and actual emitted 2/2 pass with zero skips, including the unchanged five-stage default catalog assertion. The mixed-root negative fails as required. Runtime and production build remain byte-identical to the clean extraction receipt. Full eventual combined #1324 adoption still requires its own current-tree validation.
