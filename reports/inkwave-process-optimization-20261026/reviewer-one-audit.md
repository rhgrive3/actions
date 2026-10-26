# Reviewer 1 independent optimization audit

Repository: /workspace/inkwave, main baseline 48511150. Read AGENTS.md. Read-only repository audit; no tests/builds run by this reviewer. All proposed changes must preserve gameplay timing, collision/paint and rendered/audio output. Splatoon 3 parity is unchanged by the proposed build/cache queue work; no new gameplay equivalence claim is made.

## Coverage and process inventory

This is a bounded source and composed-code audit, not a claim that every one of the 753 Splatoon runtime modules has individually been exhaustively inspected or that the program is globally optimal.

- Build/ownership: package.json, vite.config.mjs, scripts/build-inkwave.mjs, scripts/inkwave-source-composition.mjs, scripts/lib/inkwave-build-only-modules.mjs, scripts/lib/inkwave-module-imports.mjs. Confirmed immutable upstream plus fail-closed adapter composition, per-file transform concurrency, native-stage overlay, weapon registry bundling, Three tree shaking, dependency collection, loading-worker/asset revision flow, account Vite boundary.
- Frame orchestration: upstream src/main.js and actual composed main _frame/_padMenus/_updateHud; patches/splatoon3/runtime/clock.mjs; local-quality static-menu-adapter.mjs, idle-adapter.mjs, runtime-frame-scratch-adapter.mjs, frame-order-adapter.mjs (connection inspection), hud-snapshots-adapter.mjs, camera-fov-cache-adapter.mjs, drive-core-queue-adapter.mjs, drive-visual-audio-adapter.mjs, platform-game.mjs (deadline ownership sections).
- Inventory: display loop/cap -> fixed 60 Hz clock -> input/menu/network polling -> match/controller/actors/projectiles/delayed paint -> presentation camera/FX/environment/decor/props -> paint atlas/uniforms/wakes -> showcase/audio -> shadows/composer -> HUD/menus. Static decorative menu gate, native-stage transition gate, covered arena, hidden document, offline pause snapshot and results suppression already remove whole classes of work.
- Startup/cache ownership-gap audit: loading-cache/sw.js (294 lines), loading-cache/recovery.js (82 lines), loading-cache/runtime/startup.mjs (203 lines), loading-cache/adapter.mjs (boot topology/compilation and budget handling sections). Install transaction, integrity validation/retry, current/retained revision fetches, navigation recovery, cache readiness, worker status probes, registration lifecycle and profiling observer lifecycle inspected.
- Reliability ownership-gap audit: reliability/session-admission.mjs (73 lines), lobby-guards.mjs (99 lines), menu-takeover.mjs (37 lines), map-look.mjs (69 lines, build-only). Also inspected source/runtime connection searches for menu/HUD timers, transport polling and visibility handling.
- Account outside frame loop: client src/entry.js, store.js, panel.js countdown lifecycle, package/build composition. Audio listener adapter and runtime/audio-listener.mjs; effectiveQuality implementation in src/config.js.

## Actionable findings submitted to root

### B1: discarded Three core is fully composed before production skip

scripts/build-inkwave.mjs:142 invokes composeSource before :154-156 identifies replacedThree and skips normal standalone output. The 1,458,113-byte vendor/three/build/three.core.js input therefore traverses all source adapters although its output is deliberately absent and the bundle's onLoad composes it again at :357.

Safe change: recognize only the replaced production core file before composeSource, with the same !unminified, !INKWAVE_NO_THREE_SHAKE and module-exists guards. Keep three.module.js dependency capture unless separately proven. The graph visit rejects absent output before composing (:410-412), so no browser/core dependency behavior needs change. Cost reduction is one full 1.46MB adapter traversal per production build; runtime has no change. Pitfall: diagnostics/no-shake outputs must keep the original path and module dependency discovery must not silently change.

### L1: optional install-only precache queue cursor

patches/loading-cache/sw.js:141-145 allocates a copied BUILD.precache and repeatedly pending.shift() in a two-worker install queue. A monotonically increasing private index over stable BUILD.precache removes the copied array and repeated front removal while preserving synchronous claim order before each awaited populate. The manifest is decoded once at worker evaluation and never mutated afterward. Cost reduction occurs once per revision installation; network/hash work dominates, so this is lower priority than per-frame findings. Keep exactly two workers, fail flag and Promise.allSettled draining; do not change transaction completion, error precedence or asset ordering. Do not cache readiness durably.

## No-change decisions with evidence

- Main source appears to update hidden world and allocate HUD structures, but actual composition already gates static menus/covered/paused/hidden/results work and reuses HUD snapshots, players/markers, projection scratch, trig values. Proposing another generic idle/frame throttle would risk cadence/quality and duplicate existing work.
- effectiveQuality already returns desktop frozen base objects and caches mobile variants by name/platform. No justification for another per-frame quality object cache.
- Audio listener already caches individual position/orientation components, invalidates on context/listener replacement and forces synchronization on resume. Skipping caller direction extraction based only on camera identity would miss transforms; no change.
- Loading SW current warm asset hits return directly: no fetch/digest/revalidation. Cold misses dedupe flights and clone results for independent consumers. Integrity checks at install/recovery and readiness key scans protect exact revision identity and partial cache eviction. Durable complete()/readiness memoization would violate existing recovery behavior.
- Navigation state repair returns on safe activeRevision before complete scan. Readiness probes are event driven; startup coalesces in-flight probes while allowing fresh scans after activation/reconnect.
- Startup profiling is opt-in; mutation observers narrow to data-screen after mount; registration guards cover pending and completed registration. Timer fallback prevents hidden-tab boot hang. No continuous global polling remains here.
- Reliability welcome/lobby admission is bounded to <=8 members and small bounded styles, and runs on received events. Set uniqueness and recursive validation are purposeful. Lobby fanout already coalesces guest updates over 100ms while preserving controls/readiness; further throttling would change behavior.
- menu-takeover blocked-state rearm has action ownership and lifecycle effects; removal based only on empty current input could permit held actions to resume. map-look keeps filters current under map ownership; freezing it would replay stale turn state.
- Account chip updates are event driven, subscription cleanup is swept on menu swaps, panel code is lazy and prewarmed once. Session refresh is in-flight deduplicated, visibility refresh bounded by 5 minutes, countdown timers clear at banner teardown. No demonstrated high-frequency duplicate process warrants extra cache state.
- Fixed gameplay tick iteration, actor interval capture and delayed paint consumption cannot be dropped/coarsened without behavior change. Final-tick presentation deferral exists. A frame-local tick closure is present, but replacing its captured m/covered/menu variables with mutable shared context introduces lifecycle/reentrancy complexity for small allocation savings; no concrete safe proposal at this stage.

## Final independent reviews

Pending: root will provide simulation, rendering and services changes. Each scope will receive a separate review of exact paths and relevant composed runtime behavior. No tests will be run without root coordination.

### Continued broad scan before final diffs

Additional paths inspected: account/client/src/game.js and api.js; inkwave-public/src/audio/streamedTrack.js; patches/local-quality/platform-audio.mjs and music-idle.mjs; patches/splatoon3/runtime/audio/runtime.mjs (weapon event and runner wrapper paths), bank.mjs, real-s3-loader.mjs, reverb-prewarm.mjs; scripts/tests/inkwave-source-compaction.test.mjs. These are meaningful runtime paths, not evidence that every audio recipe/sample was independently audited.

- StreamedTrack delegates decode/playback to HTMLMediaElement and retires faded tracks with bounded deadlines. Platform music avoids rebuilding healthy streams/procedural players after main-thread stalls and preserves primed battle media. Music-idle suppresses procedural timer/worker when only streams remain and retires muted graphs. No additional scheduler removal justified.
- Weapon audio explicitly suppresses duplicate legacy shots; deferred one-shot occlusion occurs only after playable source admission; actor obstruction cache is WeakMap-backed; loop options remain eager for deferred decoding. Sample bank has bounded LRU/queue and in-flight job dedupe. RealS3 loader indexes manifest by id/event, loads only missing resident clips and serializes transactional loads; replacing residency checks with stale loaded flags would regress LRU recovery. Reverb prewarm is one-shot, validates actual sample rate and terminates/cleans up with TTL/generation guards.
- Compactor emit optimization review: AST runtime Literal spans are nonoverlapping; import specifiers/attributes and directives are excluded. Insertion is after leading imports/directives, so all edited literal offsets are after insertion and retaining its original offset is correct. Ascending copied chunks produce identical source strings to descending replacement, including comments, escape spelling and identifier spacing. Direct-vs-dispatch selection still uses identical parsed output/byte measurement; function hoisting and cyclic availability remain unchanged.

### R1: visible locker frame scratch (submitted to rendering)

patches/local-quality/locker-stage.mjs:43-44 creates Vector2 and Color for renderer.getSize/getClearColor on each visible locker frame. Reuse stage/game-owned scratch, still overwrite it each call and preserve clear/target restoration/error precedence. This removes two allocations per display frame without lowering cadence or image quality. Shared module scratch would need reentrancy consideration; a scoped owner and synchronous renderer transaction are preferable.

## Final independent all-three-scope review (2026-10-26)

Reviewed the implementation-frozen working diff and all added/changed tests below. Regenerated the actual adaptBuildSource output in memory for every modified game/native/locker runtime path and the diorama/netmatch owners; no tests/builds executed by this reviewer. Source composition completed for all 14 selected owners, including 351-line composed diorama and 2,988-line composed netmatch. Test results remain root/fix-agent evidence, not a claim of independent execution.

### Simulation signoff: no blockers; no further evidence-backed low-downside candidate in reviewed paths

Exact production paths: inkwave-public/src/boss/bossBrain.js, bossHazards.js, bossNav.js; patches/native-stages/runtime/triangle-world.mjs, native-projectile-sweep.mjs; patches/reliability/queue-network-ui-adapter.mjs and actual composed src/net/netmatch.js. Reviewed scripts/ci/inkwave-test-suites.json registration.

- Boss actor counts preserve admission and strict thresholds and use identical Math.hypot once per admitted actor; crab population remains a count of nondead entries with identical move/RNG weighting.
- moveEnd retains tele + act + rec associativity and rereads each call, so mutated move records and exact hazard endpoints retain existing behavior; full moveTimes remains public.
- Boss A* uses Float64 heuristic storage, computes each node once per search stamp, retains exact goal/grid coordinates and tie comparison. Cardinal/diagonal Math.hypot products preserve original left-associative arithmetic. Reusable heap's active n replaces logical array length correctly, retaining the original sift/tie order and clearing active work before each new search, including early-found/disconnected cases. Capacity remains numeric-only, owned by the current graph.
- Native sweep out is optional, untouched on misses, distinct from inputs and moving-OBB scratch. Existing callers still receive independently owned vectors. Nearest contact, exact tie preference, UV calculation, bounds/grate checks and radius equations are unchanged. Wrapper sourceHit is per-level WeakMap-owned and consumed synchronously; no new global cache lifetime.
- Dualies packet packing uses helpers that only read current actor runner state. Startup/roll boundaries, r2/r3 rounding, recovery-life/teleport receipts and object field insertion order remain unchanged; no cross-tick state retained.

Tests read: scripts/tests/inkwave-boss-processing.test.mjs and frozen fixture; patches/native-stages/tests/native-sweep-output.test.mjs and source-sweep-queue-parity.test.mjs changes; patches/reliability/tests/queue-network-ui.test.mjs changes. These cover exact expansion/read/search-array parity across repeated/disconnected paths, work counts, RNG/timing boundaries, public-vs-scratch ownership, growing-radius and source-vs-moving ties, stale misses, packet fields and reduced helper lookups. Source-only test registration updated for boss test; native additional test follows existing directory discovery.

Residual risk/limit: A* now retains a Float64Array (8 bytes per grid cell) and numeric heap capacity until the graph is retired; this is an explicit bounded memory-for-repeated-work tradeoff. This source review does not establish browser frame-rate improvements or retail Splatoon measurements. The existing search-stamp overflow boundary is unchanged.

### Rendering signoff: no blockers; no further evidence-backed low-downside candidate in reviewed paths

Exact production paths: inkwave-public/src/world/wave-data.js, props-core.js; inkwave-public/src/game/lobbySet-geo.js; patches/local-quality/locker-stage.mjs, queue-ui-20261025-adapter.mjs and actual composed src/ui/diorama.js; patches/practice-range/runtime/hud.mjs; patches/native-stages/runtime/native-load.mjs, native-render.mjs.

- Wave preparation keeps random draws, phase expressions, multiplication associativity and typed-array writes identical while hoisting amplitude-gradient products and row v division.
- Prop builder reuses only the immediately consumed local compose matrix; returned per-part/base/stack matrices retain independent ownership. Multiplication/Euler order unchanged; synchronous native matrix calls do not expose the scratch.
- Lobby attribute/UV scalar writes target the same Float32Array offsets in the same branch/order and preserve signed zeros, dominant-axis ties and callback order. Default small vectors are hoisted only within one synchronous geometry call.
- Locker scratch is stage-owned, overwritten each frame, and busy-guarded for nested renders. Success still composites on default canvas; failure restores caller target/cube-face/mip and original clear state while preserving primary error. Skip paths do not allocate or touch renderer.
- Diorama reads prior hovered target before reusing its array, clears inactive target references, preserves pin order/self location and shortens length. Display/innerHTML checks compare actual DOM, so external replacement is repaired; static numeric keycap output is canonical kbd markup.
- Range HUD compares actual text and stores both requested and CSSOM-canonical HP transforms, preserving external style/node replacement repair and target reset behavior.
- Native KTX loader pending count now follows actual parse completion, not early AbortSignal promise settlement. Retired loader survives outstanding worker callbacks, late textures dispose and replacement renderers remain independent. Synchronous event-listener failure enters completion cleanup.
- Native material channels are stored with cached material and refreshed only on committed updateTextures. onBeforeCompile and program key read the same channels/maps; needsUpdate forces recompilation and Balanced/High cycles preserve ownership and shader output.

Tests read: local-quality/tests/lobby-set-attributes.test.mjs and frozen fixture; locker-stage-state.test.mjs, queue-ui-20261025.test.mjs, ui-composed-jump-lifetime.test.mjs changes; practice-range/tests/target-feedback.test.mjs changes; native-stages/tests/native-prebuilt.test.mjs and native-texture-profile-reuse.test.mjs changes. They exercise byte/metadata equality, UV sign/ties, nesting/transaction cleanup, DOM write counts/external repair, pin lifecycle, delayed transcode callbacks and direct-High vs upgraded-High shader/cache-key parity. Existing frozen wave and prop differential evidence is fix-agent/root owned.

Residual risk/limit: no independent browser screenshot/GPU trace was run here. Geometry/wave equality is established by implementation arithmetic/ownership inspection plus root/fix-agent differential evidence; no quality or cadence reduction introduced. A truly never-finishing transcode callback retains its pending loader by design; disposing it earlier would drop callbacks.

### Services/build signoff: no blockers; no further evidence-backed low-downside candidate in reviewed paths

Exact production paths: scripts/build-inkwave.mjs, scripts/lib/inkwave-source-compaction.mjs; patches/loading-cache/sw.js; account/client/src/entry.js. Build/source composition, startup/recovery, account store/API/bridge and deployed audio runtime coverage is detailed above.

- Early Three core skip has the complete normal-production guard and leaves module.js dependency capture intact; diagnostics, no-shake and absent-module fallback paths still compose core. Actual bundle onLoad retains UUID adapter/RNG isolation.
- Compactor ascending chunk emission is text-equivalent for disjoint literal AST ranges; insertion point remains valid because preceding imports/directives are excluded from edits. Both direct/dispatcher alternatives retain parse validation, byte comparison and cyclic function hoisting.
- SW cursor retains copied manifest snapshot, exactly two workers, synchronous claim order, failure flag and Promise.allSettled draining. It removes repeated shift operations without changing integrity/readiness/transaction or cache semantics. Earlier optional report suggestion to remove the snapshot copy was deliberately not implemented; the frozen-list semantics are retained.
- Account open shares in-flight dialog mount, first request's view and shared lazy module loading. Epoch cancel prevents pending imports from mounting after close, stale completion cannot clear newer busy state, and identity-guarded delayed onClose cannot clear a newer modal. mountPanel invokes onClose only from its later close path, so the callback's captured panel binding is initialized before use. A closed active panel can be reopened with its own owner.

Tests read: scripts/tests/inkwave-queue-build-efficiency.test.mjs added guard-path test; existing source-compaction semantic/cyclic tests; loading-cache/tests/worker.test.mjs added queue/concurrency/commit-order test; account/tests/client-dialog-ownership.test.mjs. Tests demonstrate actual extracted build guards, ordering/peak two workers and concurrent/canceled/reopened dialog ownership. No extra tests run here.

Residual risk/limit: services changes have no expected per-frame FPS effect. Account cancellation is intentional lifecycle behavior on explicit close; external callers see one owner promise while opening. Production build and browser delivery validation remain root coordinated. Server/worker-account backend and hundreds of recipe/asset modules were not individually reread; they are unchanged by these final fixes.

Overall reviewer 1 conclusion: all three scopes independently reviewed, no blocking regression found and no remaining evidence-backed low-downside optimization identified in the reviewed processing paths. This is an evidence-bounded signoff, not a global optimality claim.

Final freeze follow-up: reread source-sweep-queue-parity.test.mjs numeric input-array assertions after the cross-realm harness correction. Array.from normalization is assertion-only and retains the expected numeric values. Reaffirmed all three scope signoffs on current frozen sources/tests; no new blocker or justified optimization found. Root owns the focused native rerun and final production validation.

## Integration signoff after main advanced (2026-10-26)

Reviewed rebased commit 7b5da66 atop d88aa68; actual PR comparison is `git diff d88aa68 HEAD`. Read-only review; no tests/builds executed. Earlier baseline-specific statements describe the first audit epoch, not a claim that account/backend files remain unchanged across the inherited d88 integration.

Integration sources and tests inspected: old 48511150 → d88aa68 changes to patches/local-quality/platform-game.mjs, inkwave-public/src/core/renderer.js, account/client/src/entry.js, patches/loading-cache/sw.js; relevant account/tests/client-lifecycle.test.mjs and client-session-gate.test.mjs; local-quality/tests/debug-profiler-settings.test.mjs and renderer-display-lifecycle.test.mjs; loading-cache/tests/worker.test.mjs and worker-http-followup.test.mjs. Also reread range-frame-pacing-adapter.mjs and composer-target-adapter.mjs to verify actual frame/composer ownership. Regenerated current composed src/main.js (1841 lines), src/core/renderer.js (688 lines), platform-game.mjs (355 lines), locker-stage.mjs (80 lines).

- Platform RAF remains authoritative. Profiler enable/disable/import completion is owned by the current runtime epoch and explicit OFF→ON transition; OFF frames do not allocate URLSearchParams or retry imports. Source legacy loop profiler instrumentation stays on its unused loop path. Our changes do not replace/skip the platform frame driver, debug toggle, frame cap/probe callbacks or measured frame boundary; locker updates/render remain inside game._frame and are therefore still measured. No new duplicate profiler loop introduced.
- Renderer inherited `_dpr` size cache, floor-based FXAA dimensions, and preserved external ScreenFX pass ownership remain intact. Composed renderer retains both preservedPass signatures, DPR equality guard and floor arithmetic; lazy composer size/pixel-ratio invalidation remains connected. Our locker scratch only calls WebGL renderer size/clear/target methods and does not share DPR/composer cache state. Wave/prop/lobby scratch changes do not dispose passes or resize render targets.
- Account entry in d88 is byte-identical to the already reviewed dialog single-flight/epoch fix; actual PR now has no account entry delta. Main's client-lifecycle test contains the exact three dialog-owner cases; removal of the isolated duplicate account test loses no unique coverage. Inherited session-mutation/refresh cancellation gates are not replaced by our optimization commit.
- Service worker retains d88's manifest-bounded streamed verifier, tee-reader cancellation/release and timedFetch transport cancellation/abandoned-original-branch cleanup. Our actual SW delta is only the install-queue cursor; verification deadlines, exact-revision reload retry, cold-miss flight dedupe, warm offline cache-first and transactional COMPLETE-last behavior remain connected unchanged. Cursor still claims before await, preserves two-worker draining/failure behavior and snapshots precache with a copy.
- Resolved worker.test integration contains both main's three streamed-response cases (oversize/valid/503-body readability) and our 25-path ordered, exactly-once, peak-two installation test. Conflict markers are absent. Existing real-HTTP followup tests remain intact; this reviewer read them but did not execute them.

Integration conclusion: reviewer 1 reaffirms simulation/rendering/services prior scope signoffs for the actual d88aa68 → 7b5da66 PR delta. No integration blocker or remaining evidence-backed low-downside optimization identified in these latest owners. Root coordinates final production build and execution evidence. This does not broaden the source audit into a claim of exhaustive backend, recipe corpus, retail or browser equivalence testing.

## PR1894 CI followup review: Rainmaker oracle clock and composed CPU setup

Read-only independent review of both followup scopes on 2026-10-26. No tests/builds executed and no repository files edited by reviewer 1. Reviewed the ranked failure log, actual runtime host input/owner binding and Rainmaker update paths, final checker/helper/native fixture test, both workflow changes, unchanged existing APT helper and extended workflow-inputs contract. Initial runtime optimization code is unchanged by these followups.

### Ranked browser checker: no blockers

Reviewed scripts/check-inkwave-ranked-browser.mjs, scripts/lib/ranked-rainmaker-charge.mjs, patches/splatoon3/tests/ranked-charge-browser-clock.test.mjs, .github/workflows/validate-inkwave-ranked.yml. Runtime context read: ranked/install.mjs buildFrame and advanceRanked, ranked/network.mjs serialized tick/admission, ranked/pose-admission.mjs bindRankedInput/rankedInputFor, ranked/rainmaker.mjs _updateShot, netmatch 20Hz cadence and fixed clock.

Failure mechanism is consistent with exact source: remote held command expires at host G.time age >= .75, one startup frame leaves 44/60 charge = .733333333333334, and the old checker later observed full charge while retaining that earlier partial shot as events[0]. Follower advanceRanked never advances the authoritative rule. The correct fix controls oracle clocks, preserving the production expiry/authority behavior.

Final helper freezes both native simulation clocks before held input, drives real Player→Actor input through a later ordinary 20Hz packet, waits for host-side rankedInputFor-branded receipt with current actor/match/session/owner/life/matchId, monotonic sequence and exact fire state, then revalidates that accepted sequence/fire/age inside the host step before advancing the same <=5-frame batch. Wall-clock relay delivery does not age frozen host G.time. Release follows the same native false-input receipt path. Earlier shot/dirty starting state is fatal; events, charge/rule state, TTL and packet content are never reset by the helper. Restoration uses captured mouse identity, skipRender/frozen state, and all-settled partial installation/cleanup with original failure precedence.

Caller retains strict exactly-one-shot, full charge 1, direct damage60/blast180, authoritative-vs-visual replica equivalence, native wall60+360 and guest damage packet60+180/cause assertions. Four-mode default remains unchanged; optional RANKED_MODE only permits an explicit focused subset. Workflow triggers now include the new imported helper. Test source covers the actual composed Input/Player/Actor/fixed-clock/20Hz JSON/native admission path, current receipt/epoch/TTL rejection, cleanup failure/partial installation, untouched earlier partial shots and exact negative reproduction. Component evidence is distinguished from root's planned one actual online browser subset.

Reviewed file hashes: checker 7c18911ed58a771c2f835b19b421415937f36dbe585bf43119b52aab7045aa1f; helper eb05d97791ad240ba79c05f56b9a4b08137c3451476d5c1ae77e48fc7266141e; native test 3c131b83be99d50b4b56841e80407bd572745613f98836e678433742aa5cc6ff.

### Composed CPU workflow setup/contract: no blockers

Reviewed .github/workflows/inkwave-composed-cpu.yml, scripts/tests/inkwave-workflow-inputs.test.mjs and unchanged scripts/prepare-inkwave-ci-apt.py. Workflow adds the existing exact Azure archive URL replacement helper before the unchanged Playwright --with-deps Chromium install, with its path in relevant triggers. The helper only rewrites matching Ubuntu archive URLs to the existing signed HTTPS archive and does not disable package signature verification.

Exact PR-head checkout/source-SHA verification, source composition and motion regressions, production build/startup budget, emitted motion parity, component benchmark, actual browser CPU recorder with --source-sha and 30 frames, stages/quality/evidence settings, required unconditional gates, artifact handling and20-minute cap all remain. Extended contract checks direct input trigger coverage and rejects lost setup, reversed install order, weakened timeout/frame count, removed startup gate or conditional recorder. No performance/gameplay threshold was relaxed.

Reviewed file hashes: composed CPU workflow e6b06df80817192f869002bca8c6c4c5f33797cfb1fc456019c2779ca55a8fa1; workflow-inputs test 68f12122a7d364422bddb2b836f11fd92254885ed79f4aa487bb982735c00a0c.

Reviewer1 all-followup conclusion: no blocker in either final followup scope, no remaining evidence-backed low-downside candidate in these reviewed paths. Root owns execution and the single online Rainmaker browser subset; no new browser/retail performance claim is made by this source review.

### Additional frozen-HUD fixture repair signoff

Reviewed the final scripts/tests/inkwave-frozen-hud-capture.test.mjs diff (SHA256 c2743da30d017032bb30deebf052e7daac5b7f9e6c922ad6b63f73e192ce1155). Only fixture construction changes: window DPR, desktop mobile flags, quality ratio/dynamic scale, mutable native renderer pixel ratio getter/setter and drawing-buffer sizing, plus composer.setPixelRatio stub. These satisfy current inherited Renderer.resize dependencies and preserve the requested ratio in fractional-DPR viewport cases. Exact native resize/render extraction, real crop adapter and all17 original assertions remain unchanged. Frozen/no-frame simulation sentinel, viewport/crop/DPR/negative/cleanup evidence remains intact. No runtime edit or lowered assertion identified. No blocker; prior two followup signoffs unchanged. Reviewer1 ran no tests/builds and made no repository edits; root/fix agent own focused17-pass and actual delayed online Rainmaker browser execution evidence.
