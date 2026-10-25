# Trizooka native orbit delta — fresh-model review

Base: PR #1876 head `6dacd47095352cfd600f9c83012c71a2f298a460`. The accepted runtime change is in `trizooka-collision.mjs::kitTrizookaOrbitDelta`. The public `kit-trizooka.mjs::trizookaOrbitOffset` is restored byte-for-byte to that baseline.

## Rejected initial candidate

The previous scalar-only selector rewrite reduced source object-literal executions from seven to two, but the root's local emitted-selector run did not demonstrate a timing benefit (27.2857 → 28.0481 ms per 200,000 calls). V8 may eliminate temporary objects already. Source construction counts are not physical allocation evidence. That rewrite is **not accepted** and is removed by this follow-up. Its historical measurements must not be described as a current optimization.

## Native delta change

Native integration queries current and previous orbit offsets around the same centreline. Both queries normally use the same velocity axis, and originally normalize that axis and its perpendicular basis separately. The new native delta shares only that numerical basis within the current synchronous call.

- `Math.hypot` calls fall **4 → 2 per stable-axis native step**. Both velocity observations and the two sine/two cosine evaluations remain.
- Current and previous age/radius/phase expressions are evaluated in the original order. Each offset's original two products are computed first and then subtracted; the delta is not algebraically factored, which would change rounding.
- Velocity and fallback yaw are sampled again for the previous query. If a custom observation changes the axis, a separate basis is built. Reuse requires numeric components with `Object.is` equality; signed zero remains distinct, and object-valued components preserve all original numeric coercions.
- Zero-time/identity admission, return values, position updates and `s3OrbitApplied` are unchanged. No persistent cache, public handle reuse, clock, native centreline, collision, damage, paint, volley schedule, network row or authority rule is added or changed.

Independent fresh-model inspection checked the original functions and current native owner before testing. Runtime Git blobs after that review: `trizooka-collision.mjs` `ef32f33c9b92e338986d2031ef41b8721593ab92`; unchanged public selector module `2bb69feab1041a2c0e1441fce494e2ac00ea2f0a`.

## Correctness

- New source oracle: **7/7 PASS**, no failure/skip. Frozen public selector and native delta are pinned by SHA-256. Tests compare actual exported candidates with the originals at 30/60/120 Hz, three lobes, moving axes and ghosts; 10,000 seeded public selector cases; thresholds, NaN/infinities/signed zero and live calibration; native admission/control return values and property observation order; custom velocity mutation and object-valued component coercion. The public selector still returns fresh output/axis objects.
- Final existing `kit-trizooka.test.mjs`, `kit-trizooka-native.test.mjs`, `kit-trizooka-geometry.test.mjs`: **85/85 PASS**, no failure/skip, Node 24.19.0 with VM modules, file concurrency one. These cover native firing, flight, world sweep, damage/paint, ghosts and pooled reuse.
- A normal esbuild-minified candidate build passed. `git diff --check` and syntax checks passed. This lane performed no Actions, deployment, or remote writes.

The parent owns final integrated build/browser acceptance. This lane's native numerical/regression evidence does not replace it.

## Paired timing

Timing must select **both actual normal-build modules**. Both are loaded as ESM in the same Node realm, with identical real Vector3 fixtures, no instrumentation in timed functions, consumed results, five warmups and nine alternating 200,000-step windows. The fixture authenticates both relevant emitted files against manifest input/artifact seals and immutable revision copies. A baseline selector compiled with `new Function` is not allowed for timing.

```sh
BENCH_TRIZOOKA_ORBIT=1 \
KITS_TRIZOOKA_BEFORE_MODULE=/absolute/before/patches/splatoon3/runtime/kit-trizooka.mjs \
KITS_TRIZOOKA_MODULE=/absolute/after/patches/splatoon3/runtime/kit-trizooka.mjs \
node --test --test-reporter=tap patches/splatoon3/tests/special-kits-orbit-scalars.test.mjs
```

The first stronger-delta run before the final non-numeric-component guard measured 130.0260 → 83.5114 ms (~35.8%), with exact outcomes. That is provisional history. The final guarded runtime was remeasured in the parent's clean serial slot: **149.9975 → 95.7501 ms per 200,000 complete native steps (~36.17% lower median)** across nine alternating runs. All seven correctness cases plus the timing case passed against both actual emitted modules (8/8, no skips/failures). Raw samples and authenticated artifact identities are in `specials-parallel-kits-20261025-benchmark.json`; do not substitute the provisional result for this final revision. Local native-delta CPU timing is not whole-game, GPU or real-device FPS evidence.

## PR overlap, reproduction and retail scope

Open PR #1870 at `8e539eac1e5fe4a6412d3e5852d7f5eaa5d0c1da` changes Trizooka volley spread/basis setup. It does not contain this later native current/previous delta sharing. Its separate Ink Vac/Bubbler work is not duplicated.

Reference remains Splatoon 3 Ver.11.3.0 and the pinned WeaponSpUltraShot receipt in `kit-trizooka.mjs`. The extracted 1.0 end radius and 10F transition, and the existing explicitly calibrated start radius/angular rate/three-lobe interpretation remain unchanged. Reproduce by activating Trizooka and firing all three actions at matched ticks, including the stagger, brake/free flight and remote ghosts. No new Nintendo frame values, retail trajectories, original-game pixel match, Safari/iPad or physical GPU/FPS result is claimed. The parent links this record from the shared behavior comparison.
