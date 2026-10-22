# Library queue: weapons batch, 2026-10-22

Baseline: `c0938a3f84768474df91713f7b372f9d7f8fe96a`. Target remains Splatoon 3 11.3.0; these repairs do not certify retail engine or Switch/iPad parity.

## Result

32 assigned queue items receive code fixes. Two were already implemented on composed main: catalogue Unit mode hoisting and capsule squared-distance probes. One ownership-sensitive proposal remains open (below); the native empty-dynamic-sweep item is handled by the native-render batch.

- Catalogue delayed births now cancel with `cancelPendingInput`, including TIME UP and authoritative host input neutralization. It reuses the existing catalogue hard-cancel lifecycle; shot costs, fixed-step physics and winner snapshots are not changed.
- Catalogue Hit/Set/lobe buffers survive pooled projectile reuse while retirement clears victim references, descriptors and shared volleys. Radius lookup, travel distance, ordered Inside damage and area payload setup avoid repeated per-target work.
- Brella shot basis/sample reduction, held-shield empty admission and detached-canopy paint reuse preserve native defense ordering and active-shield collision.
- Dualies stamps reuse leased interpolation vectors and prefix seeds; Charger flight defers unused normals and reuses candidate arrays; Roller contact/flick scratch retains authored math.
- Shape output and classification cache preserve original dependency changes, including late ghost metadata and special tags. Slosher nearest scratch is leased per actor for synchronous reentry. Constant native profile reach and recurring runtime splash plans retain full-sequence arithmetic, while exported `splashPlan` retains its fresh-result contract.
- Splatling bias exponent caching retains every RNG draw and numerical formula. Horizontal admission preserves the base movement call and clearing of the diagnostic state.

## Validation

Final focused production-composition batch: 179 tests passed, 0 failed. Includes 20,000 original-vs-composed capsule searches with exact `t`/`dist`; 70,000 scalar damage boundary/random/nonfinite checks; delayed-birth cancellation and pool reference cleanup; body scratch and classification dependency matrix; exact jitter and safe-integer splash-plan boundaries; mutable specification invalidation; catalogue Brella, native/block rolling support, Slosher nearest and Dualies slide suites. Earlier focused batches passed 85 and 81 tests. Quick upstream/reference compatibility passed.

A failed intermediate full-composition run detected that capsule squared probes already existed in the quality adapter. The redundant candidate was removed; the current final source uses the existing implementation and passes the new differential regression.

No native asset A/B, real iPad/Android/Switch performance trace, browser pixel/audio comparison or measured FPS uplift is claimed. Parent integration owns the combined build and browser acceptance.

## Open ownership-sensitive proposals

- Legacy Flick/Slosh whole-list identity scan: simple suffix capture can change semantics under synchronous emission/network callbacks that remove, reorder or recycle projectiles. Existing exact identity handling is retained.

## Follow-up: owner splash-drop pool

A bounded 256-record per-system pool now reuses each drop record plus its five physics vectors. Retirement occurs only after all sorted landing callbacks finish, including synchronous nested births/landings. Owner/spec/footprint references are severed; match clear increments an epoch so old callbacks cannot repopulate a new match pool. Primitive landing telemetry is never recycled. Return values remain mutable live simulation leases, matching the projectile-head pool contract.

Validation: 51 existing flight/Blaster/catalogue/disconnect/render tests and four new lifecycle tests passed. New tests prove zero vector constructors on a warmed reuse, independent logged snapshots, separate nested leases, a 256-record retention cap, clear-epoch isolation and cleanup after paint exceptions. No device performance uplift is claimed.

## Follow-up: gated-input accessor reuse

The admitted spread object still remains fresh on each gated call. Getter descriptors alone are cached with weak runner/input keys and separate captured subBlocked booleans. Their closures capture the same objects/boolean as the baseline, so retained getters and late latch changes remain valid without mutable shared views. Native actor input already has stable per-Actor identity through the quality adapter.

Three new tests preserve own string/Symbol ordering, extra-field spread snapshots, getter names/flags/arbitrary receiver calls, source lazy-read order, nested mode changes, separate runner/input identity and exception cleanup. Forty-two existing weapon-gate and Splatling composition tests passed. No CPU/FPS uplift is measured.
