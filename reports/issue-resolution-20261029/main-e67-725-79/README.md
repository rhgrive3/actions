# Exact-main source checks for #725 and #79

Main source was `e67c636b81762df56b346a09ef570964d43084df`. Tests ran with Node v24.19.0 against files extracted from that Git commit, without changing main. These are controlled software source tests; they do not establish physical-device behavior or exact Nintendo retail parity.

## #725

The main Splatoon adapter installs device-degrees-per-360 anchors 360 / 200 / 120 (gains 1 / 1.8 / 3) and the interval-integrated low-speed smoother. Its own endpoint, full-production-composition cadence, dropout, world-orientation and stationary-trust suites passed **42/42**, zero skips: [raw TAP](gyro-source.tap.gz), decompressed SHA-256 `91814e3fa95494262c06e1c089373fb7aab1366f528d27ab58fa9ad78828ad20`. The 30/60/120 Hz checks, raw-gain separation and adjacent controls use synthetic inputs. These numerical tolerances establish software arithmetic, not measurement accuracy of the cited public bridge; intermediate settings remain interpolated rather than claimed measured. The original issue permits interpolation when intermediate data are unavailable.

The existing [#725 report](../gyro-725-original-scope/README.md) includes an emitted probe for a different build and an 11-input comparison with checkout `2b01cd7efbca260a611165b1e3887ff48062ccd5`. Eight of those inputs match main byte-for-byte. The other three whole files differ: Splatoon adapter, quality adapter and source-composition script. Their diff hunks affect unrelated menu, stick, rendering and hair code; the gyro replacement and interval integration are the same. The other build is not represented as an exact-main emitted build.

## #79

The five-case strengthened test at commit `6ce78ecc` was the **only overlaid file**. Its SHA-256 is `558eb78fb53670b24f8d5b3d419e162cde2954f95d149617f2d569a54441a970`. It passed **5/5**, zero skips, against main runtime and main fixture: [raw TAP](issue79-source.tap.gz), decompressed SHA-256 `c372d6185699d3243a44490bd6187c5b36ff8f3a0a9766d86fc2bb9bb59ee6dd`. It covers native actor turf and special credit, elevated wall-only zero turf, the far-distance floor anchor, and 30/60/120 Hz render schedules. The fact that the strengthened test is not on main does not mean the tested main behavior is missing. This is source-fixture evidence, not an exact-main emitted run.

## Main source binding and hosted checks

The archived Git tree IDs were `inkwave-public/src` `11f22cef91381d48d433cdb69d1e57c80954cac6`, `inkwave-public/vendor` `ef51a1cd989da612e09f39ed907e811b091988ba`, `patches` `c4f17c642aebd68534a51660168a3592b08af9b1`, and `scripts` `b201eb033f3a3727389dc1f44b352df5c8cbdae8`. The main #79 source-fixture SHA-256 was `a1955f6288dabac02c180ec623efeaebc3e2ad389e6acef54bf13c1a6970bd0e`. The initial #79 extraction omitted vendor and failed with missing `three.module.js`; vendor was then extracted from the same main commit and the successful run above replaced that incomplete run.

The fully paginated checks API returned [main workflow run 40737709268](https://github.com/rhgrive3/actions/actions/runs/40737709268): build_site and patch_tests (2) passed, while patch_tests (3) and aggregate validate failed. Main's sorted eight-way shard inventory assigns the #725 composed cadence suite to shard 2 and the endpoint suite to shard 3. The shard 3 evidence artifact could not be downloaded (HTTP 403), so its failure is not attributed to a particular test. No claim is made that the full main CI passed. Current PR gates are separate.

## Reproduction

Extract the main source, main scripts, fixtures and vendor into an empty persistent directory; substitute the test file only for #79:

```sh
commit=e67c636b81762df56b346a09ef570964d43084df
mkdir -p /workspace/scratch/e67-repro
git archive "$commit" inkwave-public/src inkwave-public/vendor patches scripts | tar -x -C /workspace/scratch/e67-repro
git show 6ce78ecc:patches/splatoon3/tests/issue-79-shooter-live-impact-paint.test.mjs > /workspace/scratch/e67-repro/patches/splatoon3/tests/issue-79-shooter-live-impact-paint.test.mjs
cd /workspace/scratch/e67-repro
node --experimental-vm-modules --test --test-concurrency=1 patches/splatoon3/tests/gyro-sensitivity-endpoints.test.mjs patches/splatoon3/tests/gyro-sensitivity-cadence-725.test.mjs patches/local-quality/tests/gyro-dropout.test.mjs patches/local-quality/tests/gyro-world-orientation.test.mjs patches/local-quality/tests/gyro-stationary-trust.test.mjs
node --experimental-vm-modules --test --test-concurrency=1 patches/splatoon3/tests/issue-79-shooter-live-impact-paint.test.mjs
```
