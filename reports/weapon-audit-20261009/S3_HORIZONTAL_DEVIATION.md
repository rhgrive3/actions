# Splatoon 3: horizontal vs vertical shot deviation (PR #1188)

**Root cause:** The INKWAVE scalar spread adapter formerly constructed a 2D circular cone for Shooter, Blaster and Dualies. The cone's random azimuth injected an unsourced *vertical* perturbation and reduced the effective horizontal spread, changing hit probabilities, muzzle paths and paint.

**Independent S3 source:** Kanamoji, 4 Dec 2024, [Splatling range study](https://note.com/kanamoji_1027/n/n20cb3c3fb251), distinguishes horizontal bullet deviation (also present for shooters) from the *Splatling-specific* vertical deviation and initial-speed randomization. The [Splatling mechanics study](https://note.com/kanamoji_1027/n/n4de8b03535de) also distinguishes both axes. The [S3 verification wiki](https://wikiwiki.jp/splatoon3mix/ブキ/スピナー属) lists separate horizontal/vertical swerve and bias for Splatlings. This is community research rather than decompiled S3 gameplay code.

**Change:** `spreadWeaponRound()` now samples `magnitude = Stand/Jump_DegSwerve × biasQuantile(u, bias)` and uses the second legacy draw for a ± yaw sign for Shooter/Blaster/Dualies. The direction rotates about world up, so aim elevation is unchanged. Both legacy spread draws are preserved, with no new random calls, seed changes or wire schema changes. Post-slide 0° remains a no-RNG path. Splatling keeps the existing independent PitchDegSwerve path.

**Tests:** Native composed emitter cases `shot-cone-hitbase.test.mjs`, `issue-883-dualies-scalar-spread.test.mjs` are now required to verify horizontal full endpoints, vertical conservation, both muzzle origins, jump spread, steep sightlines, zero-spread state, RNG draw counts, owner-to-ghost wire fidelity and 30/60/120Hz trace equality. The code also passed existing ShooterAccuracy, Blaster jump spread, native Splatling spread, and #608 aim composition tests.

**Scope limitation:** Exact S3 source-code yaw-axis convention at steep elevation is not recovered; this is a grounded horizontal-only conversion to eliminate a demonstrable 2D-cone discrepancy, **not** proof of all retail 2D hit distributions or body-collision parity. Follow-up remains needed for measured retail impacts and Splatling joint horizontal/pitch PDF. Do not change native physics/range/damage to make tests pass.


## Splatling per-axis RNG correction (2026-10-10)

The former `spreadWeaponRound()` branch also modeled Splatling scatter as a common radial sample `u` plus a shared circular azimuth `φ`: `yaw ∝ cos(φ)·bias(u)`, `pitch ∝ sin(φ)·bias(u)`. This introduces **unjustified horizontal/vertical coupling** and suppresses each axis's marginal angular magnitude.

The [S3 Splatling study #10 (2024)](https://note.com/kanamoji_1027/n/n4de8b03535de) instead describes signed horizontal deviation `θx = sgn(2u−1)·Stand_DegSwerve·|2u−1|^log₀.₅(Stand_DegBias)`, with separately parameterized vertical offset `θz = sgn(2v−1)·PitchDegSwerve·|2v−1|^log₀.₅(PitchDegBias)`. The separate parameters in S3 v11.3.0's `WeaponSpinnerStandard` are horizontal **3.3°/0.3** and vertical **1.6°/0.4**.

The replacement uses two signed axis-specific uniform draws and Euler yaw/elevation offsets. Exactly two spread RNG draws remain, preserving the existing speed/seed draw count, transport event shape, and network replay. The real native Splatling tests continue to check charge state, firing cadence, projectile speed, impact paint, 30/60/120Hz and owner/ghost identity.

**Limit:** The independent draws and Euler composition match the published S3 modeling convention, but exact Nintendo PRNG call order and joint-axes coupling have not been recovered from a retail binary. Do not equate local statistical correctness with proof of the original game execution.
