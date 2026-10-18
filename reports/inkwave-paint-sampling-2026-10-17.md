# Restore exact ancillary paint sampling

## Cause and merge attribution

[Validate run 39065038975, patch_tests (3)](https://github.com/rhgrive3/actions/actions/runs/39065038975/job/117490782141) failed one of 834 tests at merge `9f5d3add194b5b8cde1bb1667a890a18b5bd8d4d`. Its parents are main `cb26e409b30e4be5d1185047cef018bbf9c23217` and headgear `c913973ead7600805ef2bd343a48c4777e40cc76`.

- `d5265f73d9dad69f1afd9690e374caee45195f11` and headgear `c913973e` have the identical paint runtime blob `1e1fe64728db268b5a804bb7cb98b290fcb86b24`.
- Main parent `cb26e409` and merge `9f5d3add` have the identical changed blob `9f4b670480fb1d653330592927f6ee63ae27b699`.
- [Intervening commit b6f4fd97](https://github.com/rhgrive3/actions/commit/b6f4fd97233a162a9721e0c148d53cbd63fe1191), based on `d5265f73`, replaced powers with multiplication chains and signed distances with squared-distance comparisons. PR #1570 merged this as `cb26e409`, before the headgear merge. The headgear merge did not introduce those paint changes.

The failure is deterministic, not flaky: the unmodified main reproduces on both CI's Node 22.23.3 and local Node 24.19.0. Its first differing `bx` is `0.23078732170869673`, versus `0.2307873217086967` in the unchanged oracle. This difference is caused by binary64 evaluation order, despite real-number algebraic equivalence.

## Fix and regression coverage

Restore the original `Math.pow` expressions and `Math.hypot(...) - radius < -margin` predicates. Retain direct-piece candidate traversal and the safe omission of stretch work for type-3 drips, which use the original unstretched coordinates. No shader, geometry, hair, body, gear, upstream source, immutable fixture, tolerance, or original assertion changes.

The original test checks all four piece types, three stretch factors, floor/wall cases and more than 30,000 samples, but its boundary points lie at conservative outer boxes. A new test adds 413,952 samples at the actual circle/ellipse inner boundary, using 128 directions, seven binary64-scale offsets, three seeds, four growth times, three stretch factors, and floor/wall cases. It compares the boolean result exactly with the immutable oracle; it introduces no tolerance.

A separate unstretched diagnostic found 2,136 circle and 645 ellipse disagreements among 137,984 near-boundary samples on main, including both false positives and false negatives. All disappear with the fix. These are deliberately constructed boundary samples; this is not a measured visible gameplay failure rate.

Negative controls distinguish the two causes:

- Unmodified main: both tests fail.
- Restoring powers alone: the original test passes, but the new strict-distance boundary test still fails.
- Exact `d5265f73` and `c913973e` runtime blobs: both tests pass.
- Complete fix: both tests pass on Node 22.23.3 and 24.19.0, and after esbuild 0.28.2 minification.

## Verification

The local source snapshot was reconstructed from the exact merge and verified against its recursive Git tree: all 4,679 tracked blobs matched before edits, with no missing files or drift. Open PRs #1568, #1567, #1566 and #401 were checked before editing. None owns either paint code/test file; #1566 also appends to the shared behavior report, so retain both independent report entries during integration.

- Focused paint suite: 88 passed, zero failed or skipped, on Node 22.23.3.
- Six additional directly related paint suites: 25 passed, zero failed or skipped, on Node 22.23.3.
- Existing plus new strict test: 2/2 on Node 22.23.3 and Node 24.19.0.
- Minified instrumented runtime: 2/2 on Node 22.23.3 with esbuild 0.28.2.
- Production build and deterministic startup budget: passed. Build content hash `5b27aa9a8a866d50f082248c6113724f170a7266f759e502c6f4eb0715ba4bb3`; input hash `fdd7e2e000e45f3220fdd6fe179192cf643d73a6738b200442c50195e861b627`.
- Exact formerly failing shard: 835 tests, 832 passed, 3 skipped, zero failures, on Node 22.23.3 (108/860 test files, shard index 3 of 8).
- Syntax and quick source compatibility checks: passed.

[Validation receipt](inkwave-paint-sampling-2026-10-17/validation.json). Focused checks and one shard are not the entire repository CI; exact published-head CI remains required. No browser, physical-device, native-game parity, or performance improvement is claimed.

## Reproduction

Use Node 22.23.3 and esbuild 0.28.2.

```sh
node --test patches/splatoon3/tests/paint-single-piece-samples.test.mjs
node --experimental-vm-modules --test patches/splatoon3/tests/paint-*.test.mjs
INKWAVE_TEST_SHARD_COUNT=8 INKWAVE_TEST_SHARD_INDEX=3 INKWAVE_TEST_CONCURRENCY=2 \
  node --experimental-vm-modules scripts/check-inkwave-patches.mjs
node scripts/build-inkwave.mjs inkwave-public _site
node scripts/check-inkwave-startup-budget.mjs _site
```

## Splatoon 3 comparison limits

The existing profile references Ver.11.3.0. This correction restores INKWAVE's established numeric ownership behavior under synthetic floor/wall, stretch, seed and growth-time conditions. It adds no unsourced Nintendo frame/weapon/gear values and makes no claim that ancillary paint geometry equals the native game. Native weapon/gear-specific reproduction and physical-game comparison remain unverified.
