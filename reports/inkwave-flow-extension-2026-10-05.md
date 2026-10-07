# #504: active Flow extension duration

Splatoon 3 Ver. 11.3.0 community verification specifies a10-second qualifying
splat/assist extension capped at30 seconds, while the previous profile used5:
https://wikiwiki.jp/splatoon3mix/検証/イカフロー . Nintendo's public Flow overview
supports splats/qualifying assists extending active Flow; the exact10 seconds is
the cited community verification, not a new physical measurement.

Only flow.extension changes to10. Base duration30, cap30, existing eligibility,
movement effects, and actual extension paint remain owned by the existing
runtime. The numeric-status registry is regenerated and preserves its explicit
non-pinned calibration/community-source classification.

Source integration tests verify native local splats10→20,15→25,25→30, no second
extension from repeating Actor.splat on the same dead victim, base activation30,
actual damage-credit assist versus an uncredited teammate, and exactly600 fixed
ticks for the extra10 seconds at30/60/120/144 Hz. The older real assist regression
now expects20 rather than15. Together with the #505 team-bonus tests and existing
weapon/Flow tests17/17 pass; emitted new Flow tests10/10 pass. Build39f63c1a8893.
The existing app browser WIPEOUT proof also checks the emitted Flow extension
function against the three reference timer examples; it awaits combined CI.

## Explicit online dependency: #427 / PR #494

A separate actual two-owner Actor/Projectiles/NetMatch probe on this integration
base finds that the attacker owner's active Flow remains at10 after the victim's
lethal terminal tick. The tick does not yet forward a qualifying Flow event to
that owner. Replaying it also leaves10; this is not a successful extension test.

This is the existing claimed #427 root with correction PR #494, not a duplicate
numeric-duration defect. No second ACK/progression implementation was added.
The amount change is ready for local event paths; complete online acceptance
requires #494 composition and its native confirmation tests. This limitation
must remain in the integration description; do not close #504 or report its
online acceptance as passed on this base.
