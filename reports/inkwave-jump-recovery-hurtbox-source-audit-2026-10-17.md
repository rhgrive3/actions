# Jump recovery and player collision source audit — 2026-10-17

## Scope and conclusion

Base: `bf9a8a9270b349a3b20c9550ff6ed78a61c9e729`. Comparison target is the composed public INKWAVE runtime, not the separate `game/` prototype. This change repairs demonstrated jump-state and recovery inconsistencies and binds two explicit squid collision values. It does **not** claim exact Nintendo intermediate curves, human collision defaults, or world-to-retail distance calibration.

The parent integration updates `reports/inkwave-splatoon3-behavior-2026-10-02.md`. This report supplies its focused evidence and verification record.

## Reference evidence and limits

1. **Splatoon 3 Ver.11.3.0 parameter tables**, [Leanny/splat3 at `7280ff9cde8bb1c5dcef46c700c326471584d2e6`](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130). Existing `reference/weapon-audit-1130/` and `main-weapon-catalog-data.mjs` retain the relevant WeaponParam fields. Explicit hold/end values are 25/70F for the ordinary Shooter, Splat Dualies and Heavy Splatling; Rapid/Rapid Pro/Clash use 40/70F and H-3 uses 20/50F. H-3's standing and jumping maxima are both 1 degree.
2. **Kanamoji's original S3 shooting study #6**, [2024-11-01 article](https://note.com/kanamoji_1027/n/nd8db315fcebf). It documents jump maximum-angle increase, hold, recovery, gear effects and per-family endpoints. It does not publish Nintendo's executable interpolation routine. The 2024 observations are not a claim of an independently captured Ver.11.3.0 hardware trace.
3. **XarrotD's original data-explanation draft**, [archived revision 629048](https://splatoonwiki.org/w/index.php?title=User:XarrotD/Data_Explanation&oldid=629048). It explicitly distinguishes an admitted jump from walking off a ledge, says landing does not own the recovery duration, and discusses recovery of both swerve and bias. The page has series-wide material and S3 context; it is not a version-pinned Nintendo executable receipt. Its exact composition of standing and jump bias is itself marked as needing verification.
4. **XarrotD's original parameter default table**, [paramtable](https://splatoonwiki.org/wiki/User:XarrotD/paramtable). This corroborates the existing analyst defaults, but is unversioned. It is not sufficient to relabel omitted values as extracted Ver.11.3.0 constructor defaults.

`DegBias` is used by the existing community angular quantile model as a median angle fraction. The obsolete comments calling it an outer-reticle Bernoulli probability have been corrected. The existing angular distribution and random draw count are retained.

## Repaired behavior

| Difference before this change | Implemented correction | Reproduction and impact |
| --- | --- | --- |
| Native Shooter inferred a jump from grounded-to-airborne transition. Other angular paths could use their jumping maximum/bias whenever no clock existed in the air. | Only the Actor's admitted-jump serial starts the Shooter clock. An absent jump clock consistently means ordinary accuracy for native and added Shooters, Dualies, Blasters and Splatlings. | Walk off a platform without pressing jump and fire while falling. Losing support no longer adds an unrequested accuracy penalty. |
| Dualies recovered their bias towards zero and, after the timer cleared in the air, returned to the .4 jump median and 7.5-degree maximum. | The shared calibrated recovery reaches the independently maintained standing process, then stays at the normal maximum and bias even during continued flight. | Jump from a tall platform and remain airborne past 70F. Recovery no longer introduces artificial perfect accuracy followed by a new jump penalty. |
| Blaster and Dualies maximum angles stayed at their full jump values while the bias recovered, contradicting the maximum-angle recovery observed in study #6. | Maximum angle and median fraction use the same source start/end window, with separate angle/bias quantities. HUD and emitted shot use the same recovering maximum. | Fire during the 25–70F or weapon-specific 40–70F recovery, before and after an early landing. Neither landing nor timer cleanup snaps back to the original jumping maximum. |
| Several clocks waited for landing to clear; inactive fallbacks could restore a jump state. | All angular clocks complete at their sourced end frame independently of contact. Existing reset, death, repeated-jump and Dualies turret owners remain intact. | Keep falling past the endpoint; an unchanged jump serial cannot create another jump penalty. |
| Direct Dualies/Splatling projectile helpers could still borrow an airborne fallback when no explicit maximum was supplied. | An unspecified maximum follows the same admitted-jump state. Direct calls retain explicitly supplied maxima and do not double-advance Dualies shot bias. | Omit `spreadDeg` during a no-jump fall; the helper now agrees with the runner's ordinary maximum. |

Implementation: `runtime/weapon-accuracy.mjs`, `shooter-accuracy.mjs`, `dualies-accuracy.mjs`, `splatling-jump-spread.mjs`, `weapons.mjs`, and the angular portions of `main-weapon-catalog.mjs`. The shared helper was added to the existing accuracy module; no new runtime module request is introduced.

### Intermediate curves remain a model

The shared implementation preserves INKWAVE's existing linear interpolation between the source hold and end frames. It does not silently replace that calibration with an invented power curve. Standing shot progression remains independent, and the jump median interpolates towards its current value. The exact Nintendo intermediate curve, whether and how a maximum of independent bias processes is used, and the native joint random-number call path remain **unverified**. Passing endpoint and continuity tests establishes internal behavior, not retail equivalence.

## Player collision: source values connected without inventing the missing human shape

New text receipt: `patches/splatoon3/reference/player-collision-1130.json`, exactly copied from [pinned SplPlayer](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/misc/SplPlayer.game__GameParameterTable.json).

- Git blob: `83fdedf7bccc19c65609c3b1fd2a94cf7c9c59d0`.
- Length: 13,701 bytes, no final newline.
- SHA-256: `afece0e3e2016a895ba79483bfa63489b334c372293417b3b0ef072993bcb660`.
- Pointer root: `/GameParameters/spl__PlayerCollisionParam`.

| Explicit field | Raw value | Runtime binding |
| --- | ---: | --- |
| `ColBullet_Radius_Squid` | 0.675 | `player.s3SwimHurtRadius` |
| `ColBullet_Height_Squid` | 0 | `player.s3SwimHurtSegmentHeight` |

`profile.json`, `curated-numbers.json` and the generated numeric status now trace these fields to that receipt. `player-hurtbox.mjs` represents the zero straight segment as a sphere of the configured radius, independently of the terrain capsule's `squidHeight`. The old default terrain height .55 was already shorter than the sphere diameter 1.35, so the continuous capsule solver already reduced it to the same sphere; default bullet contact boundaries are preserved. Changing movement collider dimensions can no longer lengthen the bullet-receiving shape.

The existing bottom-relative centre placement remains calibrated. The receipt omits human bullet radius/height; consequently human radius .35 and total height 1.65 are retained as **unverified INKWAVE calibration**, not relabelled as extracted defaults. The study's fitted enemy cylinder is not substituted for an absent human capsule constructor. The inherited distance factor 1 likewise remains provisional; the raw source binding does not establish Nintendo metres or matching retail dimensions.

## Omitted physics defaults: investigation result

Existing analyst assumptions remain unchanged: `BrakeAirResist=.36`, `BrakeGravity=.07`, `BrakeToFreeVelocityY=-.15`, `FreeAirResist=.02`, and `FreeGravity=.016`. Some weapon records explicitly contain individual fields such as `.016` free gravity; that does not establish every omitted type's constructor. Existing per-weapon explicit overrides keep precedence.

The user's Drive bundle `Splatoon-Decomp-NTSC-thick-plus-Splatoon3-resources` was checked through its source metadata and first individually readable ZIP. Its `SOURCE_INFO` identifies `Dexx-io/Splatoon-Decomp@9ef403d96f1a370bdd70434ce158a0c29879bfcf`, the same pinned Leanny resources, HoianViewer and Awesome-Splatoon3-Hacking resources. It supplies no S3 executable or complete bullet constructor implementation.

Public source trees were also checked:

- [Dexx-io/Splatoon-Decomp](https://github.com/Dexx-io/Splatoon-Decomp/tree/9ef403d96f1a370bdd70434ce158a0c29879bfcf): predominantly asset/YAML records, with no recovered S3 shooting/jump routine.
- [sdlfoundation/splatoon-decomp](https://github.com/sdlfoundation/splatoon-decomp/tree/4fc0db8a6027898653d4328dde83f522b5f911a4): target bullet CPP placeholders were empty, and the inspected Player stub did not implement these defaults.
- [YoshiCrystal9/Blitz_MasterVer22-Decomp](https://github.com/YoshiCrystal9/Blitz_MasterVer22-Decomp/tree/6e6f8ebb1a3d8ebac518ba47b881ec5d3740baac): symbols and partial source, without the needed recovered S3 routine bodies.

These previous-generation and incomplete trees provide no basis for overriding the current numbers as exact S3 values. The existing default uncertainty in `weapons-fidelity-reference.json` is retained. No Nintendo material binaries are added.

## Verification record

Conditions: neutral/default gear unless an existing test explicitly specifies Action Intensify 0/10/57 AP; normal kid movement; ordinary admitted jumps, early landings, ledge falls, continued flight, firing/recovery and turret transitions. Fixed simulation clock is 60Hz; rendered cadences are 30/60/120Hz. The high-platform fixture restores native Actor integration and real Level/Physics/Projectiles; presentation Character and paint rendering remain fixture stubs.

| Verification | Result |
| --- | --- |
| Existing accuracy, Blaster, Dualies, catalog, Shooter and Splatling test files | 6/6 files passed |
| Adjacent weapon audit, real ledge Blaster, human collision, Charger smoothing, movement/gear, wall-drop guards and edgecases | 7/7 files passed |
| `jump-recovery-airborne-native.test.mjs` | 8/8 tests passed: 48 actual movement/launch scenarios across four native and four added weapons, two admission conditions and three rendered cadences; complete seeded launch/pose/ink traces agree |
| `player-collision-source-1130.test.mjs` | 2/2 passed: exact source hash/bindings and actual bullet side/top/bottom sweeps, radii 0/.08/.2, before/after terrain radius/height changes |
| Direct-helper follow-up | `issue-883-dualies-scalar-spread.test.mjs` and `splatling-jump-spread-native.test.mjs`: 2/2 files passed after the unspecified-maximum fallback repair |
| Numeric source consistency and whitespace | `check-inkwave-patches.mjs --quick` and `git diff --check` passed |

Final combined CI/browser verification belongs to the parent integration. Browser measurements and Switch hardware comparison are **not** represented by these logic results. Exact intermediate recovery, missing constructor defaults, human collision and world scale remain open evidence requirements.
