# PR #1912 runtime design audit

Read-only source audit of PR #1912 `11ea9f273bc315257699e4436d08c273145bee05` against its base `e67c636b81762df56b346a09ef570964d43084df` and existing stack `22f1962e95411100d1d34dd127405d110df3e7a8`. `reviewed-source-blobs.json` identifies the exact 25 inspected runtime/adapter source paths. Shared adapter, source composition and CI integration remain root-owned. No product source changes are proposed by this report.

## Integration findings

1. **Preserve the existing hair and ring-upload owners.** Standalone #1912 retains its base's hidden hair suppression but lacks 22f's `offscreen-hair-target-adapter.mjs` import/application and source-controller `_ensureHairTargets` catch-up. Its FX composition also lacks the persistent ring-transfer owner from `render-transfer-optimization-adapter.mjs`. `composed-runtime-shapes.json` records exact composed hashes and bounded source-shape witnesses. These are sibling-branch reconciliation requirements; the new PR must be normally merged with the existing fixes, not installed through wholesale shared-adapter replacement.
2. **CMB04/CMB06 retain the safe native policies on standalone #1912.** Its composed InkFlight keeps the native capsule scan, and bots keep `distanceTo` perception. The rejected terrain-radius + .25 actor prefilter and `dSq > aw*aw` awareness rejection are absent. The 22f unique no-op source guards should still survive reconciliation; their omission alone is not a demonstrated runtime regression. CPU13's live per-pair actor/alive/radius read restoration remains present. No MOV08b work was restored or authorized.
3. **Native index narrowing has two independently named implementations.** 22f exports `compactNativeIndices`; #1912 adds private `narrowDisplayIndex`. Both retain Uint32 at index 65535 and above for primitive restart. Reconcile to one implementation while preserving the existing export and its tests. NativeLevel's sliced constructor/init-grid rewrite also overlaps 22f's per-triangle bounds fast path; source triangles and holes remain authoritative.
4. **The actual texture CI failure was a test-phase mismatch.** A new legitimate early cancellation fence after sliced Level creation consumed an nth-call fixture's second `current()` check before texture acquisition. The test-only repair and exact failure/control receipts are in [the separate texture fixture report](../pr1912-native-texture-fixture/README.md). No runtime cancellation or disposal guard changed.

## Timing and Character assessment

Full Character deferral on intermediate fixed ticks, including its documented stale rig-bone muzzle trade-off, predates this PR on both e67 and 22f. #1912 changes only debt handling: it drains owed time in native-stable 0.1-second slices with bounded work and retains any remainder. This report does not reinterpret that inherited policy as newly introduced behavior or as proof of exact per-fixed-tick muzzle equivalence.

The new refresh-aware dynamic-resolution adapter samples one lower-resolution window and restores the previous scale if presented timing does not improve, with bounded retry windows. This is a controller policy with synthetic controls, not proof of a device performance gain or causal workload attribution. The platform scheduler's visible fixed-step/gameplay cadence remains separate from presentation-clock consumers. Environment's expanded admitted delta advances analytic scene time; it does not remove gameplay simulation steps.

The offscreen budget change caches projection terms by camera/fov/aspect and Math function identity. It does not address the previously observed #845 per-simulation-tick ground solver cadence. #845 therefore remains unresolved; no ground query, pelvis compensation, body balance or muzzle dependency was deleted.

NativeLevel slicing retains cancellation/current checks and exact source triangle collision. Construction still has indivisible work (including TriangleWorld construction and `_buildHash`); no 4 ms worst-case main-thread guarantee is established here. Native render/index/grid/texture-budget changes are covered by source-level controls, without a new rendered-device comparison.

## Bounded validation

Node **v22.23.4**, CPU only, no browser/GPU, no build or timing benchmark:

- The separate 12-file native-world report records 89/89 passing cancellation/publication/recovery/clock/retention/render/budget/slicing/grid controls, including the repaired ownership fixture.
- Seven additional runtime design files initially produced 34 pass / 2 fail / 0 skip. The two failed actual-Character cases could not load source-motion banks because this isolated sparse checkout intentionally excludes assets. That raw run is retained unchanged.
- The 24 tracked source-motion asset blobs (11 MB) were verified against exact #1912, accessed through a temporary read-only link to the existing baseline checkout, then rehashed unchanged and the link removed. Only the two affected files were rerun: 5/5 pass / 0 skip. This includes real Character stable-debt replay and real retarget feet/pose/muzzle comparisons at 30/60/120 Hz with scaled parents. It is not a claim that the entire 36-case suite was rerun.
- Other passing controls cover 60 Hz platform cap, presentation-clock consumers, eligible paint-profile counts, full environment uploads and the production visual continuation. Candidate shader paths remain separate from the adopted production paths.

`receipts.json` records gzip and uncompressed SHA-256 hashes. No FPS, hardware acceptance, whole-match speedup, all-device render parity or complete #1912 acceptance is claimed. Other agents own network authority, weapons/ranked, audio/input/UI, CI/source composition and full test inventory.
