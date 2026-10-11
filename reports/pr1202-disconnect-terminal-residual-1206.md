# PR1202 disconnect terminal residuals (#1206)

Scope: additional review of PR1202 `49f37c2016804e7e388ddf463c0c06015acb2b41` integrated with #1203 on the separate fidelity branch. These changes do not touch original PR1202 or main. They do not modify numeric retail parameters.

## Reproduced roots

1. **Expired No Contest loses completion on host migration.** A guest reaches remaining=0 waiting for ncend. If the old host leaves before sending that message, the newly elected host never enters the existing `remaining > EPS` update block. A pending decision now owns completion, including at zero. A zero field without a pending decision does nothing. Guests still wait for the authoritative end; repeated updates finish exactly once.
2. **Post-battle departure deletes an actual participant.** `onLeave` previously used `state !== playing` to select pre-start removal, including finish/judge/results. `_remove` erases the actor and `byNid`, so an incoming result can no longer reconcile that participant's stats. Preserve and deactivate completed-battle actors, retaining roster identity, stats and final-packet lookup. Loading/intro nonparticipants are still removed.
3. **Late cancellation replaces a committed ordinary result.** Existing admission protected an accepted No Contest against late result messages, but not a committed ordinary result against late nc/ncend. Both start and completion now reject a new cancellation once an ordinary result exists. An already-pending No Contest retains precedence. This is malformed/abnormal-order robustness, not a claim that ordinary clients generate this sequence.

These are separate from #1203's repeated-countdown extension, host phase rewind, duplicate result commit, numeric clock poison and stale spawn cleanup.

## Evidence and limits

Three regressions fail against the current integrated production-composed NetMatch. Candidate tests cover those three plus init/intro removal, all three terminal phases and authoritative final stat reconciliation, positive/zero migration, exact-once completion, pending-guest waiting, unrelated senders and a separate new match. Platform, sockets and scene are deterministic fixture stubs, while the production adapters and NetMatch execute. No browser rendering, real relay or console testing is claimed.

Source bundle comparison is unchanged from #1203: Leanny/splat3 pinned at `7280ff9cde8bb1c5dcef46c700c326471584d2e6`, [1130 Regular Match manual mapping](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/manual/UIManual_RegularMatch.spl__UIManualData.json), and [USen localization snapshot](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/language/USen.json). These describe finite battle and post-battle results, not the game network implementation. The mapping is explicitly version 1130; localization is an unversioned pinned snapshot. Existing #201 owns the project six-second No Contest policy, which remains unchanged. No relevant executable decompile was located. No raw decompile/resource bundle is published.

Duplicate searches: disconnect/results, No Contest/migration/zero, finish/roster/disconnect. Related #201 (original policy), #1025 (pre-bind nonparticipants), #1131 (aborted Judd continuation) do not cover these roots.

## Verification

- Negative production-composed reproductions against integrated code: 3 failures / 3 expected defects.
- Candidate dedicated regressions and controls: 12/12 pass.
- Existing No Contest, disconnected main projectiles, and #1203 terminal integrity neighbors: 34/34 pass.
- Temporary relocated tests use absolute import paths to the integrated fixture and candidate runtime. The initial relocation of a Game source URL failed with ENOENT; after correcting this harness-only path, all 34 pass. Repository deliverable tests keep normal relative imports.
- `git apply --check` succeeds against the read-only integration checkout before handoff.
