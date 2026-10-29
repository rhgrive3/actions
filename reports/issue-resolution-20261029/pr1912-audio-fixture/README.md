# PR 1912 audio fixture reconciliation

At integration candidate `cb2640a7a8c80f1dbe4566ab6555ede94e0a144c`, the 114-file source run had 1,075 tests: 1,070 passed, four failed, and one existing private damage-table reference test was skipped. Three failures were extracted-method fixtures, not evidence of missing production methods:

- `queue-visual-batch231.test.mjs`: idle movement-loop case, test 906.
- `visual-audio-terminal.test.mjs`: ambience provider/consumer case, test 1061, and movement-loop case, test 1064.

Each failed with `this._recoverMainLoop is not a function`: the test extracted a composed `Game` consumer but omitted its `_recoverMainLoop` dependency. The fourth failure, test 192, was a separate paint fixture and is not attributed to audio. The source-run manifest and complete original TAP are included in the receipt archive.

Fixture-only commit `cb39ae632` (integrated as `538b578ccce0a083867a7a07196c5d5993fab54a`) extracts the actual composed recovery method and supplies running audio context state. It retains the original provider, mute, rearm, fade and pause checks. The idle case now observes zero recovery visits and zero attempted loop starts; the active case observes the real recovery owner. The movement case separately checks that an already-dead handle blocked by admission is dropped without a second stop, while an active handle is stopped on pause and on context replacement. Production audio and recovery code were not changed by this fixture repair.

On Node 24.19.0, the two affected files went from 14/17 to 17/17. The retained intermediate 16/17 log documents the stale stop-count assertion encountered during the repair. Six adjacent audio, prefetch, worker and Charger lifecycle suites passed 50/50. The separate Node 22.23.4 repaired-focus run passed **22 distinct tests**: 17 from these two files and five paint tests. These are selected runs; the original 114-file source run was not repeated in full for this evidence packet.

Upstream `dba7a9d4da37388e13638c6ae69f6e1150faf53d` (included in owner head `cb9d28353d43de174dcc6d9850c9c5e818ec111a` and integration `0d46bb41bf9f734cd40bdac7bb5dcdab99c87380`) separately guards result-music `clearTimeout` calls when the stored timer is null or undefined. The guard still admits numeric zero and live timer handles; the existing result-music fixture allocates IDs starting at one, so these receipts do not demonstrate a zero-ID test. Timer ownership, cancellation and callback fences otherwise remain as before. No claim about recorded sound fidelity follows from this change.

`receipts.tar.gz` is SHA-256 `03e45e5506251890bcf627a7f5b8a24d566a3d389f3381efe36c164c2b7dcfdf`. It contains the original full source TAP and manifest, the Node 24 before/intermediate/after and adjacent logs, and the Node 22 repaired-focus TAP. No private reference assets are included.
