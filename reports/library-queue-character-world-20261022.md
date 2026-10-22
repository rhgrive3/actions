# Character/world Library queue batch (2026-10-22)

Base: `c0938a3f84768474df91713f7b372f9d7f8fe96a`. This batch removes redundant work and closes resource/error paths. It does not assert Nintendo runtime parity beyond the pre-existing 11.3.0 reference checks, or measured mobile FPS/RAM benefits.

The canonical `SourceBank` retains its source ownership and caches each clip's Float32 base view. Remaining pinned inputs use the existing protected build adapter. No upstream hash guard is relaxed.

Implemented scopes:

- Exact-zero material pulses, result clip resolution, mantle tables, tube offset and suction-cup scratch, shared hair metadata, per-controller contact/cadence arguments.
- Structural squid refresh stays at geometry changes; hidden remote eyes skip CPU deformation and refresh before being shown.
- Palm ring evaluation, distant spawn barrier rejection, indexed Decor merging, minimap table reuse.
- Composer-owned GTAO dimensions, consumer-local texlib shader noise, opt-in `texlib-sync-timing` readback (ordinary `stats.ms` measures CPU submission).
- Exception-safe cloud bake state, sun-shadow/instance-buffer teardown, synchronous character/showcase warmup cleanup, owned showcase listeners/pools/materials, and news preload retirement.
- Frame-driver callbacks scoped to their cancellation generation, direct presentation RNG invocation, reentrant-safe temporary Set pooling for private silhouettes, settled loadout stat easing, invariant FX cone cosines, and rounded vertical-capsule axis reuse.

Validation includes actual tube/cup position/normal/index/parameter byte comparisons, finite/nonfinite/signed-zero pulse outputs, failed cloud-strip restoration, retained clip views with live source updates and independent output poses, effective-DPR GTAO sizes, cancelled old frame callbacks, indexed Decor triangle attribute streams, 600 capsule contact/body-fit comparisons and synchronous warm-mesh cleanup. Existing motion/eye, minimap, studio, private-tracking, RNG, source-ownership and texlib regressions are run separately.

The source compatibility quick gate passes. Browser shader compilation, full-game GPU images, iPad Safari measurements and Nintendo hardware comparisons are not represented by the Node checks. The broader queue's unimplemented structural candidates remain separately recorded by the queue audit; they are not implicitly closed by this batch.

Follow-up: active Flow source swimmer particles

The actual source-loaded Actor CPU scene reproduces the failing squid-active phase: native swim intentionally moves the squid pivot below the floor, and every live glint billboard is then wholly below that floor. Grounded swim now anchors Flow particles to the authoritative root surface and grows their vertical phase above it. Air/climb/kid anchors, phase, alpha, RNG and draw gates are unchanged. A fully composed old/new test compares gameplay on483ticks across30/60/120Hz, unchanged live alpha values, above-surface billboards and unchanged override/beauty drawRange gates. Six old-scene observations reproduce fully buried particles. This is CPU scene evidence; browser GPU beauty-pixel acceptance remains required and its thresholds are unchanged.

Second queue batch: exact CPU calculations and initialization ownership

- Far weapon corner attribute comparisons hoist material/color handles and use ordered direct loops. Thirty-six actual Three.js decimator output comparisons preserve every attribute/index byte and bounding sphere, including indexed/nonindexed, NaN, signed zero and normalized attributes.
- Platform deadline catch-up skips constant representable-increment runs inside each exponent bin. This preserves the exact Float64 result of legacy repeated additions, including lead-boundary selection; ordinary frames remain unchanged. Tests cover30/60/120Hz, jitter and gaps through600seconds;400additional seeded arbitrary-offset stalls were bit exact. Work follows exponent boundaries instead of expired frame count.
- Texture-library ownership now covers array attachment, geometry, program factories, compile, render and metadata preparation. Each shader is recorded immediately after acquisition, so a later factory failure retires earlier programs. Tests inject second attachment/attribute/second shader factory/compile state failures and verify each completed resource is disposed exactly once and renderer target/autoClear/XR restored. Existing15stage-pack tests pass.
- Map Super Jump targeting takes a controller-owned ally snapshot only for a requested teammate jump. Idle open-map frames read no actor slots. Raw and production-chain96input combinations preserve key/pad/touch read order, selected targets and selection cue tickets. Exceptions clear retained actor references.
- Legacy hair metadata shares cached segment/tip stiffness, damping and clamps. Metadata K/length/gravity edits invalidate the WeakMap entry.720full spring updates across30/60/120Hz preserve state arrays and all bone/tip quaternions exactly, including zero/large dt, moving head, air/form weights and metadata replacement.

Validation: quick production composition;38tests in queue-character-world/platform-60-cap/texlib-stage-pack/platform-pending-input pass. GPU/device timing and visual captures remain unmeasured; no performance percentage is claimed.

Third queue batch: render scheduling and elapsed presentation time

- Private tracking renderer stores its last attached renderer identity. Stable Actor updates no longer consult the global installed WeakMap; renderer replacement and switching back preserve installation/reuse.42private-tracking/Haunt/queue tests pass.
- SourceSquidRig.apply retains complete bone/world propagation but leaves bone palette upload to the actual vendored WebGLObjects. The source-loaded23-bone rig test exercises216pose applications and90rendered frames at30/60/120Hz, including3bound shared meshes, fully hidden frames, LOD changes, explicit reset and renderer scheduling reset. Every rendered palette matches the final bone-world × inverse matrices exactly and uploads once per shared skeleton/pass. Explicit reset and return-envelope special path retain their manual updates. This is CPU palette evidence; GPU screenshot acceptance remains separate.
- Showcase stores the existing bounded update dt for lobby/panel easing; render no longer writes a fixed60Hz step. Zero dt freezes easing; first render has nominal1/60 fallback. Actual camera/panel methods agree with elapsed-time exponential response across30/60/120Hz and preserve constant60Hz output.

Shared character rim derivation

Rim/fill derivation now caches its result by camera plus every live sky scalar, rim/fill setting and relevant inverse-matrix element. The cache copies results into each Character-owned uniform, holds no Character references, observes camera/sky mutation within the same tick, and preserves each caller's existing sun-direction uniform when rim strength is0.720actual method outputs across8characters and changing environment/camera/settings compare exactly; stable world inputs derive fewer than100times in that trace. This is operation-count and numerical evidence, not a measured frame-time improvement. The extended31showcase/source-squid regression suite also passed, including5,832fixed physics/input heading ticks.

Ownership correction: the far-LOD comparator hoist now lives directly in authoritative `inkwave-public/src/game/character-lod.js`; the frame-scratch adapter performs no rewrite of that migrated module. The geometry parity test uses the exact pre-hoist comparator as its negative control and explicitly checks zero build-time rewrite. Direct-source ownership admission is required.
