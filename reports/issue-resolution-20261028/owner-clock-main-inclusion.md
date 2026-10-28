# #1767: latest-main inclusion and tested clock equivalence

The clock implementation is already in main `e67c636b81762df56b346a09ef570964d43084df`.
Its clock-specific source equals the native-tested candidate source
`472c85fa85e91f6e8b316f7d466c2c51209e3759` (the six-phase native receipt ran source
`8c7f27a2`; its runtime/build inputs were verified identical to 472).
This concretely resolves the **main integration** condition. Keep #1767 open until
full required CI passes; no deployment condition is added.

[PR #1843](https://github.com/rhgrive3/actions/pull/1843), merged 2026-10-23T10:20:21Z
as [726e338a](https://github.com/rhgrive3/actions/commit/726e338ac256ba9609086ce65e25a68ddd99df85),
integrated both fresh receiver-proof source `dfc0bd6e` and catalogue admission
`492305e4`. GitHub associates both commits with that merged aggregate. Its first
parent main `26a4db41` has no owner-clock module (contents API404); the merged tree
contains it. The merged catalogue blob equals the source 492305e4 blob exactly:
`7fae1d7138ad68b45e0c2f88a3af93367d1575a8`. Therefore the individual unmerged/closed
status of #1842/#1846 does not mean their implementation is missing from main.

The current owner-clock blob was last refined by `e5b1b9b2` through
[merged PR #1882](https://github.com/rhgrive3/actions/pull/1882),
[merge 6e61cfcc](https://github.com/rhgrive3/actions/commit/6e61cfcc6dc1874b0aa851ffdc78da9d430392d1)
on 2026-10-27T15:18:17Z. That patch caches the unproven-peer count and retires it with
peer lifecycle; it does not widen nonce/fixed-origin admission. Complete GitHub
history was used because this local Git repository is shallow.

Critical current-main and tested472 blobs are identical:

| File | Same Git blob in both revisions |
| --- | --- |
| `patches/network-replication/owner-clock.mjs` | `552919a71f88a3fee2b834a5c3fd9c219cb8d2a9` |
| `patches/network-replication/snapshot-guard.mjs` | `d8f8d6374cbe40b82ed9e3b73319f77d3e11b832` |
| `patches/splatoon3/runtime/catalogue.mjs` | `deaf1e8d1c5716419539b830fbf431bf72111b54` |
| `server/src/index.js` | `dd756b12244aee3ce103ae76926ce6242078a324` |

Independent actual `adaptBuildSource` composition from each revision found all
**28 selected clock/ACK/lifecycle/transport sections byte-identical**, including
native pre-bind/fixed-origin/relay admission, NetMatch bind/update/dispose/leave/
send/onMessage, Session construction/begin, complete nonce ACK handling, fixed
origin guards and all Transport methods. Entire generated Session and Transport
modules are identical. Exact part hashes and all 12 file-blob comparisons are in
`agent1-1767-main-inclusion.json`; the reproducible comparison script and generated
source snapshots are retained under `/workspace/scratch`.

Whole generated NetMatch differs only in actor pose capture for combat receipts,
the PvP read-only peer default and the Boss receipt preflight/installer argument.
The network adapter diff only adds those receipt files to build identity. These
are separate from #1767; whole-build or whole-combat equivalence is not claimed.

Current network browser job
[123034976276](https://github.com/rhgrive3/actions/actions/runs/40747849465/job/123034976276)
passed on exact 472, including startup snapshot clock recovery, fixed-origin owner
clock tests and real Actor hit ceiling checks. Full core CI still has the separate
modeled provenance fixture repair pending, so that successful lane alone does not
close the issue. No source changes or additional unit/browser runs were performed
for this read-only inclusion audit, and no external issue action was taken.

The committed machine-readable comparison is [owner-clock-main-inclusion.json](owner-clock-main-inclusion.json). Main integration is verified separately from the pending full required CI.
