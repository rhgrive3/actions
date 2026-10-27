# Services/process optimization audit — 2026-10-26

Scope: main/config/i18n/context, audio, UI, client networking, account/relay, application/service-worker boot and build transforms. Simulation/world/rendering work is owned by the other two implementation agents. Read AGENTS.md, traced scripts/inkwave-source-composition.mjs, and inspected actual adaptBuildSource output for all 21 public service modules; baseline composed copies are in /workspace/scratch/services-composed/. Changes live in existing source owners, without another composition layer.

## Implemented reductions

| Production process | Editable owner | Evidence and preserved behavior |
|---|---|---|
| Held-map Bubbler pin ordering, visibility and numeric keycaps | patches/local-quality/queue-ui-20261025-adapter.mjs → src/ui/diorama.js:_ensureBubblerPins | Reuses the overlay's existing pins array instead of spread + slice each update; exact base/Bubbler/self order and length remain. Every target/serial/hover/input lifetime is still read each update. Static numbered key markup is generated once per pin and compared against actual DOM; unchanged styles/HTML are skipped and external edits/replacement nodes repaired. Seven changing target-count scenarios and 120 unchanged frames each generate no redundant writes; five numbered keys generated five times total. Removed targets are nulled exactly as before. |
| Range target card | patches/practice-range/runtime/hud.mjs:RangeHud.update | Five exact formatted text outputs compare current textContent; HP compares requested and CSSOM-serialized transforms. Timer/combo/damage/reinflate state still updates each frame. Stable 120-frame feedback causes no additional target text/HP writes; mutation, missing combo, node replacement, external overrides and clear/hide remain correct. |
| Outgoing Dualies sidecar at 20 Hz | patches/reliability/queue-network-ui-adapter.mjs → src/net/netmatch.js:_sendTick | Memoizes the pure per-actor action/startup/direction reads inside the original rl map callback, after original gear/cost/life passes. Preserves nid-before-fields evaluation, startup formula, r2/r3 order, optional remote metadata and dir field order. Native/catalog, startup/rolling, invalid direction, remote/idle actors and next-tick state mutation covered. Mixed five-actor fixture makes seven explicit action lookups and three direction lookups. |
| Concurrent lazy account dialog opens | account/client/src/entry.js | Reuses exact isolated fix from open PR #1893 (head f2c721c14f22cae9326178d47d74834bd304d4c7; entry Git blob 725ecc49efea5a4aceaa621e776fc6a3caf246c2), supplied by root. Coalesces pending opens, preserves first request's view policy, and uses epoch/owner checks for close during import and stale finalizers. Prevents duplicate modal DOM/subscriptions and late orphan mounts. Only this entry blob and three isolated entry tests reused; no merge or account API/store changes. |
| Service worker precache install queue | patches/loading-cache/sw.js:installSnapshot | Private monotonically increasing index replaces repeated pending.shift(). Snapshot array, two workers, URL claim ordering, failure latch, allSettled wait, transaction rollback and last commit marker remain. 25 assets fetched once in manifest order with observed peak concurrency two; original manifest unchanged. |
| Repeated-string compactor | scripts/lib/inkwave-source-compaction.mjs:emit | AST literal spans cannot overlap. Sort ascending and copy each unchanged segment once instead of copying the entire module per edit. Keeps declaration insertion, byte accounting, direct/dispatcher comparison, reparsing, import/export/directive handling unchanged. Exact before/after result-object differential on all 117 public source modules, 4,163,421 characters, 50 with actual compaction: zero differences. Synthetic 12,000-literal build stress fixture emitted identical 222,116-character output: 4,595 ms old vs 100 ms new in this environment (not a gameplay/FPS claim). |
| Production split Three core preliminary staging | scripts/build-inkwave.mjs | Moves existing replacement guard ahead of core read/compose. Avoids one redundant 1.46 MB core adapter traversal; bundle's existing onLoad still reads/composes original core. Wrapper module still composes/captures dependency specs. Guard tests preserve diagnostics, INKWAVE_NO_THREE_SHAKE=1, missing wrapper, and ordinary non-Three modules. Root owns the single production build validation. |

## Inspected processes retained without another change

| Path / process | Finding and no-change reason |
|---|---|
| src/main.js:boot/loadModule, lazy imports, progress frames, shader warmup | Optional mode modules already load lazily; boot steps explicitly yield for visible progress and trusted audio/start boundaries. Parallelizing/reordering more would change readiness, fallback or world publication order. |
| src/main.js:_buildWorld, lightmap prefetch/load, theme/quality changes, warmup | Existing bounded validated metadata cache and world-owned GPU disposal are in composed owners; rendering agent audits native/world lifetime. No new asset cache introduced. |
| src/main.js:_loop/_frame and platform-game/pause-frame-retention/range-frame-pacing owners | Existing stable rAF callback, fixed-step simulation delegation, covered-world suppression, pause retention and context/lifecycle guards already remove idle work. Preserve frame/input/net/audio/HUD order. |
| src/main.js:_updateLocalLoops/_updateAmbience | Existing no-local/no-loop fast return, muted deferred requests, loop rearm and audio parameter dedupe. More caching risks changing fades/phase or mutable handles; random gull/marina cadence untouched. |
| src/main.js:_updateHud, local-quality/hud-snapshots.mjs | Existing mutable frame/roster/map/mobile transports and camera tangent caches already avoid frame object churn. Actor readiness/health/map projections are live state and must remain refreshed. |
| src/main.js:_padMenus, menu/settings/match/net orchestration and persistence | Input edge ownership, elapsed stick-repeat, trusted gestures and async match/world epochs are control-flow lifetimes; no scan or serialization was removed across them. Persistence only runs on actions. |
| src/config.js | Static weapon/map/settings/progression tables plus exact quality/theme selection; no frame-driven construction to remove. Preserve data mutability/localization and gameplay balance. |
| src/i18n.js | One-time language read/data localization; per-call placeholders and input-mode-dependent prompts cannot be cached by source string alone. Numeric keycap optimization uses confirmed pure keycap function, not translated prompts. |
| src/core/ctx.js | Event bus synchronous live Set semantics are intentional (listener add/remove during dispatch); no snapshot/cache rewrite. Math/RNG helpers preserve numerical and draw order. Network event-vector snapshots already supplied by composed network owner. |
| src/audio/audio.js:context/unlock/buses/noise/voice/play/loop/duck/stop/stats | Existing context buffers, qualified emitter ownership, completed-voice retirement, voice budgets, loop deferral, safe reverse stopAll and volume dedupe inspected in composed output. Synth node creation and random sequences define sound; no node reuse or event suppression. |
| src/audio/music.js:composition/instruments/Player scheduler/fades/MusicEngine | Existing direct starvation skip, song compilation cache, procedural clock sleeping and streamed/procedural distinction already avoid idle/scheduler work. Note order/timing and RNG left unchanged. |
| src/audio/streamedTrack.js | HTMLMediaElement owns decoding/play clock; fade stop timer retires stream and disposal clears timer/listener/src/nodes. No redundant procedural pump. Trusted priming/play attempts retained. |
| src/audio/bossAudio.js | Boss cue/follow interval lifetime belongs to boss start/stop; event frequency low. Positional follow and cue semantics retained. |
| local-quality/runtime/audio-listener.mjs; platform-audio.mjs; music-idle.mjs; platform-lifecycle.mjs | Identity/context-state listener caching, listener parameter equality, source-loop parameter dedupe, suspended/active platform ownership, stream starvation/preload preservation already implemented. No added cache/invalidation owner. |
| src/ui/hud.js | Existing output-key/DOM guards, pooled map dots/markers, mutable boss squad views, project scratch slots and camera-down guards. Dynamic ink slosh/turf/charge/hit/banner/feed timers remain at original cadence. |
| src/ui/hud-boss.js | Phase/squad/bar/hazard/countdown transition state and active overlay animations require live values; existing squad scratch lifecycle clears on mode/disposal. |
| src/ui/diorama.js excluding _ensureBubblerPins | Existing allied scratch list, exact serialized transform guards, roster release and pointer epoch/serial/target identity checks retained. Full current navigation and pointer cancellation regression checks pass. |
| src/ui/menus.js | Event-driven screens/settings/room/result assembly; existing network unsubscribe ownership, news disposal, preview visibility/frozen guards and navigation timer teardown. No stale screen caching or async-order changes. |
| src/ui/menu-art.js | Existing seeded splat shape reuse, frozen wipe success cache and preview changed-state guards; active canvas animation remains live. |
| src/ui/news.js | Existing owned next/close/tween timers, frame cancellation and DOM teardown verified in composed source. Content/wipe lifecycle unchanged. |
| src/ui/ui-icons.js; ui-util.js; boss-art.js | Mostly pure string/path/art and DOM construction helpers, invoked on events; no demonstrated repeated hot process beyond static Bubbler numeric keys addressed above. Avoid unbounded text/icon cache. |
| src/net/netmatch.js:receive/admit/sample/interpolate/events/hits/owner transfer/results/voices | Existing monotonic timestamp early rejection, live ghost index, rolling quantile insertion, boss successor cache, prefix compaction, exact authority/receipt handling and idle voice guards already optimize their work. No security, packet/tick timing or resource-lifetime changes. |
| src/net/netmatch.js:sc/l actor sidecars | Candidate merging with packing was declined: original sc specialCost calls occur after gear packing, and filter snapshots ownership before reading values; merging/reordering could change snapshots or observable call order. Kept both passes and no cross-tick actor cache. |
| src/net/session.js | Room/member/lobby/start/readiness/update paths mostly user actions or bounded eight-player state; broadcasts on changed data and live start/authority admission retained. No peer/roster cache. |
| src/net/transport.js | Existing pre-serialization backpressure/readyState guard, exact UTF-8 quota, heartbeat cleanup, receipt and protocol framing. Repeated JSON is a required fresh packet boundary; no protocol caching. |
| src/net/mock.js | Developer/mock lobby timers/actions; not the production relay authority. Event-driven cloning isolates mock state and remains unchanged. |
| network-replication runtime sidecars, rolling-quantile.mjs, utf8-length.mjs, ghost-live-index.mjs; splatoon3/runtime/dualies-network.mjs | Existing protocol/authority/lifetime ownership retained. Pure action/direction helpers confirmed in catalog-dualies-motion.mjs:16–22; no retained snapshots beyond callback. |
| account/client/src/api.js, store.js, game.js, panel.js | Requests/session freshness/bridge subscriptions/form phases reviewed as action-driven lifetimes. Broader correctness fixes in pending PR1893 are not mixed into this optimization; root authorized isolated duplicate-dialog admission overlap only. No speculative auth-result cache or reordered request. |
| account/client/src/art.js, icons.js, strings.js, i18n.js, styles | Static presentation/escaping/localization; no demonstrated continuous redundant work. |
| account/shared/rules.js | Validation and identity normalization remain explicit and unmodified. |
| account/worker/index.js, account.js | Route/config/session/auth/profile/password/delete/cron processing preserved. Database/session revalidation, throttling and same-cost unknown-user verification cannot be cached/skipped as an optimization. |
| account/worker/http.js, crypto.js, store.js, device.js | CORS/CSRF/cookie/JSON checks, timing-safe comparison and hash iterations, bounded sessions/atomic database operations maintained. At most bounded request-local label scans; no persistent user/session cache. |
| server/src/index.js | Relay admission, rate/byte quotas, hibernated socket restore, attachment snapshots, forwarding buffers, host/member cleanup already use bounded maps/one serialized forwarding payload. Eight-peer socket scans are bounded; another map adds invalidation/security ownership without measured benefit. |
| patches/loading-cache/sw.js excluding queue | Integrity/digest/deadline checks, revision bounds, candidate transaction, active offline repair, request dedupe and activation ownership retained. These I/O/security operations cannot be elided on identity alone. |
| scripts/inkwave-source-composition.mjs and existing adapters | Whole production chain composed, inspected and regression-tested; anchors remain fail-closed. No extra adapter or redundant runtime implementation added. |
| scripts/build-inkwave.mjs excluding early core skip | Existing bounded parallel independent transforms, synchronous composition order, transactional output, bundle reuse and dependency/modulepreload/asset identity scans retained. Root handles single build. |
| scripts/lib/inkwave-worker-compaction.mjs; inkwave-module-imports.mjs; inkwave-build-only-modules.mjs | Worker binding-marker/parser guards, static import discovery and build-only exclusion preserve deployment graph; no unsafe textual/cache shortcuts. |
| scripts/lib/inkwave-audio-manifest.mjs; inkwave-volume-packaging.mjs; inkwave-lossless-lightmap.mjs; inkwave-lightmap-index.mjs; inkwave-artifact-digests.mjs | Existing compact runtime projection, versioned dedupe, lossless asset conversion/indexing and mutation-detecting digest snapshots are already build-side reductions. No image/audio quality compromise. |
| scripts/lib/inkwave-native-stages.mjs; inkwave-account-bundle.mjs | Prepared native assets and optional account Vite chunks copy under explicit source/manifest authority with path/hash checks. No speculative file-system cache or bypass. |
| scripts/lib/inkwave-native-module-worker.mjs; inkwave-generated-music-worker.mjs and diagnostic/reference-audio helpers | Evidence/QA observation helpers, not per-frame product workload; preserve exact worker source/provenance and observation authority. |

## Behavior/reference boundary

AGENTS.md requires evaluating gameplay against Splatoon 3, not appearance/names. This change intentionally preserves all gameplay arithmetic, simulation timing, actor state, random draw order, network fields and target selection. Existing native/catalog Dualies source calibration and runtime helpers remain the reference; no unmeasured source parity claim is newly resolved. Map pins and range feedback retain current controls, labels, values and expiry. Build compactor is byte-for-byte output-identical across the measured corpus. Independent agents own actual simulation/rendering comparisons. This services work makes no real-hardware comparison claim.

## Focused verification (no full suite/build/commit/remote mutation run here)

1. `node --test scripts/tests/inkwave-source-compaction.test.mjs`: 4/4 existing semantics tests pass (imports/exports/literals/comments/directives/cycles).
2. `node --experimental-vm-modules --test --test-name-pattern='diorama retains|target card writes|outgoing Dualies|precache workers|normal production copy' patches/local-quality/tests/queue-ui-20261025.test.mjs patches/practice-range/tests/target-feedback.test.mjs patches/reliability/tests/queue-network-ui.test.mjs patches/loading-cache/tests/worker.test.mjs scripts/tests/inkwave-queue-build-efficiency.test.mjs`: three tests passed initially; two test-harness assumptions corrected (new composed owner mark, default Japanese label).
3. Corrected focused run plus isolated PR1893 dialog tests: `/workspace/scratch/services-focused-rerun.log`: 5/5 pass. Combined with the three unchanged passing focused checks above, 8 unique added process tests pass.
4. `node --experimental-vm-modules --test --test-name-pattern='#1153 fixture|pin|Bubbler' patches/local-quality/tests/ui-composed-jump-lifetime.test.mjs patches/reliability/tests/pin-tap.test.mjs`: 31/31 pass, log `/workspace/scratch/services-pin-lifecycle.log`. Replaced outdated spread-assignment textual assertion in existing composition test with actual live pin order/target/shrink execution.
5. Exact old/new compactor differential + build stress timing log: `/workspace/scratch/services-compactor-differential.log`: 117 modules, 50 compacted, exact full result-object equality; synthetic output length equal.
6. Account source Git blob verified equal PR1893 isolated snapshot: `git hash-object account/client/src/entry.js` = `725ecc49efea5a4aceaa621e776fc6a3caf246c2`.

43 unique focused tests pass; root is responsible for one final production build/quick/budget/syntax batch and CI/PR. Initial harness-only failures and their correction are recorded rather than concealed. No pending product-code failure found in service scope.

## Exact owned changed files

- account/client/src/entry.js
- account/tests/client-dialog-ownership.test.mjs (new; isolated PR1893 tests)
- patches/loading-cache/sw.js
- patches/loading-cache/tests/worker.test.mjs
- patches/local-quality/queue-ui-20261025-adapter.mjs
- patches/local-quality/tests/queue-ui-20261025.test.mjs
- patches/local-quality/tests/ui-composed-jump-lifetime.test.mjs
- patches/practice-range/runtime/hud.mjs
- patches/practice-range/tests/target-feedback.test.mjs
- patches/reliability/queue-network-ui-adapter.mjs
- patches/reliability/tests/queue-network-ui.test.mjs
- scripts/build-inkwave.mjs
- scripts/lib/inkwave-source-compaction.mjs
- scripts/tests/inkwave-queue-build-efficiency.test.mjs

Freeze: implementation complete; no additional services edits planned absent a concrete reviewer/verification finding.

## Main integration note — d88aa68

Root is rebasing the optimization from 48511150 onto updated main d88aa68 (PR1893 and profiler work). Resolved the single worker.test.mjs content conflict by preserving all three main stream regressions and appending our precache-worker regression. No index/rebase/commit operations performed by this services agent. The automatically merged sw.js differs from current main only by our two cursor lines: main's manifest-sized streaming verification, reader lock/cancellation, original-response branch cancellation/abort, response-body deadline, exact-URL retry, readable error forwarding and all other logic remain intact. Minimal integration run `node --test --test-name-pattern='oversized streaming|valid byte-limited|uncacheable server errors|precache workers' patches/loading-cache/tests/worker.test.mjs` passes 4/4; log `/workspace/scratch/services-integration-worker.log`.

The isolated PR1893 account entry fix is now already in main. Root will remove our duplicate account/tests/client-dialog-ownership.test.mjs because main's account/tests/client-lifecycle.test.mjs covers the same three dialog cases. No account/backend main changes were reverted or edited during this followup. The earlier 14-file ownership list and 43-test count describe the pre-integration implementation; final delta is root's rebased tree. No broader tests repeated here.
