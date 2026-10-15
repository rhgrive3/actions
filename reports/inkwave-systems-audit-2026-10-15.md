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

## Batch B: effective profile-to-sensor transitions

Baseline: merged batch A `e975fb76c63ee6a70af7b288b250cb514ccc6553` (PR #1452). Three new extracted Game regressions fail by assertion before the change; all pass after. The whole-module Game/MobileInput fixture covers five cases and runs against source or an explicit emitted site. It stubs only sensor responses, storage and display seams and removes the automatic renderer bootstrap.

- Nested active-profile ON/OFF now updates the installed sensor owner.
- Conflicting flat/nested edits use the existing final nested projection when deciding sensor ON/OFF.
- Nested OFF invalidates a pending permission; old success cannot activate a subsequent ON.
- Inactive edits create no prompt; current denial reverts and saves only the active profile.
- Related source checks: 61 pass; whole-module source: 5 pass. Baseline whole-module: 1 pass / 4 assertion failures.
- CI gains the same five whole-module cases against emitted/minified code. Exact-HEAD packaging and emitted execution are required before merge. Sensor APIs remain mocked; no physical permission or latency claim.

Batch A merge receipt: PR #1452 merged as `e975fb76c63ee6a70af7b288b250cb514ccc6553`; merge tree exactly matches the locally validated tree `a4c4636f145e4ef4d1d38fad1ca166d7e12b66fd`. Additional emitted ranked integration/network tests: 32 pass; exact-HEAD packaging: 10 pass. CI was queued at merge, not reported as green.

Batch B emitted checks: five whole-module sensor-transition cases pass against minified code; adjacent emitted map/gyro/disable/inversion tests pass 26/26, including the emitted-only Game HUD cases. Related source composition/idle/startup tests pass 28/28 (overlap with the 61-case suite above).

## Batch C: continuous special audio disposal

Baseline: `1bacf21b8ce33137253ab89b83b51cbf1009fe43` (PR #1453). Batch B's merge tree `977ff24a6c590ba6dcf2a7b208adca5ece2384bc` exactly matches the locally tested/uploaded tree; packaging passed 10/10. Its CI was queued at merge.

Native direct Match.dispose previously left continuous special handles and their actor references in kit audio's active Map. The existing `match:dispose` event now retires only that match's actors, before character disposal. Removing/splatting actors still retires once. A replacement match's active sounds survive disposal of an old match.

- Negative native Match/Actor fixture: 1 pass / 2 assertion failures. Initial missing terrain seam was corrected before recording negative assertions.
- Candidate native disposal + audio-loader lifetime + Boss lifetime: 38/38 pass.
- Entire audio test set: 74/74 pass, including 2,088 rendered procedural PCM fixture variants. This is test-only synthetic render coverage, not licensed/retail playback acceptance.
- Same native disposal cases are added to emitted CI. Emitted/build packaging and broader controls/network/quality results must be checked before merge.

Batch C emitted disposal tests pass 3/3; emitted cross-check of batches A/B passes 11/11.

## Ready existing work reviewed during the audit

PR #1448's four-file verifier patch was reviewed: one absolute 30-second selector/animation deadline, no readiness relaxation, first-state evidence captured before screenshots. Its 12 portable tests pass locally, and all substantive exact-head GitHub checks were successful. Merged as `23c0e2960f05bcd511dd93d57cf89d13f0ae9948`. This does not fix or close #1432. PR #1445's duration/bomb/cosmetic hardening is separately reviewed; its final Validate job is still running, so it has not been treated as accepted.

## Final batch C validation and remaining work

- Network replication + reliability source suite: 1,459 pass / 0 fail / 11 emitted-only skips (1,470 tests).
- Local quality + practice range + movement + cache source suite: 1,060 pass / 0 fail / 14 environment/emitted-only skips (1,074 tests).
- Final exact-HEAD build packaging plus imported pause readiness helper: 22/22 pass. Startup dependency/byte gates pass. Workflow/runtime-evidence/cursor diagnostics: 44/44 pass.
- Final content/input hashes: `28f0f4d4d547aa3f73b9ad477d7423b77cdacd78d9f5c8f9fc2c195a49813808` / `4bb0a96ae3443b2bc968046c1068e55155cc7f29f40e7aeb69a813371ea52e4b`. Pre/post verifier reconciliation builds have identical hashes.
- Chromium 153.0.8010.0 real game rematch verifier: all three strict lifecycle rounds plus 95 simulated seconds in the untimed range and return to ordinary Turf pass. No failures, browser errors or missing resources. Compressed original receipt: `inkwave-systems-c-rematch-2026-10-15.json.gz`. No opacity assertions, deadlines, animation behavior or native input paths were relaxed. This run did not reproduce #1432; it does not prove that intermittent issue resolved.
- Existing native touch reliability verifier: Chromium completes all 38 checks, including held release/repress through actual Actor/Runner/Character, without browser errors. Original overall failed receipt: `inkwave-systems-c-reliability-2026-10-15.json`. WebKit download succeeded, but launch requires missing GTK/GStreamer/etc. libraries; Playwright install-deps fails on setgroups/setuid/setgid in this managed environment. Thus #1430's required two-engine repetition is not accepted or closed. Physical sensor and Switch comparison remain unavailable.
- PR #1445's final Validate job failed in `ink-volume-recipes.test.mjs` (native catalogue wire births 6 vs 9). Inspection reproduces the failure: legitimate zero-width Diffusion Slosher entries serialize tail0=501, while its new admission caps tail0 at16. This is a concrete compatibility failure; do not merge that head. Its other substantive jobs passed, but they do not replace the failed quality regression.

Independent defects confirmed during this audit are repaired in batches A/B/C. Remaining retail movement/paint numerical calibration, physical-device behavior and whole-game hardware benchmarks still need their actual evidence. Existing visual/stage/model PRs retain their own acceptance work; no unmeasured retail values or unsupported rendering fixes are inferred from these passing tests.
