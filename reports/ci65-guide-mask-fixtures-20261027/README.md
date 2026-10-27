# Exact65 CI guide/mask fixture repairs, 2026-10-27 UTC

Base/runtime: `65ad3508a30b26d9264acafc76f6ab9f77a48c1b`. Isolated code `a45886edad7fec791fb5cf46e141cbe991c845c5`, branch `fix/ci65-guide-mask-fixtures-20261027`. Only three test files change; production changes0. These are newly diagnosed failures, not a replay of the earlier issue413 correction.

## Preserved failures

[Run40442074376](https://github.com/rhgrive3/actions/actions/runs/40442074376), exact65:

- [patch_tests(5), job121984873256](https://github.com/rhgrive3/actions/actions/runs/40442074376/job/121984873256):1059tests,1054pass/2fail/3skip. The camera same-tick aim case fails before assertions because its partial Physics lacks segment. Charger calibrated-mask metadata expects2stretch formulas in weapons-charger-flight.mjs, actual1.
- [patch_tests(4), job121984873001](https://github.com/rhgrive3/actions/actions/runs/40442074376/job/121984873001):1316tests,1305pass/1fail/10skip. The #608 guide/actual-centerline case independently lacks segment.

Decoded failure extracts and local before/after logs are retained here; full decoded jobs are preserved locally with hashes in [validation.json](validation.json). The original CI failures are not called green by local results.

## Causal fixes and assertion strength

`camera-aim-controls.test.mjs` and `issue-608-fidelity-aim.test.mjs` keep their original raycast worlds and borrow the loaded real `Physics.prototype.segment` method. This supplies the native bounded fallback instead of disabling guide contact, substituting an always-miss method or changing shipped physics. All original19camera and5issue608 test bodies are byte identical. A new positive camera case verifies segment endpoints and the real installed guide stop at the same wall.

The mask's delayed formula was moved into the accepted shared `charger-paint-drop.mjs` lease. The revised location check requires one immediate formula, one shared delayed formula and actual native radius/depth/direction wiring. Browser-oracle, world-unit and terminal scaling assertions remain. A new production-path case fires all five calibration charges at floor and18-unit elevations and inspects actual travel/terminal masks after receiving-floor contact: same count, calibrated radius/stretch, correct owner/floor and no elevated prelanding paint. This protects both numeric paths instead of merely lowering a string-count expectation.

## Focused results

The three original files reproduce24pass/3fail. After correction they give **29pass/0fail/0skip**, including two added behavioral cases. Four selected actual-runtime cases give **emitted4pass/0fail/0skip**, using both INKWAVE_BUILT_SITE and INKWAVE_EDGECASE_SITE for their respective fixture contracts. Source-only code-text metadata is not promoted to emitted runtime evidence.

The reused optimized site's content hash is `596e029ef336213de97d337c5f12752bfb4f3887de28907dde1a6ef5e36fdafd`. Exact65 git-tree audit again verifies1,491 inputs including builder and2,196 artifacts, mismatch0; tests do not enter production input identity. No rebuild, broad suite or CI rerun was needed. No Hissen/Brush implementation, character/rig, weapon data or packaged media changes are included.

The accepted eight-kit harness commits `e6fb91faf` / `8121de006` remain protected on their separate branch for the next coherent integration batch. Integration and PR #1895 stay fixed at65pending review; no standalone integration push or denied PR-description retry is part of this candidate. CPU fixture checks are not new browser, audio-playback, retail pixel or hardware acceptance.
