# Zipcaster cadence review candidate — 2026-10-23

Review candidate only. Source tests passed; production build, actual browser presentation and retail visual acceptance remain pending with the parent. This is not a completion, retail-fidelity, browser-pass or main-integration claim.

Base: `726e338ac256ba9609086ce65e25a68ddd99df85` (`rhgrive3/actions`). Only `DIRECTORS.zipcaster.frame` is changed in the runtime, plus three focused test/helper files and this report. Bytes outside that frame are identical to the base. Raw `inkwave-public/`, existing tests, other directors, gameplay/physics/damage/paint and zip movement/speed remain unchanged. No new geometry or Nintendo assets are included.

The per-track clock retains fractional native 60 Hz opportunities and admits at most two per callback, dropping stall backlog. Hook probability remains 0.6 per opportunity; zip emits two drops per opportunity; coat drips retain the native ten-frame interval. Beams and ribbons follow render cadence. The existing trail is registered with track cleanup so cancellation/removal ends it.

## Evidence

These are deterministic CPU source/composition measurements, not browser or retail measurements. The clip is not attached to the delegated environment; no direct frame-by-frame visual comparison was performed. Retail particle density is not sourced, so existing 60 Hz calibration is the preservation target.

At 30/60/120/144/240 Hz, fixed-phase RNG 0.25 over one second:

| Recipe | Frozen emission counts in rate order | Candidate counts |
| --- | --- | --- |
| hookFlight | 30 / 60 / 120 / 144 / 240 | 60 at every rate |
| zip | 60 / 120 / 240 / 288 / 480 | 120 at every rate |
| coat | 6 at every rate | 6 at every rate |

Actual composed Float32 birth rows match across all five rates at fixed pose. Fresh composed VMs using the actual presentation PRNG preserve frozen 60 Hz birth hashes, counts and steady load. Actor position/velocity, native phase/timers, HP, special and gameplay seed remain unchanged; observed paint/hit/events/gameplay RNG calls are zero.

17 focused tests and 51 existing VFX/Zipcaster regression tests pass (Node v24.19.0); syntax and whitespace checks pass. Checks cover rate changes, phase boundaries, jitter, invalid/zero/large dt, bounded stalls, missing targets, cancellation/removal/reuse, unchanged parameters and load. The outer Director's existing positive-Infinity clamp remains unchanged; the raw scoped clock rejects nonfinite deltas.

At minimum quality (182-particle pool), two sustained Zipcasters plus a stall peak at 96–100 particles with zero evictions. Eight reach the cap and produce 1,866 evictions over the two-second run plus stall check at each rate; saturation is explicitly retained rather than changing native density. Frozen and candidate steady 60 Hz eight-actor runs both produce 1,920 drops + 96 coat, peak 182, and 1,834 evictions before the stall.

Initial checks exposed unregistered trail cleanup (fixed here), an incorrect zero-eviction expectation under eight-actor overload (corrected to report saturation), and a cross-VM object assertion (normalized in the test). Final tests have no assertion failures. Existing tests emit an optional motion dynamic-import fixture warning; no character work was performed. Original private source and failure logs remain preserved outside this branch.

## Reproduce and remaining gates

```sh
node --experimental-vm-modules --experimental-global-webcrypto --test patches/splatoon3/tests/zipcaster-vfx-cadence.test.mjs patches/splatoon3/tests/zipcaster-vfx-production.test.mjs
```

The composed suite is source-stage and explicitly rejects `INKWAVE_BUILT_SITE`. Parent review must integrate the owned hunk, run the final production build/project checks, validate the built site and browser at all five rates, and perform retail visual acceptance. At 30 Hz two opportunities share the currently observed pose; no past-pose resampling is introduced. No minified build or actual browser acceptance is claimed.

## Exact source hashes (SHA-256)

| File | Before | After |
| --- | --- | --- |
| `patches/splatoon3/runtime/special-vfx.mjs` | `fd906e61947494f8b5395f548a0b1d174afd6580ba3664da454445ee0a31f55d` | `65c351a9a202f31adddf17a9fb1a31cfa4d409e3cff2961387d645c7c7989a03` |
| `patches/splatoon3/tests/zipcaster-vfx-cadence-harness.mjs` | new | `48c79c70fc47879ce739d6409338a5b657f4178248baecd616ad0542d1637d5f` |
| `patches/splatoon3/tests/zipcaster-vfx-cadence.test.mjs` | new | `59cdc9fee6e6561a7142b300cf32ba1b4fe17055345e12ce82cc479c4ade5a7b` |
| `patches/splatoon3/tests/zipcaster-vfx-production.test.mjs` | new | `954f9933a4fb6003359353f246e180fe1806612258f0247872a2c827986e43c0` |
