# Additional weapon and FX queue — 2026-10-25

Baseline: PR #1870 head `8e539eac1e5fe4a6412d3e5852d7f5eaa5d0c1da`.

Implemented **22 additional queue rows**. The [per-slug index](queue-extra-weapons-fx-20261025.json) lists changed paths, excluded duplicate/open-PR work and every retained proposal. Row count is not an independent optimization or test count.

## Final behavior and ownership

The change preserves existing simulation rates, sub flight/ground retention, contact order, paint/radius/seed values, owner authority and packet formats. Pinned raw upstream snapshots remain unchanged; the authored Direct-Source owner `inkwave-public/src/game/inkCollision.js` receives its endcap change directly. FX rewrites use `queue-extra-weapons-fx-adapter.mjs`; patched runtime modules retain their ordinary production ownership.

Hot paths now share fixed-step drag/family tables, existing same-draw Roller ages, Float64 fallback sines and membrane bounds; lazy retirement arrays avoid survivor-only allocation. Booyah no longer constructs an unused hit list. Native Sprinkler skips identity snapshots only for explicitly different current envelopes; unknown/legacy forms retain the original path. Ribbon chronological references update only when ring structure changes; geometry/upload topology is retained. Torpedo/Fizzy colors invalidate on structure changes while matrices still update. Explosher scalar attributes avoid tuple/closure allocation. Empty FX droplets keep the phase advance and instance count reset. Camera updates retain real Three.js world/inverse matrices. ScreenFX avoids unused speed norms.

## Local verification

- New source-loaded exact comparisons: **13 tests pass**, no failures/skips. Fixed/variable/nonfinite drag, rotation/model arguments, material release, Wave Breaker callbacks/boundaries, Booyah hit/LOS/object order, real vendored camera matrices, 30/60/120Hz Ribbon typed arrays, Sprinkler replacement/legacy gate, seeded ScreenFX prefixes, Explosher attributes, Torpedo/Fizzy slots, collision query/output values.
- Existing all-subs, kit-ink-vac, projectile-visuals and Ribbon scope: **103 tests pass**, no failures/skips.
- Existing collision, projectile shapes, Wave Breaker expiry and Ribbon follow-up: **19 tests pass**, no failures/skips. These overlap the earlier scope and are not summed as unique coverage.
- A monolithic `all-specials.test.mjs` attempt hit Node's default ~2GiB heap limit (78.8s). Parent subsequently passed the full file **83/83** with `--max-old-space-size=6144`, before the last six residual hoists; it plans latest-source revalidation. After those six hoists, the selected actual Wave Breaker/Booyah/AoE scope passed **11/11**, no failures/skips (15.59s). Memory-limit termination is not an assertion failure or a passing run.
- Source parser/anchor and diff checks pass locally. No Actions dispatch or rerun was requested.

Commands:

```sh
node --test --test-concurrency=2 patches/splatoon3/tests/queue-extra-weapons-fx.test.mjs
node --experimental-vm-modules --experimental-global-webcrypto --test --test-concurrency=2 patches/splatoon3/tests/all-subs.test.mjs patches/splatoon3/tests/kit-ink-vac.test.mjs patches/splatoon3/tests/projectile-visuals.test.mjs patches/local-quality/tests/queue-30-ribbons.test.mjs
node --experimental-vm-modules --experimental-global-webcrypto --test --test-concurrency=2 patches/splatoon3/tests/weapons-collision.test.mjs patches/splatoon3/tests/s3-projectile-shapes.test.mjs patches/splatoon3/tests/special-wavebreaker-expiry-1130.test.mjs patches/local-quality/tests/queue-30-ribbons.test.mjs
```

## Boundaries

Splatoon 3 Ver.11.3.0 remains the existing reference target; these arithmetic/ownership tests establish scoped INKWAVE before/after invariants, not Nintendo-hardware parity. Local numeric/Three.js tests do not establish iPad Safari FPS, GPU time, energy or full multiplayer equivalence. The five visible cadence proposals remain pending rather than changing emissions under an exact-output optimization claim. Harmonic trig and mutable viewer/snapshot/job caches remain evidence-dependent. No main merge or hosted CI result is claimed here.

## Final residual reconciliation

The final FIRST18 residual pass read each current queue report and checked the composed source. It adds **six further implemented queue rows** (28 new weapon/FX rows across the two reports): marker scalar scan, discarded Dualies snapshot, static sheet attribute lists, exact small-integer bubble factors, coincident squid capsule endpoint, and band-hit integer/constant bands. [Residual index](queue-extra-residual-weapons-20261025.json) records six implemented, two already in PR, one rounding-unsafe proposal declined and nine still pending evidence.

`queue-extra-residual-hoists.test.mjs` passes **six** exact source-loaded/real-Three tests. Together the two focused new files pass 19 tests; their domains differ but are still not described as whole-game/device coverage.

Additional existing packet/combat/catalog-vfx/Dualies files passed **32/32**, no failures/skips (17.92s), after the six final residual hoists.

Final ownership correction: the squid capsule endpoint optimization is authored directly in `inkwave-public/src/game/inkCollision.js`; the build adapter has no rewrite for that Direct-Source owner. The test preserves the original capsule/sphere functions as its pre-change oracle.
