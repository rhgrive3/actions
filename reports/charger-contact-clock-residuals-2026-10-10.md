# Charger finite-flight contact/clock residuals

Baseline: `6f5b2850bd18e2d0b2ff1639e0637deaf9f35e1d` in the separate
PR #1202 data-fidelity integration branch. Original PR #1202 and main are not
modified by this workstream. Related issue: #1040, whose previous scope/report
explicitly excluded the Charger collision root.

## Fixed: two independent causes

1. **End-pose-only contacts.** The finite Charger path tested actor capsules at
   their final pose although its segment covered the same fixed tick during which
   those actors moved. This produced both phantom hits after the round had
   passed and missed hits when the actor left the ray before the tick ended.
   Read the existing `coherentMotionStart` record. Sweep the relative projectile
   endpoint against the actor's start pose; retain the returned shared-time
   fraction on the actual world segment for world/defense/boss ordering.
   A final range-clipped segment scales actor displacement by its actual flight
   duration; it cannot borrow the rest of the tick after the shot expires.
   Existing teleport, spawn, form, ownership and life invalidation stays owned by
   actor-motion. No new interpolation function or second motion snapshot exists.
   Only live 1/60-second steps use that interval; historical ghost catch-up and
   unsupported direct timestep sizes preserve the static presentation fallback.
2. **Pre-guard flight advancement.** The Charger update wrapper ran before the
   native Projectiles.update input guard. A negative 1/60-second update moved a
   full-charge shot from Z=0.3 to Z=-4.5, despite the native owner rejecting it.
   Reject non-finite/non-positive dt before this wrapper can move flights,
   trigger contact/paint, advance wall drops or retire jobs.

Partial shots still stop at their first valid capsule, full shots retain
once-per-target piercing, walls/defenses/bosses keep the previous chronology,
and ghosts never acquire hit/paint authority. Moving allies use the already
established partial-bodyblock rule without friendly damage.

## Source comparison and retained limits

The user-provided part-02 source archive was re-read. The pinned original is
[Leanny/splat3@7280ff9c, WeaponChargerNormal 11.3.0](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponChargerNormal.game__GameParameterTable.json),
SHA-256 `dfe4637def507f933b0bbecbc805331f6357bb69ac165608a6e558406a4b72c1`.
The current CollisionParam and MoveParam objects exactly match that table.
Init/EndRadiusForPlayer=0.125 is unchanged. Full launch speed 4.8 per source
frame continues to map to 288 world units/second at 60 Hz; the runtime profile's
length scale remains 1 WU/source length. Range and charge/damage parameters are
not retuned.

This archive contains extracted parameters, not the Nintendo executable
collision routine. Relative linear motion is the same fixed-step consistency
law already used by INKWAVE's ordinary projectiles. Test target displacement is
synthetic geometry, not a claimed retail movement speed. Shader/browser output,
physical Switch behavior and live relay conditions are not established here.

Two tempting changes were deliberately withheld: propagating the ordinary
projectile's submerged-friendly exception to Charger (the existing report calls
that exception a local decision, not verified retail semantics), and inferring
a circular nearest Charger footprint solely from a parameter name. Neither has
sufficient supplied evidence for a gameplay alteration.

## Verification

Final native-module suite: 11 pass, zero skip. It covers both false/missed contact
controls, teleport invalidation, invalid dt, partial/full multi-target order,
world-first contact, moving allied blockers, non-authoritative ghosts, the
actual sourced final 0.037-WU range remainder, and
30/60/120 Hz rendering over the fixed 60 Hz simulation. Before the fix, the
initial four-test set had three failures and one teleport-control pass.
The first relative-motion draft failed the range-expiry control; this was caught
during review and corrected before integration. Charger-wide verification
passed 207 tests with zero skips before that final range-duration refinement.
The final version re-runs its new suite and neighboring flight/collision tests;
these stages are distinguished from a full final-code rerun.

The fixture exposes the existing actor-motion exports in its VM so tests and the
production solver use the same snapshot realm; this adds no production feature.
The source/adapters, finite projectile owner and collision functions are actual
modules, while rendering and device input remain fixture sinks. Full emitted
build and integrated exact-head CI remain the parent's verification stage.
