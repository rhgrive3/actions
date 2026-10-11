# Suction / Curling causal core-paint replication

## Scope and evidence

Incremental companion to the three sub/special residual fixes based on PR1202 `7d74919cf78dd203e7bd0d1b80eeaf451eaec0f8`; reviewed alongside PR head `3174350f19f388d8cbed1b9c67baf103405a2590`. This patch does not contain that head's fist changes or alter fist radius. Source parameter evidence and unit caveats are in `inkwave-pr1202-sub-special-source-residuals-20261010.md` (parameter version 1130). This is a networking consistency repair, not a claim of native-engine paint raster equivalence.

Correct kit-owned paint has a radius-5 core for Suction and fully charged Curling. The generic network paint cap remains 3.744. Actual PaintSystem/NetMatch reproduction before the repair showed Suction sender 1246 versus receiver 514 cells and full Curling 1250 versus 279 cells. Splitting the core into smaller stamps would change the footprint, so this repair preserves the original center, radius, seed and satellites.

## Protocol and admission

Only Suction/Curling bomb birth events gain optional `inkwave-kit-birth-v1` metadata (match epoch and actor life). Their one core mark gains `inkwave-kit-core-v1` (epoch, actor network ID, life, birth event sequence). Existing event slots and sequence footer are preserved; events without metadata retain their old exact wire length. Existing generic radius cap is unchanged.

The receiver verifies current member/owner identity, equipped kit, finite birth position/velocity, valid charge, match epoch, life and sender event order. It derives the permitted core radius from the shared kit resolver, checks core team and shape, and grants at most one core per accepted birth. Unknown metadata, excess radius, invalid charge, unreceived old-life birth, impersonation and sequence replay fail closed. Accepted in-flight births survive their owner's death/respawn, so already-thrown bombs can still explode. Membership/ownership/match changes retire their capabilities.

Per-owner capacity is 128 births; completed entries are reclaimed. One peer cannot exhaust another peer's quota. Per-sender pending events are bounded to 256 with a two-second wait. Core-before-birth defers its later sender events to preserve sequence order. Arrival in reverse array order, separate newer envelopes and explicitly awaited older envelopes are supported. Expired claims cannot revive when their birth finally arrives. Capacity failure drops the unresolved claim rather than silently dropping unrelated later events.

Original per-row deadline and Storm envelope proof is captured before deferral. Recovery passes normal paint-order admission; host deadline commit can apply legally received pre-deadline paint before timeline playback, without later double application. Malformed non-array event rows are filtered before upstream combat-credit processing.

## Compatibility and limits

Old clients can ignore appended metadata but still reject radius-5 cores under their original cap. All peers must use this version for equivalent large-core reception. Untagged legacy senders retain the old cap, even if their equipped kit could make a larger core. This ledger validates an announced sender-owned kit action and its derived shape; it does not prove actual ink payment or a physically valid detonation, nor replace server-authoritative anti-cheat. The wait/capacity values are engineering safety limits, not Splatoon source parameters. A genuinely missing birth cannot authorize a large core.

## Verification

`node --experimental-vm-modules --test patches/network-replication/tests/kit-paint-admission.test.mjs`: 17/17 passing.

Tests execute actual kit paint, PaintSystem, encoded events and NetMatch receive/playback. They compare complete sender/receiver paint grids for Suction and charge-0 / charge-0.5 / charge-1 Curling; cover malformed metadata, owner spoofing, invalid charge/radius, duplicates, stale sequences, match boundaries, approved-birth survival after death, unreceived old-life rejection, reversed/newer/older arrival, timeout and late-birth expiry, capacity and peer fairness, and pre-deadline host commit before playback.

Independent network review reproduced and verified expiration and deadline-commit repairs. Full tracked baseline network suite plus the added head fist test and ledger suite: **289/289 passing**. Untracked tests from an older scratch workspace were deliberately excluded; the baseline file list came from `git ls-tree` at the pinned 7d74919 commit.

## Integration reconciliation

Reconciled against aggregate commit `6f5b2850bd18e2d0b2ff1639e0637deaf9f35e1d`, including upstream 49f37c, the five parallel lanes and the fist center-height repair. Only the final adapter context changed: the upstream Super Jump destination arguments, host terminal-state guards, disconnect handling and fist stamp-height behavior are retained. The ledger production algorithm is unchanged from the independently reviewed version.
