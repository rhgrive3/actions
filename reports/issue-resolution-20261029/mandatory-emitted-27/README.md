# Mandatory emitted coverage: 23 → 27 files

This CI-only change targets the top integration branch. The base is
`1ab7a58f85d847ce53bcbcbe1cbdcae75a6f48a6`; the local checkout also includes the
unchanged test from `405cd1830dad7a0b35ee18d36ec42ce752a0cc36`. That test must
already be integrated in the destination before cherry-picking this CI change.

The `validate_core` step **Verify remaining emitted combat, weapon and visual
regressions** retains its original 23 files in their original order and appends:

- `patches/network-replication/tests/combat-native-birth-timing.test.mjs`
- `patches/network-replication/tests/combat-single-round-targets.test.mjs`
- `patches/splatoon3/tests/catalog-horizontal-sector-emitted.test.mjs`
- `patches/splatoon3/tests/ranked-rainmaker-current-lifecycle.test.mjs`

The command still runs all files directly against `INKWAVE_BUILT_SITE`, after
`verifyRuntimeBuild` binds the site to the checkout and requested source SHA.
There is no filename discovery, optional-file branch, name filter or missing-file
skip in this mandatory command. The source-only sector counterfactual is excluded.
The [exact list](mandatory-files.json) records all 27 entries and the original
23-file prefix hash.

`inkwave-source-coverage.test.mjs` now requires 27 existing files, the exact
ordered command tail, each entry once, and the unchanged verified-site/trace
environment. Its negative controls remove or duplicate every one of the 27
entries, substitute the source-only sector file, and wrap execution in a
conditional. Those mutations fail. Existing missing-site, filtered, optional,
duplicate-owner and source-inventory controls remain.

The exact owner-bound launch-packet/ghost verification step and separate
10-file inertia/guide/phase step remain byte-identical. CPU/browser shards,
runner routes, sandbox profiles, full-scope classification, source identity and
all existing allowlist/pin guards remain unchanged.

## Rainmaker dependency hydration

The current Rainmaker test reads
`tools/rainmaker-form-production-qa/browser.mjs`. Its logical shared-scene import
is `./shared/production-scene.mjs`; the shared production source is
`tools/object-presentation-qa/production-scene.mjs`. The CPU test supplies a
synthetic import that throws if a renderer is requested. Both real source files
are tracked, and `validate_core` already hydrates `/tools/` plus the complete
global `*.js`/`*.mjs`/`*.cjs` inventory. The unchanged sparse-checkout contract
materializes that entire tracked inventory in a temporary Git checkout.

An initial working edit appended these two paths to the historical sparse
fixture's examples. Four existing immutable-fixture guards correctly rejected
that edit. It was reverted byte-for-byte; no historical/current SHA pin or
literal exemption was changed. Three other initial failures were missing
assets/CSS in this isolated sparse checkout. The final verifier used hydrated
text and ten Git-blob-verified asset files through temporary read-only links;
the links were removed afterward. The initial failed run is retained separately.

## Validation

All commands used Node **22.23.4**; its directory was prepended to `PATH` for
the canonical runner's child `node` processes.

- Focused source-coverage, sparse-checkout, wall workflow and full-scope guards:
  **28/28 pass**, no skips.
- Full canonical verifier: **674 total, 673 pass, 0 fail, 1 existing skip**.
  The skipped optional-pack emitted check requires `INKWAVE_BUILT_SITE`; this
  was a source-only verifier run. No mandatory regression was made conditional.
- Independent Agent2 review confirms the exact ordered 23-file prefix, four
  appended files and unchanged sparse fixture/pins. Their source-coverage run
  passes **5/5**, no skips.

The canonical command is `node scripts/ci/run-inkwave-test-suite.mjs verifier`.
The new 27-file runtime command is defined directly in the workflow. Its actual
emitted execution belongs to the root-owned current combined build; these CI
contract results are not reported as 27-file runtime or browser acceptance.
No production code, test contents, site assets, frozen evidence or held QA
workflow was changed. [summary.json](summary.json) hashes raw receipts and the
exact changed files.
