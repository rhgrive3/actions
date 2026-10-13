# バイガイ亭 / Robo ROM-en — native source comparison

`robo` uses the original `Vss_Cross00` display export in its original coordinate
system. Local supports and gameplay semantics are inferred. This is not a
recovered Nintendo 11.3.0 collision or placement asset.

Verification is still in progress. The immutable checks below used accepted
foundation `7ddb538a`; the branch also consumes the later accepted bounded route
search. The PR remains a draft until both natural opposed-bank routes and the
accepted ink-edge correction pass on the final composed artifacts.

## Source and identity

- KiTrix repository: `kirakira-dev/KiTrix`, commit
  `0611f51b35c9736ee986fb2218461e2585b7875e`.
- Stage tree: `53a94ccb7abc115382c208b540ac45728ba914d9`.
- OBJ: 99,915,303 bytes, SHA-256
  `8dacb74311fc9af52fbcebbb37038246871dfc7ad633830b16d62eb57d7e655e`.
- MTL: 47,113 bytes, Git blob `275cbdbb21299ce909b82e9b407e4592916afc3b`,
  SHA-256 `3d6b76dbaebfca234b040320cbcc12d70195871efccf3f0b53203d1b91ba4b87`.
- An isolated LFS smudge returned `Resource not accessible by integration`.
  The pinned public media URL succeeded with TLS/proxy preserved and its complete
  content matched the LFS OID. The shared source checkout was not edited.
- `VersusSceneInfo-1130.json` identifies `Vss_Cross00` as ID/display order 21,
  season 6. The 1130 `SceneInfo.json` row supplies the name バイガイ亭 and preload
  resource `Model/Fld_Cross00.bfres`. These establish identity only.

The independent original text stream matches the signed Float32 bits of all
867,672 positions and normals, aligned UV streams (including negative zero and
explicit zero insertion only for objects without UVs), and all 1,759,113 uint32
face indices, including
inactive rule alternatives. The preserved source has 586,371 triangles in 545
objects. Every one of the 202 source PNGs matches its pinned Git blob; all 151
PNG files used by the conversion also match their copied bytes and SHA-256.
No OBJ, MTL, PNG, derived geometry or screenshots are committed.

## Local playable supports and selection

The source arena extends primarily along X. Bounds `[-75, -39]–[75, 39]` follow
the common floor and side-floor subobjects. Both inferred pads lie on the actual
`Lowroof` floor at approximately Y=7.505: `[-60, 7.505000114440918, 22]` and
`[60, 7.505000114440918, -22]`. Downward source-triangle rays, upward normals,
capsule clearance and directed paths verify their support. An earlier candidate
at X=-69 had no floor at the proposed height and was rejected.

| Selection | Source evidence | Effect |
| --- | --- | --- |
| `^Fld_Cross00_(?:HokoSet|HokoAsariSet|Tclobj)_` | 89 objects explicitly named for ranked alternatives; their floor/wall extents overlap the common arena | Inactive for the local common display selection; original attributes and indices stay intact |
| `^Fld_Cross00JerryMannequin_` | 50 mannequin subobjects include distant/deep scenery poses; some source bounds extend well outside the common floor | Visible source scenery, excluded from inferred collision and paint |
| Source material suffixes containing `NoPaint`/`Nopaintable`, `MetalNetwork00`/`NetParts00`, and `GeneralCube` models named `GeneralBoxNoPaint` | Explicit original source names; the two Pnt GeneralCube models use `FenceVinyl` materials whose suffix alone does not expose their NoPaint name | Keep display/collision; omit inferred ink charts |

The two active GeneralBoxNoPaint source bounds are `[-6, 7.5, -19.5]–[6, 9, 19.5]`
and `[-52.5, 6, -31.5]–[52.5, 12, 31.5]`. Respecting their names removes 520
inferred charts and 3,584 chart-grid cells, preserving every display and collision
triangle. Other matching rule variants were already inactive.

The `Lowroof`, `Highroof` and extension subobjects retain their source positions.
Their retail visibility and moving states are not reconstructed. Source display
selection, static collision and ink chart semantics are inferences; no simplified
floor strips, relocated props or guessed retail pads are added.

## Behavioral checks

The implementation is [robo.json](../../patches/native-stages/definitions/robo.json)
and the dedicated regressions are
[robo-source.test.mjs](../../patches/native-stages/tests/robo-source.test.mjs).
The numeric record is [robo-verification.json](robo-verification.json).

- Existing Actor, NativePhysics, PaintSystem, NavGraph, BotBrain, ranked rules,
  renderer, controller, minimap and network paths are exercised on the converted
  source. The shared source tests compare Python/worker positions, indices,
  collision flags, normals, object mapping and polygon masks exactly.
- The source wall test paints an exported wall, grants squid climbing velocity,
  then overwrites it with enemy ink and verifies release. Polygon ownership holes
  stay zero. These are local logic checks, not measured Nintendo movement curves.
- Both teams complete opening/death launch and landing at 30/60/120 Hz, with
  default fixture Shooter and no added gear abilities. Existing bot slots 0 and 3
  include retained combat aim on death. Human and bot targets point into the
  supported arena; actual source body/ground queries validate their landing.
- Both teams walk for 0.5 seconds at full opposing-pad input and stop for 0.5
  seconds at 30/60/120 Hz. They remain alive and grounded; endpoints stay within
  0.25 source units of the 60 Hz run. Retail acceleration, stop distance, micro
  input and foot placement remain unverified.
- Spawn-seeded directed navigation has 5,984 valid nodes and 5,551 paintable
  nodes from 8,064 candidates; both original pad heights stay exact. Directed team-aware paths reach all local
  calibrated zone/rainmaker/checkpoint/clam targets from both pads. Retail ranked
  geometry and all objective coordinates remain unverified.
- The real controller/Character/Actor/WeaponRunner/Projectiles shooter test
  paints the same original tall duct wall at 30/60/120 Hz with zero AP. Each
  1.5-second held-fire window emits 15 shots and produces 130 natural near-wall
  splats, claiming 108/118/119 new live wall cells respectively. The retained
  old-runtime control emitted 15 shots at 30 Hz with zero target-wall impacts or
  ownership. No fixed world-axis muzzle or direct paint invocation is used.
- Actual Chromium source-menu selection downloads the pinned source across
  origins, converts it, launches eight actors/seven bots, verifies explicit ordered floor
  painting,
  lands the human, uses derived cache without another OBJ download and rolls back
  an altered OBJ while retaining the previous complete world.
- Actual indexed ink rendering is compared with the original single mesh using
  the same source attributes/order/camera. A/A, B/B and A/B produce zero changed
  pixels for gameplay, center and overhead views; twelve moving cameras exercise
  index rebuilding. Rendering preserves CPU paint, physics and navigation.
  Both references use the same native material, so their equality does not prove
  that the observed white ink fringes reproduce source colors correctly. The
  shared renderer correction is tracked separately.

The independent full-bank probe is
[check-inkwave-robo-banks.mjs](../../scripts/check-inkwave-robo-banks.mjs).
Its default runs the installed `Game._frame` at 30/60/120 render cadences and
records the actual fixed 1/60 Actor ticks. It constructs the real
eight-alive/seven-bot turf match, uses a zero-AP Shooter, starts with empty ink and
chooses genuine supported goals on the opposing banks. Only initial source-pad
setup writes poses; production logic then runs without pose, velocity or ink
overrides.

The retained earlier probe used raw Actor/BotBrain step intervals, independently
of `Game._frame`. Those are logic stress cases, not production render-cadence
failures. Team 0 reaches `[33.5, 4.505000114440918, -12.5]` at raw 30/60/120 Hz
in 68.4/59.97/58.68 seconds. Team 1 succeeds at raw 60/120 Hz in 68.47/53.66
seconds. The raw team-1 30 Hz failure abandons its original goal and ends airborne
near `[7.37, 4.47, 5.49]` after 90 seconds, 41.47 source units from
`[-33.5, 4.505000114440918, 12.5]`. Production fixed-clock qualification is pending;
the raw failure alone does not justify a shared runtime change.

Contact tracing shows the failed actor is already humanoid, with radius/lift
0.35/0.35 and height 1.45; its current foot center/ring have no support. Releasing
transform/fire and holding its existing waypoint direction through ordinary
input lands it on an original source slope. This is a raw-step path-following
stress failure, not missing source data. A private `highDrops` calibration exposed a
separate live drop: forecast Y=-0.1667, actual first source-foot touchdown Y=0.08.
The original handler keeps moving outward because it compares center heights.
Those diagnostics and the unsuccessful metadata prototypes remain private;
neither navigation flag nor a geometry/pad change has been adopted.

## Performance and limits

GPU browser work holds the shared `native-stage-browser.lock`. Original and
derived assets, screenshots and full logs stay in ignored private directories.
The reproducible production window is
[check-inkwave-robo-performance.mjs](../../scripts/check-inkwave-robo-performance.mjs).
It records seed `0x53a94ccb`, all eight actual loadouts, default gear state,
seven normal bots, 120 warmed frames, 180 measured 60 Hz steps and specified
camera aim. The human holds KeyW/fire for 90 frames then releases for 90 frames.
Low quality uses a 2048 atlas at 4 pixels/source-unit; shadows/bloom are off and
the minimap is on. Scene render drain is recorded separately from simulation.
Paint atlas/FBO work still occurs inside the measured window, so its software
driver stalls are included; this is not a measurement of CPU logic alone.

With the accepted source projectile sweep, the fixed Luna window measured
p50/p95 41.5/578.6 ms (maximum 1,865 ms), with a separate 4,044.6 ms render drain.
Its inclusive paint simulation time was 12,014.1 ms over 180 steps, including
10,007.3 ms drawing paint quads; ancillary ownership was 596.6 ms and measured
observer grouping was 322.7 ms. The fixed Shooter window measured 28.2/61.3 ms
(maximum 140.5 ms), with a separate 3,362.1 ms render drain. Character updates
dominated that case at 2,762.5 ms; paint simulation was 783.1 ms, ownership
199.8 ms and observer grouping 60.3 ms. Nested method times overlap. The actual
eight loadouts, producer queues, ownership hashes and software renderer are in
the numeric record. These are different loadout windows, not a causal A/B
optimization result. The large Luna tail remains an explicit performance limit.

The first unseeded gameplay diagnostic measured CPU p50/p95 47.8/86.8 ms and
about 4.85 seconds of ancillary ownership over 180 frames, particularly 4.4-radius
paint. Warmed fixed mixed-bot windows measured 14.3/45.9 ms with Luna and
18.9/45.3 ms with the legacy Shooter; ownership was about 192/182 ms respectively.
These different loadouts are not a before/after comparison. Character updates
dominated the warmed cases. These historical diagnostics used the old generic
projectile collision, which blocked real source-wall shots. Final runtime windows,
exact loadouts, queues and build fingerprints are recorded numerically; they do
not establish a matched-state speedup. SwiftShader measurements establish no physical mobile,
Switch or other hardware FPS claim.

A native ancillary-chart prefilter prototype passed differential CPU ownership,
replay/order and owner-credit controls and a real WebSocket turf comparison, but
its browser windows did not have identical producer states at measurement start.
No matched-state runtime benefit was proved. The prototype was discarded;
shared paint runtime, fidelity, source display and ownership remain unchanged.
Its private diagnostics are retained. The unseeded high-load window cannot serve
as an immutable before/after control.

Unverified Nintendo details remain: actual extraction/version date, source-unit
equivalence, native collision, paintability/grates/climb masks, spawns, ranked
placements, material shader semantics, moving-object transforms/states, restaurant
environment lighting and physical-device performance. The stock surrounding
environment and source-export mannequin poses visibly differ from a complete
retail scene. `version1130Verified` remains false throughout.
