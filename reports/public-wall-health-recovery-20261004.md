# Public wall-swim recovery

Scope is the composed `inkwave-public/` runtime with the Splatoon 3 profile at main `5e28dbd16f7829aebd88052ff5f7fdf71f39fdad`. This is independent of prototype-only Actions issue179. The user excluded and removed the `game/` prototype.

The public native Actor validates own wall ink in `_updateClimb` before resource recovery. `resourceSurface` intentionally keeps `submerged` floor-only. The resource patch nevertheless selected fast health recovery exclusively from that floor flag, so an attached squid healed at the configured humanoid rate. Select the swim rate when squid form is attached to the validated own-ink wall; retain the floor flag and all existing damage-delay/refill rules.

Reference conditions: profile reference11.3.0, no gear, non-special own-ink wall swim. No numerical tuning changes. The profile has humanoid/swim healing12.5/100HP/s. Nintendo gameplay URL supplied by the issue (https://splatoon.nintendo.com/en/gameplay/) could not be fetched in this environment; no new Nintendo numerical or physical-device parity claim is made.

Verification uses actual adapted Actor movement and resource modules, stubbing only world paint/collision. Before the fix all three wall-healing rate cases failed at30/60/120Hz. After the fix all six new cases and all23 existing movement/resources cases passed:29/29. Dry/enemy-wall detach, damage delay, paused ticks, leaving form and reset are covered. The original test was named issue-179-wall-health-recovery.test.mjs during reproduction and renamed wall-health-recovery.test.mjs to avoid conflating it with the excluded prototype issue. Persistent parent evidence retains both original before/after logs.

Browser/full exact-source verification is owned by the integration lane. Physical Switch/iPad comparison remains unverified.
