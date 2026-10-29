# Contact-batch integration evidence

This ledger covers the source snapshots named below, not the later commit containing this ledger. Common `53d886000e991e7a21e233d55f15d5caa3258619` includes the Storm vertical-rain contact fix `f10277b2`, nonpenetrating single-round proof admission `3955d520`, the missing-local-definition guard `c978348e`, and the final guard-source receipt. The other three snapshots contain byte-identical Git blobs for the affected Storm and proof-admission runtime files and the single-round test. The snapshots are local builds; hosted CI for later changes is not established here.

Storm object contacts now evaluate the vertical rain visibility at the target. An intervening diagonal wall no longer prevents exposed rain from reaching devices; a roof still blocks it, and normal radial attacks keep their existing visibility behavior. Source-composed tests passed 6/6, and the separate cutoff regression passed 3/3. The latter verifies the current bounded implementation; it does not establish the unknown native vertical cutoff for #735.

The proof-admission change limits Shooter, Dualies and Splatling proofs to one body contact, while preserving other families' existing capacities. A missing local weapon definition fails closed. The final six-file guard-source suite passed 154/154 and includes the earlier 100/100 focused cases; those counts are overlapping, not additive. Native flight controls, receiver regressions, the unchanged-runtime negative control and the guard hashes are detailed in [single-round proof admission](../single-round-proof-admission.md), with its [raw final guard receipt](../single-round-proof-admission/guard-source-final.tap.gz). This remains a bounded plausibility repair. #1665 and #1666 stay open: the retained unchanged production-path probe still shows 36 HP damage to PvP, Boss and crablet targets despite zero actual sender launches or receiver projectile contacts.

## Builds and verification

Each identity receipt below reports full source-input and artifact verification. Each build also passed its deterministic startup file/dependency budget; this is not a browser timing measurement. Complete hashes, evidence file hashes and compressed build, identity and budget logs are in [ledger.json](ledger.json) and [evidence](evidence/).

| Snapshot | Source commit | Content hash prefix | Input hash prefix | Artifacts / inputs | Startup budget |
| --- | --- | --- | --- | ---: | --- |
| Common | `53d88600` | `236528e1` | `9d260d68` | 2237 / 1527 | passed |
| Optimized, before ring fix | `e4ffc3b9` | `33a559f5` | `dc0110ee` | 2241 / 1530 | passed |
| Optimized, with ring fix | `7525bd5c` | `27d49de0` | `ced46582` | 2241 / 1530 | passed |
| PR #1909 | `be48c6be` | `67e78b1a` | `12550154` | 2241 / 1529 | passed |
| PR #1910 | `79fb0047` | `0c3788aa` | `70f31192` | 2237 / 1527 | passed |

Common's build log records absent or unverified prebuilt native stage payloads and fallback to browser conversion. Source and emitted targeted tests are software component evidence; neither the build identities nor the startup gate prove gameplay on physical devices or retail-game equivalence. #401 is outside this batch. The batch does not change the standing integration holds or merge main.

## Initial emitted selector result

The first common and optimized emitted runs each exited 1 with 60/61 passing. The one failing `#226 public-source scope` case expects the original source's 172/172/171 candidate-call counts but observed 178/178/178 in the emitted adapted runtime. The other 55 single-round, two Storm-object and three positive calibration cases passed on each build. The unchanged assertion is a source-context test; running it through the emitted selector measured a different implementation. The two complete failed logs are retained as `*-emitted-initial.tap.gz`. The final selector result, when available, is recorded separately; the first result is not silently discarded.

The corrected selector retains that exact source-only case in a separate source test and adds an emitted-scope guard. The common rerun passed 61/61 with no failures or skips using test harness source `b18d91f336e635e6da4b7f08fa1010e79fd11044`; its content hash is the same `236528e1...` as the common build above. The optimized ring-fix build passed 61/61 with no failures or skips using source `7525bd5cc275c46f308fda2ee06912478d48b5d5`. Both final raw logs are retained alongside the initial failures.

Initial command used `INKWAVE_BUILT_SITE` for the relevant built site and `node --experimental-vm-modules --test --test-concurrency=2` with `patches/network-replication/tests/combat-single-round-targets.test.mjs`, `patches/splatoon3/tests/storm-object-contact.test.mjs`, and `patches/splatoon3/tests/storm-rain-calibration.test.mjs`.

Work was divided among six agents: Sol 1 handled authority and the #1911 integration; Sol 2 handled CI; Sol 3 handled strict performance and ring checks; Terra 4 handled Rainmaker review, the controlled Character CPU evidence and this ledger; Terra 5 handled Storm; and Terra 6 handled PR inventory and #1910 integration. Those assignments are scope records, not claims that every acceptance condition is complete.
