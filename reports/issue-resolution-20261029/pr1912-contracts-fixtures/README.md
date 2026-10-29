# PR #1912 contracts fixture repairs

Source `11ea9f273bc315257699e4436d08c273145bee05`; repair `60304c186`. Actual noncancelled contracts CI job `123403940091` reported three material-allocation expectation failures and eight missing-VM-timer failures. The raw log is retained compressed with SHA-256 hashes in `manifest.json`. The separate stale-display ownership fixture failure from this job is handled by `a6d3d41f` and its [own receipts](../pr1912-native-texture-fixture/README.md).

Only these three test files change:

- `patches/native-stages/tests/native-texture-index.test.mjs`
- `patches/native-stages/tests/lemuria-unavailable.test.mjs`
- `patches/native-stages/tests/source-rule-start.test.mjs`

## Material enumeration

The actual failure is line 51's `materialsValues` count, **not** image closure or texture disposal. The new loader enumerates material names with `Object.keys` and reads each registry record directly. Therefore the former `Object.values(materials) === 1` expectation is now correctly zero. The original image-close, once-only texture-dispose, material metadata, pixel output and decode-count checks remain.

An independent registry Proxy records actual material property visits. Across all six source-mode/quality combinations, the pinned frozen loader demonstrates nonzero values-array allocation and repeated complete source-order scans. The current loader visits all 96 records exactly once, in the same source order, with zero values-array calls. Full material/pixel snapshots, decode counts, texture counts and decoded bitmap order remain equal. The independent visit trace prevents a skipped-material or reordered-material implementation from passing merely by reducing the allocation counter. No speedup claim is made from the counter.

## Startup timer ownership

The composed production startup methods now retire `_resultsMusicTimer` before stage/rule admission. The two old VM fixtures provided neither `setTimeout` nor `clearTimeout`, so valid cancellation raised a ReferenceError before their intended rejection assertions. Production source remains unchanged.

Each fixture now provides paired deterministic timer APIs with separate numeric IDs and an observable pending-task map. Every affected actual startup path receives a seeded results-music timer and an unrelated timer. Assertions require the exact results ID to be cancelled, its owner reset to null, its pending callback removed, and the unrelated callback retained. Flushing the queue runs only the unrelated callback. Existing world/match preservation, rejection, no-flow, toast, transport and menu assertions remain.

A temporary source-only negative control changed cancellation to record the ID without deleting its pending task. All eight affected cases then failed specifically at `retired callback is removed from the queue`; six unrelated cases continued passing. These copied counterfactual fixtures are diagnostic only and are not installed into production or CI. Thus a no-op cancellation API cannot satisfy the repaired tests.

## Validation

Node **v22.23.4**, `--experimental-vm-modules --test`, CPU only:

- Original three files: 63 cases, 52 pass / 11 fail / 0 skip, reproducing exactly three allocation expectations plus eight timer ReferenceErrors.
- Repaired three files: 63/63 pass / 0 skip.
- Those files plus source-rule availability and existing actual results-music timer-retirement tests: 83/83 pass / 0 skip.
- Diagnostic record-only cancellation counterfactual: 14 cases, 6 pass / 8 expected fail / 0 skip.

Agent6 independently reviewed the committed diff and found no blocker: actual registry visits/order/decode/pixels/disposal and cancellation/unrelated-timer controls are retained. Agent6 did not rerun integrated tests. No browser/GPU, source-asset copy, production edit, CI guard change, skip, tolerance or benchmark acceptance was introduced.
