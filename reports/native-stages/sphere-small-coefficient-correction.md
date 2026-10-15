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

## Inherited Curling CI reconciliation (2026-10-15)

Exact-head workflow 38661548961 / job 116183738587 checked out 7d9a07b72216554507beb8b9e44458194815f013 and failed the existing PaintCheckHeight trail assertion (actual -1, expected 2; aggregate 94/95). Baseline 6b and candidate 7d have identical kit-subs runtime blob f7ca9fea93ecbe92b8f9c6a0ead26169a54813d8 and test blob 8fb66b9f0ecfb458d295fe9c5ce40165e33853b0. Their runtime copies the airborne bomb position without invoking the downward surface query expected by that test. The same old runtime is present at base a84a691 and synthetic merge b84b16d.

Restore the existing main runtime blob 6a86c8534445ea761c07d3025a61895d9c93051d unchanged. Its only difference from the old runtime is the source-bounded projection and optional game argument from commit 2d6cf94705cb7729f28b295b863d322b10dc7bd2, verified as an ancestor of current main 4bc51194. No new projection implementation, test weakening, sphere-kernel change, or fixture expectation change is introduced.

Controlled same-dependency fixture A/B reproduced the unchanged assertion failure with both exact 6b/7d runtime bytes; substituting the existing main runtime passed the focused case and all 37 tests in the unchanged 7d kit-subs.test.mjs. These are private source-fixture checks, not a historical full checkout or a 95-test hosted aggregate pass. Fresh exact-new-head CI remains required.

The separate immutable 6b-versus-7d hosted diagnostic remains pinned and unchanged; its evidence must not be relabeled as this new head. Draft, merge HOLD, relay and physical-iPad limits remain.
