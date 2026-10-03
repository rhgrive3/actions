# INKWAVE Weapons / Ballistics Fidelity — Draft integration review

## Baseline and provenance

- main baseline: `5e28dbd16f7829aebd88052ff5f7fdf71f39fdad`
- supplied workstream commit: `6fdd76f8bbfc62a2d1fed60a51cf57e3d6178525`
- pinned Splatoon 3 reference version: **11.3.0**
- pinned public datamine: `Leanny/splat3@7280ff9cde8bb1c5dcef46c700c326471584d2e6`

The supplied package was independently restored against the exact GitHub Actions artifact for main `5e28dbd...` (artifact SHA-256 `3ac3aed0e5d68947adc16883f9d0be3d60384965805eae317fe5d61b5e02d597`).

Independent reproduction:
- source package tests: **77 / 77 pass**
- package identity verification: pass
- 7 pinned datamine JSONs fetched independently
- **51 / 51 explicit reference fields matched the pinned originals**

The unversioned analyst default table is deliberately marked medium-confidence and non-official.

## What changes

This workstream is restricted to main-weapon gameplay/ballistics.

- staged straight -> brake -> free projectile integration
- explicit brake-entry speed caps for Shooter / Dualies / Blaster / Splatling
- exact projectile lifetime clipping
- swept nearest-enemy chronology before wall/boss
- Blaster 10F startup / 50F repeat / 13F projectile lifetime behavior
- charge-dependent Splatling launch speed
- Roller horizontal/vertical straight phases and vertical 1+2+2 speed/pitch layers
- Roller outside damage envelope
- Slosher maximum-per-volley direct/splash aggregation
- no packet-format extension; roller remote mode is derived from the already transmitted straight duration

No changes are made to Character animation, movement physics, input admission, Bomb/Special, PWA/lifecycle or general runtime performance.

## Measured baseline -> candidate

| Case | practical hit | full damage | paint max Z |
|---|---:|---:|---:|
| Shooter | 34.3 -> **12.6** | 18.6 -> **12.0** | 34.125 -> **13.625** |
| Dualies normal/post | 33.5 -> **12.2** | 17.0 -> **11.3** | 33.125 -> **13.375** |
| Blaster | 17.8 -> **13.5** | 15.0 -> **10.7** | -> **11.875** |
| Splatling partial | 20.3 -> **15.0** | -> **14.2** | -> **15.875** |
| Splatling full | **20.3 retained** | 12.2 -> **19.5** | -> **21.125** |
| Charger full | **24.7 retained** | **24.7 retained** | **24.375 retained** |
| Roller horizontal | 9.4 -> **11.0** | 1.6 -> **4.8** | 10.625 -> **12.625** |
| Roller vertical | 17.5 -> **15.6** | 1.6 -> **6.2** | 18.375 -> **16.125** |
| Slosher | **12.7 retained** | -> **11.9** | **14.125 retained** |

Distances are **INKWAVE world units**, not Nintendo range-meter units.

## Review findings

### Accepted
- explicit source values used by the patch match the pinned v11.3.0 JSON
- RNG draw ordering for existing launch code is retained
- gameplay and visual-only/network-ghost responsibilities remain separated
- existing packet shape is retained
- the candidate is frame-schedule deterministic under the supplied fixed-step tests
- Plus PR #62 (Input / Action Reliability) has no direct production-file conflict with this workstream

### Integration note for PR #59
PR #59 Movement also edits `patches/splatoon3/profile.json` and `adapter.mjs`.
The changes are different owners, not mutually exclusive:
- keep Movement's player acceleration/movement adapter
- keep Weapons' ballistics/profile values and weapons adapter
Do not resolve the future textual conflict by dropping either side.

## Known limitations — not hidden

1. **Absolute Switch/world scale is not independently calibrated.**
   This PR connects pinned raw values to a documented 60 Hz conversion/model; it does not claim exact Nintendo metre parity.

2. **Analyst default brake/free fields are medium-confidence and unversioned.**
   They are source-guided model assumptions, not extracted 11.3.0 overrides.

3. **Roller vertical fixture has narrow hit gaps around 12.7–12.8 and 14.3–14.4 WU.**
   The pinned datamine exposes spawn-height offsets and player collision-radius transitions, but their exact native composition is not established. A review experiment applying collision-radius growth alone did not remove the gaps. This Draft therefore does **not** guess an origin-height conversion merely to fill them.

4. Charger remains the existing hitscan/beam gameplay representation. Raw finite travel values exist, but native release/collision/paint timing has not been reconstructed confidently enough to replace it.

5. Splatling interpolation between explicit speed endpoints remains a labelled minimal model.

6. Real-device GPU/frame-time and side-by-side Switch footage remain acceptance work.

## Performance

The supplied benchmark did not claim zero cost.
Shooter/Dualies improve from shorter live projectile lifetime; Splatling and Slosher paths show some additional cost. Repository CI and later mobile acceptance must catch unacceptable regression.

## CI added by this Draft

- source-level fail-closed adapter/provenance tests are part of `check-inkwave-patches.mjs`
- pinned datamine originals are downloaded and hash/field checked in CI
- after the normal site build, the built minified site is re-measured for weapon hit/full/paint golden values
- Shooter and both Roller modes are round-tripped through the existing projectile packet format and compared for trajectory drift

## Draft acceptance boundary

Ready for integration review only after all existing validate/browser jobs are green.
Physical Switch/iOS/Android fidelity and the unresolved roller-height/collision semantics are not represented as complete.
