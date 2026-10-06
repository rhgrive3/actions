# INKWAVE — Dualies wall-drop and composed-runtime guards (2026-10-06)

Base main `67fec182b3e82e2e4473dfb08e47c6fe3c2c016b`. Target: `inkwave-public/` composed with the active `patches/` adapters (the same composition as `scripts/build-inkwave.mjs`). The `game/` prototype is not used.

## #604 — Splat Dualies wall impacts (fixed)

| Item | Value |
| --- | --- |
| S3 basis | Pinned Ver. 11.3.0 `WeaponManeuverNormal` mirror in `profile.json` → `weaponsFidelityCompletion.weapons.dualies`: `WallDropMoveParam` first 20–40F @ 0.06, second 10F @ 0.06, last 15–35F; `WallDropCollisionPaintParam` shock 1.3, fall 0.65, ground 0.6. Community datamine, not a Nintendo publication. |
| INKWAVE cause | `wallDropSource()` (`patches/splatoon3/runtime/weapons-fidelity.mjs`) admitted only roller / blaster / splatling. Dualies rounds hit `return null`, so `_step` ran the generic terminal `_impact` and the round died on the contact frame. |
| Change | One `dualies` branch reading the weapon's top-level records. The existing sourced wall-drop state (seeded periods, fall paint, ground paint, ghost catch-up budget, cadence-independent frames) is reused unchanged. Both hands and post-roll rounds share it. |
| Reproduce | Fire a Dualies round straight at a vertical own-paintable wall: before, `p.fidelityWallDrop` stays unset and one generic impact runs; after, the round is retained on the wall face and slides down for the sourced period. |
| Play impact | Dualies now leave the same vertical ink trail as other projectile families on walls, which affects wall-climb routes. Damage is unchanged: the wall-drop deals no HP damage. |
| Status | Logic-level (VM, native modules) and emitted-build verifier pass. Switch footage and frame-by-frame visual comparison are **not** performed. |

`FreeGravityType: value_0_008` is not consumed, exactly as for the other families already routed. That field remains unconfirmed.

Not touched: Shooter (#385, owned by Orchestrator C / PR #792, which edits the adjacent `blaster || splatling` line — this change is several lines away and merges cleanly) and Charger (#625 / #268: the pinned Charger record omits `FallPeriodFirstFrameMax`, `FallPeriodLastFrameMin` and `FallPeriodSecondFrame`, so its defaults are unverified).

## Rows already correct in the composed runtime (regression-guarded, no production change)

These Issues were written against raw `inkwave-public/` source. The build adapters already replace the quoted lines. Each row is now pinned by an actual composed-runtime test so a later adapter change cannot silently reintroduce it.

| Issue | Raw-source claim | Composed behaviour (evidence) |
| --- | --- | --- |
| #770 | `invuln = dur + 0.2` leaves a landing shield | `adapter.mjs:172` removes the line. After landing, `invuln === 0` and a 30 HP hit on the landing tick takes 100 → 70 HP. Flight-phase rejection (#255) still holds. |
| #777 | Dualies keep 30 damage forever | `profile.json` dualies `damageReduceStart = 7/60`, `damageReduceEnd = 15/60`, `damageMin = 15`, consumed by `fidelityDamage()`. Pinned 0/7/8/12/15/24F → 30 / 30 / 28.125 / 20.625 / 15 / 15. A real 12-unit flight hit lands below 30. |
| #638 / #637 | Bomb flight and preview use 24 | `adapter.mjs:131,134` substitute `SUB.bomb.gravity` (57.6). Live Δvy/step = 57.6/60. The composed source contains no `24 * dt`/`24 * stepDt`. |
| #644 / #643 | Bomb uses the main-weapon refill delay | `runtime/gear.mjs:129-130` arms `recoverStopRemaining = SUB.bomb.inkRecoverStop` on release. Shooter, Charger and Roller first refill exactly 60 ticks after the throw (main-weapon stops are 20F / 20F / 43F). |
| #556 | Grounded Blaster randomizes by 1.2° | The runtime `_spreadDeg` wrapper returns `spreadGround` (0) / `spreadAir` (10). Six grounded shots share one direction. |

## Tests

- `patches/splatoon3/tests/wall-drop-dualies-guards.test.mjs`: 10/10. Negative control: reverting the #604 branch fails both hand cases (8/10).
- `scripts/check-inkwave-weapons-fidelity.mjs --site` (production build): adds the Dualies wall-drop case (pinned periods/speeds/radii) and a Dualies ghost case (no turf mutation). Passed: 4 families, 6 wall-drop cases. It reuses the existing 30/60/120 Hz cadence check for Blaster.
- Full suites are recorded in the PR body.

Not measured: physical Switch comparison, browser screenshots.
