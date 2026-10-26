# Local sub queue reconciliation — 2026-10-26

Base: PR #1878, `dd90aa241aabd5f0b972cc3471386ba3d4da86dc`. Local implementation only.

- implemented-local: 12
- not-adopted: 3
- needs-evidence: 1

## Verification

The seven new regression tests compare current behavior with captured baseline function bodies and actual composed runtime execution. They cover 750 defense queries and hit ownership, reverse/reentrant/throwing tick snapshots, 20 Angle tail ticks, 40 repeated Burst previews, Mine ownership lifetimes, local/remote model builds, and Torpedo/Fizzy visual batching and resource retirement. Six related suites also pass with `--experimental-vm-modules --experimental-global-webcrypto`. Browser performance is not measured.

The shared AOE distance queue also has its sub-side implementation here; its queue disposition is owned by the integrated gameplay report. Callback-sensitive shapeContact and LOS/method/endpoint changes keep their original recomputation; queue-specials-local-20261026.test.mjs covers both callers.

## Per-queue decisions

### all-subs-fixed-step-object-snapshot-array-reuse

**implemented-local** — Depth-leased scratch arrays retain the reverse fixed-step visit order, callback births next tick, and nested traversal isolation. finally clears retained entity references after both normal completion and exceptions.

Evidence: `patches/splatoon3/runtime/all-subs.mjs`.

### angle-shooter-tail-cache-static-bounds-and-capsule-scratch

**implemented-local** — Caches bounds until a new immutable tail segment is appended. Depth-leased per-tail capsule query scratch preserves target order, seen-mark timing and reentrant calls; unused queries allocate nothing.

Evidence: `patches/splatoon3/runtime/all-subs.mjs`.

### burst-bomb-aim-preview-per-render-vector-and-hit-allocation

**implemented-local** — Depth-leased Burst preview frames reuse vectors, Hit, flight/contact records and temporary template. Every original Hit field is reset at the call boundary, no launch outputs alias scratch, and finally clears the owner reference.

Evidence: `patches/splatoon3/runtime/all-subs.mjs`.

### ink-mine-beakon-instant-placement-avoid-double-model-build

**implemented-local** — Immediate local Mine/Beakon deployment reuses its birth model and synchronizes the final root height, position and yaw. Other lifecycle paths retain their rebuild behavior.

Evidence: `patches/splatoon3/runtime/all-subs.mjs`.

### ink-mine-cache-enemy-ink-region-scan-on-paint-version

**not-adopted** — The global paint version cannot establish equivalence: moving Tower surface paint may change independently. The current live scan is retained to preserve triggering on dynamic surfaces.

Evidence: `patches/splatoon3/runtime/all-subs.mjs`.

### ink-mine-empty-owner-attachment-scan-on-weapon-update

**implemented-local** — An index tied to the known entity-array identity tracks live mines per owner across birth and idempotent retirement. A proven zero skips the owner scan; positive counts and unknown array replacements retain the original ordered scan.

Evidence: `patches/splatoon3/runtime/all-subs.mjs`.

### remote-sub-replaydeploy-duplicate-visual-rebuild

**implemented-local** — Remote replay defers the intermediate deploy rebuild and performs exactly one final rebuild after authoritative attachment, position, yaw, lifetime and uses are applied.

Evidence: `patches/splatoon3/runtime/all-subs.mjs`.

### splash-wall-elide-duplicate-yaw-trigonometry

**implemented-local** — The same normal sine/cosine components supply the perpendicular right vector; arithmetic and query order are unchanged.

Evidence: `patches/splatoon3/runtime/all-subs.mjs`.

### sprinkler-droplet-reuse-rng-and-paint-point

**not-adopted** — The proposed custom all-subs sprinkler update is unreachable in the live runtime: actual throws are owned by native kit-sprinkler and replaySpawn excludes sprinkler. Optimizing that dormant branch has no live runtime benefit.

Evidence: `patches/splatoon3/runtime/all-subs.mjs`.

### sprinkler-live-drop-retirement-stable-compaction

**not-adopted** — The native list is bounded at 96 and is observable from paint.splat, applyHit and receiver callbacks during iteration. Tombstones or deferred stable deletion change that synchronous live-list view; no measured benefit justifies adding compatibility machinery. Original immediate retirement remains.

Evidence: `patches/splatoon3/runtime/kit-sprinkler.mjs`.

### sub-defense-defer-hit-object-materialization-until-nearest

**implemented-local** — Preserves sync/filter/intersection/tie-break order while retaining the winning numeric geometry. Only the final nearest result allocates its point, normal, candidate and callback. Damage and one-shot hit ownership remain unchanged.

Evidence: `patches/splatoon3/runtime/all-subs.mjs`.

### sub-object-role-specific-weakmap-allocation

**implemented-local** — Allocates seenMarks only for Angle Shooter and seenToxic only for Toxic Mist; other roles hold null and never read the absent role state.

Evidence: `patches/splatoon3/runtime/all-subs.mjs`.

### torpedo-fizzy-defer-duplicate-visual-sync-within-tick

**implemented-local** — A depth-counted visual batch surrounds custom-sub ticks. Spawn/retirement work still happens immediately; matrices/colors/count are synchronized once at the outermost exit, including exceptions. Calls outside a batch still synchronize immediately.

Evidence: `patches/splatoon3/runtime/torpedo-splashes.mjs`.

### torpedo-fizzy-idle-instanced-pool-reuse

**implemented-local** — Zero-user visual pools become invisible with count zero and remain reusable for two seconds. New births cancel retirement; expiry, clear, inactive scene replacement and context loss release geometry/material/listener/timer ownership. Physics records are not pooled.

Evidence: `patches/splatoon3/runtime/torpedo-splashes.mjs`.

### torpedo-fizzy-retire-known-reverse-index-fastpath

**implemented-local** — Backward-step retirement supplies the known index and uses it only when list[index] is still the same drop. Other or invalidated lifetimes retain indexOf; limited-drop retirement happens at its original point.

Evidence: `patches/splatoon3/runtime/torpedo-splashes.mjs`.

### fizzy-bomb-flight-splash-paint-unreachable

**needs-evidence** — The proposed helper has no production callsite and is not a flight simulation: it resolves an immediate downward ray/fallback paint without sourced initial velocity, gravity, landing footprint or an accepted online replay phase. Enabling it would change visible turf and authority. Keep dormant until the intended sourced motion and replay behavior can be established.

Evidence: `patches/splatoon3/runtime/all-subs.mjs`.
