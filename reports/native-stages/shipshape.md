# オヒョウ海運 / Shipshape Cargo Co.

Stage owner branch: `codex/native-shipshape`. Initial accepted foundation:
`79ad61c59889a5e424bc56ca934422dde184baaf`. The current tested runtime includes
accepted current-main foundation `846f0532b6b3bcde3dfed893b81ee07d3dc58cd5`
and accepted source jump attachment `e35ae3a560d228f13e85fd79a462b92989f1a403`.
Stage verification is in progress; the complete opposite-bank bot route fails.
Numeric receipts are in [shipshape-verification.json](shipshape-verification.json).

Accepted source coverage #1381 corrects partially covered cells while retaining
exact original polygon membership at every ownership sample. All 247 original
nonmask files were bit-identical before navigation resealing; the only source
data change is the corrected coverage mask, SHA-256
`20eded50871082851cf21f07d2fbc35a790289382252b580072db07467cbd097`.
No old live cells are lost, and 914,231 partial cells gain coverage. Worker and
Python source arrays agree exactly. Six real Chromium ordinary Shooter shots
at mirrored source walls and 30/60/120 render cadences own the original
triangle contact while a point outside that polygon in the same cell remains
unowned. Original NoPaint glass, uncovered cells and natural enemy overpaint
release also pass, with eight actors, seven bots and zero browser errors.

The accepted shared jump attachment ([PR #1391](https://github.com/rhgrive3/actions/pull/1391)) uses ordinary paint, a
supported human jump, swimming attachment and natural supported landing on
the intact original facade. Current source CPU proof passes both banks at
30/60/120 render cadences using the installed fixed gameplay step, every-step
original capsule sweeps and no actor pose/velocity/ink overrides. No-jump
controls remain on the lower floor, and original NoPaint beam triangle 27045
remains rejected. Both original opposing pads now have directed routes to
783 genuine paintable floor nodes in each outer bank. Actual Chromium
`Game._frame` proof passes all 30 attachment cases across five modes and
30/60/120 render cadences, plus six no-jump controls, using eight real actors
and seven bots. This establishes the narrow attachment behavior. It does
not establish complete bank execution or stage readiness.

The first full team-0 opposite-bank trial at 30 Hz eventually falls onto the
intact lower vessel hull, at y -14.8647, after ordinary route recovery. A
fixed-step observer is tracing the first departure from the intended supported
route. The hull, roofs, NoPaint surfaces and opposing pads remain unchanged;
the failed route is retained as an unfinished requirement. Source drops are
observed at each installed simulation step so handler arrival is recorded
before the ordinary bot selects another goal.

The current private artifact is
`173ee4252f9b4b65560cf171a44806bb11873496465459aba8ddddfc8c5479c5`,
and the public artifact is
`a1bbea52c233851ca1f8447d4bbe7125f6adfe1e86965410f0bbddeb480d98a2`.
Both contain all nine packaged stages and pass the existing distribution
budgets. Current original-source ownership proof also passes the six admitted
Shooter contacts, same-cell outside-polygon ownership zero, original NoPaint
glass, uncovered cells and actual enemy Shooter overpaint release.

The local stage uses the original KiTrix display export rather than a blockout.
Its pinned repository commit is `0611f51b35c9736ee986fb2218461e2585b7875e`,
stage tree `d1b59d640b885fee46b3cb93c6dab4b38ba32019`, and original OBJ
SHA-256 `8413aae6785ae2a8cbbecf075bde9c13e0aed55e4e2a048b93c894c91c3771d9`
(49,575,330 bytes). An isolated LFS smudge failed with “Resource not accessible
by integration”; the public media copy matched the expected SHA-256 and size.
The shared source repository HEAD, index and sparse checkout were not edited.

Independent text streaming compares every Float32 attribute bit and Uint32
triangulated index: 388,864 vertices, 1,166,592 position components, 1,166,592
normal components, 777,728 UV components including absent-UV zero insertion,
and 1,018,212 indices. All 304 original MTL/PNG blobs, totaling 45,413,403 bytes,
match both pinned Git blob SHA-1 and byte count. Original assets, derived buffers,
and screenshots stay in ignored private directories.

The supplied 11.3.0 `VersusSceneInfo` identifies `Vss_Twist00` as stage ID 20,
display order 20 and season 5. `SceneInfo` names it オヒョウ海運 and preloads
`Model/Fld_Twist00.bfres` and `Model/FldObj_Twist00.bfres`. These identity records
do not establish the export's extraction version or retail gameplay semantics.

The inferred interactive bounds, x ±32 and z ±72.5, follow the original
`Walls00_cp` structural extent. Floor00 supports at `[-8,6.08,-66]` and
`[8,6.08,66]` retain genuine opposing banks; direct original-triangle ray support
and human capsule clearance pass. The initial candidate at z ±68 lay over a
real gap in the export and failed three source support regressions. Those
coordinates are discarded; the source gap is preserved.

Exactly two malformed unplaced crane prototypes are selected inactive:
`^FldObj_BlueCranes_Hoisting_winch_[12]__VesselCraneSet01$`. Each has 2,188
original vertices, no vertices inside the core xz footprint, and a nearest
vertex approximately 98–100 units from the center. Their triangle edges reach
548–561 units; 10 and 7 triangle AABBs intersect the core volume. This selection
does not invent a transform or a moving state. Every original vertex, normal,
UV and index remains in the source buffers. No other object role changes;
the original vessel hull, oil-rig roofs and nonpaint surfaces remain intact.
The prototype selection reduces inferred collision triangles from 314,436 to
310,976 and the paint grid from 95,850,669 to 14,114,614 cells. Crane movement
and retail instance placement remain unverified.

Reproduce the private conversion and exact source checks with:

```sh
flock /workspace/actions/.ci-scratch/native-stage-cpu-heavy.lock \
  python3 patches/native-stages/tools/build-native.py \
  --source .codex-stage-sources/private/stages \
  --out .codex-stage-sources/generated --stages shipshape
flock /workspace/actions/.ci-scratch/native-stage-cpu-heavy.lock \
  env INKWAVE_NATIVE_STAGE_SOURCE="$PWD/.codex-stage-sources/private/stages" \
  INKWAVE_NATIVE_STAGE_ASSETS="$PWD/.codex-stage-sources/generated" \
  node --experimental-vm-modules --test --test-concurrency=1 \
  patches/native-stages/tests/*.test.mjs
```

Retail units, native collision, paint/grate/climb masks, spawn and ranked
placements, native material shaders, crane transforms/states, extraction date,
and physical hardware FPS remain unverified. `version1130Verified:false`
remains explicit. Software Chromium/SwiftShader measurements do not substitute
for physical mobile, Switch, or retail frame measurements.
