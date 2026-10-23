# Additional queue: network

Base: `8de71b09cd7a3bc05fa4ce06b00f99687beb44ad`. All six assigned originals were read in full. Four findings are implemented locally and two proposed optimizations are rejected with executable counterexamples. Production reference remains Splatoon 3 11.3.0. No cold-start clock protocol changes (#1767), packet schema changes, device timing/FPS claims, or retail-parity claims are included.

## Dispositions

| Exact queue suffix | Disposition | Evidence |
| --- | --- | --- |
| fidelity-packet-parser-eliminate-flags-and-finite-slice-arrays | Rejected | Actual full fidelity module: the proposed early-return marker scan skips a later observable getter; the proposed early finite loop skips a later getter that native slice evaluates. All 32 ordinary marker combinations and sparse inputs retain ordinary admission parity, which does not establish evaluation-order parity. Parser is unchanged. |
| host-handoff-starting-go-barrier-deadlock | Fixed | Actual composed NetSession/NetMatch reproduces a loaded successor stuck in STARTING when only the new continuation is disabled. Authenticated relay host change now rebuilds readiness using the existing READY schema. Loaded survivors resend to the elected host; the loaded successor marks itself ready and restores the existing 12-second fallback. |
| network-combat-admission-duplicate-global-prune | Fixed | Remove only the second global prune in private `take`; its sole caller `combatAdmission` already prunes at the identical timestamp before every admission. Actual-state parity covers expiration boundaries, pending rows, contacts and invalid envelopes; 14 old prune calls become 7. |
| network-combat-proof-record-merge-duplicate-rate-scans | Fixed | One loop detects duplicate keys and counts recent same-actor proofs. Pairing, ownership, proof push order, rate limits and retention caps stay in their original positions. Actual-module counterfactual parity covers 900 deterministic batches and explicit 0/1/159/160/161/256 boundaries. |
| network-combat-proof-retention-avoid-unconditional-array-copy | Rejected | Actual record alias observation changes retained array length from 1 to 2 under reuse. A synchronous LOS observation callback using actual record/admission exposes an appended proof to the active traversal only under reuse, changing rejection to acceptance. This demonstrates ownership/reentrancy differences; it is not a claim that a remote JSON packet can install an engine callback. Original unconditional outer-array replacement remains. |
| network-death-paint-reuse-deterministic-burst-plan | Fixed | Cache one native deterministic plan per victim in existing per-session/per-match state, at most 8 victims. Key snapshots generation/life/attacker/x/y/z/seed/team. Every stamp retains owner/generation/life/attacker/team/distance/row exactness and replay-mask checks. Ordered/reversed/shuffled eleven-stamp bursts reduce plan calls from 11 to 1 without changing admitted rows or masks. |

## Lifecycle and authority

Host handoff occurs after existing NetMatch owner adoption and the synchronous host notification. Captured room-attempt, transport, configuration, match and elected-host identities reject reentrant replacement rooms. Setup must actually have completed and still belong to the current native Game/Match. A loading successor waits for its original `_begin` completion. GO is host-only; fallback callbacks additionally bind the host and handoff epoch. Existing roster/protocol/compatibility and authenticated sender checks are unchanged. Two successive host departures, departed Actor ownership transfer before GO, duplicate READY/GO, wrong sender/match, stale callbacks, end-match and room replacement are covered. The tests use actual composed Session/NetMatch/Actor with platform transport/timer/world setup fixtures; they do not claim three-browser relay coverage.

Death-plan caching is only deterministic preparation, never an acceptance receipt. Cached numerical keys are copied from the proof. Ownership/life/geometry rejection still precedes generation, and individual stamp identity, deterministic seed/radius/coordinates and replay checks still run. Life changes, owner generation changes, seed/position changes, match isolation, forged rows and 37-victim churn are exercised. Native hazard/zone paint production is also checked.

## Validation

- `node --experimental-vm-modules --test patches/network-replication/tests/added-combat-scans.test.mjs patches/network-replication/tests/added-death-plan-cache.test.mjs patches/network-replication/tests/added-parser-semantics.test.mjs`: **10 passed, 0 failed, 0 skipped**.
- `node --test scripts/tests/inkwave-combat-provenance.test.mjs scripts/tests/inkwave-boss-positive-proof.test.mjs`: **56 passed, 0 failed, 0 skipped**.
- Serialized native composition command (below): **48 passed, 0 failed, 0 skipped**.
- Syntax checks for all three changed production modules and `git diff --check` pass.

The initial existing modeled combat suite had two stale roller fixtures that supplied only presentation flags. It now installs a valid owned snapshot using the current native validator/unpacker before asserting legitimate contact; an added negative assertion verifies raw flags cannot authorize contact. The initial zone fixture lacked current RankedWorld THREE/i/j/center construction inputs. It now supplies the matching cell center and runtime namespace. Original acceptance/rejection/count assertions remain. Both initial failures reproduced against the unchanged base; no runtime guards were relaxed.

Native composition command:

```sh
flock /workspace/scratch/1dcd5205fbb6/added-heavy-tests.lock node --experimental-vm-modules --test --test-concurrency=1 patches/reliability/tests/added-host-start-handoff.test.mjs patches/reliability/tests/net.test.mjs patches/reliability/tests/host-teams-start-composition.test.mjs patches/network-replication/tests/issue-522-paint-authority.test.mjs
```

Combined immutable build/browser and publication are owned by the parent integration task. No push, CI polling, shared behavior report edits, original queue edits or Library metadata writes were performed here.
