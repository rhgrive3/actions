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
4. **Release** (charge-full or cap): a charge-scaled countershot using the native
   `type:'blast'` projectile. Per the agreed parent contract, the module only queues the
   native blast projectile carrying the resolved descriptor; the native integrator and
   `_blastBurst` remain the authority for motion and detonation. This module does **not**
   apply a manual splash/paint (avoids double application and a second damage/paint engine).
   A **remote ghost authors nothing** (no projectile is queued, so no damage/paint).
5. **Normal use during the special**: the native `update` early-return for slam/storm is
   bypassed **only** for `id === 'inkvac'` by temporarily hiding `specialActive` around the
   native pass, so movement, squid form and main/sub weapons keep running. The token is
   restored so death/reset and the native lifecycle still own it.
6. **Lifecycle**: expiry (release), interruption (weapon swap clears via reset path),
   death (`Actor.splat`) and reset (`Actor.reset`) all clear the state and dispose any GPU
   resource the state created (an owned cone mesh). `disposeInkVac` is exported.

## Integration hooks the parent must wire (I did not edit install/adapter)

### A. Candidate hook (native projectile chronology)

For each candidate actor currently in an Ink Vac, call:

```js
const cand = api.inkVacAbsorbCandidate(actor, p.prev, p.pos, p);
// cand === null  -> no intake contact
// cand.distance   -> first-contact distance of p with the intake volume
// cand.onHit()    -> absorbs p (damage->0, credit charge once), run ONLY if the intake
//                    candidate wins the nearest comparison against wall/actor/boss
```

Returns a first-contact **distance** and an `onHit` side-effect closure; it does **not**
integrate or scan native projectiles a second time. `api.inkVacState(actor)` exposes the
held state.

### B. Countershot descriptor (agreed with parent)

`inkVacBlastDescriptor(charge)` is exported and also set on the projectile. Contract:

- projectile `type: 'blast'` (native integrator/burst);
- `p.wid = 'inkVac'` (the id; parent uses it as the splash cause and restores the ghost
  descriptor from the installed id registry). If the parent prefers `trizooka` for the
  other special, only that module's descriptor differs;
- `p.s3SpecialWeapon = <descriptor>` set **before** native `_push`;
- `p.damage` carries the direct damage;
- descriptor supplies `splashBands`, `splashRadius`, `splashDamageMax/Min`, `burstRadius`,
  `impactRadius`, `kind:'special'` and a `provenance` block.

Parent-side work already agreed: preserve `p.s3SpecialWeapon` in runtime `_push` (instead of
copying the owner main weapon, which would let Shooter `ageDamage` cap damage), reset it in
`_new` reuse, and adapt native `_blastBurst` to `p.s3SpecialWeapon || WEAPONS.blaster`.
Without that handoff the native burst still reads `WEAPONS.blaster`, so **current native
integration of the charge-scaled blast is NOT claimed**; the tests assert the descriptor
contract that the handoff consumes.

### C. Composition steps not performed here (parent-owned)

- add `charger.special = 'inkvac'` / `specialCost = 190` (from `base-kit-fields.json`);
- register the kit in `profile`/`SPECIALS` and the weapon-select UI;
- call `installKitInkVac(api, profile)` from `runtime/install.mjs`;
- call the candidate hook from the native projectile chronology;
- apply the `_push`/`_new`/`_blastBurst` descriptor handoff above;
- Special Charge Up gear multiplier already composes on top of the base 190 (gear.mjs owns it).

## Verification (focused, composed)

`node --experimental-vm-modules --test patches/splatoon3/tests/kit-ink-vac.test.mjs`
→ **13 pass / 0 fail** (`evidence/.../kit-ink-vac.log`, EXIT=0). Tests drive the real
`Actor` activation/update, the real `Projectiles` blast entry and the candidate hook;
helpers alone are not treated as proof. Covered: front/back, intervening wall, range,
absorbed damage disabled, single (no double) credit, movement + weapon use during special,
the native `type:'blast'` countershot with its resolved descriptor and charge scaling,
remote-ghost no-author, death and explicit disposal (GPU resource removed), pinned/calibrated
geometry helpers.

## Limitations

- Charge/duration/damage-unit conversions and frontal gate are calibration, not sourced.
- The fixed `InhaleToExhaleWaitFrame` / `ExhaleWaitFrame` timings are not reproduced.
- Exhale speed (`0.55/0.7`) is recorded but not used by this integration.
- Kit registration (`charger.special = 'inkvac'`, `specialCost = 190`), the projectile
  candidate-hook wiring and the `_blastBurst` descriptor handoff are parent-owned; until the
  handoff lands the native burst still reads `WEAPONS.blaster`, so the charge-scaled blast
  is not claimed end-to-end.
- Main weapon is verified as usable during the special; the sub uses the identical native
  pipeline path but is not separately asserted.
- No browser/physical-device capture; logic/composed-level only.