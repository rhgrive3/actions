# INKWAVE build and dedicated QA queue review, 2026-10-23

Source base: `726e338ac256ba9609086ce65e25a68ddd99df85`. Implementation commits: `538cacc` and `d24c7ff`. Relevant current open PRs were checked by the integrating agent: #1853 supplies separate source-identity bookkeeping; #1854 touches projectile/special workflows rather than these dedicated workflows. No existing pinned hashes or runtime acceptance thresholds were relaxed here.

## Implemented items

| Queue slug | Change |
| --- | --- |
| small-tank-browser-dpr-matrix-duplicate-production-builds | Two browser jobs share each browser's setup/build across two independent DPR steps. DPR2 still runs after DPR1 failure; a final outcome gate requires both. All four existing artifact names remain. |
| wiper-rng-observation-pinned-two-commit-shallow-fetch | Fixed source uses depth 1; only its immutable historical comparison SHA is fetched. Source/tree/module hash gates remain. |
| validate-pinned-source-fetch-deduplicate-14-requests | One run builds the 74-URL/88-destination plan, downloads at most six concurrently, verifies every declared hash, then publishes the existing verifier input paths. Latest main already removed seven of the audit's fourteen duplicate GETs; this removes the remaining seven, from 81 to 74. |
| squid-native-qa-production-input-and-executed-test-path-gaps | Adds the eleven directly consumed source/build/test paths to PR admission. |
| zevant-workers-full-game-build-input-path-filter-gaps | Both PR and main-push admission include the complete game/patch inputs, build composition/helpers and startup gate. The full Workers build remains. |
| charger-rise-transient-load-recovery-and-bounded-timeout | Per-context loader has an 8-second deadline, generation/disposal fencing, four-second retry backoff and three-attempt bound. Only explicit prewarm can retry transient network/408/429/5xx/timeouts. Permanent payload/decode/format/404 failures stay closed. |
| upstream-mirror-review-sparse-checkout-avoid-game-assets | Mirror review materializes scripts, patches and package metadata, with immutable checkout ref. |
| relay-security-session-mock-fixture-trigger-gaps | Both events include the real session, mock and shared source fixture. |
| dynamo-handle-duplicate-evidence-artifact-uploads | Keeps the final always-run full evidence artifact; removes the earlier subset upload. No repository consumer of the retired visual-only name was found. External bookmarks cannot be checked locally. |
| historical-material-frame-pr-rebuilds-only-pinned-commits | Historical two-ref pilot becomes manual dispatch; historical refs/assertions/replay stay intact. |
| object-presentation-qa-scoped-pinned-history-fetch | Depth-one candidate fetch plus the four distinct baseline SHAs declared by suite config, with normal failure propagation. |
| character-asset-qa-production-input-pr-trigger-gaps | Adds Character/motion/context/Three inputs and the directly involved build libraries, gameplay installation and quality patch families. |
| explosher-glitter-three-test-pr-path-gaps | Adds exactly the three executed regression paths; disabled long captures remain disabled. |
| native-stage5-three-executed-test-pr-filter-gaps | Adds exactly the three cited executed-test paths. |
| audio-v11-two-executed-test-pr-filter-gaps | Adds exactly the two cited real-loader/unlock tests. |
| squid-heading-swim-entry-qa-miss-shared-actor-fixture-path | Both workflows now watch the exact shared Actor fixture. |
| roller-source-pin-ci-misses-direct-input-triggers | Adds the four direct runtime/composition/fault-fixture inputs; existing source-pin assertions remain unchanged. |

The Charger recording remains the user-selected Splatune 2 phrase. This work changes load availability, with no change to MP3 bytes, playback source offset `.4591`, duration `1.215`, rate 1, gain envelope, routing or events. It does not establish Splatoon 3 audio identity. Same-context transient-failure recovery is tested with network/WebAudio doubles; actual Safari/device recovery remains unmeasured.

## Build-sharing proposals not adopted

`crowd-integration-three-duplicate-candidate-builds` and `weapon-shared-review-crowd-duplicate-immutable-builds` were evaluated and deliberately left unchanged. Both workflows preserve their parallel isolated comparisons and independent source/control gates.

On Node `v22.23.1`, esbuild `0.28.2`, candidate `d24c7ff9a371f88beb24b2e09ae74155d84216f7`, repeated production builds took **8.44 s / 9.24 s**, with peak child RSS **357,440 / 328,572 KiB**. Their **2,111 files / 116,182,510 bytes** were identical by relative path, size and SHA-256, including build identity. Startup-budget and exact-source build verification passed.

A candidate tar was **118,947,840 bytes**, gzip level 1 **102,172,965 bytes**. Local tar/gzip/extract took **0.06 / 2.97 / 0.82 s**; extraction preserved every file hash. Sharing this candidate across the three crowd consumers would move approximately **408,691,860 compressed bytes** over upload plus downloads, and delay all diagnostics behind a producer job.

The actual fixed weapon baseline `01aa5cc61c842a8616ab38ff5fb541b6becf1395` was separately built and verified against that SHA. Baseline-plus-candidate tar was **245,493,760 bytes**, gzip level 1 **214,734,112 bytes**; local compression took **9.86 s**. One upload plus two consumers would move **644,202,336 compressed bytes**. These are local archive measurements and transfer-volume estimates, not observed hosted Actions timings. They do not justify adding a large cross-job artifact and producer barrier to save a few short builds. The attempted sharing implementation was discarded. Future adoption requires matched hosted wall-time, total runner cost and transfer measurements.

## Validation

- Dedicated workflow path/outcome contracts: **13/13**, including one-file positive cases, docs-only negatives, and failing DPR fan-in combinations. Modified YAML parses successfully; no hosted event canary PR was created by this agent.
- Pinned fetch helper: **4/4** Python cases, covering one-fetch fanout, all current 88 paths, network/hash failure before publication, mismatched commits, conflicting hashes, destination collisions and path escape.
- Live pinned fetch: **74 unique URLs**, all **88 destination paths**; existing reference, weapon, completion and catalog verifiers pass.
- Charger and weapon-audio regression tests: **28/28** with Node 22 and `--experimental-vm-modules`. Charger tests include explicit-retry concurrency, permanent failures, exhausted attempts, fetch/body/decode stalls, late completion and disposal.
- Wiper helper tests **140/140**. Actual shallow remote fetch retained the exact source tree and four pinned source-module SHA-256 values.
- Object presentation source/historical overlay contracts **31/31**, using the four freshly fetched immutable baseline objects via `GIT_ALTERNATE_OBJECT_DIRECTORIES`.
- Relay composed compatibility **17/17**. Crowd source/observer contracts **15/15**.
- Real sparse git checkout produced byte-identical mirror-review JSON and exit status for unchanged (0), missing (1) and changed (1) source fixtures while excluding the whole game-assets tree.
- Repeated complete production output, exact-source verification, archive round-trip and startup-budget gate passed as detailed above. No Pages workflow or deployment configuration was changed.

Local logs, inventories, queue bodies and measurements are retained in `/workspace/queue-work/build_qa/`. Hosted Actions timing, total billing, installed-device Safari/iPad behavior and external artifact-name bookmarks remain outside this local validation.

## Batch 231 follow-up

Eleven more tickets are implemented with the same source base and unchanged test assertions:

| Queue slug | Change |
| --- | --- |
| object-presentation-qa-seven-test-path-filter-gaps | Adds the seven exact executed-test paths, including `ranked-clams` which is not matched by `ranked-clam-*`. |
| health-recovery-rain-two-storm-test-path-filter-gaps | Adds both storm regression paths. |
| lobby-slot-browser-fixture-test-path-filter-gap | Adds the executed CSSOM browser fixture regression. |
| terminal-recovery-qa-two-test-path-filter-gaps | Adds the start and native publish/rollback regressions. |
| pause-gpu-dedicated-ci-misses-four-input-paths | Adds the four idle implementation/test/fixture inputs. |
| small-tank-ci-misses-s3-hud-look-test-path | Adds the remaining executed HUD look regression to the browser job's PR filter. |
| squid-native-qa-pinned-shallow-history-fetch | Depth-one candidate plus explicit shallow immutable baseline fetch, object availability check and exact baseline worktree HEAD check. The remote baseline tree is `d845370771f29e5addae17dbaaca4cd5c29b336c`, as pinned by the audit. |
| ink-volume-emitted-qa-build-input-trigger-gaps | Adds the two actual production builder/composition inputs. |
| reopened-six-loading-cache-test-and-input-path-gaps | Adds the exact Cargo offline-precache regression, its loading adapter and source config. |
| headgear-six-way-fetch-depth-zero-unneeded-history | All six isolated render shards use depth one. Active runners only call `git rev-parse HEAD`; the separate historical `assert-scope.mjs` is not imported/invoked. |
| validate-four-executed-test-path-trigger-gaps | Both events cover the four exact executed test paths. They also cover the new pinned-fetch Python helper/test introduced above. |

`headgear-qa-six-shards-rebuild-identical-site` is not adopted. The measured shared candidate remains 102,172,965 compressed bytes: one upload and six downloads would move approximately **715,210,755 bytes**, with a producer barrier before all six otherwise independent render jobs. The local 8–9 second build measurements do not establish a hosted total-cost or wall-time benefit. Six source/build/render/negative-control shards remain intact.

`wiper-pilot-compare-misses-build-artifact-and-source` is not applied because its presumed executing code path does not match the actual trigger branch. The only trigger is a push to `diagnostic/wiper-plane-native-20261021`. Its live immutable head `6301d8e52a1cef062d9ba7e9e608f6321409e505` has a historical paired comparator that **does not read site/source/overlay** under `--compare-dental-only`; it reads capture receipts and images and enforces the fixed `0430673...` source and `8e350111...` product hash. Main's newer helper does read those three inputs but requires `c0938a3...`, which conflicts with the historical workflow's `0430673...` build/diff gates. Adding a large shared artifact and a `0430673...` checkout alone would fix no currently valid executing path. That attempted addition was discarded; no source/hash gate was weakened or comparison fixture substituted. Any future migration of this historical pilot requires a coherent, separately reviewed compiler/source/helper binding.

Validation now includes **24/24** workflow contracts, **30/30** dedicated idle/Cargo/lobby fixture regressions and fresh read-only shallow remote fetches of the Squid baseline and historical Wiper source. The runner import/history audit is retained with the measurements. Hosted event dispatch, render/device acceptance and Git transfer timing remain unmeasured.

Independent integration audio review added `audio-import-index-review.test.mjs`: **4/4** tests pass against both the prior implementation and the integrating agent's actual updated module (SHA-256 `7e25870af02131973a0862dd8514ff8d35a067620fbcec0144d2902b7e9439ad`). Forty seeded partial-import rounds cover concurrent jobs, LRU picks, replacement, eviction, exact event membership and shared-buffer byte accounting; additional cases cover failed-import retention, superseded/cleared loads and raw Brush windup versus independently repaired/shared rolls. No index correctness defect was found. The initially noted closed AudioContext retirement concern is handled by the integrating agent's current `music-idle.mjs` terminal cleanup. The local special-loop setter skip preserves creation options and still updates remote/ownership transitions by source review.

## Batch 305 follow-up: twenty dispositions

| Queue slug | Disposition and evidence |
| --- | --- |
| defense-selection-ci-two-test-path-filter-gaps | Implemented: both executed kit-defense and Big Bubbler contact tests admit PRs. |
| micro-surface-ci-two-test-path-filter-gaps | Implemented: grate-normal and paint-hotpath tests admit PRs. |
| touch-frame-pacing-ci-offline-test-path-filter-gap | Implemented: actual Cargo offline-precache test admits PRs. |
| package-manifest-changes-miss-validate-and-pages-triggers | Implemented: package.json admits Validate PR/push and Pages main push. |
| loading-cache-avoid-second-sha256-per-valid-asset | Implemented: authenticated fresh responses carry their verification result into population/runtime insertion; cached/mutated/missing content still verifies and fails closed. Unverified successful201 never enters cache. |
| loading-cache-coalesce-duplicate-startup-readiness-probes | Implemented: only in-flight same-worker probes share promises; positive initial active-worker readiness avoids one immediate duplicate. Negative/timeout/later activation and explicit refresh recheck; newer workers fence late replies. |
| pages-post-deploy-ranked-503-versioned-module | Historical root cause remains unresolved. Implemented telemetry preserves critical HTTP status, URL, allowlisted edge headers, request timing and expected immutable local artifact/hash; no retries or suppression. The cited old public URL returned404 on two current probes; those observations cannot establish the original503 cause. |
| crab-gyro-ci-three-executed-test-trigger-gaps | Implemented: paint-credit, input-ownership and stick-inversion tests admit PRs. |
| settings-aim-assist-preview-cache-svg-trail-and-skip-off-gaussian | Implemented: preview owns the exact previous SVG trail string, keeping its frame/reset sequence; assist0 skips the unused Gaussian. |
| boss-hud-callout-skip-identical-css-transform-writes | Implemented: each element caches authored and native CSSOM-serialized strings; external style changes still restore. |
| settings-scroll-fade-avoid-per-frame-layout-polling | Already resolved in current composed settings-ui-adapter: scroll/resize/content invalidation, ResizeObserver and disposal. Static240ticks do not reread geometry. Preserved existing fallback when ResizeObserver is absent. |
| hud-superjump-beacon-label-rewrites-on-movement | Implemented: beacon reuses its label node and writes only changed display text. Preserves current composed unavailable/dead labels and dynamic Super Jump destinations. |
| release-halyard-procedural-geometry-caches-after-stage-exit | Implemented on the world agent's pack lifecycle: private geometry generations release only after their final pending/live kit leaves, including glyph records and nested vessel hull/canvas geometry. Unit box/ring templates rebuild lazily on re-entry. |
| avoid-zero-uv-staging-buffers-in-halyard-prop-builders | Implemented for MB/GB intermediate geometry; missing UV means original zero input in atlas/repeat branches. Final GPU UV values remain exact. Directly rendered spinner bakeParts UV stays present. |
| propkit-bound-global-procedural-template-cache | Implemented: LRU CPU retention budget256entries/8MiB at the last kit boundary. Eviction waits while any kit owns pending sources or a live direct blink sphere. Counters/instance leases avoid retaining kits in a module-level strong Set. Active workload size is not artificially capped. |
| paint-atlas-omit-unused-position-buffer | Implemented: only splat geometry loses its unused288000-byte position array. Drying geometry,6000quad capacity, all active attributes, shaders, index and flush boundaries stay intact. |
| legacy-stage-skip-empty-grate-pass-and-hidden-collider-geometry-walk | Implemented: hidden geometry skips filters/vertex work while collision data remains; no visible grate faces means zero second-pass geometry/material/mesh. Cargo visible grates retain the original path. Existing null-safe teardown/quality references remain. Public renderTris remains0 on the omitted empty pass. |
| environment-sail-gull-reuse-orbit-sincos | Already resolved in current composed runtime-frame-scratch-adapter; no duplicate rewrite added. Existing actual animation/frame matrix parity regression passes. |
| coalesce-halyard-stage-theme-far-cube-and-foam-rebakes | Implemented: offline/online legacy world transaction carries its final theme into the published level's rebuild. Warm-shadow rebuild invokes the final setTheme once when needed; a missing shadow map conservatively retains the old preliminary bake and its original light/shadow initialization order; main still publishes environment-map/FX lighting afterward. Standalone theme changes and native-stage rollback remain intact. |
| native-texture-overlap-bounded-fetch-and-decode | Not adopted: retain existing authenticated two-slot fetch/decode ownership and the world agent's profile reuse. Direct-source verification supports optional byte counts; starting another fetch can allocate a third compressed payload before a reliable size bound is known, and a prefetched warm-cache payload can increase peak memory on the iPad crash path. No matched device cold/warm latency and peak-memory evidence establishes a benefit. A hypothetical delayed-I/O benchmark would not supply that evidence. No integrity, cancellation or bitmap lifetime rule was changed. |

Validation: dedicated CI/cache/startup/HTTP diagnostics **60/60**; UI+world/cache/retention+profile-reuse+ownership focused regression **60/60**. The UI tests execute actual composed methods against committed frozen baseline functions at12/30/60/120Hz as relevant. Real Chromium154 CSSOM confirms authored `translate3d(7.0px,317.6px,0)` serializes to `translate3d(7px, 317.6px, 0px)`; settled120-frame runs perform zero additional transform assignments and restore an external `scale(2)` writer. Each Halyard final-owner release drops1040 private cached geometries totaling4170274 logical attribute/index bytes in this fixture; this is logical storage, not observed process RAM. Halyard's full final geometry/index/collision hashes match the independent pre-migration baseline through overlapping owners and three eviction/re-entry cycles. All five legacy layouts retain byte-exact render attributes/index and collision records; zero-UV atlas/repeat/nonzero paths match exactly. Actual Environment rebuild/setTheme methods reach identical final light/uniform/bounds state across six warm-shadow stage/theme transitions with one final marina/shadow/cube generation. Independent review identified that an absent shadow map makes the preliminary cube bake observable; a dedicated regression preserves both original lighting snapshots/call order in that cold/context-restored case, while warm-shadow transitions coalesce.

The standalone `reports/optimization-queue-20261023/build-qa/profile-paint-position.mjs` checks actual composed PaintSystem shaders under Chromium154/ANGLE SwiftShader. Nine cases (0,1,1023,1024,1025,6000,6001,12000quads plus no-dry control) have **zero differing RGBA channels**, identical render/mipmap counts and no WebGL errors; nonempty cases produce123–56935 covered texels. Active storage stays1680000bytes and the unused288000-byte position storage disappears. This is desktop software-WebGL evidence; iPad/Safari peak RAM, frame rate, full-stage pixels, quality/context restoration and physical device acceptance remain unmeasured.

Native cancellation regressions also pass15/15 with the retained scheduler. The full loading-cache glob has four pre-existing failures in worker-template-compaction fixtures that require a writable `/mnt/workspace`; the focused affected worker/startup cases pass. No fixture or production integrity condition was relaxed to bypass that environment restriction.

Final integration validation against the full combined checkout also passes the two heavy world/cache files serially (**11/11**,6.59s). The VM fixture loads the actual relative Float32Staging helper from that checkout. The separate world change losslessly packs faceFlags into signed bytes, so the frozen-baseline comparison checks every decoded flag value and attribute count/itemSize/normalization; every other attribute and index remains byte-exact. Byte comparisons report SHA-256 values rather than expanding whole geometry buffers on failure, preserving strict comparison while bounding diagnostic output.

## Batch 358: six CI items and the minimap gate review

| Queue slug | Implemented change |
| --- | --- |
| validate-source-reference-verifiers-absent-from-path-filters | Both Validate events include the two mandatory directly executed weapon/completion verifier scripts. |
| ranked-gate-build-input-path-filter-gaps | Both Ranked events include the production builder; main push also includes source composition. |
| specials-ci-seven-test-path-filter-gaps | Adds the seven exact ordinarily executed special test paths to the dedicated PR filter. |
| projectile-visual-ci-five-test-path-filter-gaps | Adds the five exact ordinary candidate test paths; historical conditional streamed-music tests remain separate. |
| ci-quality-gate-restrict-source-diff-history-fetch | Checkout depth1 plus at most one explicit immutable depth1 base fetch. Availability checks disable Git's implicit promisor lazy fetch, avoiding an accidental unbounded history request. Missing/invalid/zero endpoints, failed fetch or failed diff require the full quality suite. Endpoint/reason summary and exact-head checkout assertion remain. |
| validate-core-deduplicate-ten-full-source-test-reruns | Discovers the current source glob and removes only three network/seven quality files from its later pass after proving each has one unconditional earlier full run with identical Node flags and no different step environment. Missing/changed/partial/conditional/duplicated proof fails closed. New tests automatically join the remaining full pass. |

At this checkout, network source full-file executions go134→131 (131 unique files), and local quality goes242→235 (234 unique patch files plus the existing extra idle-resource gate). The combined376→366 removes exactly10 repeated full-file executions. The three intentionally partial early network files remain in the later full pass. Canonical runner options remain `node --experimental-vm-modules --test`; global job environment/fixture preparation, early ordering and all production/emitted runs remain. Everything from the restored immutable-site verification through the workflow end is byte-identical to the prior workflow. The old text-only glob assertions now check actual complete discovered coverage with the same negative controls. No cross-job artifact sharing was added.

Validation:85 workflow/history/coverage/integration regressions pass. The actual ten retained early files pass66 tests using the canonical Node flags (28.13s local run; not a hosted saving estimate). Real depth1 clones preserve docs/game/delete/rename classifications, zero-before and failed-fetch fail-open behavior. A fresh read-only partial fetch from the public repository retains exact base/head trees for26a4db4/726e338a, with exactly two shallow endpoints and283→382 objects (two Git packs totaling369KiB). This is observed local object storage, not measured network transfer or Actions wall time. Five modified YAML files parse.

Current open PR changed-file pages were checked for1854/1855/1856/1857/1859, including page2 for1857. Known1854 touches the same special/projectile workflow files with separate draft-special registration/admission paths; those changes are not adopted or overwritten.1856's workflow change is main-weapons, outside this chunk. The other inspected new PRs have no overlapping QA workflow/helper edits.

The independent minimap source-epoch review is documented in `reports/optimization-queue-20261023/build-qa/minimap-reviewed-epoch.md`:40 actual legacy Canvas cases,90 native ink frames,508 mandatory source/emitted state+RGBA frames,13 source/import/observation negative-control regressions and9 native flip-cache cases pass. The two older epochs remain accepted; the one new exact tuple additionally binds the native projection helper to its build manifest. This repairs the stale review gate without changing game code, recomputing all pins or waiving any pixel/provenance check.
