# Skip empty Triple Splashdown fist queries

Parent: `7e4c2e00b421b3a09872a83b9f729f56bfc95885` (PR #1880).

`installCatalogueSplashdown` wraps the shared projectile defense query. Previously, after asking the preceding defense owner for its candidate, it cloned the projectile displacement, measured its length and normalized it even when no Triple Splashdown fists existed. Every ordinary projectile sweep paid this cost throughout normal play.

The implementation adds one empty-list return after the original preceding-owner call and original invalid/ghost guards. It returns the preceding owner's exact candidate object. Nonempty lists run the original code without changing its arithmetic, loop order, callbacks or tie-breaking. The existing live array remains the owner; no cache, persistent flag, lease or invalidation is added.

## Comparison

`compare.mjs` loads the exact parent `catalogue.mjs` with `git show` into one complete production-composed VM, and current source into another. `comparison.json` records the parent source hash and complete timing samples.

- Nine warmed, alternating runs of 500,000 calls to the actual installed defense method, no fists/devices: median **219.95 → 133.95 ms**, a **39.1%** reduction in this local query workload. A prior in-memory exploration measured 235.78 → 132.35 ms. Neither result is a browser frame-time claim.
- 1,000 empty queries: **1,000 → 0 Vector3 clones**.
- 120 actual sustained Shooter `WeaponRunner.update` / `Projectiles.update` frames: **436** defense queries; total Vector3 clones **488 → 52**, removing exactly one clone per defense query. All projectile ordering, coordinates, velocities, ages, lifetimes, seeds and **80 RNG calls** match the parent exactly. The no-collision scenario produces no paint stamps on either side; it is not evidence about new paint masks.

These are native CPU simulation/query measurements with the vendored real Three vectors and installed runtime. They do not establish a Switch or browser performance percentage. No retail behavior, ability, cadence or rendering difference is intended, and no existing unverified retail comparison is marked resolved.

## Regression coverage

The new `empty-fist-defense.test.mjs` covers absent/null/empty lists, zero clones, preceding native-candidate identity and single invocation, active fist damage/query inertness, nearer candidates and exact ties, real activation/87F retirement/clear/repeated activation, and real sustained projectile sweep reachability.

Before editing source, an identical in-memory guard passed **43 existing tests** across `catalogue-integration`, `kit-defense`, `kit-big-bubbler-blaster-contact`, `triple-splashdown-presentation`, `triple-splashdown-impact-vfx` and `triple-splashdown-network`. These retain actual kit arbitration, ghost/owner authority, damage, visual lifetime, cancellation and repeated-activation checks. The new three tests also pass on current source and on a fresh minified build, contentHash `83772a6fa910e158b9f1b139d6c187a840b73ec24cd7be043a7bf556530ed898`. Production build, startup budget, quick patch compatibility and source migration audit pass.

```sh
node --experimental-vm-modules --experimental-global-webcrypto --test patches/splatoon3/tests/empty-fist-defense.test.mjs
node --experimental-vm-modules --experimental-global-webcrypto reports/empty-fist-defense-20261026/compare.mjs
INKWAVE_BUILT_SITE="$PWD/_site" node --experimental-vm-modules --experimental-global-webcrypto --test patches/splatoon3/tests/empty-fist-defense.test.mjs
```

The benchmark restores all instrumentation and normalizes only cross-VM Array prototypes for snapshot comparison; numeric values and ordering remain exact. It reads the fixed parent commit and never edits source.
