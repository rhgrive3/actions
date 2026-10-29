# PR #1912 native texture fixture phase repair

Source: `11ea9f273bc315257699e4436d08c273145bee05`. Actual noncancelled CI failure: [run 40861011467, job 123403938501](https://github.com/rhgrive3/actions/actions/runs/40861011467/job/123403938501). The retained raw log and local receipts are gzip-compressed; `manifest.json` records their compressed and original SHA-256 hashes.

The old stale-display fixture allowed exactly one `current()` call. PR #1912 adds a legitimate cancellation fence immediately after sliced `NativeLevel.create`. That second call now aborts **before** loading textures or constructing a display. The fixture-created texture was never transferred to the world, so zero world disposals are correct at that boundary. The old test still expected the later acquired-display phase and failed `0 !== 1`.

Only `patches/native-stages/tests/native-world-texture-ownership.test.mjs` changes. Cancellation is now armed after the actual `nativeDisplay` returns successfully, with the exact data → level → textures → display-start → display-created phase sequence asserted. The acquired-display test continues to require one image close, one texture disposal, and an empty texture map. The malformed-assembly control retains the original exception identity and once-only pending-texture disposal. The successful-display control still calls `dispose()` twice and requires once-only cleanup.

A new pre-transfer negative cancels at the mocked asynchronous Level creation boundary. It requires that texture loading and display construction were never entered, and that the caller-owned texture remains undisposed until the fixture explicitly cleans it. This detects removal or displacement of the early cancellation fence without relying on how many times a legitimate `current()` check runs.

Validation used Node **v22.23.4** with `--experimental-vm-modules --test`:

- Exact old fixture: 1 pass / 1 fail, reproducing the hosted failure.
- Repaired fixture: 3 pass / 0 fail / 0 skip.
- Twelve relevant files: 89 pass / 0 fail / 0 skip: native-world cancellation, navigation publication, recovery, recovery clock, recovery startup, recovery UI, texture ownership; source retention; native static rendering; native texture budget; sliced NativeLevel; native geometry/grid.

Independent Agent2 peer review repeated the repaired file under Node v22.23.4: 3 pass / 0 fail / 0 skip.

Runtime source blobs remain unchanged (recorded in the manifest). This is a test-fixture repair, not a production leak fix, device-crash reproduction, render comparison, timing measurement, or performance claim. No browser/GPU run or build was performed.
