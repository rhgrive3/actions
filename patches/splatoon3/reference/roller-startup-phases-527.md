# Roller action-phase timing, Issue 527

Target: Splatoon 3 11.3.0, Splat Roller, base/no ability, humanoid and squid-start horizontal/vertical swings. Simulation elapsed tick 0 is ZR edge. Our earliest emitted release uses elapsed frames after that edge, not a second inclusive frame numbering scheme.

Sources read 2026-10-05:
- Nintendo update history https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/ lists11.3.0 (2026-08-19). Its Roller adjustment is Carbon Roller damage/movement, not a Splat Roller timing change. Continuing the ver11.0.0 measured timings into11.3.0 is an inference from the absence of a timing change, not a11.3.0 measurement or direct extraction of31/56/13.
- Pinned extracted 11.3.0 parameter table: https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponRollerNormal.game__GameParameterTable.json — Vertical SwingFrame26 and Wide SwingFrame21; ink recovery58/43. Raw values alone do not supply action-phase overheads.
- Published original verification table: https://wikiwiki.jp/splatoon3mix/ブキ/スプラローラー — table labels itself ver11.0.0; vertical kid31, squid44, repeat56, horizontal kid21, squid34, repeat42. This is community verification, not Nintendo source code or our own Switch capture.
- Published parameter-semantics verification: https://wikiwiki.jp/splatoon3mix/検証/パラメータ情報/メイン — vertical raw+5 kid, raw+18 squid, raw+30 repeat; wide raw kid, raw+13 squid, raw+21 repeat. These independently expressed entries agree with the weapon table.

Implementation derivation:
- verticalWindup=(26+5)/60, verticalInterval=(26+30)/60
- squidFlickDelay=13/60 for either swing; this composes before the actual runner windup, so21+13=34 and31+13=44.
- Horizontal21/42 and vertical/horizontal recovery58/43 remain separate. New squid-specific buffered-tap retention only covers the new admission interval. Later explicit squid input wins via the native input ordering. All other weapons retain the native emerge gate.
- Authoritative runner state already feeds Character pose and drum release. Update their timeline assertions to31/56; do not fabricate new joint targets from a frame table.

Limits: profile values are measured/derived, not falsely bound as direct raw fields. Physical Switch/iOS/Android timing and aesthetic motion comparison are unmeasured. This change does not fix the separately existing post-release action-recovery policy: native flickRecover=.18 affects movement, and native busy() excludes it. The table's10F post-shot sub/swim recovery is therefore not certified by these release/repeat tests. Vertical roll-transition22F also remains separate. Do not mark all of Issue527's broader acceptance criteria complete solely from this patch.

## Admission-time mode boundary (review record)

The new eight timing cases hold the ground/air condition fixed. Mode selection is still at runner admission (elapsed13 after squid-start ZR), not snapshotted at the input edge. A separate actual Actor/runner test changes the contact flag under controlled timing: airborne→ground at8F selects horizontal/releases34F; ground→air at8F selects vertical/releases44F. Changing either flag at20F, after admission, retains the already chosen vertical44F or horizontal34F mode. This records current engine behavior with controlled contact flags, not a physics landing trajectory or an S3 equivalence claim.

The exact Nintendo mode-recognition boundary while emerging is unverified. In a future composition with PR496, its natural-fall25F threshold may also be crossed during this13F wait. That combination needs a boundary check; neither the fixed-condition timing table nor these tests establishes that mode should be snapshotted at ZR. No unsourced mode-ownership rewrite is included.
