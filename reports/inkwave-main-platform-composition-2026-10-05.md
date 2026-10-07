# Main/platform composition checks — 2026-10-05

Scope: main 3bcdb37c plus integration PR #536 at 06bd16c5. These are composition fixes, not additional gameplay tuning.

- Platform reset now calls the existing respawn-navigation cancellation entry point and clears both map flags. A pending dead-map jump cannot survive suspension and execute on the next respawn.
- Held trigger rebasing uses the existing native Input admission rule (`value > 0.3` for buttons 6/7). A partially depressed trigger reported as `pressed: false` stays blocked until release, then a fresh press works.
- Reliability tests distinguish standard top-face Map (button 3) from raw Special mapping; standard Special remains button 11. A render-only top-face tap opens Map without firing Special.
- Rolling-roller speed tests preserve main's grounded-only rolling movement. Ground uses rollBaseSpeed/rollSpeed; air uses PLAYER.runSpeed, including Run Speed AP 0 and 57. No gameplay scalar changed.

Validation: the three new platform regressions failed on the unmodified composed input runtime (0/3), then passed after the fix. Source platform/action/air suites: 31/31. Related platform-smoke and respawn-navigation: 43/43. Actual emitted platform-input plus navigation: 34/34. Build 9417d15f4be5 succeeded. Full aggregate and exact published-head CI remain the integration owner's next gate. No physical-device validation is claimed.
