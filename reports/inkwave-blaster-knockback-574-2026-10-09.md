# #574: standard Blaster air-burst knockback, partial correction

Base: `5d0be6b7fdebfd07e696e75497aaa97aa5ff5648` (main, 2026-10-09).
Target: built `inkwave-public/` with the active Splatoon 3 adapters. Upstream mirror unchanged.
Status: **partial correction, Refs #574; do not close the issue as retail-physics parity.**

## Source and uncertainty

Reference: Splatoon 3 Ver. 11.3.0, standard Blaster, ordinary indirect midair explosion, stationary unprotected opponent on a flat floor. The pinned [WeaponBlasterMiddle table](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponBlasterMiddle.game__GameParameterTable.json) records `BlastParam.KnockBackParam = { Accel: 700, Bias: 0.8, Distance: 3.5 }`. Those values already exist in `profile.weaponsFidelityCompletion.weapons.blaster.BlastParam` and are now bound to the runtime tuple by regression coverage. The separate damage bands remain 70 HP through 1.025 and 50 HP at 3.385.

The public table does **not** specify Nintendo's acceleration units, exact Bias integration, impulse duration, or direct/terrain collision priority semantics. This correction reuses the existing #535 Splat Bomb **INKWAVE calibration**, `delta-v = (Accel / 10 / 60) * (1 - distance / Distance)^Bias`, and the repository's current world-distance interpretation. These conversion factors are not newly measured Splatoon 3 facts. No Switch video/physical-device comparison was performed. Terrain/direct-hit knockback, full vertical/body-state behavior and actual retail displacement remain unverified and unchanged.

## Reproduction and changes

Before: call the native composed `_blastBurst` with a non-direct opponent two world units from the explosion center. Damage is admitted, but the authoritative velocity has no blast term. The 3.385..3.5 region has neither damage nor force.

After:

- Preserve the existing damage bands, cover probes, impact paint, FX/audio and boss path. Air-burst contact also admits its independent 3.5 knockback radius. The interval beyond the damage radius is knockback-only.
- Derive the direction from explosion center to the existing target sample. Zero-length, nonfinite, boundary/outside, friendly, dead, fully covered, invulnerable and ghost contacts do not apply force. Dome cover also blocks the knockback-only interval.
- Apply a bounded calibrated delta only on the victim's authoritative actor. A newly received horizontal impulse is separated from one update of input acceleration before entering the native body/terrain integrator. Without this separation, ordinary 36/60 braking erases weak impulses before any displacement. Subsequent braking is unchanged. Reset clears pending state; body-owning paths cannot retain a delayed impulse after their update.
- Keep the current attacker-authoritative Blaster hit decision. The existing reliable hit packet can carry a finite three-component explosion-to-target offset, never arbitrary client-specified force. Recipient admission retains authenticated sender, actor ownership, life epoch and hit-sequence deduplication; the recipient recomputes the bounded response. A zero-damage packet is allowed only for valid Blaster knockback geometry. Ordinary/direct packets without that geometry keep their existing behavior.
- Store the optional geometry on the existing retryable message, keep acknowledgements, restore scoped metadata after exceptions and leave ghosts presentation-only. Ordinary actor snapshots carry the resulting velocity.
- Do not add speculative terrain/direct knockback or change the existing reduced collision-burst damage. Do not add force to Trizooka or other special-projectile descriptors.

Implementation: `patches/splatoon3/adapter.mjs`, `runtime/sub-special-fidelity.mjs`, and `patches/network-replication/adapter.mjs`.

## Verification

- New focused tests: 10/10 passed. Six composed gameplay/native-physics tests and four separate-owner network tests.
- Native Actor.update, input braking, Level and Physics produce nonzero flat-ground displacement with matching fixed-step results at 30/60/120 render intervals. Thin-wall collision stops the body; reset removes pending impulse state.
- Network tests cover independent sender/recipient fixtures, duplicate packet plus ghost replay, knockback-only zero-damage ACK, stored retry geometry, malformed/oversized geometry, negative and ordinary zero damage, wrong sender, stale life, friendly/dead/invulnerable targets and exception cleanup.
- Existing related regression tests: 92/92 passed (Bomb knockback/authority, Blaster cover/terrain/direct/delay, Bubbler contact, native movement acceleration/resources and combat-life admission). Changed JS/MJS syntax: 5/5 passed; diff whitespace check passed.
- Negative control: disabling only first-step impulse protection makes the native Actor.update displacement test fail, confirming the check detects input-braking loss. The production implementation was restored afterward.
- Focused local evidence is not an aggregate CI or browser/Switch verification. The final combined tree needs its own checks.

## Remaining acceptance gaps

The raw tuple, independent region, authoritative response and single network application are covered. Nintendo's precise integrator, direct-hit priority/knockback, terrain scaling, vertical and body-owning special/dodge states, mixed-version clients and retail feel are not established. Older receivers reject knockback-only zero-damage packets and ignore the added geometry on damaging hits. #574 therefore remains open for those fidelity/compatibility decisions.
