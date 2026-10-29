# Two bounded optimized-branch compatibility repairs

Commit `da8fb04c`, based exactly on `9ce5e5f1`, changes only two runtime leaves.
`TriangleWorld.resolveCapsule` restores the original fresh result normal in one
expression. It has no reusable output argument; allocation was present before
`67af77d7`, which introduced shared mutable result state. Ray/sphere APIs have
separate explicit output arguments and retain their reuse. No current production
caller of this TriangleWorld method was found: this is a public API compatibility
repair, not evidence of a live Actor movement failure.

Rainmaker restores the original two square-root radius comparisons and removes
unused `r2`. At the representable boundary, squared distance exceeds25 while
native square root still rounds to radius5. The original comparison admits that
body, rejects the next outside body, and still requires LOS. The depth-leased
blast scratch, visuals, ownerC2, floor argument and native values are unchanged.
No1911 sphere/capsule math, whole files or other optimization was imported.

The two new source regressions both fail on unchanged9ce (0/2), then the complete
native output and Rainmaker files pass9/9. Two affected existing source-contract
cases pass2/2 after replacing the obsolete shared-normal expectation and stale
blast-scratch source matcher with the actual ownership contract. No test or
assertion was removed or skipped, and no unchanged broad suite was repeated.

These are Node24.19.0 CPU/source controls. Raw logs and input hashes are retained
in `receipts.json`. No emitted/browser/device/FPS acceptance is claimed. The
comparison reference remains Splatoon3 Ver.11.3.0; no Nintendo timing, damage,
gear or private authority values changed. Existing MOV-08b/Character holds and
open production authority issues remain. Root owns integration and publication.
