# Ink Vac (SpBlower) for Splat Charger — public INKWAVE, freebuff-8 kit task (2026-10-04)

Scope: public composed runtime only (`inkwave-public` + `patches/splatoon3`). No native
source, lock, FETCH or generated-output edits. Owned files: this report,
`patches/splatoon3/runtime/kit-ink-vac.mjs`, `patches/splatoon3/tests/kit-ink-vac.test.mjs`.
Parent owns profile / install / adapter / gear / network composition.

## Issue 177 mapping (pinned receipts)

`evidence/actions-freebuff-20261004/kit-primary/base-kit-fields.json`
(Leanny/splat3 @7280ff9cde8bb1c5dcef46c700c326471584d2e6, 11.3.0):

| INKWAVE weapon | SpecialWeapon | SpecialPoint | Sub |
| --- | --- | --- | --- |
| `shooter` | SpUltraShot (Trizooka) | 200 | Bomb_Suction |
| `roller` | SpGreatBarrier (Big Bubbler) | 180 | Bomb_Curling |
| `charger` | **SpBlower (Ink Vac)** | **190** | Bomb_Splash |

This module implements only the charger's Ink Vac, as requested. It does **not** alias
Storm or Slam, and does not touch the other two kits (parent-owned).

## Pinned SpBlower values used

From `WeaponSpBlower.game__GameParameterTable.json` (same pinned commit):

- `InhaleParam.LengthMax = 15` — intake length (world units, project scale 1:1)
- `InhaleParam.RadiusMin.Low = 0.8`, `RadiusMax.Low = 3.3` — charge-scaled intake radius
- `ExhaleParam.DirectDamage = 2200`; `ExhaleBlastParam{Min,Max}Charge.DistanceDamage Damage = 2200`
- `ExhaleBlastParamMinCharge.PaintRadius = 6.0`, `MaxCharge = 11.0` — charge-scaled blast reach
- `ExhaleParam.SpawnSpeedZSpecUp.Low = 0.55`, `SpawnSpeedZMaxCharge = 0.7` — exhale speed (recorded; not used by this integration)
- `WeaponParam.InhaleToExhaleWaitFrame = 20`, `ExhaleWaitFrame = 150` — recorded; the real
  release trigger in this integration is charge-full, so the fixed wait frames are NOT
  claimed to be reproduced.

## Explicitly calibrated (not sourced)

Exported as `INK_VAC_CALIBRATION` and asserted in tests:

- `rawToHp = 100/3000` — 3000 raw damage ~= 100 INKWAVE HP. The pinned exhale raw 2200
  therefore yields ~73 HP rather than instant-splatting. **Calibration, not sourced.**
- `absorbCredit = 0.34` charge per accepted projectile. **Calibration.**
- `maxInhaleSeconds = 2.5` safety cap; real release is charge-full. **Calibration.**
- `breathOriginHeight = 1.0` (kid chest) for the intake origin. **Calibration.**
- `frontalEpsilon = -0.05` frontal-direction gate. **Calibration.**

No physical Switch parity is asserted. Charge/duration/unit values are engineering
calibration for this rig.

## Behaviour implemented

1. **Activation** (`Actor._startSpecial`, id `inkvac`): consumes the gauge
   (`special = 0`), refills the tank once (`ink = inkMax`), forces kid form, and opens a
   held intake state. Guarded to run once per activation.
2. **Held frontal intake** aligned to `actor.aimDir`: a cone of length `LengthMax` with
   charge-scaled radius (`RadiusMin.Low → RadiusMax.Low`). A projectile is accepted only
   if it is in front, within length and radius, travelling toward the player
   (`vel·forward <= frontalEpsilon`), and has clear LOS to the intake origin (an
   intervening wall blocks it).
3. **Charge**: credited once per accepted absorption (`absorbCredit`), clamped to [0,1].
   Absorbed projectiles get `damage = 0` and a `s3InkVacAbsorbed` guard so they can never
   be credited or damaged twice.
4. **Release** (charge-full or cap): a charge-scaled countershot. A real countershot
   projectile is pushed onto the native `Projectiles` list via an installed
   `fireInkVacExhale` handler (`_new`/`_push`, native `_step` integrates it); the
   detonation applies charge-scaled splash damage (native `applyHit`, network-routed) and
   turf (native `G.paint.splat` + `addTurf`). Blast radius scales `6.0 → 11.0` with charge.
   A **remote ghost authors nothing** (no projectile, no damage, no turf).
5. **Normal use during the special**: the native `update` early-return for slam/storm is
   bypassed **only** for `id === 'inkvac'` by temporarily hiding `specialActive` around the
   native pass, so movement, squid form and main/sub weapons keep running. The token is
   restored so death/reset and the native lifecycle still own it.
6. **Lifecycle**: expiry (release), interruption (weapon swap clears via reset path),
   death (`Actor.splat`) and reset (`Actor.reset`) all clear the state and dispose any GPU
   resource the state created (an owned cone mesh). `disposeInkVac` is exported.

## Integration hooks the parent must wire (I did not edit install/adapter)

The native projectile chronology (parent's `Projectiles._step`) should, for each candidate
actor that is currently in an Ink Vac, call:

```js
const cand = api.inkVacAbsorbCandidate(actor, p.prev, p.pos, p);
// cand === null  -> no intake contact
// cand.distance   -> first-contact distance of p with the intake volume
// cand.onHit()    -> absorbs p (damage->0, credit charge once), run ONLY if the intake
//                    candidate wins the nearest comparison against wall/actor/boss
```

The hook returns a first-contact **distance** and an `onHit` side-effect function. It does
**not** integrate or scan native projectiles a second time — the caller owns that single
pass. The parent compares `cand.distance` against the native wall/actor/boss distances and
calls `onHit()` only for the winner. `api.inkVacState(actor)` exposes the held state.

Parent-owned composition steps not performed here:
- add `charger.special = 'inkvac'` / `specialCost = 190` (from `base-kit-fields.json`);
- register the kit in `profile`/`SPECIALS` and the weapon-select UI;
- call `installKitInkVac(api, profile)` from `runtime/install.mjs`;
- call the candidate hook from the native projectile chronology;
- Special Charge Up gear multiplier already composes on top of the base 190 (gear.mjs owns it).

## Verification (focused, composed)

`node --experimental-vm-modules --test patches/splatoon3/tests/kit-ink-vac.test.mjs`
→ **12 pass / 0 fail** (`evidence/.../kit-ink-vac.log`, EXIT=0). Tests drive the real
`Actor` activation/update and the real `Projectiles` exhale entry and the candidate hook;
helpers alone are not treated as proof. Covered: front/back, intervening wall, range,
absorbed damage disabled, single (no double) credit, movement + weapon use during special,
charge-scaled countershot blast + turf via native pipeline, remote-ghost no-author, death and
explicit disposal (GPU resource removed), pinned/calibrated geometry helpers.

## Limitations

- Charge/duration/damage-unit conversions and frontal gate are calibration, not sourced.
- The fixed `InhaleToExhaleWaitFrame` / `ExhaleWaitFrame` timings are not reproduced.
- Exhale speed (`0.55/0.7`) is recorded but not used by this integration.
- Kit registration (`charger.special = 'inkvac'`, `specialCost = 190`) and the projectile
  hook wiring are parent-owned and not exercised end-to-end here.
- No browser/physical-device capture; logic/composed-level only.