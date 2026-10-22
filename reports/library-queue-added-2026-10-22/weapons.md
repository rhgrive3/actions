# Additional Library queue: weapons

Base: `8de71b09cd7a3bc05fa4ce06b00f99687beb44ad`. All 14 assigned notes were read completely and checked against composed production source. All 14 received bounded local implementations. No Library metadata, raw immutable source, admission guard, protocol, CI or shared behavior report was changed.

Reference remains Splatoon 3 11.3.0. These optimizations preserve the existing implementation; there is no new retail/device/FPS claim. Root owns composed build/browser verification and publication.

## Results

### booyah-bomb-reuse-paint-disk-centre-lattice

Cache the exact radius-only centre plan on each Booyah object. Retain all six per-call terrain probes, tangent projection, quantized key deduplication and frame-6 completion pass. Changed radii replace the private plan.

Actual-source ordered slope tiles, stamps, turf, key membership and six probe traces match the pinned baseline; one 13.5-radius growth reduces measured kernel sin/cos calls from 288 to 48.

### bubbler-skip-empty-projectile-contact-pool-array

Return null when the current local and remote arrays are both empty. Keep nonempty pool order and all hit/onHit arbitration unchanged; do not cache replaceable array references.

Existing composed world-distance, remote proposal/liveness/reset tests plus unchanged nonempty loop.

### catalog-lobes-skip-zero-offset-yaw-trigonometry

Skip yaw trig only for missing offsets with finite coordinates and no signed-zero coordinates. Retain the exact old expression path for explicit offset arrays, nonfinite inputs and signed zero.

6,000 actual-source lobe comparisons use Object.is on each coordinate; explicit Splatana-style offsets and empty arrays remain covered; finite absent-offset probe makes zero trig calls.

### catalog-splash-defer-unused-flight-direction-clones

Preserve the positive splash-count guard, skip consumed budgets, and create one local direction only immediately before the first admitted release. Keep shared direction within a substep and original boundary comparisons/order.

Actual old/current kernels match payloads/state for exhausted, unreached, exclusive head-stop, multi-release, ghost, projected and falling branches; no admitted release creates zero direction clones, admitted releases one.

### ink-storm-recovery-reuse-los-endpoint-vectors

Use an actor-keyed weak scratch pair for synchronous native LOS. Reentrant calls allocate private fallback endpoints until the outer call returns; finally restores the busy lease after exceptions. No LOS result cache.

Endpoint values, nested LOS, exceptions and reuse are tested; existing actual recovery and 30/60/120 Hz cloud/gauge traces pass.

### killer-wail-splash-wall-long-ray-conservative-broadphase

Reject a wall only when the finite segment misses its enclosing sphere with a scale-aware roundoff margin. Keep the complete original discrete sample loop for possible hits and unusual inputs.

2,200 old/current actual-source comparisons cover long/short/zero segments, rotated walls and unusual dimensions; the distant 1000-unit case performs zero samples versus the original 2,859.

### native-sprinkler-bomb-replay-avoid-bomb-snapshot-set

Validate the remote owner before snapshot allocation and delegate invalid/nonowner rows to the unchanged native playback. Retain Set identity membership for accepted senders because composed bomb-capacity wrappers can evict entries; append-index optimization is deliberately not applied.

Actual native Sprinkler JSON birth/damage, malformed/foreign owner, life, epoch, replay, retirement and recorder exception controls pass. This is the safe first phase expressly allowed by the note; accepted-owner O(B) membership remains.

### point-sensor-flight-reuse-swept-capsule-scratch

Own delta/base/contact/result scratch on each sensor and reset t/dist before every synchronous capsule query. Never alias actor or source hit vectors; original nearest and terrain ordering remain.

90 old/current flight traces cover partial result writes, opposing capsule iteration, terrain precedence and landed state; composed support/recon/contact tests pass.

### slosher-projectile-birth-reuse-aim-normalization-vector

Normalize the current owner aim into Projectiles-owned scratch. Scalar yaw/pitch are consumed before any downstream call, so nested projectile births cannot corrupt a retained direction. Owner aim and RNG are untouched.

Composed source Slosher projectile/contact regression passes; original volley timing and 4+5 birth order remain unchanged.

### tacticooler-actor-contact-reuse-flat-sweep-scratch

Lease actor-specific frames by synchronous nesting depth, reusing flat block records, Hit and start/end vectors. Preserve levelFor and Tower refresh. Release stand/axes/faces references in finally and avoid allocating anything on the usual empty-cooler route. Escaping public coolerSegmentContact result clones remain independent.

120 old/current actual module traces match contact/motion/Tower/reentry/throwing resolver behavior; 30 warmed contact calls construct 30 old Hits versus zero new Hits.

### torpedo-fizzy-detached-splash-gpu-resource-batching

Share the identical sphere geometry across currently live visual drops with an explicit reference count; dispose at the last removal and reconstruct on later deployment. Retain independent birth-color materials and meshes. Instancing/material batching is deferred as the note allows.

Cap 768 eviction, independent source-color snapshots, below-world removal, no spurious burst, last-user disposal/clear and redeployment are asserted; composed Fizzy/Torpedo JSON authority and physics tests pass.

### toxic-mist-no-status-avoid-repeated-property-deletes

Skip deletes only when all three status properties are truly absent. Present undefined properties and sparse/stale scale state still execute the original expiry comparison and deletion. Continue scanning Actors after cloud retirement.

Actual-source comparisons cover missing/present undefined fields, stale/future/NaN/Infinity/negative-time state; Proxy instrumentation confirms zero versus three empty delete operations. Actual Mist movement/replay/life regression passes.

### trizooka-frame-closure-and-presentation-context-churn

Share no-op/false functions and cache moveSpeed/busy predicates per activation state via WeakMap. Keep current tick dt/rest forwarding, dynamically checked presentation predicate, independent nested context objects and all existing finally restoration.

Existing native Trizooka lifecycle/geometry and birth/swim tests pass, including native main/sub/dodge mask, shared swim restore, replay/owner/life controls. Context reuse was intentionally not attempted.

### trizooka-rounded-obb-candidate-allocations

Replace d/s records with scalar components, remove unused ob and face arrays/filter, evaluate roots in the original entry/exit order, and pass numeric sweep radius without temporary probe records. Preserve half-extent array and returned candidates, arithmetic/ties and native fallback.

12,000 pinned old/current actual OBB candidate comparisons match t/kind/axis/sign including overlap/zero steps; existing native geometry/contact tests pass.

## Validation

- Pure actual-source/kernel/resource and sparse-cache suite: **12 passed, 0 failed, 0 skipped**. Command: `node --test patches/splatoon3/tests/added-weapons-allocation-parity.test.mjs patches/splatoon3/tests/slosher-nearest-sparse-cache.test.mjs`.
- Serialized actual-source regression batch: **138 passed, 0 failed, 0 skipped**. Run with `flock /workspace/scratch/1dcd5205fbb6/added-heavy-tests.lock node --experimental-vm-modules --test --test-concurrency=1` and the following test files under `patches/splatoon3/tests/`: `catalog-slosher-flight-contact.test.mjs`, `native-sprinkler-damage.test.mjs`, `storm-effects.test.mjs`, `support-kit-recon-cooler.test.mjs`, `kit-trizooka-native.test.mjs`, `kit-trizooka-geometry.test.mjs`, `toxic-mist-resistance.test.mjs`, `fizzy-detached-splashes.test.mjs`, `torpedo-detached-splashes.test.mjs`, `large-special-slope-paint.test.mjs`, `trizooka-birth-swim.test.mjs`.
- Five selected composed Big Bubbler query/remote-authority/liveness/reset controls: **5 passed, 0 failed, 0 skipped**. Command: `flock /workspace/scratch/1dcd5205fbb6/added-heavy-tests.lock node --experimental-vm-modules --test --test-name-pattern="the candidate reports a world distance|a match reset clears remote domes|a local round versus a remote dome|the candidate reports which targets|a stale candidate proposes nothing" patches/splatoon3/tests/kit-big-bubbler.test.mjs`.
- `git diff --check`: passed.

An initial 123-case run had six Sloshing Machine failures in the previously optimized, untouched `slosher-nearest-paint.mjs` cache. A fresh exact-base worktree reproduced the same TypeError. The validator already accepts the source-valid omitted collision subrecord, but its cache assignment dereferenced it. Parent authorized the two optional-chain corrections; commit `888c9ee3` keeps source validation/defaults unchanged and adds sparse-record/mutation coverage. The full rerun above includes all six now passing cases.

## Remaining limits

Accepted-owner Sprinkler replay still uses identity Set membership because append-only indexing is unproven with composed eviction. Public cooler segment results still own fresh escaping vectors. Trizooka presentation contexts remain per call for nested restoration. Torpedo/Fizzy retain per-drop material/mesh draws; geometry sharing is the note's explicitly allowed first phase. Actual iPad/WebKit/Android performance and visual captures remain unmeasured. Independent cold-start clock Issue #1767 remains open and untouched.
