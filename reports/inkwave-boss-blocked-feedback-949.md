# #949 follow-up: preserve blocked Boss feedback on PR #1182

## Basis and scope

- Compared main `5d0be6b7` and PR #1182 head `1d669600` with the alternative local #949 patch. The existing PR admission implementation is retained; the alternative post-HP-commit implementation is not overlaid.
- Splatoon 3 reference remains 11.3.0, Slosher, no gear, body contact during an invulnerability transition. INKWAVE's bespoke Boss mode and its `IMMUNE` HUD text are not claimed as a retail Splatoon Boss/Salmon Run equivalent. This is preservation of an existing INKWAVE feedback contract, with no new damage, movement, timing, or other calibration number.
- Native contract: `inkwave-public/src/boss/boss.js::hit` emits `boss:hit` with `blocked: true` for an invulnerable/hidden body; `inkwave-public/src/ui/hud-boss.js::_hit` consumes it to show the throttled grey `IMMUNE` popup. Both upstream files stay unchanged.

## Reproduction and minimal correction

Fire an actual nine-glob Slosher volley, let the first glob contact the invulnerable Boss, then remove invulnerability before the next glob. PR #1182 correctly keeps the volley maximum unspent but its pre-admission gate never calls `Boss.hit`, suppressing the native blocked event and popup.

The runtime now retains the existing `bossVolleyAdmission` and accepted `groupDamage` branch. Only a live body's known native invulnerability/visibility rejection is allowed through to native `Boss.hit` using the pending damage delta without changing the damage map. Native rejection prevents guest sends. Dead/remote/ghost routes and crablet admission remain separate. A fully spent maximum creates no extra blocked feedback.

This does not add a Boss ACK/volley network protocol or promise recovery from guest hits rejected only by the host. It does not replace the PR's admission implementation with speculative HP comparisons.

## Validation

`issue-949-boss-blocked-feedback.test.mjs` uses the real production adapter composition, `Projectiles.fireSlosh`, `_bossImpact`, `Boss.hit/applyDamage/_hitCrab`, and `BossHud._hit`. Display construction and the final DOM popup sink are stubbed; this is a native logic/event test, not a browser or renderer run.

- Same-composition negative control removes only the added fallback: Boss HP stays 1000, map remains empty, blocked events and `IMMUNE` popups are both zero.
- Restored local/host/guest invulnerable and hidden body paths: one blocked event, one popup, empty map and no guest send. Once admissible, local/host HP is 930 exactly once; guest sends once without changing its local HP.
- Native popup throttle, fully spent and partially spent maxima, dead/remote/ghost/non-playing/missing attacker, independent crablets, and equal fixed-step results under 30/60/120 Hz schedules are covered.
- New seven tests plus existing two admission tests: 9/9 pass. With player-volley, Boss transport/audio/timeline, and weapon-source regressions: 36/38 pass. The two unchanged `local-quality/tests/boss-hit.test.mjs` failures reproduce independently: its 2500-damage cap expectation conflicts with the new `remoteHit` rejection, and its 2001-damage rejection expectation is not implemented in `applyDamage`.
- Syntax and whitespace checks pass. Quick numeric validation is blocked by two pre-existing PR #1182 profile/status mismatches: `weapons.roller.rollDashTurnBreakSpeed` and `bomb.spawnSpeedY`; neither is modified here.

Browser rendering, real multi-device communication, final aggregate CI and Nintendo hardware comparison are not included in these results.
