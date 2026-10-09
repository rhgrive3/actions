# Comeback / Squid Spawn wrapper composition — #382

- Date: 2026-10-09 UTC
- Baseline: PR #1182 candidate `b1626ee8`; original `inkwave-public/` remains unchanged.
- Reference baseline: Splatoon 3 Ver. 11.3.0, Comeback in the head main slot, ordinary Turf, enemy-caused death, no other AP gear.
- Root: the production installer attached `installRespawnLifecycle` after `installGear` and `installFlow`. Its Turf `respawn()` enters `begin()` through `spawnAt/reset`, bypassing the captured legacy respawn method and the earlier conditional-gear wrapper. The predeath `enemyDeath` record was discarded by reset; `comeback` stayed zero, with no Run/Swim AP bonus.

## Source and comparison

Nintendo's [update history](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/) was checked for the current 11.3.0 baseline. The existing #382 comparison cites [Comeback mechanics](https://splatoonwiki.org/wiki/Comeback): after an opponent-caused respawn, 20 seconds of +10 AP in Ink Saver Main/Sub, Ink Recovery, Run/Swim Speed and Special Charge. This community summary was re-read; it is not a new Switch measurement or an official numerical specification.

The repository already implements those values in `conditional-gear.mjs` and `profile.json`. This change preserves them, all gear curves and their AP caps. No world-unit conversion, animation curve, launch trajectory, armor value or unsourced tuning is added.

## Change

Install Respawn Lifecycle before the existing gear/Flow owners. Their respawn wrappers now surround both the ordinary legacy path and Turf Squid Spawn. The new-life reset and Squid Spawn remain owned by the same code; Comeback and other existing retained state are restored by their own wrappers. Their update clocks now advance once during aim/flight instead of being bypassed by the special-state early return.

This also retains existing Flow state, Quick Respawn history and the Opening Gambit deadline across the same new-life boundary. Explicit reset and a changed match identity still clear them. The finalized special **fraction** is preserved; the raw charge can change when the existing Comeback Special Charge AP changes the weapon's special cost.

## Deterministic evidence

`issue-382-squid-spawn-comeback.test.mjs` applies all six production source transforms, the real `install(profile)`, and all eight post-install bootstrap installers in verified order. It uses actual Actor, Level and Physics; rendering/audio are headless sinks. The test includes a persisted local-player loadout and real death → aim → FIRE → flight → landing.

- Before fix, the bootstrap/native enemy-respawn case failed: `comeback=0` instead of the existing 20-second duration; run speed modifier stayed 1.
- After fix, eight new tests pass: six AP families; exact 1200-tick expiry and matching position/modifier traces at 30/60/120 Hz; initial Squid Spawn/environment/ally controls; repeated death and explicit reset/new match; retained Flow/Quick Respawn/Opening Gambit; single respawn event/teleport, gauge fraction and launch-owned armor; Boss/Range legacy path; automated bot launch and owner-private Haunt retention.
- Seventy neighboring conditional-gear, respawn, Flow, Haunt, stealth/Quick Respawn, full motion install and complete-bootstrap Storm/Slam tests pass, with zero skips.
- `check-inkwave-patches.mjs --quick` and `git diff --check` pass.
- Production build `6191860fb9a8` succeeds; the emitted/minified modules pass the same eight new tests with zero skips.
- Independent read-only review found no blocker; its suggested bot/Haunt control was added and passes.

This is logic/build evidence. Browser GPU rendering, live relay, physical controllers, Switch comparisons and the exact retail aim/launch/landing activation epoch remain unmeasured. The pre-existing conservative environmental-death residual policy is unchanged. PR #1183's stage-ground validation and network phase-transfer work are separate, and were inspected for overlap. No Issue closure or merge is claimed.
