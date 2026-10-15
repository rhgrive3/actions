# INKWAVE systems audit — 2026-10-15

Baseline: `d6dc80e36e7d7a16b04a4bf01d31f7136046cda7`. Target is the composed public build, not the separate `game/` prototype.

## Batch A: ranked input / network lifetime

Six assertion-based regressions fail on unmodified baseline and pass on the candidate. They execute the actual composed Input, PlayerController, Actor, NetMatch, RankedEngine and ClamsRule. Display, audio and terrain seams are stubbed; this is not a live WebSocket match.

| Reproduction | Fixed behavior |
| --- | --- |
| Turf Map open, press C with clams | No throw; holding through close requires release before another throw |
| Release while disabled, menu-blocked or dead | Clear intent/pending throw and observe release; next fresh press works |
| Invalid damage/life/victim with a higher sequence, then valid hit | Invalid packet does not suppress valid hit; accepted hit still cannot replay |
| Damage after finish/judge/results/winner/dispose | No actor HP or accepted sequence mutation |
| Out-of-range barrier hit or numeric-string damage | No sequence consumption or queued hit; valid hit applies once |
| Remote Crab metadata older than the existing input lease | Expire metadata with fire/throw; clam pickup becomes available again |

Validation:

- Negative control: 0/6 pass on the unmodified baseline, all six failures are assertions.
- Source ranked, pause and touch-map suite: 280 tests, initially 278 pass / 1 fail / 1 emitted-only skip. The failure exposed a skeletal fixture with absent winner; absent winner is now treated as unset. Targeted ranked integration + new suite rerun: 34/34 pass. Unique source coverage is 279 pass / 1 skip after this correction.
- Emitted new regression + pause/touch-map composition: 38/38 pass, no skips.
- Startup dependency/byte gates pass. These are deterministic packaging checks, not latency/FPS measurements.
- Chromium 153.0.8010.0 focused native touch routing: five scenarios, nine trusted pointer downs, no browser errors. Receipt: `inkwave-systems-a-browser-2026-10-15.json`. This checks retained map/pause/gyro composition, not native keyboard Clams interaction or a full rendered match.
- Content hash: `04cf69e204e31ed6234301bf2aff60be7b4ca92429c3f322eb1e0ef0616ec39a`.
- Exact-HEAD packaging checks are run after committing the candidate. CI status is independent of these local checks.

## Audit queue and ownership

| Area | Current disposition / next work |
| --- | --- |
| Ranked input and message lifetime | Batch A above |
| Settings/profile transitions | Continue with nested profile changes and pending permission boundaries |
| Audio lifetime and cache | Inspect async cancellation, voice/loop disposal and long-session bounds; no new defect established yet |
| Match duration, offworld bomb quotas, remote projectile metadata | Existing PR #1445 owns overlapping fixes; do not duplicate |
| Pause browser deadline fixture | PR #1448 owns verifier change; its admission deadline is not evidence of fixing #1432 |
| Paint bounds / squid upright transition / silhouettes | Existing PRs #1443 / #1442 / #1449 |
| Wall-climb / stage collision / material handoff | Existing PRs #1420 / #1419 / #1408; retain source and rendered evidence requirements |
| #1430 held-touch flake / #1432 rematch style pending | Need their exact full-game reproductions; focused touch probe does not resolve them |
| #1434 whole-game performance / Switch equivalence | Full-game timing and real hardware evidence still required; byte gates and logic tests are not substitutes |

Reference remains Splatoon 3 11.3.0 and pinned Leanny commit `7280ff9cde8bb1c5dcef46c700c326471584d2e6`. No new retail numerical claims are introduced.
