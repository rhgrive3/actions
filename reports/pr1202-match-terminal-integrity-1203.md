# PR1202 match and respawn integrity audit (#1203)

## Baseline and interpretation

- Repository baseline: PR #1202, `7d74919cf78dd203e7bd0d1b80eeaf451eaec0f8`.
- Changes belong only to `fix/pr1202-data-fidelity-20261010`; no edit to PR1202's branch, main, or merge.
- Issue and explicit worker ownership: https://github.com/rhgrive3/actions/issues/1203
- This is **five INKWAVE lifecycle consistency corrections**, compared against the supplied game rules. It is **not five imported retail numeric parameters**, nor evidence of Nintendo's wire protocol.

## Evidence classification

The supplied archive `SOURCE_INFO.txt` identifies Leanny/splat3 commit `7280ff9cde8bb1c5dcef46c700c326471584d2e6` and Dexx-io/Splatoon-Decomp NTSC `thick` commit `9ef403d96f1a370bdd70434ce158a0c29879bfcf`. The inspected `thick` content is an earlier-generation asset snapshot; this audit did not locate relevant decompiled C++ for match/damage/respawn. It cannot establish S3 executable logic. Raw assets/decomp are not copied into this change.

| Source inspected | Version / units / certainty |
| --- | --- |
| `data/parameter/1130/manual/UIManual_RegularMatch.spl__UIManualData.json` | Explicit 1130 manual labels; no timer implementation. SHA256 `558e5cba9d8a68ccd443440dda71033c54cf1a99bdaa16a6dd969f5af0e0badc` |
| `data/language/USen.json`, `CommonMsg/Manual/ManualRegularMatch`, `RegularMatch_Manual00`, `01`, `05` | Unversioned localization snapshot in the pinned bundle, linked by the 1130 manual. Three-minute Turf War, winner determined at expiry, then post-battle rewards. Text-level rule evidence, not measured frame/network chronology. SHA256 `73c51d21d8827ca0fe0d3eb9f6a795d1aa7ca5e352ef36046c5eef02a9745ceb` |
| Same localization, `CommonMsg/Gear/GearPowerExp` respawn descriptions | Confirms post-splat respawn exists. Does not establish spawn invulnerability or specific countdown duration. |
| `data/parameter/1130/misc/SplPlayer.game__GameParameterTable.json` | S3 11.3.0 sparse player data. Damage receiver history field 64 observed, but it is not mapped onto INKWAVE's network receipt-cache limit: different concepts. No numeric edits derived from it. SHA256 `afece0e3e2016a895ba79483bfa63489b334c372293417b3b0ef072993bcb660` |
| Existing #201 implementation | INKWAVE already uses a six-second No Contest delay. This change preserves that calibration; it is not a new exact S3 timing assertion. |

Public source links:
- [1130 manual map](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/manual/UIManual_RegularMatch.spl__UIManualData.json)
- [Pinned localization](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/language/USen.json)
- [1130 player data](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/misc/SplPlayer.game__GameParameterTable.json)

## Five roots, reproductions, and fixes

| Root | Baseline native reproduction | Correction / gameplay impact |
| --- | --- | --- |
| Host clock value admission | With remaining time 50, receive host state time NaN or Infinity, or a nonfinite/negative clock sample. Remaining time becomes invalid. | Reject invalid clock samples; only finite nonnegative state times update the clock. Valid half-correction and 90/180-second games retain their owners. Stops malformed host data breaking finite battle completion. |
| Host phase monotonicity | Finish, judge, or results followed by delayed host `playing:30` reopens combat and restores 30 seconds. Repeated finish can replace frozen coverage. | Admit only recognized same-or-later phases and keep the first valid finish snapshot. Stops a completed battle being reopened or scored from a later snapshot. |
| Result commit lifetime | After one result, set results/age 5 and replay a result with a different winner/stats. Baseline returns to judge, resets age and changes stats. | Native result commit runs once per match; post-result retransmission is inert. Prevents repeated judging and changed accepted outcomes. |
| No Contest countdown ownership | Receive `nc:6`, advance 2 seconds, receive `nc:6` again: remaining 4 becomes 6. Repeated host disconnect notices can prolong one decision. | Repeated notices may shorten but never increase the existing remaining time, including zero. New match gets a fresh timer. No change to six-second tuning. |
| Dead actor retains Squid Spawn | Enter actual initial Squid Spawn with native Level/Physics, then apply an accepted native splat. Spawn action remains and its early return owns future updates instead of death countdown. | Splat clears spawn state; update also retires stale spawn if an external death bypassed splat. Native dead-actor countdown resumes. This is cleanup of an accepted death, not a claim that ordinary shots penetrate invulnerable spawn. |

The clock packet cases are malformed or explicitly delayed/repeated input. They are not evidence that normal clients commonly produce those packets. The spawn test uses a legitimate engine death entry point rather than demonstrating a retail hardware attack against spawn protection. These qualifications are retained instead of claiming unmeasured fidelity.

## Test method and results

- `match-terminal-integrity.test.mjs` executes actual production-composed network modules and actual actor/spawn runtime; scene/platform services are test fixtures.
- Baseline fixed checkout: **8/8 fail** in the expanded negative run, including actual initial-Squid-Spawn entry.
- Patched: **8/8 pass**. Exact PR1202 network test set plus the new test: **277/277 pass**.
- Neighbor set: **96 pass, 1 emitted-site-only skip, 0 fail**. Includes respawn, armor/adoption, Turf finish/snapshot/tie, special stats, No Contest, and guest deadline behavior.
- The optional-special-count test now starts a fresh match for each first-result malformed-field compatibility case. It no longer relies on recommitting an already accepted result. Existing repeated lower-count assertions remain.
- An initial broad glob accidentally included older cached tests absent from PR1202. Those are not counted as PR1202 regression evidence; the final network run uses the exact test-file list from the fixed baseline plus the new test.
- Browser, actual relay network, real console, and exact S3 executable comparison were not performed. Full aggregate build/CI belongs to integration; targeted passes are not represented as full acceptance.


## Result-order review follow-up

Root review identified that phase alone is not proof a result has been accepted. Native `_hostClock` only corrects time, and native `_hostState` ignores `judge`, but it can accept `results` before a delayed result packet. The first draft's phase guard could therefore drop the first payload. The corrected gate uses only `m.result` as the completed commit.

- Host `judge` and `results` notifications do not advance guest presentation. The authoritative result payload starts the first local judge, and each guest finishes its own awaited reveal. A faster host cannot invalidate the guest continuation.
- If an external path already placed a match in judge/results with no payload, the first result still fills stats/outcome without restarting or rewinding that presentation.
- A replacement match object accepts its independent first result.
- Added three tests exercise finish/judge/results notification ordering, an already-active judge, an already-terminal results view, same-match duplicate protection, and replacement-match acceptance.
- Reviewed order + score/Turf neighbor run: 43 pass, 1 emitted-site skip, 0 fail. The original 8 negative cases remain valid; the first-result order cases are additional normal controls, not additional claimed defects.


### V3: actual awaited Game continuation

The production-composed Game._judge method waits for HUD judging, then requires the same match/epoch and `state === judge` before showing menus. The original host `st:results` could change the phase first and kill that continuation. The final receiver leaves both judge/results presentation transitions to the guest, while accepting its first result payload and preserving data/phase when a presentation has independently advanced.

A new paired test executes the actual six-adapter Game._judge method and native NetMatch. With the network adapter omitted, host results arrives while the real judge Promise is pending: completion shows **zero menus**. With the fix, the phase remains judge until that same Promise resolves, then **one results menu** opens. A subsequent result retry does not change the winner or repeat the menu. This is a source-composed async integration check, not a rendered-browser claim.

V3 focused set: **13/13 pass**, including the explicit negative control. Final network and result-neighbor runs are checked separately during integration. V2 was superseded before parent application.
