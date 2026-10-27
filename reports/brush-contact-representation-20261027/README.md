# Brush contact follows the current weapon representation

Code `5f6311c6f662557a3426b5243a85037143d30c34` follows exact base `e2a9348ce531de750d9a4d1377e52dc2191d931d`; the original owner's branch is unchanged. This follow-up changes production composition and weapon-only contact selection, with one focused regression. It does not change character geometry, rig, motion clips, appearance, model integration, selection rules, gameplay physics, paint or RNG.

## Problem and change

The prior contact solver always measured flexed `head/headInk`. A nonlocal Brush switching to the merged static far weapon therefore retained the correction for its now-hidden bent head. Octobrush floated 7.70 cm on the first far frame and 7.54 cm after 12 ticks. Merely selecting by the previous `w.near` fixed steady far frames but introduced a return-near penetration of 4.34 cm on the first frame.

Family poses run before `_applyPose` selects the weapon representation. The adapter now extracts the native `_animWeapon` selection/geometry preparation into `_weaponPresentationNear(w)`, and native animation calls that same method. The Brush solver also calls it before measuring contact. The original distance/tier expressions and far-geometry selection exist once and are unchanged; no clocks or part animation run early or twice. Native visibility still switches in the existing animator. Upstream `inkwave-public/src/game/character.js` and its lock hash remain byte-unchanged.

The solver projects flexed near head meshes for near rendering and the actual currently selected `bodyFar/inkFar` meshes for far rendering. It does not force the two representations to share geometry. The ground probe still runs on every applicable solve. If its normal exactly equals the first plane's normal, all vertex distances shift by a constant, so the first support vertex is reused within that call; changed normals rescan. No persistent cache, time cutoff, offset or gain was added.

## Discriminating checks

- New transition test uses a real nonlocal Actor/Character, actual source bank, ordinary native weapon LOD, flat Physics floor, held firing and +Z movement. The camera follows for 180 CPU ticks, then alternates far/near for four 12-tick phases. It independently transforms displayed vertices and requires the original 0–3 cm clearance on **every** frame. Body tier stays hero only to isolate weapon presentation.
- Exact base and incomplete previous-state selection both fail on the first far Inkbrush frame: **6.68335 cm**. Both unchanged negative receipts are retained. The diagnostic of incomplete selection also records first return-near penetration for all three Brush heads.
- Final source and optimized emitted each pass all **144 measured transition frames**, including the first far and first return-near frame. Emitted extrema: Inkbrush **1.3575–1.6255 cm**, Octobrush **1.3593–1.6388 cm**, Painbrush **1.3578–1.6459 cm**.
- Existing head entry/exit on the actual ramp, draw cadence and transform regressions pass. Existing five Roller/three Brush held/air/landing compatibility runs at **30/60/120 Hz**, including contact paint, admitted state and airborne rolling audio gating, pass.
- **Source 7/7, emitted 7/7**, no failure/skip. Source tests first ran with the extraction directly in control source; the final adapter's composed control module is byte-identical (SHA-256 in composition-equivalence.json). Final production composition also ran in the source cost counter and the fresh emitted tests.

The upstream compatibility guard initially rejected the direct source edit as expected. The reviewed extraction was moved into the existing exact-once adapter. The original upstream file and lock were preserved, compatibility passed, and the subsequent standard optimized build passed. This was not an access/approval denial or a bypass of the guard.

## Build and emitted provenance

Build `/tmp/inkwave-brush-visible-representation-20261027`:

- content `60ca76b3a8f82583751cd1e73be5940649f510752e18de885aa3ea5210a3b8ca`;
- input `8d6f76443eb52c03952c6335ef276569631fd12ab05c3383af17209f7a4c3045`;
- **2194/2194** artifact hashes match after tests, zero mismatch.

The base's old emitted held fixture imports `rollers.mjs`, which the production builder inlines. For emitted compatibility only, use the separately reviewed test-only fixture `e6fb91faf9c3e491c6589943d8d98c8b1311afa1` from branch `test/emitted-held-compat-registry-20261027`. Its four original test bodies/assertions are unchanged. It exposes the actual bundled inspection function by appending an in-memory export alias, without modifying emitted statements or importing source runtime. Independent provenance records **394 runtime modules from this emitted site**, one synthetic test root, and no source runtime fallback. The aliased registry prefix matches the built artifact. This fixture change is not bundled into this production follow-up; the integrator already has its separate candidate.

## Bounded cost

The independent flat-ground pose counter now records **886/2120/1434 vertex projections**, **2 part matrix updates**, **1 local raycast** for Inkbrush/Octobrush/Painbrush, versus two full scans/four part updates before same-normal reuse. Buffers/matrices/hit storage remain reused. Far uses the actual merged/decimated weapon mesh and remains bounded by that geometry. These counts are source CPU work, not mobile/GPU FPS or browser timing measurements.

## Reproduce

```sh
node --experimental-vm-modules --test patches/splatoon3/tests/brush-contact-representation.test.mjs patches/splatoon3/tests/brush-head-contact-geometry.test.mjs patches/splatoon3/tests/brush-rolling-transform-cache.test.mjs patches/splatoon3/tests/roller-brush-held-motion.test.mjs
node scripts/build-inkwave.mjs inkwave-public /tmp/inkwave-brush-visible-representation-20261027
INKWAVE_BUILT_SITE=/tmp/inkwave-brush-visible-representation-20261027 node --experimental-vm-modules --test patches/splatoon3/tests/brush-contact-representation.test.mjs patches/splatoon3/tests/brush-head-contact-geometry.test.mjs patches/splatoon3/tests/brush-rolling-transform-cache.test.mjs
# In an isolated checkout of the accepted e6fb91fa fixture:
INKWAVE_BUILT_SITE=/tmp/inkwave-brush-visible-representation-20261027 node --experimental-vm-modules --test patches/splatoon3/tests/roller-brush-held-motion.test.mjs
```

These are controlled CPU/emitted geometry and compatibility checks. No new native-input browser capture, GPU timing or original-game measurement was made. Earlier native captures belong to the prior candidate and are not relabeled as proof of this change. The confirmed implementation ownership mismatch is fixed; original-game visual parity and retail weapon shape/size remain separate. No image/media, generated site, PR, CI run or upload is included. See validation.json and the retained text logs; all commands exited.
