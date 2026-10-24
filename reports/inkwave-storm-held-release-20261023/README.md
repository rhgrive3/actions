# INKWAVE Storm held-release browser verification — 2026-10-23

Candidate browser result: **passed**. Frozen baseline reproduces remote rejection for all three native held releases. See [summary](summary.json), complete raw receipts and input manifests retained in the saved local environment, and [input identity](input-identity.json).

| Release after activation | Actual baseline / candidate tick delta | Baseline remote canisters / clouds | Candidate remote canisters / clouds |
|---|---|---|---|
| +2 | 2 / 2 | 0 / 0 | 1 / 1 |
| +30 | 30 / 30 | 0 / 0 | 1 / 1 |
| +600 | 600 / 600 | 0 / 0 | 1 / 1 |

## What actually ran

Chromium 154.0.8037.57, two isolated contexts in one browser process. The full procedural Tidewater game booted with production Game/Match/Actor/Character meshes and the exact minified builds. Both peers created/joined a room, selected the native `charger_scope` Storm kit, confirmed teams, readied and started the match. Real browser WebSockets used the existing local relay fixture, which invokes production Worker fetch and RoomDurableObject admission and delivery. The Node shim only replaces the Cloudflare WebSocket upgrade platform.

Independent cases were charged using controlled native gauge setup. The existing debug input hook pressed Q, held/released E; native PlayerController, Actor, throw trigger, throwStorm, event recording, transport and receiver playback ran. Native frames advanced at 1/60 with rendering skipped between screenshots and real performance.now unchanged. No direct ghostBomb call produced browser evidence: its diagnostic wrapper only observed receiver calls. Receiver `_stormBirthAuth`, epochs, peer clock state, nonce guards and projectile quotas were never assigned by this browser test. The local relay recorded both fresh clock negotiation and native use/throw/birth packets.

The +30 release's exact relay envelope was delivered twice unchanged. Inspect `candidate.duplicate` and each case's remote counts for one-consumption evidence. After normal throw end, then a controlled lethal call through the native damage method, actor snapshots and receiver authority are retained in the summary. These are representative lifecycle checks, not a full death/reconnect matrix.

## Exact inputs

- Repository: rhgrive3/actions; frozen base `726e338ac256ba9609086ce65e25a68ddd99df85`; base tree `cfd4402fa796d11daffe2db0d34cdfcac8a4c71c`.
- Private candidate is a detached copy of that base with only `patches/network-replication/adapter.mjs` changed. The original checkout stayed clean. No moving main was used.
- Patch SHA256: `e7e183dd4c0867c67341a00679eb6581af1df50c4b51f648d7c2d45c5a5e1e5f`.
- Candidate adapter SHA256: `aaabac7d788db42436f338e0364f8bd48340862140cec297619bcb6cae95bd5a`; Git blob `7f0fe0d1658be5f6b797966bf1cbacb4dcd190c5`.
- Baseline inputHash `350b861c6d2ca16e5430ffc5b4f7e39cfbefc9df67290de1746b077ae256eb81`; contentHash `caa80f320098ca6b8d4cbedd4b8f6ca2b8652663cfb120412abf8dfb78f4d100`.
- Candidate inputHash `968db27a5491109fa12fd4dda62e21080681079b146c655206b256adb71df386`; contentHash `4f8e1303d56fc4c2d2acdb1122312e22673e7990252502289cbe4471947c3ade`.
- Every baseline manifest input was checked against frozen Git blobs. Candidate and baseline input tables differ only at the adapter. Every emitted artifact was hash-checked on disk before serving. Complete file/artifact SHA256 tables are in each raw build identity.
- Browser response bodies checked: baseline 1118, candidate 1118; each run has two evicted inspector bodies as explicit audit gaps (candidate identifies the large, unrelated Roller volumes asset). The final candidate classifies body unavailability separately from hash mismatches. Both peers' netmatch, session, transport, Actor, weapons and main module response hashes were recorded. No mismatches were observed.
- Private parent `e9f59c085666a0128558c43da456801b42033cd1` was unavailable locally and was not fetched or published. Runtime patch, runtime files and builds are not included in this report commit.

## Validation, failed attempts and limits

- Both production minified builds completed.
- Untouched baseline focused unit run: 24/24. Untouched candidate focused run: 28/30. The two failures are the existing Storm quota positive fixtures, which omit a throw event. The separate evidence-only adaptation inserts that event and shifts sequence expectations; both pass in source (2/2) and actual minified output (2/2). Original failing logs are preserved; no claim is made to have rerun the parent's 53/53/75 suite.
- First baseline attempt's +2 case never activated during spawn. It remains recorded; the final baseline waits for normal spawn completion and records all exact deltas.
- Final baseline raw harness status is `failed` solely because its response-audit handler treated two Chromium inspector-cache evictions as errors. All three native runtime acceptance rows passed. Relevant runtime modules have response hash receipts; all server files were validated. This is not reported as an entirely clean harness run.
- First candidate attempt used HTTP interception for response auditing. Chromium denied its local WebSocket (`ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`); the relay saw zero connections. That attempt is preserved. The next attempt removed interception and used normal local HTTP requests, as the successful baseline did. No local-network permission grant, check-disabling flag, GPU flag, remote debug port, auth/access change or download was added.
- This establishes only the observed local browser/production-relay-shim path. Deployed relay, WAN delay/loss, physical input/frame pacing and Nintendo hardware behavior remain unverified. No Splatoon 3 frame calibration, gravity, drag, contact or VFX change is included.
- The known latest inactive/dead endpoint rejection of very late packets remains outside this fix and is not claimed resolved. A comprehensive late-delivery/life/session/handoff matrix remains an acceptance gate.

## Own screenshots

These show INKWAVE's procedural map and its own runtime presentation. No Nintendo media is included.

- [held-2-canister](held-2-canister.png)
- [held-2-cloud](held-2-cloud.png)

The [browser harness](verify-browser.mjs) and [evidence-only quota adaptation](quota-with-native-throw.test.mjs) include fixed local workspace paths and are preserved for inspection. Adapt only these paths when reproducing elsewhere. Launch arguments were exactly `--no-sandbox --disable-dev-shm-usage`; the installed Chromium wrapper's defaults were used.

## Publication receipt

This compact report publishes the summary, input identity, harness, quota-fixture adaptation, and representative +2 canister/cloud screenshots. The full six original screenshots, all build manifests, wire traces, logs and raw-evidence.tar.gz remain under `/workspace/storm-held-release/deliverable` and `/workspace/storm-held-release/evidence` in the saved environment. Larger uploads were interrupted; no success is claimed for unpublished files. Runtime evidence was recorded on 2026-10-23; report publication completed afterward.
