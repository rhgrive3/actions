# Held special devices: grip contact, aim and render-time behavior

Code baseline: `fd6435a4dd2781928d211537c485c87bc50b3784`. Candidate: `967c64f8e92a7285dd259a3c977eb38b734905d5`. Presentation changes only; no special admission, movement, projectile launch, damage, paint, network or input values are changed.

## Reference and scope

The model/hold reference remains [special-models.md](../../patches/splatoon3/reference/special-models.md): Splatoon 3 promotional model renders/screenshots, with dimensions and joint curves unverified. [Nintendo's Crab Tank description](https://www.nintendo.com/us/whatsnew/new-splatoon-3-details-from-the-squid-research-lab/) distinguishes crab walking and ball travel. Its [2021 Crab Tank screenshot](https://assets.nintendo.com/image/upload/Nintendo%20Direct/2021/articles/splatoon-3/Special%20Weapon/Splatoon3_0924_scrn_Special_CrabTank_00) shows the crouched pilot reaching separate control bars at the upper rear of the shell. That establishes riding/holding relationships, not exact retail joint coordinates. Gear, input, frame timing and final retail version of the prerelease still are unknown.

This work owns device placement and the final hand constraint. The rider body/leg change is in the separate `special-motion.mjs` commit. This report does not claim matching Nintendo's skeletal animation, dimensions, timing or hardware rendering.

## Findings and changes

- The old all-specials hand constraint passed a *grip* point to `_solveLimb`, whose target is the *wrist*. The real character's closed-hand hole is offset from the wrist by `[±0.0255, -0.0525, 0]` metres (`character-geo.js`, `HAND.hole`). With no end-hand quaternion, fingers missed the grip even when the wrist reached it.
- Hand constraints now subtract that rotated hole offset and apply an explicit device-relative hand orientation. Vertical pistol/yoke/support bars, the sloping Stamp shaft and the Crab's lateral control bars have corresponding wrist directions. A bounded two-arm reach fit translates only hand-carried devices. Vehicle roots remain fixed to the chassis; no rig or gameplay socket moves to satisfy arm reach.
- Reefslider's old approximate targets `±.215,.54,.18` were above/behind the modeled black handles. The geometry and constraints now share the actual modeled handle centers (`REEFSLIDER_GRIPS`). The shark is mounted on the character root, and the old post-update whole-kid lean/counter-transform has been removed. The separate rider pose therefore owns body movement without dragging the shark with it.
- Inkjet's visible cannon now follows the actor's world aim, including aim-yaw versus body-yaw lag and the parent's current transform. Its recoil translates along that bore. The authoritative shot direction, origin and state remain unchanged.
- The Stamp throw wind-back formerly advanced by 25% on every draw, even `dt=0`. It now composes the original 60 Hz response over elapsed time. Tenta salvo, Inkstrike case lid and throw-ready blends use the same approach. One 60 Hz step retains its previous value; 30/60/120 Hz constant-input trajectories now agree, and zero-time draws do not advance them.
- The hand fit starts from each device's authored position every frame; the prior fit correction cannot become next frame's rest transform.

The Booyah sphere deliberately retains its above-head placement. A trial translating it into the standing rig's arm reach embedded the sphere in the hair; that trial was removed before the candidate commit. Its full overhead body/shoulder pose and exact hand contact remain uncalibrated. This is a visible remaining limitation, not a completed match.

## Local measurements

Real procedural Character, 60 Hz, stationary fixture; distances are the actual transformed hand-hole center to the model grip point, not wrist-to-target solver error:

| Device/hand | Baseline distance | Candidate |
| --- | ---: | ---: |
| Inkjet right | 0.0584 m | < 0.00001 m |
| Inkjet left | 0.1342 m | < 0.00001 m |
| Ultra Stamp right | 0.0584 m | < 0.00001 m |
| Ultra Stamp left | 0.1910 m | < 0.00001 m |
| Wave Breaker right | 0.1270 m | < 0.00001 m |
| Tenta, Chump, Screen both hands | 0.0416–0.0584 m | < 0.00001 m |

The candidate regression repeats actual hand-hole measurements at 30/60/120 Hz, across pitch/yaw and throw-ready changes. A local integration fixture loading the rider agent's `special-motion.mjs` measured Crab and Reef hands within `2.3e-16 m` of their authored handle centers. That is solver/geometry evidence using procedural bones; it is not a Switch comparison or the separate source-animation browser verification.

There are no added model meshes, geometries, materials, scene nodes or UUID generation calls. Hand-solver scratch vectors/quaternions are allocated on device creation and reused. New inspection-only scene nodes were considered and removed; browser inspection can use the existing actual handle geometry.

## Verification

Run from the worktree, using the full locked snapshot where the sparse checkout lacks assets:

```sh
INKWAVE_UPSTREAM_SOURCE=/workspace/actions/inkwave-public node --experimental-vm-modules --test patches/splatoon3/tests/special-holds-quality.test.mjs
INKWAVE_UPSTREAM_SOURCE=/workspace/actions/inkwave-public node --experimental-vm-modules --test patches/splatoon3/tests/special-models.test.mjs patches/splatoon3/tests/special-vfx.test.mjs
INKWAVE_UPSTREAM_SOURCE=/workspace/actions/inkwave-public node --experimental-vm-modules --test patches/splatoon3/tests/special-presentation-hotpath.test.mjs
ESBUILD_MODULE=/workspace/actions/node_modules/esbuild/lib/main.js node scripts/build-inkwave.mjs /workspace/actions/inkwave-public .ci-scratch/holds-quality/site-final
```

The 7 new hold tests pass. Existing model/VFX tests pass (20), and the 3 held/Wail hotpath tests pass. The fixture prints its known optional-source-motion dynamic-import warning; these CPU tests intentionally use procedural Character bones. The hotpath run initially could not import Three from the sparse worktree; materializing the unchanged tracked `inkwave-public/vendor` fixed that environment issue. No locked snapshot was edited.

Final visual evidence and build identity are listed below. Screenshots are Chromium/SwiftShader with real browser source animations, a flat diagnostic scene and fixed cameras; they establish local presentation appearance only.

## Candidate source hashes

| File | SHA-256 |
| --- | --- |
| `runtime/special-presentation.mjs` | `05972dc376048095cb2fbc9f0c962dbc9e0a1bf48e7ca3766f8c0ede13eea2cb` |
| `runtime/special-models.mjs` | `0aed9ae331dd1f6f7bd931572afb810caf3df788dfb4781b0b22b514a387d3ff` |
| `tests/special-holds-quality.test.mjs` | `eb1061cb8455867ab812fefe5f3496891067e428e603e1bacbab3cab88e39805` |

## Render evidence

Final standalone build (holds code only; rider body code is validated separately): content hash `77eb9d27e80ef329b84c1614c2fb38b4037dcb745b8ea392968700449405666d`, revision `bad1f1e962cba50bc737a935db39012fef7ce6bc7485195ad44a0f02f9f16528`. Startup dependency/file budgets passed: 1,832,414 initial JS bytes; 145 preloads; 590 precache entries. These are deterministic file/dependency checks, not browser performance measurements.

The two exact baseline/candidate runs used the existing special gallery (480 px, Inkjet and Stamp), with only `/usr/bin/chromium` selected and an empty favicon added to the local runner. Both completed with no page/resource errors. The actor starts the real action and presses fire on the gallery's fixed schedule. [Screenshot hashes and build revisions](holds-evidence/screenshots.json) record the individual outputs.

| View | Baseline | Candidate |
| --- | --- | --- |
| Inkjet, held cannon | [before](holds-evidence/inkjet-before.png) | [after](holds-evidence/inkjet-after.png) |
| Ultra Stamp, action pose | [before](holds-evidence/stamp-before.png) | [after](holds-evidence/stamp-after.png) |

The near/far hands now close around the cannon and shaft instead of placing the wrist at the target and leaving the fingers offset. The Stamp is translated into both arm spans while keeping its handle/head rotation. The rendered comparison is local visual evidence, not a Nintendo-frame match.

## Additional gameplay regression boundary

The existing Crab presentation tests (10/10) and Ultra Stamp source timing tests (3/3) passed. `special-crab-paint-aim.test.mjs` passed 11/12. Its existing thin-wall case, **“Crab socket beyond a thin wall cannot launch damage or flight paint through cover”**, fails at line 149 because the victim is present in the hit list. The focused case fails identically against the immutable baseline build (`contentHash=d4a2070c97d4b556a3a624d63e50080ffdbccee560f4170f02085a7e9706611f`):

```sh
INKWAVE_BUILT_SITE=/workspace/actions/_site-before node --experimental-vm-modules --test --test-name-pattern='Crab socket beyond a thin wall' patches/splatoon3/tests/special-crab-paint-aim.test.mjs
```

That test does not construct the production Character; its collision/gameplay failure predates this presentation patch and remains unresolved here. The passing sibling tests preserve gun-socket alignment, world aim, recoil ownership, ball transitions, timing, paint emissions and coarse/fine update behavior. This report does not label the whole gameplay suite as passing.
