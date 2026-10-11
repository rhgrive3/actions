# INKWAVE #1089: Special retires the preceding Dualies firing stance

Baseline: `main@5d0be6b7fdebfd07e696e75497aaa97aa5ff5648`, 2026-10-09 UTC.
Issue: https://github.com/rhgrive3/actions/issues/1089

## Root and repair

An actual Dodge Roll establishes `s3Turret`. Special ownership bypasses the
native WeaponRunner update. Before this change, its continuous-fire stance
therefore survived a Special, and holding ZR restored the previous 4F / zero
spread shots afterward without a new Dodge Roll.

`installWeapons` now consumes the existing committed `special:use` event for an
authoritative Dualies actor. It clears `s3Turret`, the main post-roll first-shot
timer, and the separate weapon-gates deferred-shot flag/timer. The actual
Special input or a rejected start does not publish that event and cannot erase
a valid current stance. A later Dodge can establish a fresh stance normally.

The event boundary also covers kit owners that do not call the original
`Actor._startSpecial`. No parallel Special admission policy or numeric delay
was added. Current cooldown, ink, roll count, movement lock and ink-recovery
history retain their existing owners. Other weapon kinds and remote visual
actors are excluded. The existing Special-start active-Dodge cancellation
remains separate and unchanged.

## S3 comparison and limits

The reference remains Splat Dualies, Splatoon 3 Ver. 11.3.0. Nintendo's
[S3 weapon overview](https://splatoon.nintendo.com/en/weapons/) establishes the
Dualies/Dodge family; the pinned
[WeaponManeuverNormal source table](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponManeuverNormal.game__GameParameterTable.json)
and existing profile own the unchanged normal 5F versus post-roll 4F cadence
and post-roll zero-deviation value.

This repair treats a successfully intervening Special as a break in the old
main-weapon firing action, as requested in #1089. No private Nintendo state
variable or additional frame boundary is claimed. The current INKWAVE Dualies
kit uses Tidal Slam, which is not the verified S3 Splat Dualies kit. Its Special
animation, landing logic and kit identity are not changed or certified here.
Nintendo hardware equivalence remains unmeasured.

## Native checks

The focused test uses production source-adapter composition, real Actor,
WeaponRunner, projectile emission and the existing native Special lifecycle.
It bounds rendering and floor resolution; it does not set `specialActive=null`
to bypass completion. The source fixture installs the relevant gameplay
wrappers and fidelity owner, not the complete renderer/UI installer.

- Removing only the new event listener reproduces the stale 4F / zero-spread
  turret after a real Special completes.
- Held and released ZR both return to normal 5F / nonzero-spread shots with the
  listener present.
- Successful activation inside the post-roll 4F pending window clears both
  independent pending owners without resetting paid-ink/roll/recovery state.
  The fixture's separate Special ink-refill installer is not enabled for this
  exact state-preservation assertion; the listener never writes the tank.
- A fresh Dodge after the Special restores the ordinary post-roll state.
- Uncharged native input and a guarded rejected Trizooka start preserve the
  old stance; a charged native Trizooka start clears it.
- Unrelated weapon and remote actor events do not mutate their runner state.
- 30/60/120 Hz render schedules agree when driving identical fixed updates.

The seven new cases and adjacent Dualies recovery/gate, #477 action admission,
#883 scalar spread, weapon-config hot-path and #196 Charger Special regression
suites pass **50/50**, with zero failures/skips. Changed modules parse, the quick
upstream/numeric provenance gate passes, and `git diff --check` is clean.

Focused test receipts are native logic evidence, not a rendered browser,
physical controller, socket session or Nintendo capture. Final combined-PR
validation remains a separate gate.
