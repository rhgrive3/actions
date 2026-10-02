# Squid Roll motion comparison — 2026-10-03

Scope: the public `inkwave-public/` Squid Roll body turn, launch direction,
silhouette, recovery and chained action restart. Foundation
`5cdc815c923e2e6e0a9860bcfec6a4734a089657`. This separate runtime module composes
with the existing movement module; it does not retune gameplay or other motions.

## Fresh primary material and comparison conditions

- [Nintendo UK beginner battle tutorial](https://www.nintendo.com/en-gb/News/2024/September/Beginner-basics-for-Splatoon-3-tips-for-improving-in-battle-2640849.html),
  retrieved again 2026-10-03 Asia/Shanghai. The page still links the
  [reversal video](https://assets.nintendo.eu/video/private/wcmuyl6pzsbbnxukgtk1.mp4).
  Fresh video SHA-256:
  `fb7a3ca80ed3f6ecd268ef0980c2520cf9cffc12ad929e0cd830b57980fd7561`;
  1920×1080, encoded 60 fps, 680 frames. This is a new byte receipt, not an
  assumption that yesterday's video bytes persisted unchanged.
- [Nintendo's Japanese battle tutorial](https://www.nintendo.com/jp/topics/article/af825de6-16d5-4653-ba00-a7e775cc54b9),
  retrieved again. It describes rotation when leaving ground/walls, quick
  direction changes and briefly reduced damage; its documented input condition
  is a fast swim followed by opposite stick direction and jump. Article
  conditions are as of 2024-04-01, Joy-Con grip or Pro Controller. It supplies no
  skeletal angles, turn duration, armor curve or world-unit dimensions.
- [Nintendo's research report](https://www.nintendo.com/jp/switch/av5ja/report/index.html),
  retrieved again. Intensify Action reduces the speed loss from repeated Rolls.
  That supports retaining the native chain/action state; it does not specify a
  chained animation angle, a new clock or exact animation restart frame.
- [Nintendo NA original-resolution Roll clip](https://assets.nintendo.com/video/upload/v1657880121/Microsites/splatoon-3/videos/s3_howtoplay_move06.mp4):
  retained material from the preceding task, rehashed before reuse and copied
  into this lane's persistent evidence. SHA-256
  `9aacbf90a3bd2403192e017f4b7cb9ce37210e544cbbd95065c0037712b8be26`;
  1920×1080, encoded 60 fps, 420 frames. This clip was **not** freshly downloaded.

The local profile targets 11.3.0 and its existing gameplay duration is 0.25 s.
The Nintendo clips' executable versions, weapon loadouts, gear AP and physical
stick traces are unknown. Visible conditions: yellow own ink, squid form,
fast ground swim, reversal, airborne turning body, return to ink. The tutorial
captions describe opposite-stick plus B input. Film PTS/frame numbers below
identify decoded material; they are not input-aligned game frame measurements.
Possible slowed playback and camera movement prevent timing extraction.

Evidence root:
`/mnt/workspace/.dev-state/agent-work/evidence/inkwave-motion-detail-20261002/terminal-squidroll/`.
`fresh-primary-source-receipt.json`, `fresh-uk-page-receipt.json` preserve fetch
times, URLs, sizes and hashes. `verified-official-roll-pts.json` and
`fresh-official-direction-pts.json` retain decoded PTS. The contact sheets are
`official-roll-frames.png` and `official-direction-frames.png`.

## Observations, divergences and corrections

| Item | Nintendo evidence | Actual public implementation / reproduction | Correction and play effect | Status |
| --- | --- | --- | --- | --- |
| Airborne turnover | NA frames 80–120, PTS 1.333333–2.000000 s: mantle, eyes and exposed tentacle undersides change vertical orientation during departure and return. UK frames 112–152, PTS 1.866667–2.533333 s: reversing squid leaves ink, turns, travels back and re-enters. A turnover is a qualitative visual inference from the film, not an extracted rotation matrix. | `movement-motion.mjs` multiplies the ordinary squid pivot by a rotation about local `(0,1,0)`. The native squid mantle runs along local +Y (`character.js` `_updateSquid`); thus this axial turn cannot flip that mantle vector. Swim forward in own ink, reverse + jump, inspect the real squid body. | `squidroll-motion.mjs` removes only the existing Roll axial offset, then rotates the actual pivot about the horizontal transverse axis of launch travel. The body reads as an airborne somersault. | Confirmed engine divergence; qualitative original turnover observed; exact axis/sign/count/angle curve calibrated. |
| Launch direction | The UK tutorial shows fast reversal followed by travel back; the official Japanese article documents quick direction change. | Native `_trackRoot` damps travel direction and `_updateSquid` further damps `sqYaw` / `sqQuat`. The original Roll layer only adds axial spin, so the visible mantle can continue facing the previous travel direction. | Capture read-only `actions.roll.vx/vz` once per native action; orient the visible body in world space toward that launch direction. Model/root yaw changes cannot rotate the chosen direction or world turn axis. | Launch direction regression measured on actual native source; exact Nintendo orientation-lock timing unknown. |
| Compact silhouette | NA sequence alternates long and compact appearances, including changing eyes/undersides. Perspective, ink FX and deformation cannot be separated into exact original model dimensions. | Native airborne squid remains stretched along its mantle; existing Roll applies only a 12% longitudinal tuck and long-axis turn. | A 22% calibrated longitudinal tuck with compensating transverse expansion makes the turning silhouette more compact while retaining native indexed body, eye and dark meshes and native shader tentacle wave. | Visual calibration only. Original tentacle curl, mesh topology and exact body dimensions remain unknown. |
| Recovery | Both clips show the turn returning to ordinary travel/ink entry. | The legacy offset restores its base pose, but a new layer must also respect earlier Actor reset/death restoration and hidden-body cancellation. | Direction lock releases during the last 35% of the existing action. The full turn and tuck return to identity at completion. Offset restoration checks the previously applied outputs so an Actor's earlier death/reset restoration is never overwritten with a stale Roll pose. | Native completion/hidden/death regression tested; original recovery curve and readiness timing unknown. |
| Chaining | Official report describes repeated Rolls and gear-dependent speed loss. | Native `movement.mjs` owns `actions.roll`, velocity, chain count, duration and gear retention. Reusing an old visual direction would make a lateral second Roll misleading. | A fresh action object or preview trigger starts a fresh direction capture; no new gameplay or animation clock is introduced. | Native chained action/direction restart verified; original chained posture continuity and input window unmeasured. |

## Runtime contract

Export: `installSquidrollMotion(api, profile)` and
`squidrollMotionSnapshot(character)`. Install immediately **after**
`installMovementMotion(api, profile)` in the same production module realm,
before subsequent squid-pivot layers. Other pivot layers must gate the Roll
branch to keep ownership exclusive. Existing public `movementMotionSnapshot`
and `MOVEMENT_MOTION_CALIBRATION` exports supply the legacy action phase/age,
turn and tuck. No adapter anchor or upstream-source edit is required.

The module only changes `squid.pivot.quaternion` and `squid.pivot.scale` while
the existing movement layer selects Roll. It restores its output before the
next native pose update. Ordinary swim, wall Surge and Super Jump are delegated
unchanged. Gameplay action objects, physics, root/world position, native pose
springs, input, ink, HP, weapon runner and projectile/bomb clocks are read-only.
Weapon/form/sub interruptions suppress the old live Roll until a fresh action.
There are no new scene objects, GPU allocations, event listeners or timers.
`Symbol.for` guards each actual prototype against duplicate module realms;
dispose restores owned output and deletes its weak state.

One turn, forward sign, smoothstep angle curve, 22% tuck, final-35% direction
release, the existing 0.25 s profile duration and retained native flight pitch
are **game-engine visual calibration**, not verified Splatoon 3 parameters.
Standalone previews use their trigger duration and public `localMove` when no
Actor action exists. Zero-direction previews retain a labelled native-pose
fallback. The actual Actor launch velocity remains authoritative in play.

## Verification and remaining work

Focused command:
`node --experimental-vm-modules --test patches/splatoon3/tests/squidroll-motion.test.mjs`.
The test uses one actual production installer/THREE/Actor/Runner/Character
realm, the full native rig and native Physics on a flat owned-ink floor.
Projectile emitters and paint lookup are fixture services; body integration,
collision, landing, posed bones, native two-bone IK and indexed geometry are
real source. It compares complete gameplay state, native clocks/springs, body
and weapon transforms, real IK output and a natively skinned drawn vertex
before/after. Squid geometry proof evaluates the actual vertex-shader wave
against drawn indexed body vertices, eyes and dark meshes; it is CPU posed
geometry proof, not GPU/browser proof.

Regression coverage: turnover instead of long-axis spin; immediate visible
reversal; native collision/landing and recovery; fresh chained lateral launch;
one-realm composition; duplicate-realm installation and snapshot; nullable
previews/custom duration; pause/dt0; direct 30/60/120 Hz previews; exact 60 Hz
physics/pose trajectories under 30/60/120 Hz FixedClock rendering; reset, death,
form, sub, weapon, hidden-body, Surge and Super Jump interruption; disposal;
byte-identical ordinary swim/Surge/Super Jump poses. Exact results and hashes
are in the lane's `done.json`; failed development logs remain evidence.

Parent owns installer wiring, incorporation into
`reports/inkwave-splatoon3-behavior-2026-10-02.md`, combined lane tests,
exact-SHA build/CI and active browser verification. The lane receipt must not
be represented as those completed integration checks.

Native measurement (60 Hz replay, existing profile): at 0.117 s the mantle's
world vertical component changes from +0.498 before to -0.741 after, and RMS
displacement across 4,409 native body vertices is 0.325 engine units. By
0.283 s the before/after indexed body coordinates are identical again. These
are local engine pose measurements, not Nintendo units or timing. Kid return
executes the actual native two-bone solver and checks the drawn skinned vertex,
posed bones, grip and IK errors. Side/oblique CPU triangle contact sheets are
saved as `native-roll-before-after-side.png` and
`native-roll-before-after-oblique.png`; their receipt explicitly excludes GPU
material/render parity.

Still needed for original parity: 11.3.0 input-aligned Switch capture with
weapon, gear AP, camera and stick conditions; forward/reverse/lateral/diagonal
ground Rolls and wall Rolls; repeated Rolls at matched speeds; slow/normal
playback distinction; turnover axis and direction in 3D; mantle/eye/tentacle
shape landmarks; animation completion versus armor expiry versus firing
readiness; manual form/sub interruption; remote-peer action transport. Current
clips do not justify exact numerical parity or closing these unknowns.
