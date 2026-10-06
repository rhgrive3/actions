# Dualies jump-spread recovery — #887

## Reference and behavior

Reference: Splatoon 3 Ver. 11.3.0, Splat Dualies, normal human jump and firing, with no Dodge Roll or post-roll turret lock. Nintendo lists Ver. 11.3.0 as the current release; the internal weapon values below come from the pinned extracted table, not from Nintendo's public patch notes.

The pinned `WeaponManeuverNormal` table at source commit `7280ff9cde8bb1c5dcef46c700c326471584d2e6` records `Stand_DegSwerve = 2`, `Jump_DegSwerve = 7.5`, `Jump_DegBiasDecreaseStartFrame = 25`, `Jump_DegBiasEndFrame = 70`, and `Jump_DegBiasMax = 0.4`. The profile keeps these source fields at `patches/splatoon3/profile.json` under `weaponsFidelityCompletion.weapons.dualies.WeaponParam` and pins the reference clock at 60 Hz.

The source pins the endpoints and frame boundaries; it does not expose the intermediate recovery equation. The adapter linearly blends the existing spread endpoints between frames 25 and 70 as a local approximation. That intermediate curve is not verified against Switch gameplay and is not recorded as exact native behavior.

## INKWAVE finding and fix

At main `f31f5da439134fe49bb89018dad5557671a49c67`, `inkwave-public/src/game/weapons.js::WeaponRunner._spreadDeg()` selects `spreadAir` or `spreadGround` directly from `a.grounded`. The first grounded tick therefore selected 2 degrees even if the jump's source recovery window had not reached frame 70. Its existing bloom multiplier was independent of the jump state.

`patches/splatoon3/runtime/weapons.mjs` now reads the Dualies frame bounds from the pinned profile. It starts a timer from the actor's actual `actor:jump` event and stores the timer on that actor's `WeaponRunner`. It holds the jump endpoint through 25F, blends toward the ground endpoint, and saturates at the ground endpoint at 70F. The existing `WeaponRunner.spread` remains the shared value sent to projectiles and read by the HUD. Normal 5F shot cadence and the projectile angular sampling code are unchanged.

Squid/swim jumps do not start this human Dualies state. Dodge and post-roll turret states keep their existing spread lock, reset clears the timer, and actor instances do not share timer state. Incoming ghost projectile velocities are still assigned directly from the wire record.

## Reproduction and impact

Use a Dualies actor in human form, perform a normal jump without moving into a Dodge Roll, fire through landing, and inspect `weaponRunner.spread` alongside the spread passed to `fireDualies`. Main previously changed to the ground endpoint on the first grounded frame. With this adapter, the jump endpoint remains through 25 fixed simulation frames and the ground endpoint is reached at 70 fixed frames, regardless of render cadence.

The player-facing change is that jump-shot spread no longer snaps tight on the landing frame. The gameplay projectile cone and HUD spread move together because both consume the same runner value.

## Verification and limits

Focused source tests cover the 25F/70F boundaries and landing transition, identical traces under 30/60/120Hz rendering over the fixed 60Hz simulation, projectile/HUD spread agreement, unchanged five-frame Dualies cadence, swim jump exclusion, Dodge Roll/turret lock, reset, per-actor isolation, offline Range execution, and unchanged incoming wire velocities. These are deterministic VM logic checks; browser gameplay and Switch hardware comparison were not run.

Remaining limitation: the extracted table does not document the recovery curve between 25F and 70F. The current linear blend is an explicit approximation pending a grounded source or hardware measurement. Issue #887 should remain open for that native-curve confirmation. #891's angular probability/cone work and #883 are outside this change.
