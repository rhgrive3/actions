# Kraken knockback route audit (2026-10-21)
Status: incomplete research, no production physics change. Runtime remains PR1743 fc5d5bcb57494c1aed693799d537045071712506.

## Parameter evidence
Pinned extractor record:
https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpCastle.game__GameParameterTable.json
KnockBackKf_Std=3; Charge_St=3; Charge_Ed=1; Charge_Ed_Frm=30; Dash=0.
These are coefficients, not a base acceleration or velocity. They do not establish whether every blast impulse shares the same base, nor the interpolation curve.
The same pinned misc/SplPlayer.game__GameParameterTable.json contains explosion KnockBackParam records (including Accel470), not an identified generic incoming-shot base force. Absence in this file is not proof no inherited/default value exists.
The adjacent research-only .mjs stores known endpoints, returns null for unknown charge interior/startup/finish, and is not imported by production. Nine V8 endpoint/unknown cases passed; this is not gameplay acceptance.

## Current route at fc5d
- all-specials.mjs Actor.damage wrapper returns false for active Kraken (t>=1 and t<duration), without applying a shot impulse.
- Native weapons.js Projectiles.applyHit routes local damage to victim.damage; Actor.damage updates HP/flinch but not velocity.
- sub-special-fidelity.mjs applySplatBombKnockback applies a separate recipient-local velocity delta even if damage is blocked, with stale ghost-life rejection.
- Its existing splatBombKnockbackDelta maps Accel via /10/60 and distance attenuation. Its own documentation calls that the repository calibration, not Nintendo's published integrator.
- applyBlasterBlastContact requires accepted local contact before applyBlasterKnockback. Blaster pending horizontal impulses are protected around Actor._horizontal once.
- Kraken normal/charge uses moveCombatSquid, not that ordinary _horizontal path. Dash directly sets horizontal velocity each step. Blindly adding velocity can thus be damped or overwritten before displacement.
- main-knockback.mjs separately handles source-backed Blaster blast and Roller body contact. Do not generalize those baselines to all incoming shots.

## Safe boundary and required next evidence
No base impulse was invented; no blast multiplier or shared actor movement wrapper was installed.
Before wiring: establish generic shot base and application point from additional engine defaults or measured original-game displacement; identify blast vs bullet coefficient applicability; preserve recipient authority/stale-life rejection; give external impulse a collision-resolved movement lifetime without altering ordinary character motion.
Tests must distinguish damage immunity from displacement, standard/charge/dash, local vs remote victims, stale-life packets, horizontal/vertical impulse, and 30/60/120Hz.
