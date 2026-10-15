# Bounded quadratic coefficient correction

Base: `6b186c7f1ba33956b2e86a29a8ea3a58b7544e50` (PR1419, still Draft).

## Change

Only `quadraticEntry`'s `abs(A)<1e-14` and `abs(B)<1e-14` decisions become exact zero checks. A small nonzero quadratic must not be replaced by an unrelated linear equation. The existing stable q-based roots, interval checks, sphere tolerance, geometry, BVH, dynamic priority and simultaneous-contact handling are unchanged.

The new `patches/native-stages/tests/sphere-triangle-small-coefficients.test.mjs` adds three ordinary, nondegenerate-triangle regressions: two winding variants of a false vertex hit and a prematurely reported edge contact. Candidate3/3 passes; the original cutoff fails all3. Expected misses follow a negative vertex-distance discriminant, and expected edge contact follows an independent linear distance equation. No retail model/source asset is added.

Run:
`node --experimental-vm-modules --test patches/native-stages/tests/sphere-triangle-small-coefficients.test.mjs`

## Evidence and scope

- Selected existing native catalogue/projectile source tests:18total,14pass,4named optional skips,0fail. Skips: recorded Bluefin Luna source fixture and original Flounder admitted-source30/60/120Hz. This selection is not the historical21-test run.
- Separate original decimal corpus:3120cases; correction passes with the previously documented28 binary-tangent adjudications. The original oracle and adjudication are retained separately and unchanged.
- Independent coefficient oracle:8400cases, scale1e-30..1e30, exact binary coefficients evaluated by110-digit Decimal.from_float. Candidate0fail versus original122fail. Independent review recomputed all expected values and reran all8400, finding0mismatches/failures;18 additional near-linear scale checks pass.
- Unchanged Bluefin source BVH: tiny synthetic false hit becomes a miss,33candidates on both;49 normal-scale queries retain exact results/candidate counts; six source input buffers unchanged. These are source component checks, not natural firing acceptance.
- Independent source-buffer inspection:1,588,554 finite coordinate values, maximum absolute150.5102996826172. This observed source bound is not a universal caller-domain guarantee.
- Same-process warmed Node timing showed no observed regression; no hardware/FPS or guaranteed speedup claim.

## Limitations

Direct discriminant arithmetic still has extreme IEEE limitations. For A=s,B=-s,C=.1875s the correct entry is.25: s=1e-200 returns.375 from underflow and s=1e200 returns Infinity from overflow; s=1e±150 returns.25. These pre-existing limits are outside the bounded oracle/observed source scale. Exact-zero branching does not recover rounding lost when constructing coefficients or resolve every near-tangent discriminant cancellation. Finite-input guards do not formally cap arbitrary caller coordinates. A scaled-arithmetic redesign requires separate scope and review.

Emitted validation, final required CI, full21-stage source/cost qualification, final Game admission, visible projectile/paint, five-mode network and physical iPad gates remain open. Keep Draft and merge HOLD. No shared CI rules or acceptance thresholds are changed by this patch.
