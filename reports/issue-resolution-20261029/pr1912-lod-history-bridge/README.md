# PR #1912 exact LOD source-history bridge

Actual noncancelled PR #1912 A+ job `123403938943` and source/emitted job `123403939257` failed the same immutable queue-LOD source identity check. Exact #1912 source `11ea9f273bc315257699e4436d08c273145bee05` produced normalized closure `54344ec75dbfff00176a83d0d557bad7bac5ec69`; the existing historical adapter expected `4df1943b2d598d012eaa7fa09fe96af4900821bd`. Both original hosted logs are retained unchanged and compressed.

The cause is precisely the authored Character LOD owner's 15 inserted lines and one replacement: the no-attribute vertex-signature fast path and indexed-corner memoization. Existing centroid/index inversions correctly retained those later owner changes, so their result could not equal the older source epoch.

Only `scripts/benchmark-aplus-verification.mjs` and its existing focused contract `scripts/tests/inkwave-cpu-history.test.mjs` change in repair `fc9d6004f7b878469f35180edd6aab9243689c94`. The live `inkwave-public/src/game/character-lod.js` remains unchanged. No new runtime module or source fixture is introduced.

The benchmark now authenticates both complete allowed raw-source Git blobs. After the original centroid/index inversions, a local helper reverses exactly five uniquely matched new-owner hunks. It authenticates the complete current normalized closure `54344ec…`, reconstructs the complete old `4df1943…` bytes, and retains the original `4df1943…` assertion. The helper's literal descriptor list has a separate SHA-256 seal. Exact prior `4df1943…` remains admitted unchanged; unrelated source cannot acquire that identity.

The historical migration oracle `ac2bbba478608abc5ce626a0372958528a096c00` remains independently pinned and is still the actual historical comparison input. New current-source authentication does not replace or relabel that oracle. Every benchmark byte from the outfit-source read through the remaining historical loops, configuration audit and report tail is byte-identical to the repair's parent. No pixel, pose, version, upload, equality or tolerance gate is weakened.

## Validation

Node **v22.23.4**, no browser/GPU or source-asset copy:

- Exact original focused admission contract: 4 cases, 2 pass / 2 fail / 0 skip. The queue-LOD failure also prevented a later BodyBalance-negative case from reaching its intended guard.
- Bridge added, before extending tests: original 4/4 pass / 0 skip.
- Extended focused contract: 8/8 pass / 0 skip. It independently authenticates both full raw files with Git blob and SHA-256 identities, proves exact forward/reverse equality of all five owner hunks, checks both normalized closure pins, and runs the actual historical gate on the prior raw epoch.
- All five hunks each reject missing, duplicate and semantic-tamper inputs (15 controls). Unrelated raw/closure drift and a modified descriptor seal also reject. Existing independently pinned historical-oracle and BodyBalance-drift controls remain.
- The actual full `node scripts/benchmark-aplus-verification.mjs` entrypoint exits 0. Its raw JSON is retained. It reports the unchanged frozen historical migration byte comparisons and completes the existing direct-source comparison loops.

`manifest.json` records exact source epochs and compressed/uncompressed receipt hashes. `owner-edits.json` contains only the five reviewed text deltas. Synthetic timing fields in the unmodified benchmark output are retained as raw execution evidence; they are not a new speedup, FPS, GPU, device or hardware acceptance claim.
