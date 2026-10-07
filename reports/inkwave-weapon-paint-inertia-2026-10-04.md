# Charger paint and player-forward launch dependency

Scope: #407, #420, #414, #431. Baseline is latest main `83d6b088246f760a34d0921c118482bca7cde777`. Raw `inkwave-public/`, upstream lock, and character/hair files are unchanged. The production build adapter invokes dedicated helpers at the actual paint and final publication points.

## Reference and limits

Splatoon 3 Ver.11.3.0, pinned extraction `Leanny/splat3@7280ff9cde8bb1c5dcef46c700c326471584d2e6`:

- [Splat Charger](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponChargerNormal.game__GameParameterTable.json): impact radius .906 / 2.719 / 3.263; line half-depth 2.73 / 1.56 / 1.56 and overlap .125 / .25 / .34.
- [Splat Dualies](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponManeuverNormal.game__GameParameterTable.json) and [Splat Roller](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponRollerNormal.game__GameParameterTable.json): explicit `spl__SpawnBulletAdditionMovePlayerParam.ZRate = 2`.

Primary bytes were fetched independently and checked against the repository hashes. Verification: 11 files, 143 extracted fields, 14 unknown entries preserved.

These are ratio/dependency corrections, not a Nintendo world-unit calibration. Impact paint retains the old maximum-partial anchor 1.2 WU; line spacing retains the old minimum-charge anchor 1.2 WU. The two distinct spatial quantities are not represented as sharing one new physical conversion. Intermediate values use the existing normalized charge and linear interpolation, and full uses the existing .999 full-state threshold. Exact minimum-release normalization, original interpolation/PDF, final overlapping ink contour, nearest/feet paint and wall drips remain separate. No Switch or browser/GPU measurement is claimed.

Forward contribution uses the actor's horizontal yaw-local Z basis, already used for native Roller launch: `(vx*sin(yaw)+vz*cos(yaw))*ZRate`, applied along that horizontal direction. Pure strafe and vertical velocity contribute zero; backward velocity changes its sign. This is an explicit local mapping of the missing dependency. The extraction alone does not establish Nintendo's exact basis, hidden clamps, pitch transform or post-launch velocity decomposition; those remain unverified. No unsupported X/Y rate is inferred from absent fields.

## Behavioral change and reproduction

- #407: native ground impact formerly used `impactRadius*(.6+.4*charge)`, yielding almost no full-charge discontinuity. It now uses dedicated minimum/max-partial/full ratios, producing full/max-partial `3.263/2.719 = 1.20007356`. The actual impact event receives the same radius. Damage/range/beam/charge gates are untouched.
- #420: actual line splat centers formerly incremented by 1.2 at every charge. New step is `1.2 * depth*(1-overlap)/(2.73*.875)`. Endpoint ratios are .489795918 and .431020408, with full/max-partial .88. The existing first center offset, terminal exclusion, line radius/stretch and guaranteed-feet ownership remain independent.
- #414/#431: actual native `_push` adds player-forward velocity after launch wrappers configure the final base velocity and before `recProj`. Both Dualies hands and all Roller horizontal/vertical/near-group globs participate. A per-object guard cleared in `_new` prevents duplicate inheritance; post-launch movement or weapon switches do not mutate the result. Ghost replay retains transmitted velocity without adding it again. Non-target families and remote actors are excluded.

Reproduce through the real `Projectiles.fireCharger/fireDualies/fireFlick` methods, fixed RNG, ±4.8 WU/s forward and 9 WU/s strafe, yaw 0/.7/pi/2, both hands and both Roller modes. Capture ground paint calls and packet velocities before the first integration tick. Expected forward delta is ±9.6 WU/s in the selected local horizontal basis, not a claim of Switch absolute range.

## Validation

- Full gameplay/reliability gate: 821/821 passed.
- Focused native: 6/6 passed, including the cross-product of yaw/hand/Roller mode and stationary/forward/backward/strafe states.
- Actual production-minified modules: 6/6 passed.
- Production build, upstream compatibility, numeric bindings, primary hashes and diff checks passed.
- Detailed composition, negative-control and remote CI results follow in the PR conversation. A source-level composition is not certification of all existing PRs or of physical Switch/iOS behavior.

## Existing PRs / integration

All current Open/Draft PR patches and the four Issue comment threads were audited before claiming. PR64 supplies ballistic trajectories and growing Roller colliders; PR318 supplies action gates and Dualies collider snapshots; PR331 supplies Charger line footprint shape. None implements these four roots. Do not duplicate any of their radius/gate/footprint producers.

The launch helper deliberately runs inside native `_push`, after PR64's emitter and `_push` initialization, so finalized velocity is recorded once. The new Charger center-spacing anchor is distinct from PR331's footprint replacement. Preserve each semantic producer when combining adapters, and test the combined tree independently before integration.

### Final local receipts

Local-quality/idle/motion/workflow gates: **82/82**. In a disposable actual-code composition, PR64 head `33db80691e65ea5e620cfff4abaa17be9eefc7ae` adapter/runtime plus PR318 head `c6b13fde64486d21d7209cebee91a26671cbb516` action/collider runtime passed **6/6** focused tests. Adding PR331 head `e694c83079a9c79be75411a076f9121d69427f3a` line-footprint connection and runtime helper also passed **6/6**, retaining the new center spacing and the separate existing footprint. This deliberately selects PR331's line-shape connection only, retaining PR64's collision owner; it is not a full PR331 merge or acceptance of its other radius/camera/swim edits. With only the new adapter connections omitted in the same composed fixture, all six checks reject the baseline, including genuine impact/spacing/forward-velocity failures; the ghost flag assertion separately rejects the absent pool-reset field. No source engine is mocked or recreated.
