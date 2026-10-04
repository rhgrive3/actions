# Ink Vac (SpBlower) for Splat Charger — public INKWAVE, freebuff-8 kit task (2026-10-04)

Scope: public composed runtime only (`inkwave-public` + `patches/splatoon3`). No native
source, lock, FETCH or generated-output edits. Owned files: this report,
`patches/splatoon3/runtime/kit-ink-vac.mjs`, `patches/splatoon3/tests/kit-ink-vac.test.mjs`.
Parent owns profile / install / adapter / gear / network, the native burst integration, the
candidate-hook wiring and the installed browser.

Native id used consistently everywhere (weapon.special, `specialActive.id`, `p.wid`,
`descriptor.id`): **`inkVac`**.

## Issue 177 mapping (pinned receipts)

`evidence/actions-freebuff-20261004/kit-primary/base-kit-fields.json`
(Leanny/splat3 @7280ff9cde8bb1c5dcef46c700c326471584d2e6, 11.3.0): `charger` →
`SpBlower` (Ink Vac), `SpecialPoint = 190`, sub `Bomb_Splash`. Only the charger's Ink Vac is
implemented here; it is not a Storm/Slam alias.

## Pinned values used

From `WeaponSpBlower.game__GameParameterTable.json`:

| Field | Value | Use here |
| --- | --- | --- |
| `InhaleParam.LengthMax` | 15 | frustum length |
| `InhaleParam.RadiusMin.{Low,High}` | .8 / 1.4 | near radius at charge ends |
| `InhaleParam.RadiusMax.{Low,High}` | 3.3 / 4.3 | far radius at charge ends |
| `ExhaleParam.DirectDamage` | 2200 | countershot damage (via repository `/10`) |
| `ExhaleParam.SpawnSpeedZSpecUp.Low` / `SpawnSpeedZMaxCharge` | .55 / .7 | spawn speed, ×60 |
| `ExhaleParam.FlyGravity` | .003 | ×3600 gravity |
| `ExhaleParam.FlyPositionAirResist` | .01 | ×60 drag |
| `ExhaleParam.SpawnBlastWaitFrame` | 50 | detonation delay (projectile `delay`) |
| `WeaponParam.InhaleToExhaleWaitFrame` | 20 | minimum inhale before a manual release |
| `WeaponParam.ExhaleWaitFrame` | 150 | special time cap |
| `ExhaleBlastParam{Min,Max}Charge.PaintRadius` | 6.0 / 11.0 | charge-scaled blast reach |

## Explicit calibration / limitations

- **Damage conversion.** Uses the repository's established `rawDamageToHP: "/10"`
  (profile.json `calibration.unitConversions`), so the pinned 2200 raw is **220 HP**.
  The earlier `100/3000` was inconsistent with the repository and has been removed. 220 HP
  exceeds the 100 HP actor pool, so the countershot splats on contact: this is a **physical
  scale limitation** of copying the raw Splatoon number into INKWAVE's HP pool, not a
  hardware-parity claim.
- **Intake geometry reading.** `RadiusMin`/`RadiusMax` are read as the **near (muzzle-end)**
  and **far (`LengthMax`-end)** radius of a frustum that widens away from the player, with
  `Low`/`High` the ends of the charge range. The volume is therefore a **widening frustum**
  along the **full 3D aim vector** — not a cylinder, and not a cone about horizontal only.
  Nintendo's actual field meaning of `RadiusMin`/`RadiusMax` is **unconfirmed**; this is a
  labelled interpretation, not a source claim.
- `breathOriginHeight = 1.0` (intake origin above feet) — calibration.
- `frontalEpsilon = -0.05` (must travel against the aim) — calibration.
- `absorbCreditPerProjectile = 0.34` charge per accepted projectile — calibration.
- Unknowns left explicit: the exact mapping of the 20F/150F fields onto "minimum inhale
  before manual release" and "special time cap" is an interpretation; blast detonation
  visuals and the `GuideRadius 0.25` guidance are not reproduced.

## Behaviour

1. **Activation** consumes the gauge, refills the tank once, forces kid form, opens a held
   inhale state and creates the intake visual.
2. **Special replaces main and sub.** During the inhale the native pass runs for movement
   only: `intent.fire`, `intent.sub` and `intent.squid` are withheld and form is pinned to
   kid. **Primary fire releases the countershot** (after the pinned 20F window). The token is
   restored around the native pass only if the actor is still alive and still owns the state.
3. **Held frontal intake.** A projectile is accepted only if it travels toward the player, and
   its swept segment **first enters** the frustum within `LengthMax`; LOS is tested at that
   first-contact point, so an intervening wall blocks intake.
4. **Charge** credited once per accepted absorption; absorbed projectiles get `damage = 0`
   and a guard so they can never be credited or damaged twice.
5. **Release** (charge full, primary fire, or the 150F cap) queues a native `type:'blast'`
   countershot carrying the resolved descriptor. The native integrator and `_blastBurst`
   remain the authority; this module applies no manual splash/paint. Countershot ballistics
   use the pinned speed/gravity/drag and the pinned `SpawnBlastWaitFrame` delay. A **remote
   ghost authors nothing**.
6. **Lifecycle.** Expiry/interruption, death and reset clear the state and dispose the owned
   GPU mesh. `dt === 0` is a strict no-op.

## Projectile contract (kept as agreed)

`fireInkVacExhale` pushes a real native projectile via `_new`/`_push` with
`type:'blast'`, `p.wid = 'inkVac'`, `p.s3SpecialWeapon = inkVacBlastDescriptor(charge)`
set **before** `_push`, and direct damage on `p.damage`. The descriptor supplies both
`splashBands` and `damageBands` (parent supports either), plus `splashRadius`,
`splashDamageMax/Min`, `burstRadius`, `impactRadius`, `kind:'special'` and a `provenance`
block. Errors are not swallowed.

Parent-side work still required: preserve `p.s3SpecialWeapon` in runtime `_push`, reset it in
`_new`, adapt `_blastBurst` to `p.s3SpecialWeapon || WEAPONS.blaster`, use `p.wid` as the
splash cause and restore the ghost descriptor from the installed id registry. Until that
handoff lands the native burst still reads `WEAPONS.blaster`, so **native integration of the
charge-scaled blast is NOT claimed**.

## Candidate hook

```js
const cand = api.inkVacAbsorbCandidate(actor, p.prev, p.pos, p);
// null | { distance /* analytic first contact */, onHit }
```
Compare `cand.distance` against the native wall/actor/boss distances and call `onHit()` only
for the winner. The hook performs no integration or second projectile scan.

## Verification

`node --experimental-vm-modules --test patches/splatoon3/tests/kit-ink-vac.test.mjs`
→ **21 pass / 0 fail**. Tests drive the real `Actor` activation/update, the real `Projectiles`
blast entry and the candidate hook. Coverage includes: gauge/tank consumed once; frontal
absorb with damage disabled; backside rejection; intervening wall; intake length; a projectile
that only **sweeps through** the volume (analytic first entry at the far boundary); vertical
aim alignment; single (non-double) charge credit; main/sub/form withheld while held; primary
fire withheld inside the 20F window then releasing; 150F cap auto-release; native `type:'blast'`
countershot with descriptor and both band forms; pinned speed 42 u/s, gravity, drag and 50F
delay; damage 220 via `/10`; remote ghost no-author; death during an update not restoring the
token; `dt 0` no-op; visible aim-aligned front-only presentation; reset/dispose GPU removal;
pinned/calibrated geometry helpers.

## Limitations

- Kit registration (`charger.special='inkVac'`, `specialCost=190`) and the candidate-hook and
  `_blastBurst` wiring are parent-owned; end-to-end charge-scaled detonation is not claimed.
- The `RadiusMin`/`RadiusMax` near/far reading is an interpretation (unconfirmed).
- 220 HP exceeds the 100 HP pool (instakill) — physical scale limitation.
- Origin height, frontal epsilon and per-projectile charge credit are calibration.
- 20F/150F field mapping, blast visuals and `GuideRadius` guidance are not reproduced.
- Logic/composed level only; no browser or physical-device capture.