# Bot navigation and retry budgets — 2026-10-16

Base: `rhgrive3/actions` main `7ea9410d9aaca46ddb864b96ca4af4ea475f82d6`.
Target: the production composition of `inkwave-public/`, particularly the second custom stage, Kelpline Terminal. The fetched public source remains unchanged; the guarded local-quality adapter and its runtime participate in production identity.

## Cause and correction

The dry trench beneath Kelpline's bridge is at y=-2. Actor already permits supported dry floor below sea level. BotBrain._wet additionally rejected **any** floor below PLAYER.fallDeathY (-1.45). Its edge guard zeroed every movement direction on the dry trench floor. With actual Level, Physics, Actor, Brain, WeaponRunner, Projectiles and CPU Paint, the previous predicate strands the actor at exactly [0,-2,0] for 10 seconds; the captured composed baseline also remained there for a 30-second diagnostic.

The correction checks missing support, consistent with Actor. Sea height, geometry, collision and water death are unchanged. Bots use existing trench ramps. All seven controlled shooter bots leave the bridge centre in a 30-second CPU run. Individual actors leave the trench and reach the upper floor at 30/60/120 Hz.

Other changes:

- Direct combat steering requires a currently perceived enemy on the same floor, body-width clearance and continuous ground. Otherwise movement follows the existing route to the enemy. Ordinary reaction/aim/fire conditions remain. Corridor checks run at perception cadence.
- Separation and paint-goal crowding ignore unrelated floors. Only live teammates with active paint routes reserve goals.
- Paint selection tries at most three distinct ranked alternatives, excluding already reached and recently failed/stalled goals. Failure history is bounded to six entries for eight seconds.
- Failed paint goals wait 0.6–1 seconds before another decision. Failed refill/retreat searches respect existing timers. Finishing refill releases the paint-goal timer immediately.
- Recovery skips a waypoint only over a clear, supported same-floor route. It cannot skip through walls and repeatedly reset progress there.
- Grate approaches use human input. Static support is classified lazily and shared through a WeakMap keyed by graph (one byte per node). Current grate support remains live. Actor's actual squid grate-drop physics is unchanged.
- Rising/stalled squid approaches check actual lower/upper wall ink. Bare, hostile and nonpaintable walls select human input; ordinary human jumps remain available. Ownership is sampled live, including enemy repaint. Normal flat travel adds no wall rays.
- Native painting, wall, jump, drop, surge and grounded-form traversal owners retain control. The new grate/wall form helper does not override native traversal.

## Cost measurement

Controlled no-route workload: seven actual composed brains, 120 ticks at 60 Hz, real Tidewater Level/Physics/CPU Paint, seeded random; A* admission forced to return no route. Actor integration is excluded from this cost workload. Baseline: composed BotBrain captured from the base above.

| Work over two simulated seconds | Before | After |
| --- | ---: | ---: |
| Paint-goal decisions | 840 | 21 |
| Path searches | 840 | 63 |
| CPU paint-region queries, including tactical observation | 8,463 | 277 |

These are deterministic request counts for a failure case, not whole-game FPS or mobile hardware timings. A separate empty-route/refill regression records three paint decisions and two refill searches over 120 ticks per mode.

## Verification and comparison boundary

The 12 cases in `patches/local-quality/tests/bot-navigation.test.mjs` cover the former predicate as a negative control, seven bots, three time steps, grate crossing with actual Actor collision, tactical floor/visibility changes, failed-goal budgets and alternate goals, live wall repaint, nonpaintable walls and safe waypoint recovery.

Comparison reference remains the repository's Splatoon 3 11.3.0 baseline, default kits, no added gear. Own ink is required for wall swimming; human grate support and squid grate drops remain in the existing Actor/Physics owners. Player acceleration, speed, braking, turn, jump, weapon damage and ink costs are unchanged. Retry times, avoidance radii and routes are INKWAVE AI tuning, not measured Nintendo AI. Retail AI parity and Switch/phone/iPad performance remain unmeasured.

```sh
node --experimental-vm-modules --test patches/local-quality/tests/bot-navigation.test.mjs
node scripts/build-inkwave.mjs inkwave-public _site
INKWAVE_BUILT_SITE="$PWD/_site" node --experimental-vm-modules --test patches/local-quality/tests/bot-navigation.test.mjs
```

Existing bot edge guard, paint observation, charge release, refill, attract budget, navigation heuristic, ranked bot, native combat support, native grounded form, native climb delegation and packaging checks are included. Optional native-source geometry checks require external stage assets; skipped checks are not gameplay acceptance for those assets.

## Final emitted browser check

Chromium loaded the complete optimized game, real Character/Match/Actor/Brain/WeaponRunner/Projectiles/CPU+GPU Paint and rendered frames. For a controlled comparison, the baseline substitutes only the captured base BotBrain module; the candidate uses the actual emitted module. Service workers were blocked in both contexts. Seven shooter bots are placed on the same team at [(i-3)*0.4,-2,0], isolating navigation from enemy damage; the local actor starts at [18,0,-25]. Seed=142, LOW quality, 960×540, SwiftShader. Debug stepping uses 60 Hz physics and renders once per simulated second.

Over 15 simulated seconds, baseline **0/7** bots leave the bridge centre and **0/7** reach the upper floor. Candidate **7/7** leave the centre and **6/7** reach the upper floor within that interval. Both runs complete rendered frames with nonzero draw/triangle counts and zero page JavaScript errors. This controlled placement is not a normal-match win-rate test, a screenshot acceptance claim or device FPS measurement.

Final checks: source 100 passed, 17 optional/external-asset or emitted-only cases skipped; emitted Bot and packaging checks 22 passed. Optimized build, startup budget, exact commit-input identities, exported interfaces, offline graph and quick upstream compatibility pass. The new 12-case suite passes against both source and actual minified output. Machine-readable counts, baseline SHA-256, production content hash and browser position traces: [verification receipt](inkwave-bot-navigation-2026-10-16.json).
