# Booyah cadence review candidate (source stage only)

Base: `726e338ac256ba9609086ce65e25a68ddd99df85`.
Branch: `inkwave/booyah-cadence-candidate-20261023`.

Only assigned Booyah warning rotation, suction/scatter, flight stars, and fully charged stars change. Warning rotation uses its original angle plus presentation age at 1.2 rad/s. Particle opportunities retain fractional 60 Hz carry, original probabilities/arguments, and at most two catch-up trials. Phase changes clear fractional carry. No gameplay, native 40F/80F clock, damage, paint, gauge, shader, geometry, Zipcaster or Wail changes. The parent's separate charge-orb `rec.t * 3` change is outside these hunks and must be retained during integration.

At 30/60/120/144/240 Hz, raw and installed production-composed fixed-phase tests measure 1.2 rad/s and 60 opportunities/s for each assigned particle stream. Frozen angles were 0.6/1.199999/2.399998/2.879997/4.799996 rad/s. The fixed-phase one-second diagnostic deliberately holds native frameCount at 20, and is not a one-second gameplay hold phase. Seeded 60 Hz emission arguments and RNG call order match the frozen source exactly.

Actual native launch plus explicit terminal-hook tests burst at frame 40 (0.666666667 s), retire at frame 80, preserve 40 center and 21 far 3.3-damage calls, HP 868/930.7, six paint-growth frames to radius 13.5, gauge 0, 62 paint calls and five events. Hit/paint/event sequences and gameplay RNG state match with VFX off/on at every tested rate. Readiness and collision/display/paint use controlled fixture setup; this is not browser or Nintendo verification.

Known limits: finite native lifetime suction/scatter totals are 38/38 at 30 Hz versus 39/39 at other tested rates because of boundary sampling. Unchanged particle aging produces live hold spark totals 58/60/65/65/63. No retroactive phase particles are added. Twenty-four simultaneous Booyahs plus repeated stalls stay within every pool capacity; final sparks 480/900, puffs 144/520, 24 ribbons, 77 aggregate retained shapes, 12 draws, zero director errors; mesh/geometry/material identities are retained.

Validation: 47/47 source/composed/regression tests passed; quick compatibility/reference-11.3.0, syntax and patch-whitespace checks passed. Existing tests remain unchanged. Tests cover all five rates, fractional jitter, phase 39/40/41, full-charge threshold, zero/invalid/large dt, cancellation/reactivation, same-object seed reuse, clear/restart and pool bounds.

```sh
node --experimental-vm-modules --experimental-global-webcrypto --test patches/splatoon3/tests/booyah-vfx-cadence.test.mjs patches/splatoon3/tests/booyah-vfx-production.test.mjs
```

Initial failures corrected before the final run: Float32 tolerance in the baseline assertion; a candidate cleanup bug from primitive clock fields in retained-handle `r.d` (clock fields moved onto the presentation record); RNG accounting that included actor construction; and a native hit assertion that included an existing zero-damage terminal call. Original private artifacts and all failing logs are preserved privately and are not published here. The unchanged broader regression emits an optional-source-motion VM dynamic-import diagnostic while still passing.

Runtime SHA-256 before: `fd906e61947494f8b5395f548a0b1d174afd6580ba3664da454445ee0a31f55d`.
Runtime SHA-256 after: `73b1a5712706f149f5071c196e1d897661e254e2f8877b290988057dc0697cf4`.
Runtime Git blob before: `01911bf47b140ecd603d0080d065b280b37295df`.
Runtime Git blob after: `ec05ebc0bc6ed0bdfc1a84348ed2409d43a7a1fe`.

This branch stores a review candidate only. Final/minified build, browser/GPU playback and independent retail-media visual acceptance remain pending with the parent. No direct retail media was attached to this worker; no Nintendo particle-density or frame-by-frame fidelity claim is made. No Nintendo assets, secrets, private raw source snapshots or failure logs are included in the changed files. No PR or main integration is requested or claimed.
