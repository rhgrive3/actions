# #469: connect the existing Ink Storm lock to HUD depletion

## Evidence and boundary

Base: aggregate `909a7014`, with main `5d0be6b7` and all #469 comments/Open PRs rechecked on 2026-10-09 UTC. The older completion comment describes a separate display patch, but the current `hudFrameSnapshot` still reads only `specialFrac()` and the brief `specialActive` token. Its real Storm lock persists after that token ends, so an actor unable to recharge appears empty/inactive.

Reference baseline is Splatoon 3 11.3.0, Ink Storm, no gear and the existing Special Power duration path. The behavior comparison is the post-use draining/charging-lock distinction documented in [the issue](https://github.com/rhgrive3/actions/issues/469) and its [earlier scoped implementation report](https://github.com/rhgrive3/actions/issues/469#issuecomment-5992340241). No new Nintendo time, damage, motion or world-scale number is inferred. Existing `STORM_GAUGE_LOCK` is actor-owned; the existing Special Power wrapper may extend it.

## Change

`stormGaugeFraction(actor)` returns the held gauge or the normalized remainder of the real actor lock. `hudFrameSnapshot` uses that value and keeps the in-use indication until the same lock expires; its already-shared mobile transport receives the same values. The actual elapsed-time owner, charge lock, readiness and raw network charge remain unchanged. No second display timer is introduced and no spendable charge is restored.

The initial duration is captured after the real throw, including an existing Special Power extension. It survives `Actor.reset` alongside the lock. Reading the temporary power snapshot as the denominator instead would cause a display jump when reset removes that snapshot. Remote actors do not invent an unreplicated post-use clock.

The visual fraction is a proportional projection of INKWAVE's established lock. Exact Nintendo per-segment/animation-curve parity has not been measured; this corrects the missing state connection without claiming that remaining presentation calibration is complete.

## Regression results

`issue-469-storm-gauge-display.test.mjs` uses the production-composed real Actor/Projectiles, current Storm Power wrapper, native packet encoder, persistent HUD snapshot and native composed 23-segment HUD updater. DOM nodes/display sinks and collision presentation are fixture substitutes; renderer/mobile pixels are not browser-verified.

- Same-composition negative control removes only the HUD projection. It reproduces zero displayed gauge while the real lock remains at 4 seconds and the throw token has ended.
- Holding retains a full, non-ready gauge. Actual throw begins depletion. All 480 base-lock ticks are monotonic, the midpoint drives 11 of the native 23 segments, and the final lock tick clears the active indication and permits subsequent turf recharge.
- Special Power's existing 10-second test duration stays normalized across death and reset; reset clears the temporary power snapshot without jumping the visible remainder or reopening recharge.
- Native packet charge stays zero. Remote HUD and ordinary accumulation/Slam read their existing values. A previously ready gauge flares only once; showing used Storm does not falsely mark it ready.
- Fixed 30/60/120 Hz render schedules produce identical 480-tick authoritative display traces.

Final new tests: **5/5 pass**. Adjacent existing Storm effects, Special Power/sub, HUD snapshot and HUD-authority tests: **55 pass, 2 emitted-site-only tests skipped**. Syntax, whitespace and quick upstream/numeric checks pass. No full CI wait or browser/relay/Nintendo hardware validation was performed for this scoped change.
