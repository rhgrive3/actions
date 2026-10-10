# Splatoon 2 (5.5.0) → Splatoon 3 (11.3.0) extracted field comparison

This report is **not** a game-code decompilation or proof that S2 and S3 execute the same formula.

### Reproduce

`node scripts/measure-splatoon2-3-lineage.mjs` prints per-field source, numeric scale, normalized S2 value, explicit S3 value and one of **same-extracted-value**, **changed-extracted-value** or **omitted-s3-default-unknown**. Its 25 assertions run in `node --test patches/splatoon3/tests/splatoon2-3-lineage.test.mjs`. Sources are committed alongside the S3 11.3.0 refs, so the checks are offline and reproducible.

### Source pinning

- S2 v5.5.0: `Leanny/leanny.github.io/data/Parameter/550/WeaponBullet/{ShooterNormal,SpinnerStandard,TwinsNormal_2,BlasterMiddle_Burst}.json`, exact copies committed under `patches/splatoon3/reference/splatoon2-550`.
- S3 11.3.0: seven existing pinned `Leanny/splat3` parameter tables, `patches/splatoon3/reference/weapon-audit-1130`; see its `manifest.json`.
- S2 partial decomp `YoshiCrystal9/Blitz_MasterVer22-Decomp` is **v3.1.0**, not 5.5.0 and **mostly stubs** in the game-specific core (`GameBullet.cpp` empty, `BulletRollerCore::paintImpl_KingSquid` empty). It is not proof of S3's missing RNG/ballistics functions.
- `open-ead/sead/modules/src/random/seadRandom.cpp` and `include/random/seadRandom.h` provide a reproducible Xorshift128 algorithm, but there is **no demonstrated S3 weapon call-path** using it; changing the live INKWAVE weapon `Math.random` calls would be speculative and affect network determinism. Not changed.

### Observed same vs changed

| Field | S2 v5.5 value | S3 v11.3 value | Conclusion |
|---|---:|---:|---|
| Shooter splash spacing | 92 × 0.1 = **9.2** | **9.2** | Extracted match |
| Shooter ink per shot | 0.0092 | 0.0092 | Extracted match |
| Shooter ground angular swerve | **6.0°** | **4.86°** | **Changed** |
| Shooter jump angular swerve | **12°** | **11.66°** | **Changed** |
| Spinner splash spacing | 200 × 0.1 = 20 | 20 | Extracted match |
| Spinner ground/jump angular swerve | 3.3° / 7° | 3.3° / 7° | Extracted match |
| Dualies dodge move duration | **16F** | **12F** | **Changed** |
| Dualies dodge ink | 0.07 | 0.07 | Extracted match |
| Dualies dodge distance, easing, extra air glide | S2 has explicit 40 / .95 / 10 | S3 table **omits** corresponding fields | **Unknown S3 default**, not an S2 match |
| Blaster burst collision drop radius | 20 × 0.1 = **2.0** | **2.5** | **Changed** |
| Blaster shot-collision reduced burst radius multiplier | **0.5** | **0.4234** | **Changed** |
| Blaster collision sphere radius | 14 × 0.1 = 1.4 | S3 Middle table **omits** the member | **Cross-generation model**, not verified S3 default |

### Implication for INKWAVE

Use S3 explicit parameters first, S2 data only to generate hypotheses for missing/default-valued parameters, and independently validate simulation-generated ink placement, hit admission and timing. Preserve the independently measured S3 Dualies 5.0 world-unit roll distance; do **not** force historical S2 4.0/16F onto S3 5.0/12F. Similarly, don't change S3 spread angles to S2 shooter spread angles.

This evidence does **not** resolve S3's missing two-dimensional aiming PDF, skin/texture-shaped paint edge, aerial Dualies vertical velocity curve or exact physics integration law. Those remain open; keeping Draft PR #1188 is appropriate.
