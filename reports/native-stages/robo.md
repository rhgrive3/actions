# バイガイ亭 / Robo ROM-en — local inferred source stage

The pinned source is reviewable as a local playable stage in all five modes.
The final immutable pair consumes accepted foundation `3249d6dc`, including the
current-main `14f9f913` refresh, source-triangle projectiles, v4 polygon ownership,
ink-edge alpha, ordinary floor/jump following, moving Tower rider guards and
source-qualified Clams collection. All 17 final browser checks passed. This is
an INKWAVE implementation check; complete Nintendo retail parity is unverified.

The implementation is [robo.json](../../patches/native-stages/definitions/robo.json),
the source regressions are [robo-source.test.mjs](../../patches/native-stages/tests/robo-source.test.mjs),
and the exact numeric receipts are [robo-verification.json](robo-verification.json).
No reference model, texture, derived geometry or screenshot is committed.

## Source and identity

- KiTrix commit `0611f51b35c9736ee986fb2218461e2585b7875e`, stage tree
  `53a94ccb7abc115382c208b540ac45728ba914d9`, internal `Vss_Cross00`.
- OBJ: 99,915,303 bytes, SHA-256
  `8dacb74311fc9af52fbcebbb37038246871dfc7ad633830b16d62eb57d7e655e`.
- MTL: 47,113 bytes, Git blob `275cbdbb21299ce909b82e9b407e4592916afc3b`,
  SHA-256 `3d6b76dbaebfca234b040320cbcc12d70195871efccf3f0b53203d1b91ba4b87`.
- Isolated LFS access returned `Resource not accessible by integration`; pinned
  public media succeeded with the complete LFS digest. The shared source checkout
  was not changed.
- `VersusSceneInfo-1130.json` row 21/season 6 and `SceneInfo.json` name/preload
  `Model/Fld_Cross00.bfres` establish identity only. `version1130Verified:false`.

Independent streaming comparison verifies every signed Float32 position, normal
and UV bit, including negative zero and positive-zero insertion only where UVs
are absent. All 1,759,113 uint32 indices and original normal/UV face references
match, including inactive alternatives. The original has 867,672 vertices,
586,371 triangles and 545 objects. All 202 original PNG blobs match pinned Git
hashes; all 151 used PNG copies also match. Python and worker conversion agree.
All 163 final copied source files, totaling 67,676,722 bytes, are SHA-256 equal
to the preserved v4 calibration. No source fidelity was reduced.

## Supported pads and source semantics

Source bounds `[-75,-39]–[75,39]` and opposing pads
`[-60,7.505000114440918,22]` / `[60,7.505000114440918,-22]` remain unchanged.
Original Lowroof triangles, upward normals, actual body clearance, foot support
and directed routes qualify these local inferred pads. An unsupported earlier
X=-69 candidate was rejected. Coordinates are raw source units, not verified
meters or retail placements.

| Selection | Original source evidence | Result |
| --- | --- | --- |
| `^Fld_Cross00_(?:HokoSet|HokoAsariSet|Tclobj)_` | 89 overlapping rule-alternative objects | Inactive local common selection; all original render attributes/indices retained |
| `^Fld_Cross00JerryMannequin_` | 50 distant/deep scenery subobjects | Visible, excluded from inferred collision/paint |
| Explicit NoPaint/Nopaintable, MetalNetwork00/NetParts00 and `^Fld_Cross00_GeneralCube_.*GeneralBoxNoPaint_` | Original names; FenceVinyl suffix alone misses the named NoPaint models | Display and collision preserved; corresponding inferred charts omitted |

Exactly two active Pnt GeneralBoxNoPaint models occupy
`[-6,7.5,-19.5]–[6,9,19.5]` and `[-52.5,6,-31.5]–[52.5,12,31.5]`.
Six other matching alternatives were already inactive. This narrow classifier
removes 520 charts/3,584 chart-grid cells without changing display or collision;
`_nb` is not classified as NoPaint. Final conversion has 107,020 collision
triangles, 32,767 BVH nodes, 23,685 charts, 1,181,405 grid cells and 584,771 valid
cells. Directed navigation retains 5,984 valid/5,551 paintable nodes from 8,064
candidates; decorative lower-hull supports remain excluded.

## Final behavioral verification

The asset-enabled serial CPU matrix passed 121 tests, with 22 named optional
fixtures unavailable and zero failures. Both private and public packages passed
9/9 checks with zero skips and existing startup budgets unchanged. Exact skips,
software environment, scripts, source pins and artifact hashes are recorded
numerically. Optional VM source-motion warning tokens are distinct from actual
browser errors; every final browser check reported zero errors.

- The actual `Game._frame` clock updates Actor at fixed 1/60 while render
  cadence varies across 30/60/120. All six opposing-bank bot routes arrive on
  the original 95/96-node paths without goal replacement or refill replans.
  Team 0 takes 29/28.9833/28.9833 seconds; team 1 takes
  29.8667/29.85/29.85 seconds. Each fresh match has eight real actors/seven bots,
  zero-AP Shooter and initially empty ink. Other brains are frozen in isolation
  probes while every actor keeps normal physics; no later pose/velocity/ink
  writes enforce arrival.
- Physical pointer-lock mouse and keyboard drive human walking, a 90-degree
  turn, gravity departure, source-foot arrival, release and painting at all
  three cadences. Each produces 14 shots/37 natural splats. The 30 Hz endpoint
  uses an original curb and 60/120 Hz use the adjacent slope, differing by
  0.196 source units. Both original pads, native axis, minimap and source Nav
  are verified. Camera menu/physical launch and real WS both-team cases give
  nine supported landings, minimum axis alignment 0.9990373 and 1,207 packets;
  legacy Tidewater camera behavior is preserved.
- Real Character/Actor/WeaponRunner/Projectiles Shooter fire reaches the original
  duct wall at `[52.5,8.883333,-37.5]` from supported stance
  `[45.5,7.833333,-37.5]`. Each cadence admits 15 shots and claims
  136/120/119 new live wall cells. The retained old-runtime negative emits
  15 shots with zero target-wall cells. No fixed world-Z muzzle or manual splat
  substitutes for these shots.
- Three genuine partial-polygon wall impacts claim v4 cell 18,044 on face 906,
  which the old mask omitted; the same-cell outside-polygon sample stays zero.
  Original GeneralBoxNoPaint triangle 47,638 produces no chart/ownership, and
  uncovered cell 217 stays zero. Separate actual 1/60 Actor/Character weapon
  interactions paint an own wall, climb through ordinary squid input, then
  admit one enemy Shooter overwrite and release on frame 5.
- Physical menu selection starts all five modes and launches the human. Seven
  normal bots remain active for ten simulated seconds with production rules.
  The Zones observation has one naturally dead HeavyBrush bot; its preceding
  grounded position is recorded, without forcing survival or inventing cause.
  Controlled ranked-rule integration remains separate from natural objectives.
- Six genuine Tower cases walk from the original opposing pads, board, ride
  and progress beyond 0.99, with actual current-world rider/deck support and
  19,652 continuous source/rider capsules. The walking map has zero special
  traversal dispatches. Physical KeyW/conditional Space boarding, all 43 route
  nodes/three segment interiors, 338 capsule checks, swept deck/pole/rider
  clearance and both source-axis halves also pass. Retail Tower placement is
  unverified.
- Six fresh Clams cases naturally form a Power Clam in approximately 16 seconds
  from original banks, with no inventory/goal/pose overrides. The observed
  seven small clams precede the eighth-to-Power conversion. Source-qualified
  collection and local rules pass; autonomous basket scoring is not claimed.
- All five modes use two real browsers and production RoomDurableObject WS.
  Each complete ink grid settles SHA-equal: 1,181,405 bytes in four modes and
  1,181,505 in Tower, including its 100 dynamic deck cells. Ranked counts also
  agree. The host uses Luna radius 3.84. Deliberate ordered ground
  paint and controlled rule actions are integration controls, not autonomous
  scoring proof.
- Actual public source-menu download/conversion/cache works without a second
  OBJ fetch. Altered-source and corrupt-binary failures preserve the prior
  complete world. Quality changes, cancellation, native/legacy cleanup,
  fingerprints and 844×390 touch HUD pass. Touch p50/p95 19.4/62.2 ms is a
  SwiftShader diagnostic; mobile hardware was not measured.
- Three static source views give A/A, B/B and A/B zero changed pixels. Twelve
  moving cameras exercise index rebuilding; they are not per-frame pixel
  comparisons. The native alpha check restores 9,756 source pixels and removes
  9,756 old opaque fringe pixels. Its isolated 269 opaque centers have zero RGB
  differences; the complete source comparison retains 14 differing pixels.
  Actual human, camera, ink-edge and touch screenshots were inspected privately.

## Performance and retained limits

The fixed-seed window in
[check-inkwave-robo-performance.mjs](../../scripts/check-inkwave-robo-performance.mjs)
records seed `0x53a94ccb`, all eight real loadouts/zero AP and active mixed bots,
120 warmed frames and 180 measured 60 Hz frames. KeyW/fire are held for 90
frames and released for 90. Low quality uses atlas 2048/4 pixels per source unit,
minimap on, shadows/bloom off and opposing-axis camera/pitch 0.2. Final scene
render is excluded from frame samples, but paint GL/FBO work and driver stalls
remain included. This is instrumented software runtime cost, not pure CPU logic
or physical-device FPS.

| Human weapon | Frame p50 / p95 / max ms | Separate render drain ms | Character inclusive ms | Paint simulation inclusive ms | Ownership inclusive ms |
| --- | --- | --- | --- | --- | --- |
| s3-blaster-short | 21.9 / 63.4 / 1089.4 | 2996.8 | 1967.0 | 3054.3 | 365.4 |
| shooter | 23.3 / 52.0 / 63.4 | 3244.4 | 2154.1 | 456.8 | 174.7 |

Nested method times overlap. Queues, actors, grid/owner/order hashes, turf/special
gains, radii and object groups are frozen before the separate flush/render drain.
Observer grouping cost and system/load/cgroup snapshots are recorded separately;
other CPU activity between boundaries is not excluded. Both mixed-bot windows
retain large software-driver tails. Different human loadouts are not a matched
before/after optimization comparison.

Historical unseeded 47.8/86.8 ms and earlier seeded windows retain their exact
older artifact/loadout scope. The unseeded diagnostic cannot serve as a causal
control. A private ancillary prefilter had no proven matched-state benefit and
was discarded; no paint optimization, lower fidelity or physical FPS claim is
promoted. The preserved old Game-clock floor-corner failure and six matched
source-equal repair positives support the accepted floor correctness change;
older raw Actor-dt failures remain logic stress, not production cadence failures.
Private highDrops/Drop prototypes remain unadopted, with original pads and all
source-navigation flags unchanged.

The exact artifact code head is `888eb844d1b36657d5f559c5e8ece163ff40b882`;
later own commits correct harness waits/assertions and reports only. Private
revision is `4589e03e375bb98581764d5e9d9537fd3dc6ae9b45e6fa0c77bdecbb9c53f310`,
public revision `b2196a3519aff05d017793b3842cfe2914c17115eeca04e64dc3f3df256eb1e7`,
shared native runtime `2a60e63893bd660bb16b89729e0ae751102e33d961483b911f93a85cfd9c4778`.
Later grounded-form `0c39e684` and forthcoming main `18ce7b6c` compatibility
require affected aggregate checks; these 3249/14f receipts are not relabeled.

Retail extraction/version date, metric units, native collision, paintability,
grates/climb masks, spawn/ranked placements, native material shaders, moving
objects, restaurant lighting and hardware performance remain unverified.
Original floating bowls/mannequin poses and the stock surrounding environment
visibly differ from a complete retail scene. No transforms, geometry or
half-arena pads are invented to conceal those differences.
