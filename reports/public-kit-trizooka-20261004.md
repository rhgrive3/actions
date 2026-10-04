# Trizooka — Splattershot special (issue 177)

Lane `freebuff-2`. Replaces the generic/renamed special on the public
Splattershot with the real Splatoon 3 **Trizooka** (`SpUltraShot`).

## 1. Authoritative source

| item | value |
| --- | --- |
| file | `data/parameter/1130/weapon/WeaponSpUltraShot.game__GameParameterTable.json` |
| repo | `Leanny/splat3` |
| ref | `7280ff9cde8bb1c5dcef46c700c326471584d2e6` |
| sha256 | `b088c9df476ed786a4a9e76c1fd3d7166885adf0dcffd563b36d1d20b9995d22` |
| cost | 200 p, `WeaponInfoSpecial` `BaseShooter_Normal_00 -> SpUltraShot` |

Unit conversions come from `profile.calibration.unitConversions`: frames `/60`,
per-frame velocity `*60`, per-frame gravity `*3600`, raw damage `/10`.

## 2. Extracted vs calibrated — the honest split

**Extracted from the table** (used verbatim):

| field | raw | converted |
| --- | --- | --- |
| `SpawnSpeed` | 1.125 | 67.5 /s |
| `GoStraightToBrakeStateFrame` | 16 | 16/60 s |
| `BrakeToFreeStateFrame` | 10 | 10/60 s |
| `BrakeGravity` / `FreeGravity` | 0.09 / 0.0190565 | 324 / 68.6 m/s² |
| `BrakeAirResist` / `FreeAirResist` | 0.09 / 0.01985 | 5.4 / 1.191 per s |
| `BrakeToFreeVelocityXZ` / `Y` | 1.0 / −0.1 | — |
| `DirectHitDamage` | 2200 | 220 HP |
| splash bands | 530 @2.5, 350 @4.0 | 53 / 35 HP at 2.5 / 4.0 |
| `PaintRadius` | 3.2 | 3.2 (ink/FX radius — **not** the damage radius) |
| `StartDelayFrame` / `ShotDelayFrame` / `RepeatFrame` | 5 / 15 / 55 | — |
| `SpecialDurationFrame` Low/Mid/High | 330 / 405 / 480 | 5.5 / 6.75 / 8.0 s |
| `MoveSpeed` / `MoveSpeedInCharge` | 0.07 / 0.04 | 4.2 / 2.4 /s |
| `OrbitalRadiusEnd` / transition | 1.0 / 10 F | — |
| collision init/end radii | 0.01 → 0.75 actor, 0.01 → 0.3 field | 10 F / 20 F windows |

The `SpecialDurationFrame` reading of **570 F** is the *UltraStamp* value. The
correct AP-0 value here is `Low = 330 F`. A test asserts the duration is 330/60
and explicitly **not** 570/60, so a regression back to the wrong weapon fails.

**Simulation calibration** (the table states no value; labelled in code as
`simulation-calibration-not-extracted`):

| item | value | why |
| --- | --- | --- |
| `VOLLEY_CONFIG.lobes` | 3 | reads as the weapon's three-lobed burst. The earlier `null` produced **zero projectiles**, which is not the weapon. |
| `VOLLEY_CONFIG.spreadDeg` | 2.6 | tight fan across the three lobes |
| `TRIZOOKA_END_DELAY` | 12 F | bounded return after the third action; the table states no such delay |
| `TRIZOOKA_ORBIT.startRadius` | 1.0 | table gives the end radius only |
| `TRIZOOKA_ORBIT.turnRate` | 6.0 rad/s | table gives no angular rate |
| `TRIZOOKA_ORBIT.lobePhase` | 2π/3 | spread three lobes evenly |
| brake easing curve | clamp at the transition frame | table gives endpoints, no curve |
| collision radius interpolation | linear between init and end | table gives endpoints + windows |

`DistanceDamageDistanceRate` is a **distance** rate. It stretches the bands
outward and must never touch the damage numbers:

| AP | rate | bands | damage |
| --- | --- | --- | --- |
| 0 | 1.00 | 2.5 / 4.0 | 53 / 35 |
| 1 | 1.15 | 2.875 / 4.6 | 53 / 35 |
| 2 | 1.30 | 3.25 / 5.2 | 53 / 35 |

The damaging radius is the **outer band distance × rate** (4.0 at AP 0), *not*
`PaintRadius` 3.2. `PaintRadius` is the ink/FX radius and is exposed separately
as `paintRadius` so the two can never be confused.

`apOf()` reports **AP 0** by default. INKWAVE *does* carry ability points
(`gear.mjs`: `abilityPoints(loadout)` → `a.s3.modifiers`, 10 per main and 3 per
sub), but no Special Power Up ability is wired to a weapon yet, so nothing
reaches this special. `apOf` also reads `actor.apLevel`, `actor.s3Ap` and
`actor.s3.specialPowerUp` if the parent ever supplies one.

## 3. Single authoritative shot damage

Three lobes must not become three 220 HP direct hits. The contract:

- exactly **one** lobe per volley is the damage carrier (`damageOwner: true`,
  `type: 'blast'`, `damage: 220`);
- the other lobes are **visual only**: `type: 'shot'`, `damage: 0`, and never
  `type: 'blast'`, so the native `_blastBurst` path can only be entered once per
  volley;
- all lobes share **one native `vol` record**, so the native per-victim dedupe in
  `_step` (`p.vol.hits`) applies on top.

The descriptor now carries the full field names native `_blastBurst` reads:
`splashRadius` (4.0, the outer band distance), `splashDamageMax` 53,
`splashDamageMin` 35, plus `splashBands`, `burstRadius`, `impactRadius` and the
separate `paintRadius`.

### 3.1 Aim

The volley follows the **native camera-ray path**: `Projectiles._muzzle` for the
anchor and `Projectiles._aimFrom` for the 3D direction (which falls back to
`aimDir` when the aim point is too close or behind). The earlier draft called
native `throwVelocity` and then immediately overwrote it with a copy of the bomb
lob — the `aimPitch + 0.28` tilt, the pitch clamp and the `+1.5` lift — which
destroyed camera aim and treated the Trizooka as a lobbed bomb. That is removed.

The **only** deviation from the aim ray is the calibrated lateral lobe fan, and
it is symmetric about the damage carrier, so the authoritative shot travels
*exactly* along the native ray and the side lobes straddle it.

## 4. Lifecycle and input — wired to the native Actor

No adapter edit and no native source edit. `installKitTrizooka` wraps the native
prototype; the native code runs first and keeps ownership:

| hook | behaviour |
| --- | --- |
| `Actor._startSpecial` | **the guard runs BEFORE the native call.** Native zeroes the gauge and bumps `stats.specials` unconditionally, so delegating first and rejecting afterwards would spend the gauge on a dead / super-jumping / not-ready / already-active / re-entrant call. For `trizooka` every condition is checked first and a rejection never enters native. Every other special id is passed straight through. |
| `Actor.update` | a frame with `dt <= 0` is skipped entirely while the token is active. Native `update()` writes `_prevIntent`, `fireBuffer` and several timers *before* it reaches `_updateSpecial`, so stepping it with `dt = 0` would still advance the intent edges. |
| `Actor._updateSpecial` | drives the Trizooka when `specialActive.id === 'trizooka'`; otherwise defers to native. |
| `Actor.reset` / `Actor.splat` | dispose the token permanently. |

The token is installed **only if** native actually incremented
`stats.specials` exactly once. Special movement uses the real configured
`PLAYER.gravity` (via `setTrizookaPlayerConfig`), not a hardcoded constant.

### 4.1 Bounded return

Once the three firing actions are spent the weapon has no ammo left, so control
returns after a short tail (`TRIZOOKA_END_DELAY`, 12 F) instead of holding the
body until the full 330 F duration expires. **The table states no such delay** —
the end frame is when the last shot leaves the barrel — so this is an explicit
`calibration-not-extracted` value. `endTrizooka` reports `reason: 'ammo'` versus
`'duration'`. Setting the delay to 0 restores hold-to-timeout.

The module therefore **cannot** double-spend: `startTrizooka` only installs the
token and never touches the gauge or the counter, and a refused `_startSpecial`
never enters native at all.

Fire is driven by the **native intent edge**, never automatically:

- `StartDelayFrame` 5 F gates the first volley;
- a press **during** the start delay is buffered, not lost (`IsReqShotInStartDelay`);
- `ShotDelayFrame` 15 F is the minimum gap between volleys (`gateAt`);
- `RepeatFrame` 55 F governs a held trigger (`repeatAt`);
- at most **3** fire actions, then the special ends itself at the AP duration;
- `dt <= 0` is a strict no-op: no time, no gate change, no shot;
- `endTrizooka` clears `fireBuffer` so the frame the control returns cannot fire
  the main weapon.

Main and sub suppression is the native early return in `update()` —
`if (this.specialActive) { this._updateSpecial(dt); this._finishFrame(dt); return; }`
— so `weaponRunner.update` is never reached. The sub *release* edge is consumed
natively because `_prevIntent.sub` is updated before the special branch.

## 5. Parent hooks — narrow selectors, no second integrator

Exported from the owned module and registered on `SPECIALS.trizooka.selectors`,
so the parent can look them up by wid. The native `_step` keeps its **single**
integration and its chronological `p.prev -> p.pos` collision segment.

### 5.1 `selectTrizookaFlight(p, dt)` → `{ stage, grav, drag, ... }`

| age | stage | gravity | drag (per s) |
| --- | --- | --- | --- |
| `< 16 F` | `straight` | **0** | 0 |
| `16 F … 26 F` | `brake` | `BrakeGravity` 324 | 5.4 |
| `>= 26 F` | `free` | `FreeGravity` 68.6 | 1.191 |

Gravity is **not** left at the launch value: straight flight is genuinely
gravity-free and the free stage starts from the table's `FreeGravity`.
`transition: true` marks the frame the brake boundary is crossed, and the
selector returns the raw `brakeVelocityXZ` / `brakeVelocityY` /
`goStraightMaxSpeed` for the parent to apply. **Flagged:** the brake easing curve
is an interpretation (clamp at the transition frame).

Drag conversion: the table gives a per-frame retention, native `_step` uses
`vel *= 1 - drag * dt`. The linear equivalent is `perFrame * 60` (0.09 → 5.4,
0.01985 → 1.191). `TRIZOOKA_DRAG` exposes both the linear and the exact
exponential `c = (1 - (1 - perFrame)^(60·dt)) / dt` forms; they coincide exactly
at 60 Hz and diverge at other frame intervals. **Flagged:** which matches the
retail integrator is unverified.

### 5.2 `selectTrizookaCollision(p)` → `{ actorRadius, worldRadius, ... }`

Distinct per-projectile actor and world spheres, each interpolated over its own
frame window (10 F actor, 20 F field) between the table's init and end radii.
The parent queries these for its two contact tests. **Flagged:** the
interpolation between the endpoints is a linear reading.

### 5.3 `trizookaOrbitOffset(p, dt)` → `{ x, y, z, radius, phase, axis }`

The spiral is a **displacement offset**, not a position. The parent adds it to
`p.pos` after the native integration and before the contact queries; the
projectile's centreline remains the native centreline. The selector never
mutates the projectile, never integrates and never creates a second list.

The circle is built in the plane **perpendicular to the projectile's own flight
axis** (the launch velocity, falling back to the yaw before the first step),
using the stable orthonormal basis from `perpendicularBasis(dir)` — the helper
axis is the smallest component so the cross product never degenerates. An
earlier revision circled world Y, which is not an orbit around the trajectory.
Verified: the offset is perpendicular to the axis (`dot ≈ 0`) and has a non-zero
vertical component for a tilted launch, which a world-XZ circle cannot produce.

### 5.4 Field contract for `_new` and ghost replay

`trizookaClearProjectile(p)` deletes `s3SpecialWeapon`, `s3Weapon`,
`s3VolleyIndex`, `s3ActionIndex`, `damageOwner`, `s3OrbitPhase`, `s3Yaw`;
`trizookaApplyProjectile(p, {...})` reconstructs them for a ghost.
`TRIZOOKA_PROJECTILE_FIELDS` lists them for the parent's `_new`.

## 6. Replay state

Flat, idempotent, and it authors **no** remote damage, **no** remote gauge refill
and **no** countershot: `newTrizookaReplayState`, `trizookaReplayActivate`,
`trizookaReplayFire`, `trizookaReplayEnd`. A duplicate activation cannot restart
a live special; a duplicate fire packet cannot fire twice; nothing fires after
the end; a replay never exceeds three actions.

## 7. Tests

`patches/splatoon3/tests/kit-trizooka.test.mjs` — **37 pass, 0 fail, exit 0**
(`evidence/…/freebuff-2/trizooka/kit-trizooka-test.log`).

They load the real modules through the production adapter and the real
`install(profile)`, build a **real `new api.Actor(...)` with the real
`api.Character`** and drive the real `update(dt)` loop with a real `intent`.
Only display/audio/collision callbacks are stubbed.

**No test mutates `VOLLEY_CONFIG` or any module global** — an earlier draft did,
which is how a zero-projectile module passed. The volley must fire on the shipped
default.

Covered: pinned table values and the 330-not-570 guard; non-null calibration;
descriptor blast fields and the AP distance-vs-damage split; activation guards;
**a refused `_startSpecial` on every rejection path spending neither the gauge
nor the counter nor ink, and never reaching native**; an accepted call spending
exactly once; other specials still delegating to native; a paused frame being a
no-op on the *whole* actor (token clock, position, velocity, `_prevIntent`,
`fireBuffer`, counter and projectile count all serialized); no fire without a
press; a real non-empty default volley; the single damage carrier; the native
camera-ray aim path including negative pitch, a camera `aimPoint` disagreeing
with the body yaw, and proof the bomb lob is not used; ShotDelay vs Repeat
timing; the three-action cap and self-end; the start-delay buffer; main/sub
suppression including the release frame; no queued weapon fire on the return
frame; death; reset; disposal and native clear; the native integrator; the
flight, collision, orbit-axis, drag and field selectors; registry reachability;
the replay contract; and uninstall restoring the prototype.

Regression: `kit-subs` + `bomb-motion` + `weapons` + `weapons-gear-flow` +
`special-motion` + `superjump-motion` — **63 pass, 0 fail, exit 0**
(`evidence/…/freebuff-2/logs/regression-after-trizooka.log`). The last two
exercise the `Actor` lifecycle the wrappers sit on.

## 8. Still open (parent-owned)

- Wiring `installKitTrizooka(api, profile)` into `runtime/install.mjs`.
- `profile.json`: `weapons.shooter.special = 'trizooka'` and `specialCost = 200`.
- Calling the §5 selectors from native `_step`, `_new` and the ghost replay.
- Net: route the volleys to `recProj` (already unique per projectile) and group
  a remote volley for the replay API of §6.
- The cartridge eject mesh (`TRIZOOKA_CARTRIDGE`, extracted, not yet driven).
- Movement/weapon pose needs the original calibrated visual, not a renamed Slam.
- Browser and GitHub Actions proof at the exact pushed SHA.