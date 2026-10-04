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
| splash bands | 530 @2.5, 350 @4.0 | 53 / 35 HP |
| `PaintRadius` | 3.2 | 3.2 |
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
| `TRIZOOKA_ORBIT.startRadius` | 1.0 | table gives the end radius only |
| `TRIZOOKA_ORBIT.turnRate` | 6.0 rad/s | table gives no angular rate |
| `TRIZOOKA_ORBIT.lobePhase` | 2π/3 | spread three lobes evenly |
| brake easing curve | clamp at the transition frame | table gives endpoints, no curve |
| collision radius interpolation | linear between init and end | table gives endpoints + windows |

`apOf()` reports **AP 0** because INKWAVE has no AP source. The `SpecialChargeUp`
ladder is recorded and scales splash only, never the direct hit.

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
`splashRadius`, `splashDamageMax`, `splashDamageMin`, plus `splashBands`,
`burstRadius` and `impactRadius`.

## 4. Lifecycle and input — wired to the native Actor

No adapter edit and no native source edit. `installKitTrizooka` wraps the native
prototype; the native code runs first and keeps ownership:

| hook | behaviour |
| --- | --- |
| `Actor._startSpecial` | native spends the gauge (`this.special = 0`), increments `stats.specials`, plays the cue. **Exactly once** — a re-entrant call returns before installing a second token. |
| `Actor._updateSpecial` | drives the Trizooka when `specialActive.id === 'trizooka'`; otherwise defers to native. |
| `Actor.reset` / `Actor.splat` | dispose the token permanently. |

The module therefore **cannot** double-spend: `startTrizooka` only installs the
token and never touches the gauge or the counter.

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
exponential `1 - (1 - perFrame)^(60 dt)` forms. **Flagged:** which matches the
retail integrator is unverified.

### 5.2 `selectTrizookaCollision(p)` → `{ actorRadius, worldRadius, ... }`

Distinct per-projectile actor and world spheres, each interpolated over its own
frame window (10 F actor, 20 F field) between the table's init and end radii.
The parent queries these for its two contact tests. **Flagged:** the
interpolation between the endpoints is a linear reading.

### 5.3 `trizookaOrbitOffset(p, dt)` → `{ x, y, z, radius, phase }`

The spiral is a **displacement offset**, not a position. The parent adds it to
`p.pos` after the native integration and before the contact queries; the
projectile's centreline remains the native centreline. The selector never
mutates the projectile, never integrates and never creates a second list.

### 5.4 Field contract for `_new` and ghost replay

`trizookaClearProjectile(p)` deletes `s3SpecialWeapon`, `s3Weapon`,
`s3VolleyIndex`, `s3ActionIndex`, `damageOwner`, `s3OrbitPhase`;
`trizookaApplyProjectile(p, {...})` reconstructs them for a ghost.
`TRIZOOKA_PROJECTILE_FIELDS` lists them for the parent's `_new`.

## 6. Replay state

Flat, idempotent, and it authors **no** remote damage, **no** remote gauge refill
and **no** countershot: `newTrizookaReplayState`, `trizookaReplayActivate`,
`trizookaReplayFire`, `trizookaReplayEnd`. A duplicate activation cannot restart
a live special; a duplicate fire packet cannot fire twice; nothing fires after
the end; a replay never exceeds three actions.

## 7. Tests

`patches/splatoon3/tests/kit-trizooka.test.mjs` — **28 pass, 0 fail, exit 0**
(`evidence/…/freebuff-2/trizooka/kit-trizooka-test.log`).

They load the real modules through the production adapter and the real
`install(profile)`, build a **real `new api.Actor(...)` with the real
`api.Character`** and drive the real `update(dt)` loop with a real `intent`.
Only display/audio/collision callbacks are stubbed.

**No test mutates `VOLLEY_CONFIG` or any module global** — an earlier draft did,
which is how a zero-projectile module passed. The volley must fire on the shipped
default.

Covered: pinned table values and the 330-not-570 guard; non-null calibration;
descriptor blast fields; activation guards; native `_startSpecial` spending the
gauge and the counter exactly once; no fire without a press; a real non-empty
default volley; the single damage carrier; ShotDelay vs Repeat timing; the
three-action cap and self-end; the start-delay buffer; main/sub suppression
including the release frame; no queued weapon fire on the return frame; dt-0
no-op; death; reset; disposal and native clear; the native integrator; the
flight, collision, orbit, drag and field selectors; registry reachability; the
replay contract; and uninstall restoring the prototype.

Regression: `kit-subs` + `bomb-motion` + `weapons` + `weapons-gear-flow` —
**43 pass, 0 fail, exit 0**
(`evidence/…/freebuff-2/logs/regression-after-trizooka.log`).

## 8. Still open (parent-owned)

- Wiring `installKitTrizooka(api, profile)` into `runtime/install.mjs`.
- `profile.json`: `weapons.shooter.special = 'trizooka'` and `specialCost = 200`.
- Calling the §5 selectors from native `_step`, `_new` and the ghost replay.
- Net: route the volleys to `recProj` (already unique per projectile) and group
  a remote volley for the replay API of §6.
- The cartridge eject mesh (`TRIZOOKA_CARTRIDGE`, extracted, not yet driven).
- Movement/weapon pose needs the original calibrated visual, not a renamed Slam.
- Browser and GitHub Actions proof at the exact pushed SHA.