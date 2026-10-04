# public-kit-trizooka — Trizooka for Splattershot (issue 177, lane freebuff-2)

Reference: **Splatoon 3 Ver. 11.3.0**. Successor assignment to the stopped
freebuff-3 session.

## 1. Primary source (verified before use)

| | |
| --- | --- |
| Repository | `Leanny/splat3` @ `7280ff9cde8bb1c5dcef46c700c326471584d2e6` |
| File | `data/parameter/1130/weapon/WeaponSpUltraShot.game__GameParameterTable.json` |
| sha256 | `b088c9df476ed786a4a9e76c1fd3d7166885adf0dcffd563b36d1d20b9995d22` |
| Local copy | `evidence/actions-freebuff-20261004/kit-primary/WeaponSpUltraShot.game__GameParameterTable.json` |
| Kit | `WeaponInfoSpecial`: `BaseShooter_Normal_00 -> SpUltraShot`, **200 p** |

The file's SHA was recomputed locally and matches the value given in the handoff.
Conversions use the existing `profile.calibration` rules: `/60` frames,
`*60` per-frame velocity, `*3600` per-frame gravity, `/10` raw damage.

### Quarantined draft — reviewed, values rejected

The freebuff-3 draft at
`evidence/actions-freebuff-20261004/freebuff-3/quarantined-draft` was read before
writing any code. **It used the UltraStamp hammer table, not UltraShot
Trizooka.** None of its numbers are used. Only its harness *structure* was
considered, and only after re-deriving everything from the table above. Its
`SpecialDurationFrame` reading of 570F is the Stamp value; the correct AP-0 value
here is `Low = 330F`. A test asserts the duration is 330/60 and explicitly
**not** 570/60, so a regression back to the wrong weapon is caught.

### Values taken from the table

| Field | Raw | Converted |
| --- | --- | --- |
| `MoveParam.SpawnSpeed` | 1.125 | 67.5 |
| `GoStraightToBrakeStateFrame` | 16 | 0.2667 s |
| `BrakeToFreeStateFrame` | 10 | 0.1667 s |
| `FreeGravity` / `BrakeGravity` | 0.0190565 / 0.09 | 68.60 / 324.0 |
| `FreeAirResist` / `BrakeAirResist` | 0.01985 / 0.09 | per-frame retention |
| `UltraShotMoveParam.OrbitalRadiusEnd` | 1.0 | 1.0 |
| `OrbitalRadiusTransitionFrame` | 10 | 0.1667 s |
| `DamageParam.DirectHitDamage` | 2200 | 220 HP |
| `BlastParam.DistanceDamage` | 530 @ 2.5, 350 @ 4.0 | 53 HP / 35 HP |
| `BlastParam.PaintRadius` | 3.2 | 3.2 |
| `CollisionParam` | init 0.01 / end 0.75 (player), 0.3 (field), over 10F / 20F | variable sphere |
| `StartDelayFrame` / `RepeatFrame` / `ShotDelayFrame` | 5 / 55 / 15 | 0.0833 / 0.9167 / 0.25 s |
| `SpecialDurationFrame` | Low 330, Mid 405, High 480 | 5.5 / 6.75 / 8.0 s |
| `MoveSpeed` / `MoveSpeedInCharge` | 0.07 / 0.04 | 4.2 / 2.4 |

## 2. What this module owns

`patches/splatoon3/runtime/kit-trizooka.mjs`, exporting `installKitTrizooka`,
`trizookaSpecialWeapon`, `trizookaProjectileDescriptor`, `startTrizooka`,
`stepTrizooka`, `canActivateTrizooka`, `disposeTrizooka`, `throwVolley`.

It registers `SPECIALS.trizooka` with `cost: 200` and the parent's
`projectileDescriptor` callback, and provides the three-action state machine with
`StartDelayFrame` then `RepeatFrame` spacing, bounded by `SpecialDurationFrame`.

**Authority is untouched.** Volley projectiles are created and pushed through the
real `Projectiles._push`, fly through the real `Projectiles._step`, and burst
through the real `_blastBurst`. There is one list, one integrator and one damage
path. `p.s3SpecialWeapon` is set on the record before `_push`, matching the parent
contract (candidate `7691dc7`), and `p.wid` carries `trizooka` as the native cause
id so ghosts restore through `SPECIALS[wid].projectileDescriptor`.

## 3. Behaviour and lifecycle

- **Activation guards** — refused when dead, super jumping, already in a special,
  already active, or below 200 p.
- **dt 0 is a no-op** — no clock advance, no projectile produced.
- **Three firing actions** — first after `StartDelayFrame`, then `RepeatFrame`
  spacing, ending at `SpecialDurationFrame`.
- **Death / reset / disposal** — `disposeTrizooka` nulls the token; a nulled token
  produces nothing and cannot be revived.
- **Network** — every projectile goes through the native `recProj`, so shot
  counters and records stay unique per projectile. No bespoke packet.

## 4. Exact parent hook requested (no second integrator)

Two behaviours cannot be expressed without a narrow native hook. Both are
**narrow selectors inside the existing native loop**, not new integration.

**(a) Three-stage flight state.** The table defines `goStraight` (16F) ->
`brake` (10F) -> `free`, with a different gravity and air resistance per stage
(`FreeGravity`/`BrakeGravity`, `FreeAirResist`/`BrakeAirResist`). Native `_step`
has one `grav`/`drag` pair. Requested hook, inside `Projectiles._step` only:

```js
// stage selector, next to the existing gravity application
if (p.s3SpecialWeapon) { const st = trizookaStage(p, dt); p.grav = st.grav; p.drag = st.drag; }
```

`trizookaStage` returns the stage from `p.age` against the pinned frame counts.
No second integrator, no second list.

**(b) Spiral / orbit and the variable hit sphere.** `OrbitalRadiusEnd = 1.0` over
10F, plus `CollisionParam`'s radius growing 0.01 -> 0.75 (player) / 0.3 (field)
over 10F / 20F. Native `_step` has a fixed `p.radius`. Requested hook, again
inside `_step`:

```js
if (p.s3SpecialWeapon) p.radius = trizookaCollisionRadius(p);
```

plus an orbital displacement term on `p.pos` using the native `p.age`. These are
value selectors; the integration stays native.

**Not requested and not built:** no second projectile array, no second collision
pass, no second paint or damage path, and no copy of `_step`.

## 5. Deliberate honesty gaps

- **Per-volley projectile count is `null`.** Trizooka's 10-projectile volley is
  not stated anywhere in this table, and the spread angle is not either. Rather
  than import a number from memory or from the quarantined draft,
  `VOLLEY_CONFIG.perVolley` and `spreadDeg` stay `null` with
  `perVolleyStatus: 'unknown-not-stated-in-primary'`. `throwVolley` fires whatever
  count is configured, so the parent can supply the sourced value without
  touching this module. A test asserts it is not invented.
- **SpecialChargeUp** (`paintRadius` 3.2/3.6/4.0, `DistanceDamageDistanceRate`
  1.0/1.15/1.3) is recorded on the spec but **not yet driving behaviour**.
- **Cartridge eject** (`EjectCartridge*`) is recorded as
  `extracted-not-driven`; no eject mesh is claimed.
- **Movement / weapon pose** during the special is *not* implemented as a renamed
  Slam. There is no calibrated original visual for Trizooka in this repo, so
  nothing is asserted here; the pose is an explicit handoff.
- **Knockback** (`KnockBackParam` accel 470 / bias 0.8 / distance 8.0) is on the
  spec but the native blast owns knockback and is not overridden.

## 6. Verification

| Log | Result |
| --- | --- |
| `evidence/.../freebuff-2/trizooka/kit-trizooka-test.log` | **11/11 pass**, exit 0 |

Tests compose the **real production installer** plus this module and use the real
`Projectiles`, `Physics` and `Actor` — no fake sub-pipeline. They cover: the
pinned table values with an explicit guard against the Stamp 570F; descriptor
contents and the ghost-restore callback; per-volley count not invented;
registration on the real `SPECIALS`; every activation guard; dt 0 no-op; exactly
three volleys then completion; projectiles present in the **one** native list with
`wid` and descriptor attached; movement produced by the real `_step`; disposal and
non-restoration; and the real `clear()` releasing the list.

## 7. Remaining handoff to the parent

1. `install.mjs`: call `installKitTrizooka(api, profile)` alongside the existing
   installers.
2. **The two narrow `_step` selector hooks in section 4** — flight stage and
   orbit/collision radius. Without these the projectile flies straight under the
   free-state gravity, which is honest but not yet Trizooka.
3. **Source the per-volley count and spread angle** from a primary source, then
   set `VOLLEY_CONFIG`.
4. `profile.json`: map `shooter.special = 'trizooka'`, `specialCost = 200`
   (not edited by this lane).
5. SpecialChargeUp, cartridge eject, and the special's calibrated movement/weapon
   pose.
6. Remote visual state: ghost descriptors restore through
   `SPECIALS[wid].projectileDescriptor`, but the *volley count per shot* is not
   transmitted, so a remote peer sees individual projectiles without grouping.
   Explicit and left as-is rather than faked.
7. Browser composed proof and the exact-SHA Actions gate.
