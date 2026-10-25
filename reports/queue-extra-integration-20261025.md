# Additional optimization queue integration — 2026-10-25

PR #1870, starting head `8e539eac1e5fe4a6412d3e5852d7f5eaa5d0c1da`. This follow-up adds **107 queue fixes** to the existing PR. Main is not merged. Seven concurrent owners, including the integration owner, compared current queue reports with the existing PR and other open branches before implementation.

## Queue reconciliation

All **513 active optimization titles present at the start** have an explicit [per-row disposition](queue-extra-reconciliation-20261025.json):

| Result | Rows |
| --- | ---: |
| Implemented by this follow-up | 107 |
| Already present in the existing source/PR | 292 |
| Separate open PR owns the implementation | 2 |
| Conditional evidence still required | 83 |
| Not adopted, with correctness/performance reason | 28 |
| Excluded by earlier user instruction | 1 |

Implemented means included in this PR follow-up, not deployed, merged or measured on an iPad. The conditional rows remain unresolved. No rejected or incomplete proposal is marked fixed.

| Additional workstream | Rows |
| --- | ---: |
| Weapons, sub/special presentation and FX | 28 |
| Motion, face, hair and outfit construction | 13 |
| UI, input, teardown and Decor | 16 |
| Network, protocol and relay | 7 |
| Ranked modes | 11 |
| Audio | 7 |
| World construction and native array ownership | 7 |
| CI input coverage, sparse checkout and account gating | 18 |

The linked `queue-extra-*` workstream and residual reports contain the individual paths, exact tests, counterexamples and limits. The earlier 329-row ledger remains historical evidence; this new record describes the active queue at this request's start.

## Final behavior

Same-invocation arithmetic and immutable kernel reuse preserve the original operation order, boundaries, RNG streams and ownership. Tests execute real composed code and vendored Three.js geometry rather than duplicate toy implementations. They include 30/60/120Hz traces, source-backed mesh attributes, getter order, synchronous reentry, constructor failures, signed zero/NaN and malformed-input controls. Two allocation-removal proposals were measured slower and withdrawn. Proof-tail and single-paint elision retain their original copies after executable admission/wire counterexamples.

Direct-owned outfit, PropKit and ink-collision changes are authored in their real modules. Build-only transforms are registered in composition, input identity and the transformer exclusion set. All 24 fixed upstream-lock inputs retain their original hashes. Existing menu teardown placement and mixed-NaN Decor broadphase regressions were corrected during integration.

A production build check caught a raw split Three core returning to the staged dependency graph after the slim bundle had replaced it. Production now avoids staging either full split input at all, reads/composes them directly for the same bundle, and retains the normal diagnostic/no-shake path. The full-site regression checks absence from disk, artifact identity and eager hints while executing the emitted UUID implementation. This prevents an unnecessary **1,458,355-byte** raw module from returning to initial loading; it does not claim an equivalent device-memory reduction.

## Final local verification

The [verification receipt](queue-extra-verification-20261025.json) records exact scopes and the final production hashes.

- Additional combined source-loaded suites: **88 passed**, zero failures/skips.
- Existing full specials scope on the final runtime: **83 passed**, zero failures/skips. Node's initial default-heap termination was resolved with an explicit 6GiB test heap; no assertions were bypassed.
- Ownership/input/Pages/CI contracts: **31 passed**, zero failures/skips.
- Real production Three bundle and full-site UUID checks: **2 passed**, zero failures/skips.
- Production minified build, startup budget, Direct-Source audit, workflow YAML parsing and diff checks pass. Final artifact inventory has **2,152 entries**, with **1,463 declared source inputs**. The raw split core is absent.

These scopes overlap and are not summed into an inflated unique test count. Earlier workstream scopes and optional unavailable external-fixture skips remain separately recorded.

Chromium installation did not produce a runnable browser in this environment, so no new rendered-image comparison or iPad/Safari/GPU/FPS claim is made. Splatoon 3 Ver.11.3.0 remains the existing behavior reference; scoped INKWAVE before/after equality is not retail-device equivalence. No new automation was created. Actions were not manually dispatched or rerun; the single final push uses `[skip ci]`.
