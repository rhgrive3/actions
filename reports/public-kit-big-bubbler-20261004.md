# Big Bubbler (issue 177 kit work) — INKWAVE public runtime

Scope: `inkwave-public/` composed through `patches/splatoon3`. `game/` is out of
scope and was removed from `main` by merged PR #185. This lane owns **only**
`patches/splatoon3/runtime/kit-big-bubbler.mjs`, its own test file and this
report. Profile, install/adapter, gear and network composition belong to the
parent; the exact hooks are listed below and are not applied here.

## Reference and pinned receipts

Target: Splatoon 3 **Ver. 11.3.0**, splat3 commit
`7280ff9cde8bb1c5dcef46c700c326471584d2e6`. Primary receipts (pinned, unmodified)
in `evidence/actions-freebuff-20261004/kit-primary/`:

| Receipt | What it fixes |
|---|---|
| `base-kit-fields.json` | `Roller_Normal_00` → `SpGreatBarrier` special, `SpecialPoint` 180 |
| `WeaponInfoSpecial.json` | `__RowId "SpGreatBarrier"`, `Id 2`, `StandAlone false` (not a standalone special) |
| `WeaponSpGreatBarrier.game__GameParameterTable.json` | every geometry/HP/duration number used below |

`SpGreatBarrier` is Big Bubbler. `SpBlower` in the same receipts is **Ink Vac**
(Splat Charger), and `SpUltraShot` is Trizooka (Splattershot) — they are not
this module and are not implemented here.

Pinned values, verbatim (module constants `BIG_BUBBLER_RAW`):

| Field | Raw |
|---|---|
| `MaxHP.Low / Mid / High` | 15360 / 16896 / 18432 |
| `MaxFieldHP.Low` | 30720 |
| `TimeDamage` / `TimeDamageOnVLift` | 921 / 1842 |
| `MinRadius` / `MaxRadius` | 2.255 / 7.5 |
| `RadiusRatioCurve`, `AscendCurve` | Hermit2DSmooth, `MaxX 1.0` |
| `AscendFrame` / `AscendHeight` / `IgnitionFrame` | 30 / 8.5 / 15 |
| `FieldCollisionRadius` | 0.4 |
| `OverlapFieldDamage` / interval | 5 / 5 |
| `BaseParam.PaintRadius` | 4.5 |
| `CanopyKnockBack` / `DamgeRatio` | 700 / 0.64 (recorded, not used) |

## What is calibrated, not sourced

`BIG_BUBBLER_CALIBRATION` is a declared mapping. Per AGENTS no unconfirmed value
is presented as a Nintendo one.

- **`rawPerDamageUnit = 100`** — raw dome HP per INKWAVE damage unit. The 11.3.0
  tables state no such factor. It is deliberately **not** the weapons' damage
  factor and is **not** applied as HP/10; at 100 a 36-point Splattershot direct
  hit costs ~6.7 % of a 0-AP canopy. The scale-independent part of the data (the
  ratio `MaxHP / TimeDamage`) is what the implementation actually relies on.
- **`timeDamageIntervalSeconds = 1`** — TimeDamage read as a per-second rate. A
  per-frame reading ends a full canopy in 16.7 ticks (0.28 s), which contradicts
  the observable multi-second dome, so that reading is rejected **as an
  inference, not as a source**. One constant switches it; the module's exported
  tests then need re-basing.
- **`radiusGrowthSeconds = 45/60`** — mapped onto the pinned drone frames
  (`AscendFrame` + `IgnitionFrame`). The tables carry no growth window.
- **`deployDistance = 3`** — landing point ahead of the owner. The tables carry
  no throw distance or arc.
- **`radius = MinRadius + (MaxRadius - MinRadius) * curve`** — declared mapping
  of `RadiusRatioCurve` onto the named Min/Max radius pair.
- **`OverlapFieldDamage` is OFF.** Its unit is unresolved: read through the
  canopy mapping it is 5/100 = 0.05 INKWAVE damage per 5-frame tick. Enabling it
  would assert gameplay no receipt supports. The code path exists and is gated
  by `profile.kits.bigBubbler.overlapFieldDamage`.
- **`eraseOnOwnerReset = false`.** `Actor.reset()` is the *respawn* path, so
  erasing there would delete the dome immediately after the owner's own death,
  which the reference does not do. See "Expiry" below.

Unverified and not implemented: the throw arc/animation, the emitter's own
damage model beyond its HP, `CanopyKnockBack` knock-back, `DamgeRatio`, the
`MaxHP.Mid/High` Ink Resistance tiers, and `TimeDamageOnVLift`.

## What the module does

`installKitBigBubbler(api, profile)` exports only this module's behaviour:

- **Activation** — wraps `Actor.prototype._startSpecial`. The native activation
  has no branch for this id, so it still owns the gauge cost (`special = 0`),
  `stats.specials`, the form change and the audio; the module only deploys the
  structure afterwards. No renamed Tidal Slam / Ink Tempest state is created and
  no invulnerability is granted.
- **Stationary dome** — never moves after landing; the owner may leave.
- **Radius growth** — `Hermit2DSmooth` evaluation of the pinned curve between
  `MinRadius` and `MaxRadius`, monotonic, capped at the pinned `MaxRadius`.
- **Timed activation** — arms exactly on the pinned `IgnitionFrame` (15), paints
  the interior with the pinned `BaseParam.PaintRadius`, then applies the pinned
  `TimeDamage` to the canopy until it collapses.
- **Emitter** — rises on the pinned `AscendCurve` to `AscendHeight`, above the
  shell, and has its own `MaxFieldHP` budget. Destroying it collapses the dome.
- **Interception** — enemy rounds stop at the dome surface (first entry of the
  shell or of the exposed emitter, whichever is earlier). Friendly rounds and
  rounds already inside may leave. Ghost rounds are never intercepted. Actors
  walk in freely, take no damage by standing inside, and get no invulnerability.
- **Paint/damage ownership** — paint only through `G.paint.splat`; damage only
  through this module's HP budgets and, where used, the native
  `G.projectiles.applyHit`. There is no second physics, damage or paint engine.
- **Visual** — a real `THREE` hemisphere plus emitter mesh in `G.scene`, team
  coloured; geometry and materials are disposed on removal.
- **Net** — `bigBubblerSnapshot()` emits plain serializable state; the module
  does not replicate it (parent-owned, see handoff).

## Expiry, disposal and reset

| Event | Effect | Why |
|---|---|---|
| `TimeDamage` drains the canopy, or the emitter is destroyed | dome removed, scene released | pinned |
| `Projectiles.clear()` (match disposal, `main.js`) | **every** dome removed | explicit disposal path |
| Owner `splat()` | **nothing** | the reference does not erase the structure when its owner dies |
| Owner `reset()` (respawn) | nothing by default; erases only when the parent sets `profile.kits.bigBubbler.eraseOnOwnerReset = true` | `reset()` is the respawn path |
| `clearBigBubblers(reason)` | explicit | shutdown / parent use |

A zero timestep (`Projectiles.update(0)`, i.e. a paused match) freezes growth,
ignition and the burn.

## Concrete parent handoffs

1. **Profile** (`patches/splatoon3/profile.json`, parent-owned): set
   `weapons.roller.special = "bubbler"` and `weapons.roller.specialCost = 180`
   (pinned `Roller_Normal_00 SpecialPoint`), register `SPECIALS.bubbler`, and add
   an optional `kits.bigBubbler` calibration block. This lane did not touch the
   profile; the tests stand in for that composition locally and say so.
2. **Adapter** (`patches/splatoon3/adapter.mjs`, parent-owned) — one exact
   `replaceOnce` in the `src/game/weapons.js` branch. The anchor is verified
   unique by a test in this lane:

   ```
   before:  "      p.pos.addScaledVector(p.vel, dt);\n      let dead = false;"
   after:   "      p.pos.addScaledVector(p.vel, dt);\n      let dead = this.kitBarrier ? this.kitBarrier(p) : false;"
   ```

   `Projectiles.prototype.kitBarrier(p)` returns the first-entry record
   (`{ dome, distance, point, normal, target }`) or `false`, and applies the
   canopy/emitter damage itself, so the native loop keeps the chronology and the
   module never scans or re-integrates the round list.
3. **Install** (`patches/splatoon3/runtime/install.mjs`, parent-owned): import
   and call `installKitBigBubbler(api, profile)` after the other installers,
   then call `disableBigBubblerFallback()` so the stand-in `_step` wrapper stops
   double-testing rounds. Until (2) and (3) land, the module ships inert.
4. **Network** (parent-owned): `bigBubblerSnapshot()` plus the
   `kit:bubbler:deploy` / `kit:bubbler:collapse` events are the integration
   surface. Remote proxies are **not** implemented in this lane — the parent must
   decide replication (host-authoritative snapshot on deploy/collapse) and, if
   wanted, gate remote interception on `p.ghost`, which is already honoured.

## Explicit gaps — not claimed as complete

- **Explosion shielding on collapse** is not implemented. When the dome is
  destroyed, enemy rounds already inside it are not swept or damaged.
  Handoff: subscribe to `kit:bubbler:collapse` and add the burst through the
  native blast path; the blast radius/parameters are not pinned by any receipt.
- **Remote ghost replay** of a deployed dome is not implemented (see handoff 4).
- **Bomb interaction**: only the bullet pipeline (`Projectiles.list`) is probed.
  Thrown bombs (`Projectiles.bombs` / `_updateBombs`) are unaffected, which is
  consistent with a dome that stops rounds rather than thrown explosives.
- No physical-device, browser or Switch parity is claimed. The evidence is a
  composed-runtime logic measurement under `node --experimental-vm-modules`.

## Test evidence

`patches/splatoon3/tests/kit-big-bubbler.test.mjs` runs against the **actual
composed runtime** — the immutable `inkwave-public` sources adapted by
`patches/splatoon3/adapter.mjs` with the real `Actor`, `Projectiles` and config.
Only wall/ground collision and audio are stubbed. 13/13 pass.

Logs in `evidence/actions-freebuff-20261004/freebuff-6/`:
`kit-big-bubbler-after.log` (13/13), `kit-focused-regression.log` (42/42 with
`adapter.test.mjs` + `integration.test.mjs`), `kit-patch-gate-quick.log`
(`check-inkwave-patches --quick` OK, reference 11.3.0).

Covered: pinned curve endpoints and monotonicity; deploy/pinned durability/native
gauge+stat/no-specialActive/no-invulnerability; stationary; growth, arming on the
pinned frame and the radius cap; `TimeDamage` collapse with real GPU disposal;
enemy round consumed at the surface with the actor behind it unharmed and an
exact canopy delta; the first-entry distance/point/parametric parameter of the
documented hook; uniqueness of the parent adapter anchor; actors inside take no
damage and friendly rounds fired from inside escape; emitter damageable above
the shell and its destruction collapsing the dome; owner death and respawn not
erasing; match disposal erasing and releasing the scene; the opt-in reset flag;
zero-dt freeze; and the net snapshot being plain serializable state.