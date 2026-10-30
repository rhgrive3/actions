# Bot melee-special policy — 2026-10-30

Baseline: `5d6480b2e2c1a8afa789bcc1415bae586e3156cb`. Scope is bot input policy only; weapon damage, movement physics and action timings remain owned by the existing Actor runtimes.

## References read

S3mix individual pages were opened through the browser on 2026-10-30, including their controls, usage and terrain sections. Page versions differ from the pinned INKWAVE 11.3.0 source tables; prose is tactical guidance, not a replacement for the runtime values.

- [テイオウイカ](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/テイオウイカ): close jump attack, ZR charge then release, locked dash heading, vulnerable transformation/recovery, water and grate hazards. Page performance table identifies 8.1.0.
- [ウルトラハンコ](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ウルトラハンコ): held stamping, short-startup jump swing, sub hold/release throw, exposed startup, obstacles and ledges. Table identifies 11.1.0.
- [サメライド](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/サメライド): locked rail, mandatory initial travel, manual braking, travel while braking, water death, explosion occlusion. Table identifies 11.0.0; older timing prose is marked historical and is not copied into physics.
- [ウルトラチャクチ](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ウルトラチャクチ): directional forward fists, local blast, vulnerable rise, independently destructible fists, super-jump variant. Table identifies 11.3.0.

## Implementation and reproduction

`runtime/bot-special-melee.mjs` owns only admitted intent values via the common bot context. All decision distances and reaction choices are INKWAVE AI heuristics, not retail statistics.

| Reproduction | Policy | Expected consequence |
| --- | --- | --- |
| Active Kraken, no visible living enemy | Clear jump/attack and stop pursuing; a fully charged hold remains held because releasing it would launch blindly | No repeated empty jumps or uncontrolled charge-release |
| Close visible Kraken enemy | Grounded, edge-safe jump request | Native jump attack, with physical landing before another jump |
| Distant visible Kraken enemy | Check full route, charge to runtime threshold, release only while aimed and safe | Actual native charge-release dash rather than a permanent ZR hold |
| Target disappears, dies or crosses a wall | Suppress attack; cancel incomplete charge or retain completed hold without releasing | No stale-position attack |
| Stamp near / distant target | Jump swing or stamping / sub hold then release | Native swing and 42F queued throw remain authoritative |
| Reefslider target in safe lane | Grounded activation; fixed startup rail; predict braking travel after native minimum movement | Stop near enemy or brake on target loss and hazards |
| Splashdown or legacy Slam | Require visible local target and face it before activation; leave subsequent attack to Actor | No distant timer-driven activation or idle input spam |

Kraken and Reefslider reserve the full planned travel corridor, including shoulder probes. Recovery/startup do not inherit main-weapon attack or jump commands. Legacy `slam` remains a distinct runtime special with its own closer activation heuristic.

## Verification status

Checks:

- `node --check patches/splatoon3/runtime/bot-special-melee.mjs` and `git diff --check` passed.
- `node --experimental-vm-modules --test patches/splatoon3/tests/bot-special-melee.test.mjs`: 21/21 passed. The fixture uses production composition, real Actor.update input admission, restored native Actor integration, actual Level/Physics and native projectiles. It tests Kraken charge-release/contact and idle behavior at 30/60/120Hz, close jump/contact, target loss at full charge, dead/friendly/occluded/high/cliff targets, Stamp sub-release/42F queued startup and target-loss hold, Reefslider manual braking/impact at three rates, unsafe rails, Triple Splashdown and legacy Slam impacts.
- The test fixture supplies stable aim through the normal public aim fields; it does not claim to test the BotBrain aim spring. Full BotBrain/build verification belongs to the integration report.

Tests use shared context commit `9cf8b3f38c0b73da7b9c08bbf4edbb223d1c479d` plus actual sibling category sources. Corridor width is delegated to the shared `safePath` helper, with 0.65-unit half-width. During Kraken charging the local path is checked; the full route is checked again immediately before release, avoiding repeated distant probes.

No Switch measurement or retail parity claim is made.
