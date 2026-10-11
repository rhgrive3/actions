# Dualies paint source ownership and remaining #992 evidence

Baseline: `12be2542f4e858221267c6c4afe894da15f4db58`, PR #1182. Target: composed `inkwave-public/` plus `patches/splatoon3/`. Reference: ordinary Splat Dualies, Splatoon 3 Ver. 11.3.0.

## Correction to the initial result

The first version of this report incorrectly described the generic `Projectiles._impact` and trail loop as the normal live Dualies path. The initial direct-impact tests exercised that fallback, including under the full installer, but did not establish which impact owner a normally fired head reaches. The ordinary native path already had distance/angle paint coefficients and detached droplets at this baseline. The reported radii 1.71/1.685/1.66 must **not** be counted as a newly delivered normal-play balance improvement from generic random blobs.

Actual full-installer firing establishes this path:

1. `fireDualies -> _fireRound -> _configureInkRound -> InkFlightRuntime.configure`.
2. Configure sets `inkProfile`, `inkPlan.count=1` and `trailEvery=0`.
3. `_step -> InkFlightRuntime.stepHead -> InkFlightRuntime.impact -> paint -> PaintSystem.splat`.
4. `InkFlightRuntime.emitAlong/spawnDrop/updateDrops` owns detached droplets independently of the head. The existing seven-shot sequence is already capped to one droplet per shot.

No new droplet cap is necessary or added. The existing reconstructed pattern and break/free-height model remain, with their original source-fidelity limitations.

## Evidence actually inspected

- [Pinned Splat Dualies parameter table](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponManeuverNormal.game__GameParameterTable.json), directly read through the GitHub connector.
- [Original parameter research](https://splatoonwiki.org/wiki/User:XarrotD/paramtable), documenting sparse distance defaults, distance-anchor interpolation, and 10/35-degree straight-flight depth endpoints. The exact break/free-height interpretation is unknown there.
- [Splat Dualies mechanics](https://splatoonwiki.org/wiki/Splat_Dualies), explicitly documenting a per-shot maximum of one detached droplet, separately from seven patterns and 14-unit spacing.
- [Japanese parameter glossary](https://wikiwiki.jp/splatoon3mix/%E6%A4%9C%E8%A8%BC/%E3%83%91%E3%83%A9%E3%83%A1%E3%83%BC%E3%82%BF%E6%83%85%E5%A0%B1/%E3%83%A1%E3%82%A4%E3%83%B3), cross-checking parameter meanings. These community semantics are not recovered Nintendo executable code or retail measurements.

## Corrected implementation scope

The build adapter now connects the **native** `InkFlightRuntime.impact` owner to the same retained `PaintParam` resolver used by the fallback. This removes a split source contract: normal native impacts previously read a separate frozen native profile, so changing the installed retained paint record did not reach them.

The shared resolver uses projectile-start-to-impact distance, `weaponsFidelityCompletion.worldUnitsPerSourceUnit`, and the documented straight-flight angle envelope. Normal native values already agree at the present scale of 1. A test-only changed-source canary proves that a different retained source now reaches actual native CPU paint; it is not a proposed game-balance value.

Native heads advance `inkPhase`, while their generic `fidelityPhase` can remain zero. The resolver now reads the actual native phase when `inkProfile` exists. It therefore does not overwrite the existing native break/free-height model with the straight-flight angle rule. Native face-specific painting, plane-projected heading, random sequence, returned CPU area and turf credit remain under the original paint owner. The generic fallback retains its earlier first-splat interception and exception restoration.

## Validation

- Four new full-production-installer tests execute real `fireDualies`, real Physics and actual CPU PaintSystem through landing: retained-source width/angle wiring with a bridge-disabled counterfactual; native break/free phase preservation; 30/60/120 Hz render schedules driving the same 60 Hz simulation; and seven successive real births proving the already-existing per-shot cap and ghost score exclusion.
- The native-path tests assert that `Projectiles._impact` is never called. This is the missing check in the initial tests.
- Nine earlier fallback/pure-resolver tests remain useful for that narrower scope. Their direct `_impact` calls are not evidence of the normal native path.
- One existing InkFlight composition test verifies retained actor-contact and wall-drop hooks. The three files pass together: 14 tests, 0 failures.
- Quick compatibility and whitespace checks pass. No physical GPU/browser screenshot or Switch measurement is claimed.

## Remaining acceptance

#992 stays open. `inkFlight.js::INK_MODEL` explicitly labels its descending-uniform pattern and detached-particle integrator as local reconstruction choices. The exact seven-pattern permutation, particle dynamics and break/free-height composition have not been independently established. Connecting the source owner and preserving the existing cap does not settle those questions. World scale 1 remains INKWAVE calibration, not an SI or pixel-perfect Switch measurement.
