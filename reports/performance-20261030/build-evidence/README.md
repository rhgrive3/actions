# Evidence packaging performance

Baseline: `3715e29d1656a00b853f73e12a89624b17985b7c`.
Candidate: the uncommitted `scripts/ci/package-inkwave-evidence.mjs` in this change; its exact SHA-256 is recorded in `results.json`.

The bounded failure-evidence packager repeatedly serialized the entire manifest after removing one inventory row. For a large inventory that must be reduced to a short prefix, this took quadratic work. It also searched the retained manifest by path for every copy and cleanup operation.

The candidate finds the longest retained prefix with a binary search. Each comparison still serializes the complete candidate manifest and counts its UTF-8 bytes, including the changing omitted-entry count. The selected inventory and manifest retain identical order, so copying and cleanup can address corresponding entries by index. File hashing, priority ordering, copy verification, non-regular-file rejection, the artifact limit, and failure exit status are unchanged.

Measured medians (six calls per version and size):

| Small JSON files | Baseline | Candidate | Reduction |
| --- | ---: | ---: | ---: |
| 2,500 | 3,603.7 ms | 390.0 ms | 89.2% |
| 5,000 | 14,948.5 ms | 830.8 ms | 94.4% |

All 24 calls returned identical metadata and output hashes for their corresponding fixture. This was a shared cloud machine with other work running; raw samples show substantial timing variability. The comparison establishes the reduction on these fixtures, rather than a production CI time guarantee.

Run from the repository root:

```sh
node reports/performance-20261030/build-evidence/benchmark.mjs \
  3715e29d1656a00b853f73e12a89624b17985b7c 2500,5000 3 \
  > reports/performance-20261030/build-evidence/results.json
node --test scripts/tests/inkwave-evidence-packaging.test.mjs
npm run test:ci-config
```

The benchmark loads the baseline directly from Git and snapshots the candidate source. It creates 2,500 or 5,000 small JSON files, Unicode filenames, a diagnostic log, a preferred Wiper receipt and image, and a 1 MiB file that exceeds the 32 KiB submission limit. Each size runs three alternating ABBA/BAAB blocks, giving six measured calls per version. Timings include inventory, hashing, manifest selection, copying, and verification; fixture creation and comparison assertions are outside the timer. Every call must return identical metadata and identical output-file SHA-256 values, while retaining the original input files unchanged. Scratch fixtures are removed after the run.

Validation: the 20 evidence-packaging tests pass. They include exact byte thresholds, Unicode and escaped paths, omitted-count digit boundaries, maximal-prefix equivalence with the former loop, a 1,000-file inventory that exercises reverse cleanup after copy metadata expands, and mutation between hashing and copying. The complete `test:ci-config` suite also passes: 122 tests across its two steps, with no failures or skips.

These are synthetic measurements of the oversized failure-artifact path on the machine recorded in `results.json`. They do not measure game frame rate, browser behavior, complete CI duration, or ordinary under-budget artifact uploads.
