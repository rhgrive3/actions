# Local audio queue reconciliation — 2026-10-26

Base: PR #1878, `dd90aa241aabd5f0b972cc3471386ba3d4da86dc`. Local implementation only.

- implemented-local: 15
- already-in-pr: 25
- not-adopted: 7
- excluded-user: 1

The 48 entries were checked against current source and final adapter composition. Historical #1870 statuses are retained only as comparison data. The Foley invariant was historically labeled complete but was absent and is now implemented; arithmetic music catch-up and runtime manifest compaction were found in #1878 and were not duplicated.

## Verification

- 15 new regression tests pass across spatial voice ownership, source/listener DSP, admission timestamps, four brush variants, stale Safari promises, occlusion endpoint invalidation, batched import/backoff, and actual composed offline/online START flows.
- 22 related existing/new test files pass; VM-based tests require `node --experimental-vm-modules`.
- All baseline PCM hash comparisons pass: 5 grain kinds × 4 sample rates, 87 guided articulations, 126 complete weapon renders and fallback fixtures. The generated worker is current.
- Browser device timing and audible hardware output are unmeasured. No MP3 samples, game balance or retail-equivalence status was changed.

## Per-queue decisions

### avoid-rejected-one-shot-poisoning-emitter-min-gap

**implemented-local** — The composed one-shot method commits emitter time only after priority admission and a successful voice build; rejected/failed requests can retry immediately while successful requests retain their minGap. Per-emitter cleanup remains owned by the existing reliability adapter.

Evidence: `patches/splatoon3/audio-adapter.mjs`.

### avoid-unchanged-audio-bus-gain-automation-on-volume-slider

**already-in-pr** — Actual AudioParam identity and target are cached in a WeakMap; unchanged bus targets are not re-automated.

Evidence: `patches/local-quality/visual-audio-queue-adapter.mjs`.

### avoid-unused-fourth-recorded-brush-swing-decode

**implemented-local** — Automatic one-shot variants cycle across all four resident brush recordings. Existing three-way authored/recorded selection and explicit variants are preserved.

Evidence: `patches/splatoon3/runtime/audio/bank.mjs`.

### batch-cold-start-recorded-combat-cue-imports

**implemented-local** — ensureMany combines missing event clips into one serialized AuthorizedSamplePack import with concurrency 2, preserves per-event inFlight ownership, partial errors and retry backoff, and lets urgent per-event requests promote their batch. Required combat/charge readiness still gates START.

Evidence: `patches/splatoon3/runtime/audio/real-s3-loader.mjs`, `patches/splatoon3/runtime/audio/engine.mjs`.

### bind-default-fetch-for-recorded-charger-rise-safari

**already-in-pr** — The actual default fetcher is bound to globalThis; injected fetchers are unchanged.

Evidence: `patches/splatoon3/runtime/audio/charger-charge-rise.mjs`.

### boss-socket-audio-follow-reuse-vector3-scratch

**already-in-pr** — Final composed boss audio uses a per-loop follow record and a constructor-aware socket Vector3 scratch.

Evidence: `patches/local-quality/visual-audio-queue-adapter.mjs`.

### bypass-static-frequency-exponential-in-s3-articulation

**implemented-local** — Hoists cue drift and skips exp only when drift is exactly 1; baseline Float32 PCM hashes remain identical.

Evidence: `patches/splatoon3/runtime/audio/s3-articulation.mjs`, `patches/splatoon3/runtime/audio/render-worker.js`.

### cache-source-guided-inverse-fft-twiddles

**already-in-pr** — 1024-point transforms cache exact Float64 sin/cos tables independently per direction.

Evidence: `patches/splatoon3/runtime/audio/source-guided-render.mjs`.

### cancel-orphaned-primed-battle-mp3-on-aborted-start

**implemented-local** — Offline and online START claim the specific pending media object by flow identity. Their finally guards cancel failed/abandoned startup; return-to-attract releases an abandoned admitted wait. Stale claims cannot cancel a newer claim or an already selected stream. Legitimate START-to-GO priming remains alive.

Evidence: `patches/splatoon3/audio-adapter.mjs`, `patches/splatoon3/runtime/audio/music-preload-owner.mjs`.

### constant-time-procedural-music-catchup-after-starved-ticks

**already-in-pr** — Contrary to the historical #1870 disposition, #1878 already composes arithmetic past-step skipping with exact boundary correction. The current queue-network-ui test verifies final bar/step/note times and RNG consumption.

Evidence: `patches/reliability/queue-network-ui-adapter.mjs`.

### defer-idle-music-worker-allocation-until-procedural-player

**already-in-pr** — _startTimer exits until a non-streamed, live player exists; HTMLMediaElement-only playback does not allocate the procedural worker.

Evidence: `patches/local-quality/music-idle.mjs`.

### defer-procedural-music-delay-reverb-graph-on-recorded-only-start

**already-in-pr** — Final composition moves the procedural effect graph into _ensureProceduralFx, called only before creating Player.

Evidence: `patches/local-quality/input-lens-queue-adapter.mjs`.

### defer-speculative-reverb-prewarm-until-audio-intent-and-match-sample-rate

**not-adopted** — Retain eager IR preparation. Starting the one-shot worker only at AudioContext creation guarantees no prepared pair for that same synchronous init; the fallback then renders on the first gesture. The proposal requires measured non-regression of first audible latency, but no Safari/device A/B trace establishes that. take(ctx) already rejects wrong-rate PCM and disposes worker/timer ownership. This is a rejected scheduling change, not a claim that speculative waste is fixed.

Evidence: `patches/splatoon3/audio-adapter.mjs`, `inkwave-public/src/audio/audio.js`, `patches/splatoon3/runtime/audio/reverb-prewarm.mjs`, `patches/splatoon3/runtime/audio/reverb-prewarm.mjs`, `patches/splatoon3/audio-adapter.mjs`, `patches/splatoon3/runtime/audio/reverb-worker.mjs`, `patches/splatoon3/runtime/audio/reverb-impulse.mjs`, `inkwave-public/src/main.js`, `inkwave-public/src/main.js`.

### defer-unneeded-procedural-grain-texture-prewarm

**not-adopted** — Retain all five grain warm kinds. The realOnly weapon bank does not make native environmental/movement voices unreachable: composed audio still uses squelch, bubbles, bubbles_bright, rain and sizzle, including swim/climb/enemy-ink loops invoked by main. A menu/practice intent boundary with guaranteed lead time is not currently present; delaying to the first loop moves synchronous texture work into first sound. No safe unused-kind proof or required device onset trace exists.

Evidence: `inkwave-public/src/audio/audio.js`, `patches/splatoon3/audio-adapter.mjs`, `patches/splatoon3/runtime/audio/grain-prewarm.mjs`, `patches/splatoon3/runtime/audio/grain-texture.mjs`, `patches/splatoon3/runtime/audio/grain-worker.mjs`.

### gate-muted-recorded-battle-mp3-preload-and-decoding

**not-adopted** — Retain recorded BGM prime/play at START even when mixer gain is zero. It establishes the trusted-gesture media unlock and continuously advances the existing track timeline. Deferring it would require a measured Safari-compatible later gesture and accurate seek/recovery policy; simply pausing is explicitly disallowed by the proposal. No iPad mute-to-unmute acceptance trace exists, so this conditional resource saving is not adopted.

Evidence: `inkwave-public/`, `inkwave-public/src/audio/audio.js`, `inkwave-public/src/audio/music.js`, `inkwave-public/src/audio/streamedTrack.js`, `inkwave-public/src/audio/music.js`, `inkwave-public/src/audio/streamedTrack.js`, `inkwave-public/assets/audio/`.

### gate-recorded-charger-rise-mp3-prefetch-by-weapon-roster

**not-adopted** — Retain eager Charger-rise preload. The existing conditional hooks only warm local selected Chargers; nearby remote charge onset uses the same recording, and prepareWeapon explicitly declines nonurgent remote work. Removing the init warm before an announced-roster owner exists creates a cold late-remote/instant-swap onset gap. The ticket explicitly blocks increased first-onset misses; no such safe readiness gate was demonstrated.

Evidence: `patches/splatoon3/runtime/audio/engine.mjs`, `patches/splatoon3/runtime/audio/charger-charge-rise.mjs`, `inkwave-public/assets/audio/charger-first-splatune2-reference.mp3`, `patches/splatoon3/runtime/audio/engine.mjs`, `patches/splatoon3/runtime/audio/runtime.mjs`, `patches/splatoon3/audio-adapter.mjs`, `inkwave-public/src/audio/audio.js`.

### gate-roller-loop-hypot-on-active-roll

**implemented-local** — Velocity hypot is evaluated only for grounded rolling with suspended-hold false. Inactive/suspended states preserve stop/fade ownership without reading velocity.

Evidence: `patches/splatoon3/runtime/audio/runtime.mjs`.

### grain-texture-elide-per-sample-modulo-with-wrap-cursor

**not-adopted** — The queue explicitly conditions adoption on measured WebKit improvement and documents a slower 96 kHz candidate. The canonical grain texture still uses modulo; no device evidence supports replacing it. This is not presented as completed optimization.

Evidence: `patches/splatoon3/runtime/audio/grain-texture.mjs`.

### hoist-foley-noise-attack-denominator-from-sample-loop

**implemented-local** — Historical #1870 marked this already-in-pr, but #1878 raw and composed Foley still computed Math.max(1/sr,attack) per sample. Hoisted the unchanged denominator once per noise call and regenerated the bundled worker; baseline PCM bytes match.

Evidence: `patches/splatoon3/runtime/audio/no-bleep-foley.mjs`, `patches/splatoon3/runtime/audio/render-worker.js`.

### hoist-guided-envelope-measured-span

**already-in-pr** — Measured envelope span is computed once in renderGuidedSample and passed to dbEnvelope.

Evidence: `patches/splatoon3/runtime/audio/source-guided-render.mjs`.

### hoist-render-fallback-tanh-normalizer

**already-in-pr** — Math.tanh(drive) is already hoisted; the original division is retained.

Evidence: `patches/splatoon3/runtime/audio/render.mjs`.

### invalidate-weapon-occlusion-cache-on-endpoint-change

**implemented-local** — Cache invalidates immediately when either copied source or listener endpoint changes, in addition to the original 100 ms/clock-rollback invalidation.

Evidence: `patches/splatoon3/runtime/audio/runtime.mjs`.

### listener-motion-refresh-stationary-3d-sfx-distance-dsp

**implemented-local** — Live spatial voices register with their engine. Listener position changes refresh distance LPF and reverb even when the source loop position was deduplicated; disposal immediately releases registry ownership.

Evidence: `patches/splatoon3/runtime/audio/spatial-dsp.mjs`, `patches/splatoon3/audio-adapter.mjs`.

### main-gate-idle-swim-audio-math

**implemented-local** — The composed main loop calculates swim speed/volume/pitch only when swimming or an existing fading swim handle needs its update.

Evidence: `patches/splatoon3/audio-adapter.mjs`.

### memoize-immutable-s3-articulation-cue-plans

**already-in-pr** — Own known actors and bounded events use deeply frozen cue-plan cache entries; unknown actors retain the original builder path.

Evidence: `patches/splatoon3/runtime/audio/s3-articulation.mjs`.

### moving-3d-se-reverb-retains-spawn-distance-boost

**implemented-local** — Base reverb is stored per voice; each source/listener movement recomputes the boost from current distance, including creating a previously absent send when needed.

Evidence: `patches/splatoon3/runtime/audio/spatial-dsp.mjs`.

### network-remote-audio-idle-near-camera-elision

**already-in-pr** — Final netmatch composition skips distance probes only when no continuous sound/onset or previously playing handle needs work.

Evidence: `patches/reliability/queue-network-ui-adapter.mjs`.

### optimize-audio-emitter-key-weakmap-and-positional-validation

**already-in-pr** — Current bank uses one WeakMap.get on actor identity and direct finite xyz validation; AudioEngine validPos also checks scalar components without arrays.

Evidence: `patches/splatoon3/runtime/audio/bank.mjs`, `inkwave-public/src/audio/audio.js`.

### precompute-grain-attack-envelope-float64-with-bitexact-pcm

**already-in-pr** — Float64 attack factors are already generated once per texture and reused with original Float32 accumulation order.

Evidence: `patches/splatoon3/runtime/audio/grain-texture.mjs`.

### precompute-guided-spectral-bin-routing-and-band-power

**already-in-pr** — Per-render bin routing and per-window band power are cached outside the bin loop.

Evidence: `patches/splatoon3/runtime/audio/source-guided-render.mjs`.

### preserve-recorded-sample-lru-touches-across-async-load-commit

**already-in-pr** — Current source bank mirrors live playback touches into transactional staging and preserves shared-buffer accounting.

Evidence: `patches/splatoon3/runtime/audio/authorized-samples.mjs`.

### rearm-evicted-game-owned-ambient-and-movement-loops

**already-in-pr** — Current composition rearms stopped ambience/movement only when audible and free loop capacity exists, preserving deferred mute recovery.

Evidence: `patches/local-quality/drive-visual-audio-adapter.mjs`.

### rearm-jet-arrow-bgm-on-connectivity-or-gesture-recovery

**already-in-pr** — Current composition rearms transient media failure on online/focus/visibility or trusted gesture; unsupported media is excluded and lifecycle removes listeners.

Evidence: `patches/local-quality/drive-visual-audio-adapter.mjs`.

### remove-redundant-noise-buffer-float32-scratch

**already-in-pr** — Final white-noise output aliases its channel and second DC pass writes in place; no final Float32 scratch/copy remains.

Evidence: `patches/splatoon3/audio-adapter.mjs`, `patches/local-quality/drive-visual-audio-adapter.mjs`.

### retire-paused-streamed-bgm-without-procedural-clock

**already-in-pr** — Clock-aware timeout/statechange retirement releases paused streams even when no procedural scheduler exists.

Evidence: `patches/local-quality/music-idle.mjs`.

### reuse-brella-audio-canopy-transition-snapshot

**already-in-pr** — Existing runtime mutates its canopy snapshot after transition comparison; no steady-frame object replacement.

Evidence: `patches/splatoon3/runtime/audio/runtime.mjs`.

### reuse-verified-niceball-source-decode-across-fire-and-spin

**not-adopted** — No production emitter for source:Sp_NiceBall_HoldFull_00/fire was found: the name occurs only in the source registry, while Booyah spin is the established route. The ticket explicitly says to close/deprioritize if the second route is not used. Both manifest rows lack raw SHA-256, Git blob identity is not that hash, and fire versus spin has different loop-repair semantics. Adding retained unlooped PCM for an unproven dual-route benefit is not adopted.

Evidence: `patches/splatoon3/runtime/audio/s3-real/Sp_NiceBall_HoldFull_00.mp3`.

### reuse-weapon-occlusion-weakmap-cache-record

**implemented-local** — Each remote actor owns one mutable obstruction cache record; time and copied endpoint scalars are refreshed in place.

Evidence: `patches/splatoon3/runtime/audio/runtime.mjs`.

### revoke-music-worker-blob-url-on-constructor-failure

**already-in-pr** — idle-adapter scopes worker URL ownership and revokes on constructor/postMessage failure as well as normal worker startup.

Evidence: `patches/local-quality/idle-adapter.mjs`.

### settings-audio-muted-preview-skip-18-bar-per-frame-trigonometry

**already-in-pr** — Muted settled preview writes the floor once and returns before 18-bar trigonometry; band spectra are cached.

Evidence: `patches/local-quality/added-ui-motion-adapter.mjs`.

### skip-fallback-nonloop-grain-write-modulo

**implemented-local** — Non-loop rendering already breaks at the buffer end and now writes its direct index. Loops retain modulo and PCM hashes stay identical.

Evidence: `patches/splatoon3/runtime/audio/render.mjs`, `patches/splatoon3/runtime/audio/render-worker.js`.

### skip-grain-frequency-ramp-pow-after-saturation

**already-in-pr** — Each grain caches its ratio and bypasses Math.pow only at exponent exactly 1.

Evidence: `patches/splatoon3/runtime/audio/grain-texture.mjs`.

### skip-procedural-battle-song-compilation-for-recorded-stream

**already-in-pr** — Final recorded track branch uses lightweight SONGS metadata instead of getSong and preserves recorded-only failure policy.

Evidence: `patches/local-quality/input-lens-queue-adapter.mjs`.

### skip-redundant-static-loop-panner-position-automation

**implemented-local** — Copied xyz and Panner identity gate modern/legacy position automation; listener movement separately refreshes application DSP.

Evidence: `patches/splatoon3/runtime/audio/spatial-dsp.mjs`.

### slim-recorded-mp3-runtime-manifest-preserve-provenance-sidecar

**already-in-pr** — Current build already emits compact playback-only manifest with source-manifest SHA256 while retaining full source provenance. Duplicate proposed implementation was removed.

Evidence: `scripts/lib/inkwave-audio-manifest.mjs`, `scripts/build-inkwave.mjs`.

### stage-long-crab-tank-idle-mp3-predecode

**not-adopted** — Retain current Crab idle preload. Local main-shot work is already admitted ahead of kit events and supports priority promotion. Delaying the two long spin variants to gauge readiness reduces the readiness window for instant/full-gauge and late remote activation; the ticket explicitly rejects any increased missing first activation. No device/bandwidth readiness measurement supports a safe delay, and merely retaining the existing queue order is not a new optimization.

Evidence: `patches/splatoon3/runtime/audio/runtime.mjs`, `patches/splatoon3/runtime/audio/real-s3-loader.mjs`, `patches/splatoon3/runtime/audio/real-s3-installed.json`, `patches/splatoon3/runtime/audio/authorized-samples.mjs`, `patches/splatoon3/runtime/audio/kit-runtime.mjs`.

### suspend-hidden-audio-even-with-stale-safari-resume-promise

**implemented-local** — Context/operation tokens allow hidden suspend to supersede unresolved resume. Stale fulfillment cannot clear a newer token and reconciles actual lifecycle; statechange and disposal listeners have explicit ownership.

Evidence: `patches/local-quality/platform-audio.mjs`.

### verify-rights-and-separate-public-distribution-of-recorded-audio

**excluded-user** — Excluded by existing explicit user instruction; no work performed.

Evidence: `prior session instruction retained by parent`.
