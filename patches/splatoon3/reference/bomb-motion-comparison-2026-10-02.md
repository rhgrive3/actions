# Bomb hold, release, recovery and physical origin

This component fixes two measured inconsistencies in the public INKWAVE rig: the arm started another cock after the actual projectile already existed, and the fixed actor offset used for bomb creation/preview was about 0.6 world units away from the physical throwing prop. The change aligns the native release curve with the real runner event and uses that same native rig sample for creation and preview. These are implementation consistency corrections and visual calibration. They are not a measurement of unpublished Splatoon 3 joint animation or a certification of Switch animation parity.

## Primary reference and remaining uncertainty

Nintendo's [basic controls guide](https://www.nintendo.com/jp/games/feature/splatoonqa/guide_basic/index.html), [Splatoon 3 introduction](https://www.nintendo.com/jp/switch/av5ja/index.html), [first-time guide](https://www.nintendo.com/jp/ichikara/av5ja/index.html), and [weapon introduction](https://www.nintendo.com/jp/topics/article/2e33bbea-9aec-4df5-a5bc-3d062051bce4) provide the primary comparison context. The basic guide's `ZNcLehKqvhI` sub-weapon embed previously returned `LOGIN_REQUIRED`; its retained response and hashes were verified, and that access restriction was not bypassed. The retained poster is a title card, not a motion observation.

Fresh public Nintendo assets were downloaded and their one-second contact sheets visually inspected:

| Asset | Public source | SHA-256 | Inspected selections |
| --- | --- | --- | --- |
| Top introduction | [movie_pc.mp4](https://www.nintendo.com/jp/switch/av5ja/assets/images/index/movie/movie_pc.mp4) | `6a62fa1d074c19a0f8d35a6f334691decff7ac7e29110b6fff7c5c31302386dd` | 0–7 seconds, 30 fps source |
| Turf War introduction | [nawabari_pc.mp4](https://www.nintendo.com/jp/switch/av5ja/assets/images/index/movie/nawabari_pc.mp4) | `5e933a5ce4b6695ca07b12777298ad5bf5eee82b5ce50ba0f90141382d5e8640` | 0–25 seconds, 60 fps source |
| Human/squid introduction | [modal_pc.mp4](https://www.nintendo.com/jp/switch/av5ja/assets/images/index/ikatohito/movie/modal_pc.mp4) | `294c6713400be43793f989f897dfae633bcc2744a369849bd0ec14c77b28e807` | 0–12 seconds, 60000/1001 fps source |

These assets did not yield a clear close-up bomb hold/release sequence. Nintendo's first-time guide photographs [007](https://www.nintendo.com/jp/ichikara/av5ja/photo/01/007.jpg) and [008](https://www.nintendo.com/jp/ichikara/av5ja/photo/01/008.jpg) show a Splash Wall and a Killer Wail respectively, and cannot establish a Splat Bomb throwing hand. Other official embed endpoints returned 403, and the US gameplay page failed TLS chain verification; neither is positive motion evidence. Consequently the original game's holding hand, exact release arm/torso angles, anticipation duration and recovery duration remain unverified. The public model's left hand remains provisional; it was not swapped on inference from unrelated frames.

The freshly verified [version 11.3.0 extracted Splat Bomb parameter table](https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponBombSplash.game__GameParameterTable.json), pinned to commit `7280ff9cde8bb1c5dcef46c700c326471584d2e6`, has SHA-256 `d2a7e096d8e3ba3b5bef7774c7b62d1e9cb252b054650317955fa38f90658f97`. It provides gameplay data, not joint curves or a spawn attachment: `BurstFrame=60`, `FlyGravity=0.016`, `SpawnSpeedY=0.24`, and horizontal speed scaling are present. This patch changes none of those mappings or the chosen gameplay profile.

## Comparison against the actual source

| Condition | Measured public source | Result | Classification |
| --- | --- | --- | --- |
| Real release event | `WeaponRunner.update` consumes 70 ink, triggers `throw`, and immediately calls native `Projectiles.throwBomb` | Same event and input tick, unchanged speed/direction/fuse/cost; the first release arm presentation is already in whip/follow-through | Event synchronization; curve age is calibration |
| Native throw curve | `_poseThrow` starts with cock even though creation already happened | Its existing age `0.10` is evaluated at actual release; native aiming supplies anticipation | Native visual calibration, not Nintendo frame timing |
| Recovery | Native throw curve fades out at `0.62` | Shifted recovery lasts `0.52` seconds, then native carry/IK resumes | Native visual calibration |
| Main attack plus sub | Main slosh/weapon overlays can reclaim the held/free left hand | The owned hold/throw overlay is applied once after native main overlays | Rig presentation priority |
| Dualies hold/recovery | A partially shrinking left pistol overlaps the bomb or floats while the hand throws | Native pistol is fully hidden while holding and recovering, then its native damped return resumes | Presentation calibration |
| Creation/preview origin | Both use `actor.pos + (0,1.35,0)`, separate from the physical native prop | Both use the identical native release prop center at current actor position/yaw | Model/game origin consistency correction |
| Bomb arc gravity | The source arc uses `24` while the existing calibrated physical bomb uses `SUB.bomb.gravity=57.6` | The bomb-only arc reads that same existing profile gravity | Physics/preview consistency; physical gameplay unchanged |
| Render/collision/network/event position | All derive from native `pos` | One supplied position is corrected before native creation; all still derive from it | Existing native contract maintained |
| Hidden/form/death/cancel/reset/swap/dispose | Held clocks/flags could persist across transitions | Owned state clears; current real held input starts fresh after return | State lifetime correction |

`0.10`, `0.62`, `0.52`, hand choice and joint curves are explicitly not claimed as official Nintendo animation parameters. The held triangular prop and airborne body remain the source's original indexed geometries; this component does not claim a matching official model silhouette.

## Pose-only sampling and integration contract

The adapter exports `CHARACTER_BOMB_POSE = Object.freeze({ throw: Character.prototype._poseThrow, apply: Character.prototype._applyPose })` from the exact native Character module before installers wrap its methods. The installer receives that registry and the exact native `T_THROW`; it is connected after `installWeaponMotion`. No private channel/timer order is guessed.

Own prototype stamps using `Symbol.for('inkwave.s3.bomb-motion.install.v1')` and a separate Runner reset symbol prevent duplicate decoration even when another VM realm imports a fresh installer module. The Character stamp retains the original state/curve registry so second-realm snapshot/origin helpers read the real active installation rather than an empty private WeakMap.

The native release curve runs on isolated reusable pose buffers. Its native rig application runs in a transaction with weapon/face/hair/tank/jiggle/finger simulation disabled. It does not call `Character.update`, `Actor._finishFrame`, root tracking, input processing, state advancement or gait stepping. Bone/weapon transforms and matrices, all direct scalar/vector/quaternion/typed-array state, foot contact/display data, head bookkeeping, IK errors, springs, hair velocities and native root history are restored, including exception rollback. The buffers, field banks and bone snapshots are cached per Character and reused for every preview. External scene matrices are not updated by the sample.

The source hook calls `bombReleasePosition(a, pos)` immediately after the unique bomb-only native candidate is constructed, before the mesh/network/event creation. The preview calls `bombPreviewPosition(a, p)` immediately after its native candidate is constructed. Missing rig, opt-out, any hidden ancestor in the rig hierarchy, squid, dance and dead presentation retain that candidate. Native nullable/show-false/dead arc guards remain in place. The storm's separate `+1.45` origin is untouched. The parent also connects the unique bomb-only arc gravity line to `SUB.bomb.gravity`; this matches the existing physical bomb rather than changing its gameplay parameters. The native semi-implicit Euler integrator, 60 Hz step and one drawn vertex per two steps remain unchanged. Original-game trajectory parity still depends on the selected profile's calibration.

## Verification and limits

Run the focused actual-source tests with:

```sh
node --experimental-vm-modules --test patches/splatoon3/tests/bomb-motion.test.mjs
```

The suite installs production once in one VM and then installs this owned component once in that same realm, exercising exact proposed adapter hooks without editing the shared adapter. It constructs the real Actor, WeaponRunner, Character, Projectiles and original rig. Assertions cover immediate release at 30/60/120 Hz after both one-frame and longer holds; unchanged ink cost, native velocity, fuse and age; actually drawn indexed vertices and native arm reach errors; dualies grip recovery; combinations with shooter/dualies/slosher/charger/splatling/roller; cancel/empty/hidden/form/air/reset/death/swap/dispose; pause; identical fixed-60-Hz traces under variable render intervals; native arc/creation origin equality; complete rig preservation during repeated previews with active Flow; and exception rollback. All 64 actual native arc BufferAttribute vertices are compared with the real `_updateBombs` position every two 60 Hz ticks through 126 ticks with no collisions. Each vertex equals the actual physical position after Float32 storage rounding; repeated previews leave that existing bomb's age/fuse/position/velocity and Character clocks unchanged.

A moving 65-tick slosher throw trace is compared exactly with an otherwise identical control that skips sampling. Contacts, cadence, native `rp/rv/ra`, yaw, pose, springs, hair, clocks and invocation counts match, with one normal Character/root/feet/hair/weapon tick and one real slosher volley. This specifically guards against the previous proposed `update(0)` approach consuming movement/root history or duplicating impulses.

A separately imported installer in another VM realm is applied to the same real Character/Runner and must preserve all original hook references and active helper state. A composed left support-arm solver with independent WeakMap state is observed across six weapons: native release sampling leaves `IKL/LTW` free at curve age `0.10`, never invokes that correction, and preserves its state. The parent must additionally run these tests with any later weapon detail installer in the final combined installation.

Durable receipts, primary files, contact sheets, test logs, per-release indexed-geometry measurements, integration instructions and their SHA-256 manifest are under `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-motion-detail-20261002/bomb/`. This component's evidence is actual-source logic/rig geometry, not an actual WebGL draw certificate. The parent owns combined installation, generated output, independent review and actual WebGL/browser gates. Remaining original-game motion uncertainty requires a clear unrestricted primary bomb sequence; it is not silently declared fixed by these implementation tests.
