# Sprite drag byte comparison: compiler-feedback isolation

Full CI on Node 22.23.3 intermittently failed the existing non-finite SpritePool byte comparison. This predates the GPU upload changes: the runtime, frozen oracle and vendored Three files are identical to baseline `e0072a749df0ec8c2d368e383bdf337baa7b44ad`. The original test also matched that baseline exactly. SHA-256 receipts are in [sprite-drag-nan-feedback-20261026.json](sprite-drag-nan-feedback-20261026.json).

Isolated reproduction used Node 22.23.3 / V8 `12.4.254.21-node.57`, installed in a workspace npm cache without changing package metadata. The original unmodified test failed 3 of 30 child-process runs (zero-based runs 15, 19 and 20). Diagnostic-only catch blocks exposed raw Float32 bit differences for `dt=NaN`: the frozen update produced `0x7fc00000`, and the cached update produced `0xffc00000`. Both are NaN; their sign bits differ. Another diagnostic run failed in the renderer color attribute, also printed entirely as NaNs. The raw typed-array assertions correctly rejected these bytes. Diagnostics and raw logs remain in `.ci-scratch/sprite-nan/` in the GPU audit worktree.

The test compiles the two update bodies using `new Function`. Its first two tests repeatedly exercise finite updates, providing compiler feedback before the final one-update non-finite cases. Changing diagnostic execution scheduling affected reproduction. As a diagnostic control, the original file had no failures in 30 runs with optimization disabled, while disabling only inlining still failed 2 of 30 runs. These flags are not part of the fix or CI configuration.

The fix adds inert source comment tags only when the third test creates each baseline/candidate pool. Each `dt` case receives fresh compiled code rather than sharing feedback from the preceding finite workloads. Runtime source, all inputs, 64 particles per case, iterations, exponential call-count expectations, raw Float32 comparisons, renderer values, update ranges, versions and every assertion remain unchanged. The first two optimized finite workload tests remain untouched. No NaN normalization, numeric-only comparison, test skipping, compiler-disabling flag or gameplay change was introduced.

Validation:

- The actual changed test passed all three tests in Node 24.19.0 and Node 22.23.3.
- Fifty independent Node 22.23.3 executions of the actual changed test passed, with no failures. A preceding diagnostic variant of the same isolated construction also passed 50 runs.
- `git diff --check` passed. No application/build files changed, so no new render or gameplay performance result is claimed.

```sh
node --test patches/splatoon3/tests/special-sprite-drag-cache.test.mjs
# Repeat with the CI Node 22.23.3 executable.
```

This is test determinism work for an already present non-finite comparison. It does not establish a new runtime behavior fix or a mobile frame-rate result.
