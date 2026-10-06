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
| `ExhaleParam.SpawnBlastWaitFrame` | 50 | native projectile **lifetime** before detonation (`delay` stays 0) |
| `WeaponParam.InhaleToExhaleWaitFrame` | 20 | minimum inhale before a manual release (interpretation) |
| `WeaponParam.ExhaleWaitFrame` | 150 | **inspected and NOT used as the inhale duration** (exhale standby field) |
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
- **Inhale duration is CALIBRATED (`2.5 s`), not source-backed.** The SpBlower table
  carries no total inhale duration. `ExhaleWaitFrame 150` is an exhale standby field and is
  deliberately **not** used as the inhale duration; the earlier source-backed claim was
  wrong and has been removed. `InhaleToExhaleWaitFrame 20` is interpreted as the minimum
  inhale before a manual release.
- **Countershot lifetime is finite and pinned.** `SpawnBlastWaitFrame 50` is the native
  projectile lifetime (`life = 50/60`) with `delay = 0`, so the native integrator runs from
  the first frame and `_step`'s `p.age > p.life` rule fires the burst at exactly frame 50.
  `life` is never `Infinity`, so no unbounded claim is made. `age` is initialised to 0 so the
  native clock is valid.
- Blast detonation visuals and the `GuideRadius 0.25` guidance are not reproduced.

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
   and a guard so they can never be credited or damaged twice. **A net ghost is a replay and
   is given no authority**: its `onHit` credits nothing and mutates nothing.
5. **Release** (charge full, primary fire, or the calibrated inhale duration) queues a native
   `type:'blast'` countershot carrying the resolved descriptor. The native integrator and
   `_blastBurst` remain the authority; this module applies no manual splash/paint.
   Countershot ballistics use the pinned speed/gravity/drag and burst at the pinned lifetime.
   A **remote ghost authors nothing**.
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

## Robustness details

- **Analytic entry tolerance**: the surface quadratic is tested with a scale-relative
  tolerance so a root that is analytically on the boundary but lands a few ulps outside
  after rounding is still accepted. Zero-length segments (inside / outside / behind) take a
  point test after the quadratic is built, with no temporal-dead-zone error.
- **Degenerate aim**: a zero `aimDir` (before the first update or after a reset) falls back
  to the actor's facing, then to +Z, so the intake never degenerates.
- **Disposed state**: a disposed actor yields no intake candidate.
- **Pause**: a `dt <= 0` frame is a strict no-op — it never releases, never queues a
  countershot and never fires the main weapon. On the release frame the replaced main/sub/
  squid inputs stay suppressed, so the player cannot also shoot on that frame.

## Remote replay (explicit, parent-wired)

`replayInkVac(eventName, actor, payload)` is the single entry point the parent calls from the
native NetMatch transport. It never touches native source, the adapter, the profile or any
network file.

**Wire contract.** Native `packEvent`/`unpackEvent` keep only TOP-LEVEL actors (`{n: nid}`),
`[x,y,z]` vectors, numbers, strings and booleans — every nested object is dropped. All payloads
are therefore deliberately **flat**:

| Event (`INK_VAC_EVENTS`) | Payload |
|---|---|
| `special:inkvac` | `{ actor: owner, kit, serial, charge, nid? }` |
| `special:inkvac-charge` | `{ actor: owner, kit, serial, charge }` |
| `special:inkvac-absorb` | `{ actor: shooter, target: vac owner, kit, serial, key }` |
| `special:inkvac-release` | `{ actor: owner, kit, serial, charge, authored }` |
| `special:inkvac-dispose` | `{ actor: owner, kit, serial }` |

`actor` is the **shooter** for a proposal and the Vac **owner** for its own events, matching
native `_onLocalEvent`/`_playEvent` (`e.actor || e.victim`). The activation id is
`activationKey(actor, serial)` = real `nid` when the transport has one, otherwise a unique actor
identity, plus a monotonic per-owner serial.

**Authority.** A replica may only present. It never authors a countershot, paint, damage, gauge
consumption, tank refill or charge of its own. The countershot itself travels as the native
`recProj`/`ghostProjectile` packet, so the release event allocates nothing on replicas.

**Absorb (proposal) validation** — every gate is checked before a single byte of state changes,
and each refusal carries its own reason:

| Refusal reason | Gate |
|---|---|
| `unknown-event` / `missing-event-or-actor` / `malformed-payload` / `not-inkvac` / `malformed-serial` / `malformed-subject` | shape, kit tag, `Number.isSafeInteger` serial, subject — checked first, for any event |
| `sender-actor-mismatch` | `payload.actor === actor` (the transport-resolved actor) |
| `no-peer-binding-for-sender` | a validator is installed but `opts.from` was not passed |
| `sender-not-owned-by-peer` | `validator(actor, opts.from)` is not exactly `true` (a throwing validator grants no trust) |
| `self-proposal` | the sender is not its own target |
| `same-team-sender` | the sender must be a genuine enemy of the owner |
| `dead-sender` | the sender must be alive |
| `replica-is-not-an-authority` | the target must be **locally owned** |
| `dead-target` | the target must be alive |
| `no-local-activation` / `stale-or-mismatched-serial` | the target must hold this exact live activation |
| `malformed-proposal-key` | key is a non-empty string, ≤ 64 chars, charset `[A-Za-z0-9#._:-]` |
| `duplicate-proposal` | bounded 64-key ledger |

**Peer binding is parent-owned.** Which peer a packet came from cannot be recovered from a
replayed payload, so the parent must install
`installInkVacSenderValidator((actor, fromPeerId) => senderPeerId(actor) === fromPeerId)` and
call `replayInkVac(name, actor, payload, { from })`. Until then the module takes the
unvalidated path and says so in `INK_VAC_CALIBRATION.authorityStatus` rather than pretending.

**Lifecycle ordering.** `release`/`dispose` record a bounded **tombstone** (last 32 serials per
replica) *before* anything else, even when no replica state exists — so a release that overtakes
its own activation still blocks the delayed activation (`activation-after-release-or-dispose`),
while the next serial starts normally. Serials are bounded safe integers. Replicated charge is a
**high-water mark**: a reordered packet carrying a lower value is refused
(`charge-regression-rejected`) and never walks the cone backwards.

**Native-owned projectile vs ghost.** When a native (non-ghost) round owned by a locally-owned
shooter enters a replica intake, `onHit` neutralises the shooter-authoritative damage at first
contact and emits an absorption **proposal** keyed by source projectile and activation
(`actor` = shooter, `target` = Vac owner). The **owner** consumes it under a bounded
duplicate-key ledger (last 64 keys) and credits with its own calibration. A ghost round is
consumed **visually only** — no damage edit, no charge, no proposal, no paint.

**Other guards.** Strict `dt <= 0` early return (form, `_prevIntent`, weapons, refill, gauge and
the inhale clock are all untouched); `_startSpecial` refuses dead, already-holding, reentrant and
not-ready calls; an `onHit` closure captured before disposal is a no-op.

**Parent handoff:** add the five `INK_VAC_EVENTS` names to the native `FORWARD` list, call
`api.replayInkVac(name, e.actor || e.victim, e, { from: peerId })` from the replay path, and
install the sender validator. Replica presentation is advanced by
`advanceInkVacReplica(actor, dt)`, wrapped around `NetMatch.prototype.applyRemote` when the real
NetMatch is supplied (remote actors are driven by `applyRemote`, not `Actor.update`).

## Verification

`node --experimental-vm-modules --test patches/splatoon3/tests/kit-ink-vac.test.mjs`
→ **46 pass / 0 fail**. Tests drive the real `Actor` activation/update, the real `Projectiles`
blast entry and the candidate hook. Coverage includes: gauge/tank consumed once; frontal
absorb with damage disabled; backside rejection; intervening wall; intake length; a projectile
that only **sweeps through** the volume (analytic first entry at the far boundary); vertical
aim alignment; single (non-double) charge credit; ghost given no authority; main/sub/form
withheld while held; primary fire withheld inside the 20F window then releasing; calibrated
inhale-duration auto-release; native `type:'blast'` countershot with descriptor and both band
forms; pinned speed 42 u/s, gravity, drag; **the native `_step` driven to the automatic burst
at exactly its finite lifetime (frame 50)**; damage 220 via `/10`; remote ghost no-author;
death during an update not restoring the token; `dt 0` no-op and release-frame suppression;
zero-length/tangent/zero-aim safety; disposed state; visible aim-aligned front-only
presentation; reset/dispose GPU removal; pinned/calibrated geometry helpers.

**Replay coverage** (two composed actors, real `packEvent`/`unpackEvent` mirrors, every packet
round-tripped through `JSON.stringify`): payload flatness and JSON safety; a replayed
activation opening a real replica scene cone; duplicate and out-of-order activations dropped;
stale-serial charge refused; malformed/foreign/target-less packets rejected with an explicit
reason and no half-applied state; a replica authoring no projectile/paint/gauge/refill/damage;
a native-owned round neutralising its damage and proposing credit the owner consumes exactly once
(no double credit, owner's own calibration); a ghost proposing nothing; owner death emitting
`dispose` that drops the replica state and both GPU resources; post-death and repeat packets
harmless; replica advance rejecting `dt <= 0`, negative and `NaN` steps and following its actor;
a stale `onHit` no-op; `_startSpecial` refusing dead/reentrant/not-ready calls; and a paused
frame changing nothing at all.

**Authority coverage**: a sender that is not the transport-resolved actor; self-proposal;
same-team sender; dead sender; replica target; dead target; oversize/whitespace/object/non-string
keys; spoofed and missing peer binding plus a throwing validator; release-before-activation
tombstoning with the delayed start blocked and the next serial accepted; charge high-water mark
against a reordered packet; unknown/malformed packets leaving the live cone, charge and scene
untouched; and a stale proposal refused after the owner's death.

## Limitations

- Kit registration (`charger.special='inkVac'`, `specialCost=190`) and the candidate-hook and
  `_blastBurst` wiring are parent-owned; end-to-end charge-scaled detonation is not claimed.
- The `RadiusMin`/`RadiusMax` near/far reading is an interpretation (unconfirmed).
- 220 HP exceeds the 100 HP pool (instakill) — physical scale limitation.
- Inhale duration (2.5 s) is calibrated, not sourced; `ExhaleWaitFrame 150` is an exhale
  standby field and is not used as the inhale duration.
- Origin height, frontal epsilon and per-projectile charge credit are calibration.
- Blast visuals and `GuideRadius` guidance are not reproduced.
- The replica stuck-cone guard (7.5 s) is a **calibrated** presentation-only failsafe for a lost
  release/dispose packet, not a sourced duration; the owner packet remains authoritative.
- The proposal ledger (64 keys) and tombstone ledger (32 serials) sizes are engineering bounds,
  not sourced values; the 64-char key cap is a transport guard, not a Nintendo field.
- **Peer binding is unverified end-to-end**: the validator hook is implemented and tested, but no
  real NetMatch peer id has been wired to it, so sender ownership in a live session is not claimed.
- **Replay is verified against the real composed modules and a faithful mirror of the native
  packer, not against a live NetMatch session.** No actual two-client/browser/online session was
  run: the `FORWARD` registration and the replay-path call are parent-owned and not yet wired.
- Logic/composed level only; no browser or physical-device capture.
## Parent integration (2026-10-04)

The production installer now installs this module with the actual NetMatch class, and kit-network.mjs registers all five native forward events. The native _play path passes its transport sender to _playEvent; typed replay binds the unpacked actor to byNid and actor.owner before accepting either state or absorption proposals. Actual NetMatch bind -> native packEvent -> JSON -> _play tests cover activation, duplicates, foreign peer rejection and exactly-once owner credit. The native projectile arbitration calls intake candidates beside wall/actor/boss candidates; a real swept shot is absorbed before the actor, with ghost charge unchanged. Existing per-projectile blast/ghost descriptor hooks supply the countershot. These are composed native tests, not a live online or device proof. Charger kit assignment remains pending the complete three-kit installer and exact-source browser CI.
