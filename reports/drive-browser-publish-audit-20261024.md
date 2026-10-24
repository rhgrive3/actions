# Special browser batch and static publication audit — 2026-10-24

## Dispositions

| Queue slug | Decision | Scope |
| --- | --- | --- |
| `specials-1130-batch-22-browser-runs-and-build-manifest-verification` | Implemented; real production Chromium batch passed | One verified build and browser process, with all 22 original cases and a separate context for every case. |
| `site-publishing-audit-unversioned-revisioned-static-twins` | Audited; blanket deletion not adopted | The completed production tree has measured identical twins. No additional public URL was removed because byte equality does not establish that the root URL is unused. |

## Browser batch

`scripts/check-inkwave-splashdown-browser.mjs --batch` preserves the original sequence: one Splashdown catalogue run, eighteen Inkjet runs (30/60/120 Hz × 1/2/4 actors × near/mixed), then three native-terminal runs (30/60/120 Hz). Each case receives a fresh `BrowserContext`, page, module/global state and context-owned cache. The context is closed before the next case starts. The native page evaluation, capture names and assertions remain unchanged; the existing standalone CLI selections remain available.

The full artifact-content pass and full terminal source-proof pass each run once before launching the browser. Source proof still binds all manifest inputs, the builder and the driver/probe/generator Git blobs. Before and after each case, the driver checks every verified file's device, inode, size, nanosecond mtime and ctime. Every response backed by a build artifact is also compared with its manifest SHA256. A changed file, corrupt proof, unexpected response, browser error, case failure or cleanup error fails the batch. There is no verification-skip option.

The workflow now invokes one explicit batch command with its pinned proof hash. Structural operation counts change as follows; these are counts from the orchestration contract, not measured wall time:

| Operation | Previous workflow | Batch |
| --- | ---: | ---: |
| Full artifact SHA256 passes | 22 | 1 |
| Full source-proof passes | 3 | 1 |
| Chromium launches | 22 | 1 |
| Isolated case contexts | 22 | 22 |
| Native case selections | 22 | 22 |

Existing PNGs, `result.json` files and all three terminal preflight receipts retain their directories. The new `batch-result.json` records each passed, failed or unrun case, content/input identities, verification counts and global failures. Failure stops the batch before another case starts. Workflow contract hashes were updated for this explicitly approved orchestration change while preserving all other emitted and source gates.

Validation: the new protocol suite has seven passing tests, including all 22 case selections, seeded context isolation, standalone CLI behavior, an explicit Chromium executable, proof/input/artifact corruption, same-length file mutation with restored mtime, page/case/cleanup failures and preflight-only mode. The three related workflow suites pass another 23 tests, for **30/30** total on the final frozen integration HEAD. These protocol tests are separate from the rendered validation below.

The actual production build completed the entire batch with **Chromium 151.0.7922.34 and ANGLE SwiftShader**, process exit 0, one browser launch, one artifact-content pass over 2,152 files / 115,861,071 bytes, and one source-proof pass. Every selection passed with zero recorded assertion failures and zero captured console/page/server errors. The driver records failed assertions, not the total number of successful `expect()` calls; no successful-call total is inferred.

| Rendered selection group | Selections | Native scenario cases | PNGs |
| --- | ---: | ---: | ---: |
| Splashdown catalogue | 1 | 9 | 7 |
| Inkjet stationary flight | 18 | 18 | 84 |
| Inkjet native terminals and ghosts | 3 | 6 | 60 |
| Total | 22 | 33 | 151 |

The PNGs total 11,173,055 bytes. All result files agree on the tested input hash `1b3c5dfaef1503f17b481e8f83fa7d99457edd7f966e0ee169a587eb4208dbcd`, content hash and revision. The later input-registration-only rebuild described below preserves every tested artifact byte while recording a new input hash. All three terminal receipts match source HEAD `b6ed09b0e5b183eac435062429af8368c9f9a0ad`, tree `e55c9bdf2b4e5b044b6755dca3f8cc6f8d1e7d32`, proof SHA256 `725f366196383f5236f12b3455f8b50cdf86e0861044deacb0e05136b3369f30`, and the exact driver/probe hashes. The scenarios use fixed simulation steps of `1/hz`; these are real rendered controlled scenes, not actual display-refresh measurements, native Safari/iPad tests, retail comparisons or a measured runtime speedup.

## Completed-tree static inventory

The read-only command below verifies declared artifact hashes, inventories every completed file, and compares each current-revision path with its root twin by final byte length and SHA256:

```sh
node scripts/audit-inkwave-static-twins.mjs --site _site --output .ci-scratch/static-twins-inventory.json
```

The full measured path/hash inventory is in `reports/drive-static-twins-inventory-20261024.json`. This measurement is the input-registration-complete production build at source HEAD `a7136c871b1780e3c21215f023ace7f411538f31`, produced in a unique temporary directory. [The equivalence record](drive-final-build-equivalence-20261024.json) compares all 2,152 actual artifact paths, hashes and sizes against the browser-tested build and finds no difference. The identity manifest alone grows by 2,248 bytes after ten missing static adapter inputs are registered. The original browser proof and its input hash remain unchanged; this is payload-equivalence evidence, not a new browser run. It supersedes the first workspace-tree inventory because workspace synchronization later restored an old revision and a copy temporary into that tree. The isolated final tree contains no old revisions and only the build manifest outside the artifact map.

| Identity or measurement | Value |
| --- | --- |
| Build content hash | `30c3f5023a51395c79f25e15f0f3850c8a7b923d9c399379f1ba1cca26d34c41` |
| Build input hash | `906b9616c1a785ab3aefc0de7245562dda241e0652a88cecd011f3358deec7a3` |
| Revision | `f3222bf50c8986003a4032d02e24d7e8f6aa910f1a3860ba37981baf1bf3528a` |
| Files / logical bytes in completed tree | 2,153 / 116,452,082 |
| Manifest artifacts verified | 2,152 |
| Current-revision files | 1,076 |
| Identical root/revisioned pairs | 1,071 |
| Root bytes in identical pairs | 48,990,113 |
| Different pairs / missing root twins | 3 / 2 |
| Root-only files | 3 |
| Files or bytes removed by this audit | 0 / 0 |

The one file outside the artifact map is `inkwave-build.json` itself. The three different pairs are the finalized root `sw.js` and the roller/shooter volume manifests. The two missing root twins are the volume binaries already handled by `scripts/lib/inkwave-volume-packaging.mjs`. Root-only files are `index.html`, `.nojekyll` and `inkwave-build.json`.

| Identical-pair group | Pairs | Root logical bytes |
| --- | ---: | ---: |
| `assets/` | 63 | 17,658,995 |
| `patches/` | 871 | 27,385,527 |
| `src/` | 117 | 2,854,921 |
| `styles/` | 3 | 411,368 |
| `vendor/` | 17 | 679,302 |

These are logical file bytes, not archive-compressed bytes, uploaded bytes, HTTP transfer, physical storage blocks or end-user download savings. The measured build does not include an account bundle. Workers builds add that bundle and hosting metadata, so their exact final file count requires a separate completed `dist/` inventory.

### Why no additional twin was removed

`scripts/build-inkwave.mjs` intentionally copies the staged tree into `_versions/<revision>/` before finalizing the root worker and identity. Its HTML base points ordinary relative imports to that immutable tree. This establishes the normal entry path, but it does not establish that every root URL is unused.

There are concrete remaining root contracts:

* `scripts/check-inkwave-startup-budget.mjs` reads root preload/startup sizes and root `src/main.js`, in addition to validating the immutable tree. Deleting root modules from the tested artifact would break these mandatory checks.
* `scripts/tests/inkwave-build-packaging.test.mjs` reads root emitted lightmaps and root emitted modules for pixel and export-interface checks. Root omission could either fail the checks or reduce export coverage through existing existence guards.
* `patches/loading-cache/runtime/startup.mjs` registers the root `sw.js` relative to the navigation URL. `patches/loading-cache/sw.js` deliberately passes mutable root asset requests to the native HTTP cache and never substitutes a revisioned response for them. Root and revisioned URLs therefore retain distinct cache behavior.
* `account/dev/vite-plugins.mjs` explicitly serves both root static routes and revisioned routes in development. Its production hook publishes the full build with Workers headers and only excludes `.nojekyll`. `.github/workflows/pages-inkwave.yml` likewise uploads the complete `_site` tree. A publication-only pruned copy would need its own tested URL and worker-update contract.

No dynamic evidence in this work proves a particular additional root set unused by old documents, external/direct URLs, worker updates or Workers routing. The proposed broad removal is therefore **not adopted**. The audit does not mislabel the 48,990,113 identical root bytes as achieved savings. Existing volume deduplication remains the proven limited removal.

The audit fixture suite passes **4/4** tests covering identical twins, same-size different bytes, missing roots, unrelated revisions, final-stage extra files, manifest corruption, unsafe paths and symlinks. The inventory command is read-only, and its CLI requires the report to be written outside the publish tree.
