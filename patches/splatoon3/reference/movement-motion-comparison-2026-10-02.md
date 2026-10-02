# Movement motion comparison, 2026-10-02

Target gameplay data is Splatoon 3 **11.3.0**, extracted at `7280ff9cde8bb1c5dcef46c700c326471584d2e6`. This work corrects missing connections to the actual INKWAVE Character. It does **not** establish complete Switch animation parity. Public Nintendo clips are older, show no input log or gear inventory, and can contain edited/slow playback. Decoded video frames are not automatically game-input frames.

## First differences and changes

At base `d72f07c88720ab8b392035bfb3e1a18bb3dca974`, `beforeActions` launches a Squid Roll but calls only `character.trigger('jump')`. Surge release only emits `actor:squidsurge`. The real `Character.trigger` switch and `_updateSquid` have no dedicated roll or surge action. Its normal air/swim/climb animation therefore plays even when the gameplay action succeeds. Counting those emits as implemented body motion would be incorrect.

`movement.mjs` now sends dedicated `squidroll`, `squidsurge`, and `squidsurge_top` triggers. Wall charge replaces the visible roll pose while preserving the existing gameplay defense clock; the footage does not establish a new armor cutoff rule. Super Jump charge probes the ground; the original flight transition kept that ground flag, selecting a grounded squid pose. Flight now clears `grounded`, including the launch tick. Collision and land events still own landing.

`movement-motion.mjs` wraps the real Character `trigger`, `update`, and `_updateSquid`, delegating all captured implementations. The final squid pivot receives a calibrated axial turn/tuck for Roll, charge compression, upward burst stretch, and a top-departure turn. The native wall basis and native flight direction remain responsible for body orientation. Super Jump preparation compresses the squid using the Actor's **actual** preparation duration, including gear modification; flight uses the native airborne squid. The module never writes the Actor's position/velocity, camera, or Character's world root.

The Actor `_finishFrame` hook passes live action objects to the real Character rather than relying on notifications alone. Form return, grounded completion, wall loss, death, reset, special takeover, and Super Jump takeover cancel old offsets. Hidden bodies advance/cancel clocks. Offsets are restored before the next native squid pose and never feed into its springs. The module does not replace walk, feet, `_buildPose`, `_poseAir`, `_poseLand`, or roller IK hooks.

## Official references and conditions

Nintendo's [gameplay page](https://splatoon.nintendo.com/en/gameplay/) describes a charged wall burst and direction-changing Roll. Its actual video objects identify `move05` as **Squid Surge**, `move06` as **Squid Roll**, `move02` as **Dive**, and `move04` as **Squid Spawn**. Spawn footage is not Super Jump proof.

Nintendo's [Japanese technique article](https://www.nintendo.com/jp/topics/article/af825de6-16d5-4653-ba00-a7e775cc54b9) describes leaving ground or a wall while turning, and the opposite-stick/B input while swimming at sufficient speed. Nintendo UK's [corresponding article and videos](https://www.nintendo.com/en-gb/News/2024/September/Beginner-basics-for-Splatoon-3-tips-for-improving-in-battle-2640849.html) provide shooter/own-ink reversal examples. The [official research report](https://www.nintendo.com/jp/switch/av5ja/report/index.html) confirms that Intensify Action shortens surge charge and reduces consecutive Roll speed loss. None provides a joint curve, rotation axis/count, or exact armor duration.

The [11.3.0 update](https://support.nintendo.com/jp/switch/software_support/av5ja/1130.html) fixes excessive lateral movement after departing a wall with Surge. Older clips cannot verify that lateral distance for 11.3.0. The [9.3.0 update](https://support.nintendo.com/jp/switch/software_support/av5ja/930.html) establishes that Squid Spawn armor ends before a subsequent Super Jump lands; it does not establish a flight pose.

Evidence lives under `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-motion-compare-20261002/movement/`. `reference-receipt.json` contains URLs, resolved files, byte counts and SHA-256 for downloaded HTML and movies. `primary-frame-observations.json` records conditions and zero-based decoded frame indices. Selected-frame contact sheets were visually inspected; they are documentary evidence, not inferred numeric defaults.

| Official source | SHA-256 | Observed decoded frames (60 fps) |
| --- | --- | --- |
| [Surge original 1920×1080](https://assets.nintendo.com/video/upload/v1657880121/Microsites/splatoon-3/videos/s3_howtoplay_move05.mp4) | `3fd3fd8f12f71cbe93fb28c04fc3763c110fbd813473259d7f08fe57e4b0b450` | 270–278 attached body; 282 readiness flash; 286–298 attached; 302–306 upward wall motion; 310–322 top departure/air |
| [Roll original 1920×1080](https://assets.nintendo.com/video/upload/v1657880121/Microsites/splatoon-3/videos/s3_howtoplay_move06.mp4) | `9aacbf90a3bd2403192e017f4b7cb9ce37210e544cbbd95065c0037712b8be26` | 78–81 swim splash; 84–99 leaving ink with illuminated turning body; 102–114 changing eye/mantle orientation and return |
| [UK reversal tutorial](https://assets.nintendo.eu/video/private/wcmuyl6pzsbbnxukgtk1.mp4) | `f6cf639febb6bc59308d51bde8a4367e16c5296ea84bec934776245bfdc2387d` | 105–113 splash; 115–123 reverse/jump-spin; 125–133 air travel |

Film release/input/gear conditions remain unknown; timing spans above describe playback observations only. The AIA intermediate missing from the NA site's served TLS chain was supplied after verification against the existing system CA roots; certificate/hostname validation stayed enabled. The leaf, intermediate, and verification receipt are retained.

## Scope disposition

| Action/condition | Actual INKWAVE result | Nintendo comparison status |
| --- | --- | --- |
| Kid→squid squat/dive; squid→kid return | Native visible compression, kid disappearance, squid appearance, return to ordinary scale/foot controller exercised on full rig | Order is observable in Dive/JP footage. Native flourish, scale overshoot, duration and joint angles remain unmeasured; no exact-match claim |
| Kid jump / impact landing | Native Actor land event reaches full bone/IK pose; absorb/recover and planted-foot return measured | Existing procedural air/free-arm/landing curves remain calibration; Switch input-aligned capture needed |
| Dry squid jump | Reversal input produces an ordinary jump, never dedicated Roll; native squid remains visible | No invented special action for dry hopping; dry wiggle amplitude/time unverified |
| Detach from an unpainted/lost wall | Real `_updateClimb` loss cancels surge charge and visible offset | Source's original low hop is not relabeled Squid Roll; exact exit pose/distance unknown |
| Wall Roll | Same dedicated turning layer reached by real wall-roll eligibility, cancels surge | Official ground/wall description supports the action; axis/count and wall-specific timing unverified |
| Roll reversal / completion | Real trigger→full visible pivot turn→normal pose; actual native collision/landing also exercised | Missing motion connection fixed. One axial turn, tuck and profile `.25s` timing are calibration, not measured Nintendo values |
| Surge partial charge / release | Charge fraction controls mesh compression; partial release stretches, no full-charge armor asserted | Fraction/shape curve and burst velocity/time unverified; full no-gear charge endpoint 45F comes from pinned data |
| Surge full charge | Reaches pinned 45F endpoint at 60Hz; variable-dt tests bound to tick resolution; full release and wall-roll takeover measured | Body compression/release shape remains calibration |
| Surge top departure / landing | Real `_ledgePop` triggers a distinct top turn; land/form/timeout removes it | Official attached→rise→top departure order observed. Top rotation curve and automatic-vs-input kid switch not established |
| Super Jump preparation / flight / landing | Preparation shape follows live duration; flight is airborne on launch tick; native trajectory, kid return, actual `_onLand` and root invariance measured | Pinned default charge 80F/flight 138F retained. Kid switch at 82%, trajectory easing, posture and compression are existing/calibrated behavior, not official motion proof |
| Hidden / dead / reset / special / form return | No stranded roll/surge offset; normal full rig resumes; camera-followed root untouched | Engine regression proof only; no Nintendo camera/IK equation claim |
| Network peer display | No network protocol expansion in this lane | Remote action phase transport remains unverified; local body hookup does not prove remote motion parity |

The original raw table omits default acceleration, Roll animation duration, joint/shape curves and armor timing/capacity. Missing entries remain unknown. High/Mid/Low gear endpoints are not interchangeable defaults. Raw distance factor `1` remains uncalibrated. The module's `MOVEMENT_MOTION_CALIBRATION` labels the new shape/turn constants explicitly and does not promote them to numeric bindings.

## Verification and installation contract

`tests/movement-motion.test.mjs` directly installs the module on the actual source Character (full skeleton, squid body, eyes and real IK) and source Actor. Its first cases test Actor updates at 30/60/120Hz. A separate native Physics floor + in-world Character + production `FixedClock` case compares complete 60Hz position, velocity, grounded/phase, squid quaternion/scale and world foot trajectories under 30/60/120Hz rendering. Actor physics stubs in isolated wall/target tests are labeled; the floor test uses native integration/collision. Tests measure visible turn travel, pose deformation, flight direction and landing recovery; finite values or emitted names alone cannot pass them.

Focused command: `node --experimental-vm-modules --test patches/splatoon3/tests/movement-motion.test.mjs patches/splatoon3/tests/movement.test.mjs patches/splatoon3/tests/movement-resources.test.mjs`. Exact-head test logs/hashes and actual file inventory are recorded in `done.json`. Broad CI, generated output and active browser verification belong to the parent integration lane.

Parent installation needs only an import of `installMovementMotion` and `installMovementMotion(api, profile)` **after `installMovement`**. Existing API already supplies Character/Actor/THREE. No adapter/source anchors or upstream edits are required. `adapter-delta.json` contains the exact proposed integration contract. Prototype installation is idempotent; live Actor frames provide authoritative cancellation.

## Measurements still needed

Capture 11.3.0 Switch footage at 60fps with gear AP/weapon/stage and frame-aligned input receipt. Use a fixed camera and a side/front pair of views; record neutral bone landmarks, ink boundary, wall top and body center. First compare the tick of input, lift-off, readiness flash, wall departure, mantle/eye orientation change, impact, and return. Fit an axis/count/angle trajectory only after compensating camera motion and checking duplicate/slow-play frames.

For Roll, test ground and wall directions separately at speed thresholds, reversals/90° turns, and repeated input. Distinguish defense end from visible rotation end. For Surge, release at 0/15/30/44/45F with 0AP, then pinned Mid/High endpoints, record wall distance and top exit, and repeat lateral input after top on 11.3.0. For Super Jump, record preparation with/without Quick Super Jump and fixed-distance target, mantle direction, kid-switch tick, impact and feet recovery; record manual firing/form input separately. For transforms/jumps, run dry/own/enemy ink, wall loss, low/large falls, repeat rapid form toggles, and inspect both shoes and weapon anchors after return. A same-input local/remote capture is needed before claiming network motion parity. Without those receipts these points stay unverified.
