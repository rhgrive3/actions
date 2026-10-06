# Isolated small-PR integration: PR609 and PR612

## Fixed scope and source ownership

This composition takes two other-owner, previously isolated small PRs, not an existing large batch. Main is pinned to 37ab02fcb7314eee8a6b3e6e8e6b0593610e7bff. Source PR609 is pinned to 7abf43775c2038a43399727c990e0235126b67ce (4 files; Issues519/576/597), and source PR612 to a55d607e7ebcc03667bddf1126b88237113b179d (7 files; Issues577/598). Both source heads were read back unchanged before publication preparation. Coordination was recorded on the original PRs. No source branch, main, Issue state or existing large integration PR is changed.

PR609 provides the sourced retained wall-drop state for Roller, Splatling and Blaster, with owner-only paint, one Blaster terrain burst and ghost lifecycle extension. PR612 provides flight-only fresh Super Jump Slam admission and one-use remote Storm authority. The own-team seven-Issue PR705 and prepared eight-Issue batch are separate; their gameplay is not imported here.

## Required connections and discovered defects

- Preserve new main's superJumpGround reset in the exact remote-respawn anchor alongside Storm authority cancellation.
- Split the legacy near-unit terrain test: ordinary floor impact remains terminal exactly once; wall impact enters the sourced retained state and completes within its actual flight plus wall-state budget. Paint, native OBB, completion and retirement remain asserted.
- Horizontal ghost unit selection previously chose the closest nominal speed, misclassifying an ordinary low-speed main glob as near. The two current source speed intervals are disjoint, so the repair uses interval distance only for supported ghost-horizontal layouts. Seed13 exposes the old error; all13 birth units and ten wall ticks now match. Unsupported layouts retain the previous fallback. Future player-velocity inheritance requires a separate immutable-unit contract and is not silently added.
- Native replay samples snapshots, plays events, then updates actor presentation. Reading the actor's preceding specialActive rejected legitimate instantaneous Storm. Receiver-local proof now comes only from the same packet's accepted alive/active snapshot, with owner/life and simulation-time bounds. Replay requires latest accepted alive/active evidence and keeps same-tick, sequence, one-use, death/respawn/handoff checks. Wire-provided proof is discarded. The comparison fixture no longer pre-applies presentation ahead of native events.
- Reuse the independently verified32-field precision correction: retain the three birth velocity numbers, without new fields or changed footer ownership. Browser diagnostics are saved before assertions. No trajectory tolerance changes.
- Reuse only the native-recorder32-field verifier correction and12-minute validate allowance; all original gates remain. These are validation compatibility deltas, not gameplay from PR701 or the33-field large Batch B protocol.

## Local evidence

Production build/content: 6f52753187e34440779e2fb90562844f1be3fdb48ad5816c9e220ad92de67164.

- Complete network source suite75/75.
- Exact-source comparison28cases, max fixed position error0.009089216476510634.
- Emitted canonical15 range/paint goldens,3 native packet modes,3 wall-drop families and5 wall-drop cases.
- Actual emitted Storm authority16/16: native30/60/120Hz at20Hz sending phases0/1F/2F, plus sender/proof/termination/duplicate/respawn rejection.
- Actual emitted horizontal seed13: all13 packet32 births retain unit identity and ten wall ticks match; the main glob remains y3 and the proper near glob falls to y2.4.
- Range26/26; quality89 passed with one existing emitted-only optional case.
- Startup and complete artifact hashes pass,131 core plus14 Range preloads; budgets unchanged.
- Full gameplay aggregate:920 passed,2 environment/storage failures,1 emitted-only optional (923 total). One failure occurred while workspace was full, the other correctly rejected a temporary checkout path. Both unchanged tests passed from real persistent storage after moving only our regenerable cache (2/2). The aggregate optional Match/Alpha test and quality optional Tenacity test passed against the actual build (2/2). Initial failures and logs are retained; no complete-suite repeat was used.

## Limits and history

Source PR CI histories are not this composition's acceptance. PR609 had a legacy terminal-wall expectation and an earlier baseline Charger comparison failure; PR612's comparison reordered Storm presentation and its browser network failure lacked packet diagnostics. These are recorded, not represented as source-green acceptance.

The Storm proof intentionally fails closed if no active accepted snapshot survives, including termination/death/life advancement before playback. Historical reconstruction without that evidence, and PR322/668 delayed hold-to-throw, are outside this pair. Real hardware and Nintendo parity are unverified. Browser acceptance requires the new dedicated integration PR's exact CI. No main merge or deployment is performed.

## Follow-up after accepted PR705 merged

The original pair passed all seven required jobs in run37387892831 at head38507f7b, merge9084141a and content6f527531. After the separately accepted PR705 was merged, main advanced to fdc2806c0464813baa5af1d9b2c16044ca03d0a9 with exactly its tested treeaaa41c56. This pair is now composed on that main:705's seven Issue fixes are inherited base, not additions to this pair's five-Issue delta.

The three-way tree combines without source conflicts; duplicate precision/verifier fixes occur once. Private composed build/content f182fb6adfc9df62defe8170805352e0068ee46d819d02f990853dedfd8f12d8 passes the shared35-case Storm authority, native floor precision, horizontal wall-unit and Roller/Storm coverage tests, plus emitted canonical15goldens/3packet modes/5wall cases and complete startup/artifact gates. No second full local aggregate was run. A new exact merge-candidate CI is required for this changed base; the earlier pair's all-green run is historical evidence, not acceptance for this new composition.
