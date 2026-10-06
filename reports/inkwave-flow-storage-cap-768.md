# Inactive Turf Flow storage ceiling (#768)

Baseline main: `3d8a48d37ea5d6206e4f4185fa4a8229ae1c6977`.
Claim: https://github.com/rhgrive3/actions/issues/768#issuecomment-6007756690

## Scope and evidence

The [community Flow verification table](https://wikiwiki.jp/splatoon3mix/検証/イカフロー#kdd8334c), read 2026-10-06, describes a100fp activation threshold, a200fp inactive storage maximum, and the requirement to splat before activation. These are community verification values, not newly extracted Nintendo parameters or a new Switch measurement. The table separately gives different Tricolor thresholds; this patch does not add that mode.

The existing runtime normalizes100fp to threshold3. The new profile field `flow.progress.referenceCap = 200` therefore produces `200 * 3 / 100 = 6`, using the same scale as existing decay and death losses. The numeric-status mirror is regenerated with an explicit non-extracted/calibration status. No unrelated award weight, duration, extension, AP or damage value changes.

Before this correction, ten native Turf awards of1000 area each stored score30 without activating. After60 seconds of existing decay that bank remained24.525; a later splat activated Flow. With the200fp storage ceiling the same sequence stores6, decays to0.525, and a later one-point splat remains below threshold. Existing area-to-point and award-weight calibration is not asserted to be complete by this test.

`awardFlow` caps inactive gains before the existing splat-only activation check. Its optional cap switch lets the installed Actor/event path apply the reference ceiling only when `G.match.mode === 'turf'`. Custom Boss, Range and absent-match tool contexts retain their prior accumulation behavior. Active duration/extension returns before the new cap logic. Profile configurations without the new ceiling also retain the previous helper behavior.

No event producer, replication path, victim/attacker admission, assist ownership, turf statistic, special gauge, decay or death owner is replaced. Pending broader Flow PRs remain separate.

## Verification

- New8 plus existing Flow progress/lifecycle12 source tests:20/20.
- Actual emitted runtime and Actor/event tests:8/8.
- Boundaries below/at/above activation threshold, cap6, multiple gain types, and scaling at thresholds3/10/100.
-30/60/120Hz fixed-clock decay from the cap, compared with the executable no-cap control.
- Existing normal/environment death losses from the capped value; active extension remains independent.
- Native Turf `addTurf` keeps statistics/special credit while capping only Flow. Death→respawn retains the reduced score, and direct new-battle reset clears it.
- Boss, Range and absent-mode controls keep the prior uncapped score30.
- Build `77b4fef10365ad5f5d1bd7bcf53fe501826863a9f224017e48d5efd58149bc40`.

Combined CI/browser acceptance belongs to the fixed shared batch with #780. No physical-device, multiplayer transport or original-game pixel equivalence is claimed from these controlled tests.
