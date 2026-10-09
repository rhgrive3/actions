# Weapon evidence recheck and Slosher impact composition repair

Date: 2026-10-09 UTC. Baseline: PR #1182 `12be2542f4e858221267c6c4afe894da15f4db58`.
Reference target: Splatoon 3 Ver. 11.3.0, stock Bucket Slosher, no gear changes.
This report distinguishes an INKWAVE composition defect from unverified retail
probability and interpolation models. No Issue is closed on this report alone.

## Confirmed and repaired: #1011 / #1140 impact-paint composition

The build adapter already replaces native Slosher landing paint with
`fidelitySlosherImpactPaint()`. That owner selects the first/after record,
uses the fidelity profile's `worldUnitsPerSourceUnit`, and applies the existing
high-drop scale. The installed `_impact` wrapper then replaced its first
`G.paint.splat` result again, using `slosherImpactPaintSource()` with a hardcoded
0.2 conversion and no high-drop scale.

The 0.2 notation in the [parameter glossary](https://wikiwiki.jp/splatoon3mix/検証/パラメータ情報/メイン)
is in test-range line units, not an independent INKWAVE world-scale calibration.
The project explicitly uses 1 WU/source unit for the fidelity profile. A second
fixed conversion changes both the radius and near/far selection.

Native reproduction before the repair: emit a full nine-glob volley, take the
first live unit's first glob, and invoke its actual `_impact` at XZ distance 5
and zero downward drop. The configured source radius is 4.44 WU, but the native
paint call received 0.768 WU: it had selected the far 3.84 value after applying
0.2 to the distance anchors, then multiplied the width by 0.2. Raising the
launch point relative to contact could no longer affect that overwritten stamp.

The repair removes the second global-paint wrapper. One source helper now takes
an explicit world scale and supplies the existing native paint owner. This
restores the configured first/after-unit widths and the existing high-drop
multiplier exactly once. Damage, trajectory, collision, yaw RNG, foot paint,
source profile numbers, and the current interpolation/decay equations are not
changed. The global paint method is never swapped during an impact callback.

## Public source verification

The [pinned public Bucket Slosher table](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSlosherStrong.game__GameParameterTable.json)
was read directly through the GitHub connector at commit
`7280ff9cde8bb1c5dcef46c700c326471584d2e6` (public blob
`a7cbb627bd2b7aac9a19aa315eae513479e0390b`). Every member of its
`GameParameters.UnitGroupParam.Unit` matches the active profile, including
zero-bullet unit 0 and the two live units' first/after paint records. The
regression uses the live emitted nine records, not the unused unit 0.
The JSON records parameter values; it does not contain gameplay sampler or
interpolation function bodies.

## Unresolved semantics

- #940: the existing maximum-envelope fix remains. PR #1188 is separately
  developing a calibrated distribution; its actual diff was checked to avoid
  duplicate implementation. Its published audit does not establish Nintendo's Heavy Splatling joint PDF. No probability change here.
- #1022: the current Japanese parameter glossary explicitly leaves
  `RandomRotateYBias` unknown. The general deviation draft also says normal
  weapon bias never exceeds 0.5, whereas the live Slosher source carries 0.65.
  The [general deviation draft](https://splatoonwiki.org/wiki/User:XarrotD/Data_Explanation#Deviation_Calculations)
  and the glossary do not establish that Slosher's differently named field
  uses the same law. The existing labelled calibration is not promoted to
  source-verified semantics and is not replaced with another guessed formula.
- #498: the [pinned Roller table](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponRollerNormal.game__GameParameterTable.json)
  records 20F/30F start, 50F end and 0.6 width endpoints. The
  intermediate age-width curve is not specified by that parameter table.
- #1140: reconnecting the already-present paint drop scale repairs composition;
  it does not validate the collision/visual exponential tail or its shared use
  of paint parameters. Those models remain explicitly provisional.

## Verification

- Negative control on the unchanged baseline: native nine-glob impact test
  fails at 0.768 versus 4.44, before editing the runtime.
- Every live first/after glob: near/far anchors crossed with zero/source-end
  drop; exactly one landing stamp; stored damage, velocity and radii unchanged.
- Paint callback identity, exception propagation, and ghost non-paint controls.
- Full production adapter/runtime: all nine delayed births complete and the
  actual impact rows agree at 30/60/120 Hz rendering over the fixed 60 Hz clock.
- Pure helper tests retain explicit 0.2-scale coverage and add configured-scale
  1 and 2 anchors, so the old unit example is no longer a hidden runtime default.
- Production build `d76fd8324faa` passes; the three new native tests also pass
  against that emitted minified build. Quick upstream/provenance and unchanged
  startup/cache budget gates pass.
- Focused Slosher source/native suite: 97/97 passed; no skips or failures.

No browser/GPU rasterization or physical Switch measurement was performed.
Full exact-head CI remains the integrating parent's responsibility.
