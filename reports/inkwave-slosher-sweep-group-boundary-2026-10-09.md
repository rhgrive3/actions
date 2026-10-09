# Slosher sweep group-boundary correction (#258)

## Baseline and public evidence

Baseline: PR #1182 head `2eaec912f4eeaa54982a698e1ac41576b7d574e4`.
Comparison target: Splatoon 3 Ver. 11.3.0, Bucket Slosher, no gear,
stationary ground launch, with the horizontal aim transition on the final
windup tick. Physical Switch behavior has not been measured in this change.

The [original Slosher verification notes](https://wikiwiki.jp/splatoon3mix/ブキ/スロッシャー属#k6aa318b)
describe sampling the yaw difference between the last two windup frames, then
accumulating each incoming glob's group-specific firing interval. Their Bucket
example gives `10 * (4 * 1 + 5 * 2) - 10 = 130` degrees, excluding the first
glob's own increment. The notes explicitly warn that RNG, launch momentum and
vertical angle can make measured spread differ from this model.

The [public pinned 11.3.0 extracted parameter record](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSlosherStrong.game__GameParameterTable.json)
was read directly through GitHub (blob `a7cbb627bd2b7aac9a19aa315eae513479e0390b`).
It contains a zero-count group, then four globs with 1F `AfterOffsetDelayFrame`,
then five with 2F. The last group's `UnitDelayFrame` is separately 4F.
This establishes the input records, not recovered Nintendo execution code.

## Actual residual and repair

The earlier #1144 implementation is already merged. Its remaining runtime
uses absolute birth delay as the sweep coefficient. That produces
`[0,1,2,3,4,6,8,10,12]`, so the second group's first glob advances only one
sweep step from its predecessor and the final angle is 120 degrees.

The corrected per-volley accumulation uses the incoming live group's interval:
`[0,1,2,3,5,7,9,11,13]`. Zero-count groups contribute nothing. This corrects the
group boundary and the source-guided maximum to 130 degrees. It does not
change the real birth schedule `[0,1,2,3,4,6,8,10,12]`, 4+5 projectile count,
70/50 HP, sampled randomness, pitch, launch speed, collision, paint or damage
group ownership. Remote visuals continue to consume the recorded birth velocity.

The accumulator is held only in the existing synchronous volley context. It
starts at zero on each volley and is discarded/restored by the existing
`finally`, including native-emitter exceptions.

## Verification

- The previous runtime fails the corrected interval assertions at glob index 4
  in both left-turn and angle-cap cases. No acceptance tolerance was relaxed.
- 50/50 selected source/native tests pass: sweep, true-birth replication,
  Slosher impact composition, weapon-source contracts, Splatling stage/ink and
  Slosher HUD regressions.
- The new sweep coverage checks actual `WeaponRunner` admission, both turn
  directions, true +/-pi wrap, stationary controls, 30/60/120 Hz fixed-step
  equivalence, real native birth packets, unchanged birth timing, repeat/reset,
  and a partially emitted volley that throws before the next one.
- Two/three-client existing network tests now use positive/negative sweeps and
  verify that each observer preserves packet velocity, without duplicate birth
  or a second source delay.
- Production build `e22fbb989f2a` and unchanged quick provenance/startup budget
  gates pass. All 6 sweep tests also pass against the actual minified emitted
  build. Browser/GPU, physical-device parity and final aggregate PR CI
  are separate, unexecuted gates here.
- Independent review found no blocking evidence or implementation issue and
  separately exercised repeated volleys and exception recovery.

## Five-Issue selection and limits

This pass examined #258, #854, #836, #613 and #653 against active composition,
not only the upstream-locked source. The latter four already have active
ground/air and empty-tank charging, two-stage stream duration, and non-arch
Slosher HUD implementations, covered by the selected passing regressions. No
duplicate runtime edits or new completion claims are made for them.

Current #1183/#1188 actual patches and #1144's merged state were checked before
the #258 residual claim. Other actively owned weapon roots were left with
their existing PRs. This patch remains `Refs #258`: the source-guided angular
model is corrected, while retail calibration and the independent unverified
random-yaw law are not certified by these tests.
