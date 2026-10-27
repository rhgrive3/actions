# Local flight and special queue reconciliation — 2026-10-26

Base: PR #1878, `dd90aa241aabd5f0b972cc3471386ba3d4da86dc`. Local implementation only.

12 delegated entries are implemented locally and one (Inkjet exhaust) is implemented partially. Three world-domain entries also appear in the world report; they are the same work and must not be counted twice. Two candidates adopt only the provable subsets: Inkjet keeps its escaping center/predicate, and shared flight classification leaves mutable/custom paths unchanged.

## Verification

- Five InkFlight/splash tests pass: 300 baseline/composed emission cases including trace/override mutation; actual Three.js 30/60/120 Hz Float32 matrix/shape comparisons and pooled lifetimes; 500 splash births; callback/getter/fallback segment cases; catalog null/custom/Proxy/empty emission paths.
- Eight special tests pass: nested/retained Inkjet inputs, complete Screen projection lifetime, native/custom/reentrant/throwing Crab paint, movement snapshots, Wail scratch clobbering, Tenta sorted selection and numeric coercion boundaries, LOS-sensitive AOE distances, and actual installed world proxy/native fallback.
- The existing added-weapons allocation parity suite passes all 11 subtests. Eight InkFlight/paint suites pass.
- Eight related special suites pass, including all 84 subtests in all-specials.test.mjs with a 6 GiB Node heap. The initial default 2 GiB heap attempt exhausted memory; the larger-heap rerun passed unchanged.
- Browser hardware performance and screenshot output are unmeasured. No source gameplay constants, numerical integration or paint authority were invented.

## Per-queue decisions

### inkflight-emit-along-reuse-planar-head-heading

**implemented-local** — Each admitted emitAlong segment lazily shares the original scalar planar heading. Tracing and overridden spawnDrop methods use the original per-birth path; direct calls retain their fallback. No heading is cached across segments or pooled lives.

Evidence: `patches/local-quality/queue-remaining-inkflight-20261026-adapter.mjs`.

### inkflight-drops-reuse-fixed-tick-orientation-in-render

**implemented-local** — Pooled records reuse speed and four Quaternion scalars only at the same frame with Object.is-identical velocity components. Every birth and clear invalidates. Position, age, color, shape buffers, capacity checks and matrix writes remain live. The shared scratch normal is still updated; no Quaternion object is added per drop.

Evidence: `patches/local-quality/queue-remaining-inkflight-20261026-adapter.mjs`.

### source-flight-splash-share-segment-heading-and-footprint

**implemented-local** — Adopts the provable subsets: owned callback-free distance states share direction after the first real release; wall/custom/fallback paths keep original evaluation. Catalog falling-drop loops lazily share footprint only for known plain source records and preserve null. Custom descriptors, getters/Proxy and immediate floor paint retain per-release classification. A-side mutable weapon classification remains per release; no unsafe descriptor assumption is introduced.

Evidence: `patches/splatoon3/runtime/blaster-flight-paint.mjs`, `patches/splatoon3/runtime/main-weapon-catalog.mjs`, `patches/splatoon3/runtime/roller-vertical-paint.mjs`.

### splash-drop-birth-inline-record-and-seed-helper

**implemented-local** — Restores the missing #1870 scalar birth assignments and inline seededSplashUnit calls while retaining current pooled-record reset fields, random evaluation order, numeric operations and retirement ownership.

Evidence: `patches/splatoon3/runtime/blaster-flight-paint.mjs`.

### shared-splash-flight-avoid-finite-triplet-array

**implemented-local** — Restores all three endpoint reads before short-circuit finite tests, preserving getter evaluation order while eliminating the temporary triplet array.

Evidence: `patches/splatoon3/runtime/blaster-flight-paint.mjs`.

### catalog-distance-splash-reuse-pooled-projectile-interpolation-vector

**implemented-local** — Restores a projectile-catalog-state interpolation Vector3 for synchronous release consumers; exact copy/lerp arithmetic, threshold order and per-drop owned values are preserved.

Evidence: `patches/splatoon3/runtime/main-weapon-catalog.mjs`.

### inkjet-exhaust-fixed-step-temporary-closures-and-center

**implemented-partially** — Adopts the safe staged reduction: removes the separate inside closure and evaluates the same actor-live x/z and captured minY/maxY through one helper. The independently cloned center and escaping damageAt closure remain, because arbitrary damage hooks may retain them. This is not reported as eliminating all per-tick allocation.

Evidence: `patches/splatoon3/runtime/all-specials.mjs`.

### splattercolor-screen-reuse-drop-projection-vectors

**implemented-local** — Native raycasts use a depth-leased per-screen pair of projection vectors; source/current coordinate arithmetic and paint cadence are identical. Custom raycasters keep fresh vectors, including retained-input behavior. Nested calls and exceptions release lease depth in finally.

Evidence: `patches/splatoon3/runtime/all-specials.mjs`.

### crab-tank-roll-paint-elide-per-tick-vector-and-stamp-options

**implemented-local** — Movement-start vectors are depth-leased across moveActor/paint. Known native paint and network sinks reuse depth-owned stamp options, resetting/deleting face and clearing owner on exit. Custom sinks keep fresh options. Seed hashes are call-locally reused only while the primitive seed stays Object.is-equal; changed seeds and coercible object seeds retain their original timing.

Evidence: `patches/splatoon3/runtime/all-specials.mjs`.

### special-world-flight-kind-check-hoist-three-value-array

**implemented-local** — Restores ordered scalar marker/wave/screen comparisons in the per-object flight update, removing its temporary three-element array.

Evidence: `patches/splatoon3/runtime/all-specials.mjs`.

### special-world-hidden-native-proxy-mesh-factory

**implemented-local** — Restores both sides of the missing proxy contract: the installed model presenter provides hidden transform Groups with emissiveIntensity/opacity scalars, and worldMesh asks for the proxy before allocating geometry/material. Unsupported/uninstalled paths still create the original native mesh.

Evidence: `patches/splatoon3/runtime/all-specials.mjs`, `patches/splatoon3/runtime/special-presentation.mjs`.

### killer-wail-paired-beam-share-delayed-trace-sample

**implemented-local** — Restores the shared delayed sample per paired beam tick, copied into scalars before hit/event callbacks use shared runtime vectors. Origins, beam calls, seeds and event ordering remain separate.

Evidence: `patches/splatoon3/runtime/all-specials.mjs`.

### tenta-missiles-selecttargets-per-candidate-gearcurve-and-slice-map

**implemented-local** — Restores call-local missile/AP resolution, lazy one-time gear curve and in-place sorted output truncation/mapping. Numeric slice semantics and BigInt/Symbol coercion errors are preserved with unary numeric conversion.

Evidence: `patches/splatoon3/runtime/all-specials.mjs`.

## Shared AOE safety

Both callers save all six point/center coordinates around LOS. Reuse requires Object.is-identical coordinates and the same native distanceTo method; mutation, custom distance methods and shapeContact paths recompute as before. This queue is owned by the integrated gameplay report and is not included in the 13-entry count here.
