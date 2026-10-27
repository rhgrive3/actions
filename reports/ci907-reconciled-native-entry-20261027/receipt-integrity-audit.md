# Historical catalog receipt-integrity correction

Audit source: `d3ee2a9fbbfbb32c79819021facab66840a2be70`; local native handoff, 2026-10-27. Scope is the saved catalog evidence, not gameplay, pose thresholds, models, the movement worker's physical comparison contract, or Splatoon 3 retail equivalence.

## Findings and evidence boundaries

1. **Tracked historical helper loses contrary evidence.** `browser-probe.mjs:29–33` loads an old result, constructs a Map keyed by `file`, overwrites entries with fresh observations, then calls `validateCatalogReceipts` only on the union. A bad original FX digest can disappear behind a good fresh digest. Same-array duplicates can also disappear during the initial Map construction. `safe-same-head-receipt-union.test.mjs` extracts and executes that exact archived union snippet: the canonical validator accepts its fabricated overwritten union, while the replacement rejects the original corrupt row. This is a reproduced acceptance-logic flaw, **not proof that any historical receipt was actually corrupt**.
2. **The 860-image aggregation is not independently reproducible from the tracked handoff.** `browser-probe.mjs:34` reads the diagnostic and counts data/images; it does not read/hash 860 PNG files or run the full motion-result validator. `combined-saved-validation.json` records a summary with `imagesVerified: 860` and `status: passed`, but the full augmentation program, original result/diagnostic, all 480/450 loaded rows, and raw image files referenced by the old scratch paths are absent from this native handoff. Their historical execution is not disproved; this audit simply cannot independently verify it. Do not infer a browser/image pass from counts, hashes in summaries, three selected HTTP rows, or the new unit tests.
3. **The original-file digest labels remain unresolved.** `bounded-entry-receipt.json:58–59` identifies `motion-catalog-result.json` with SHA-256 `9d5c9880217e0132d7f7976a60f8ef8771a2bb3de7d273c97abd4dc1fb2255c6`. `combined-saved-validation.json:3` instead records `originalSha256: 39d0ce104e7750f05b29eb83c1a6ee45de303c5affdc6d1067824c1d8f55a365`. Without the original bytes/program it is unknown whether these denote different snapshots, another file, or an error. Neither value has been relabeled or treated as evidence of corruption.
4. **Canonical fresh collection does not perform this historical merge.** In `scripts/check-inkwave-motion-catalog.mjs`, lines 1090–1107 verify immutable artifact hashes, committed source inputs and builder identity; lines 1120–1131 save actual PNG bytes and hash each fetched response before `loaded.set`. HTTP/page/request errors remain in `errors`. Lines 1138–1147 retain the full diagnostic, read/hash actual PNG files and run `validateCatalogResult`. No historical receipt set is imported. This audit changes none of that code, its required-module denominator, its existing two narrowly documented module exclusions, graph invocation checks, or pose/image thresholds.

The source/VM audio and native FX validators remain separately useful source checks. Their passing tests do not rehabilitate the historical augmentation. Old Shooter ownership observations also remain bounded and historical, not final integration-head browser proof. No new browser, media upload, artifact download workaround, manual CI, remote write, PR operation or main merge was attempted by this audit.

## Preserve originals; fail closed for any future receipt-only comparison

The following original bytes are intentionally unchanged:

| Archived file | SHA-256 |
| --- | --- |
| `browser-probe.mjs` | `2797c0f58cf1f562a788b47e754e2c042953ed04cdb8a30daa88a4c560253def` |
| `combined-saved-validation.json` | `ce3f2a6f3786357f8328a07fa893bc275f20a7415e10d81da679ad07f878b198` |

`manifest.json` remains the historical manifest, not a manifest for these new audit files. The README correction supersedes the old catalog acceptance prose and old JSON `passed` fields without altering them.

`safe-same-head-receipt-union.mjs` is a narrow, unwired **receipt-only** replacement for the archived union, not generic infrastructure or a capture/replay tool. It:

- requires an externally pinned full source commit and exact raw manifest SHA-256;
- checks manifest/build consistency and exact source head, manifest, content hash, input hash, artifact table, build metadata and committed source-input receipts in **both** captures;
- rejects retained capture errors, unknown artifacts, wrong digests, invalid byte counts and any supplied non-200 HTTP status before combining;
- validates each original row before insertion, rejects conflicting duplicates within or across captures, keeps exact duplicates only, and does not mutate inputs;
- calls the unchanged canonical required-module validator on the resulting array and returns only that array, never a passed replay/image certificate.

These identity fields must come from a trusted capture, not be retrofitted onto incomplete old summaries. The helper cannot authenticate fabricated metadata or independently establish absent source/artifact/image bytes. Different source heads are deliberately rejected even if some emitted bytes coincide. The historical inputs have **not** been processed by this helper and must not be described as repaired or revalidated.

## Local verification

Exact commands and full output: [`receipt-integrity-local-tests.txt`](receipt-integrity-local-tests.txt). Runtime: Node `v24.22.1` (the existing automatic workflow uses Node 22; CI is still required).

```sh
node --test reports/ci907-reconciled-native-entry-20261027/safe-same-head-receipt-union.test.mjs
# 26 tests passed, 0 failed, 0 skipped. Fabricated receipt metadata only.
node --test scripts/tests/inkwave-catalog-audio-graph.test.mjs scripts/tests/inkwave-catalog-audio.test.mjs
# 42 tests passed, 0 failed, 0 skipped. Existing source/VM graph contracts.
```

The new tests include corrupt-old/fresh-valid and corrupt-old/good-later-duplicate failures, old HTTP failure/zero bytes, conflicting duplicate byte counts/metadata, retained errors, missing/changed source/build/input/artifact/raw-manifest identity, corrupt committed source input and missing required union entry. They also pin both preserved original file hashes. No full motion/browser/screenshot pass is claimed.

## Fresh automatic CI is the acceptance route

For the final coherent PR source commit **H**, all of the following evidence is required. A later source change requires fresh evidence for its new exact head; do not carry `af180bad…`, old 480/450/482 counts, or 860-image summaries forward.

1. **Automatic exact-head build:** the existing PR-triggered workflow checks out full commit H, passes its production build/source-input checks, and produces the immutable site artifact with `_site-source-sha.txt == H`. Preserve the raw `inkwave-build.json` bytes/digest, `build`, `files`, `inputHash`, `artifacts` and `contentHash`. Verify actual emitted artifact bytes and source inputs against that manifest and committed H, including the builder. Derive denominators from the final manifest, not old hardcoded counts.
2. **Complete catalog execution on that built site:** the unchanged `.github/workflows/validate-inkwave-update.yml` catalog lane runs its audio graph tests, Brella controls and `node scripts/check-inkwave-motion-catalog.mjs --site .built-site/_site --evidence-dir "$CI_STORAGE/evidence/catalog" --profile-dir "$CI_STORAGE/cache/catalog"`. Require successful process/job completion and a real full `motion-catalog-result.json`, not only a bounded invocation or a unit-test pass. Do not shorten scenarios, skip tails, exempt additional modules, loosen thresholds or substitute the receipt-union helper.
3. **Inspect full retained catalog evidence:** require `status: passed`, no retained errors, full result/diagnostic/source-input JSON, every case trace, every referenced raw PNG and the final manifest. Independently confirm `sourceHead == H`, exact build/input/artifact identity, valid loaded-byte receipts without conflicting duplicates, the canonical named scenario/frame/render/cleanup denominators, audio Worker protocol/PCM/termination, real FX birth/invocation/restoration, and each PNG's actual bytes/size/SHA-256. Run the unchanged full result validator. An expected-hidden geometry case remains distinct from a visible indexed case; do not convert one into a model exemption.
4. **Exact-head CI envelope:** inspect the lane's `ci-result.json` (`status`, full `sourceSha == H`, matching `contentHash`, catalog `checks`, `runId`, `runAttempt`, automatic `event`) and its complete artifact, and require all other existing source, patch, browser and workflow fan-in gates for H to pass. The catalog result does not certify the active/network/UI/range/startup suites, Shooter visual calibration, retail timing or hardware parity. If configured offload is active, require the existing equivalent offload/fan-in evidence rather than a skipped GitHub lane alone.

Until those exact-head artifacts are available and inspected, catalog browser/image acceptance remains **pending**. This audit neither triggers CI nor represents that any historical data was corrupt; it closes the evidence-labeling and receipt-overwrite defect only.
