# デカライン高架下 / Urchin Underpass (`urchin`)

**Final verification in progress:** earlier private tower candidates have been removed. The stage uses accepted foundation `29c01b4f` and runtime-neutral browser runner fix `e7882e62`. Authentic source comparison and the final source-enabled CPU suite pass. Fresh immutable private/public builds are undergoing the full browser matrix before Ready review and self-integration.

This definition adds the authentic pinned `Vss_Crank02` display export to the existing native-source stage pipeline. It uses the existing integrated actors, weapons, bots, painting, minimap and five rules. It is a local Pnt/base display-mesh calibration; retail 11.3.0 collision, masks, spawn placements, ranked placements and hardware timing remain unverified.

## Identity and source

- KiTrix commit: `0611f51b35c9736ee986fb2218461e2585b7875e`.
- Stage tree: `3ea9e36f296ab6f6b9c636abc1cc401ce1768f07`.
- Original OBJ: 64,033,907 bytes; SHA-256 `17f3c5645505f75d58b99d5333cb8d2f710e230a3278c18a64e47258c2ec942c`.
- Original MTL: 38,406 bytes; Git blob `29ce0e6b25446a4e2abbb763e1cc8131d7a1e621`; SHA-256 `1a3e2c5a91c00ea61b7c240cfcbb2cad0046b448ba522c6f1edf0b4f3312661f`.
- Independent original text-stream comparison proves exact Float32 positions, normals and UVs; the dedicated stage test proves every Uint32 render index equals the original triangulated OBJ face stream.
- All 266 acquired MTL/PNG files were checked against pinned Git blob SHA-1 and size. All 195 textures used by the conversion match both original bytes and generated-file SHA-256.
- Isolated authenticated LFS smudge failed with `Resource not accessible by integration`; pinned public media retrieval succeeded and was hash-verified. Originals, generated buffers, source screenshots and detailed browser logs remain ignored private evidence.

11.3.0 metadata verifies identity only. `VersusSceneInfo-1130.json` row `Vss_Crank02` has Id 26, display order 26 and season -1. `SceneInfo.json` labels it `デカライン高架下` and references `Model/Fld_Crank02.bfres`. File SHA-256 values are `205532c39ebe91f5c704b5a3e674652ed644361b656f7d42e8580c89290a8c62` and `37b9cce349998238b86c353c151f618827220a718a0613a44ef2c64295c87d3e`, respectively. These metadata files contain no native gameplay placement proof.

## Actual source support and inferred semantics

Bounds X ±103.5, Z ±37.808 come from the horizontal source `Fld_Crank02_Asphalt_1__AsphaltBace` floor extent. Pads `[90,12,-20]` and `[-90,12,20]` lie exactly on its Y=12, +Y-normal source triangles; both pass the standing-player capsule clearance test. They are selected local launch supports, not recovered retail spawn coordinates.

The source has 401 objects; common Pnt/ranked detection displays 156 and leaves 245 alternative-layer objects inactive. The original complete 534,545 vertices / 407,073 triangles remain preserved regardless of those inferred flags.

| Anchored selection | Source evidence | Inference |
| --- | --- | --- |
| `^Fld_Crank02_BakeDummy` | `BakeDummy1__BakeDummy`, bounds X -112.244…107.563, Y 2.964…37.583, Z -55.619…84.593; overlapping dummy planes appear at Y 2.964/3.349/3.849 away from actual floor | Keep display; remove phantom gameplay support |
| `^Fld_Crank02_Prop_Crank02WaterTower[AB]_` | Water towers at X 126.399…135.260 and -135.268…-126.407, outside the playable extent | Keep display; omit distant scenery collision |
| `^Fld(?:Obj)?_Crank02_.*(?:_np_xl|__Ivy00|__CmnPlantationSet)$` | 8 active explicitly named NP frames/guards, ivy and plantation objects; Pnt NP-frame bounds X ±5.526, Y 5.457…6.996, Z ±27.772; source base NP-frame extends X ±79.510 | Keep collision/display; omit inferred nonpaintable/decorative ownership |

The OBJ coordinate system, display-derived BVH, object-name masks and planar paint charts are retained without scale or translation. Native material flags, shader reconstruction, collision and paint/grate/climb masks are not asserted. No moving-object placement is invented.

## Behavior and verification

Native launch and respawn now face the inferred opposing-pad vector `[-180,40]` in XZ. Team 0 forward is `[-0.9761870601839527,0.21693045781865616]`, and team 1 reverses it; yaw values are -1.3521273809209546 / 1.7894652726688387 radians. Geometry, texture coordinates and source positions are unchanged. This local arena orientation is inferred from the selected supported pads, not a recovered retail spawn direction. The shared native-only basis helper also selects forward launch fallback candidates and supplies a lateral axis for local ranked placement. Native Rainmaker retreat uses a configured projected coordinate; ordinary stages retain Z.

The installed runtime passed 60 actual Urchin opening/death launch cases: a human and all four bot slots, both teams, 30/60/120 Hz. Every target points toward the opposing pad and lands on actual support. Ordinary Tidewater opening/death yaw and landing remain unchanged. The relevant native, respawn and Rainmaker suite passed 62 tests after native death-respawn targets were reset independently of stale combat aim. The existing five stages also passed their asset-backed source integration checks.

Actual setup-menu stage selection and start-button clicks also verify the gameplay camera, rather than relying only on actor heading. The native offline cinematic endpoint and offline/online camera yaw derive from the same supported-pad basis. At 30/60/120 Hz, all three offline human launches and both human teams over the real WebSocket production relay align with that basis and land on source support. The minimum default-target alignment is 0.999885373583625; rig yaw and actor aim yaw equal the inferred yaw. The test uses actual canvas pointer lock and physical mouse fire, records 1,213 relay packets, has no browser errors, and confirms ordinary Tidewater yaw/aim remain zero. These are inferred local camera endpoints and directions, not recovered retail intro coordinates.

Production source implementation: `patches/native-stages/runtime/native-physics.mjs`, `native-nav.mjs`, `native-ranked.mjs`, `native-spawn.mjs`, `native-bots.mjs`, `native-minimap.mjs` and source conversion/cache/registry modules. This stage changes the catalog and source semantics only; original source render buffers and the existing controller remain intact.

The dedicated CPU movement test constructs the production Actor and Character and retains their normal integration and frame finishing. It uses legacy `shooter`, default gear with no ability loadout supplied, no shooting, kid form and inward unit-X movement for 0.5 s from both source-supported pads at 30/60/120 Hz. All remain alive and grounded and move more than one source unit. The VM reports caught optional motion-import warnings; those do not establish browser motion loading. Other generic CPU tests using `fixture.make()` retain its simplified fixed world-Z muzzle and no-op integration/frame finishing unless explicitly replaced. Actual muzzle-dependent shooting and bot behavior require the production browser evidence. These are implementation checks, not retail speed or unit-equivalence measurements.

The final source produces 12,883 navigation nodes, 8,294 valid nodes after accepted spawn-seeded reachability pruning. From each team's spawn-adjacent node, all 69 zone, Rainmaker center/goal/checkpoint, clam and tower-floor targets have directed paths. The local tower has 57 poses, 57 legal source-floor approaches, inferred lift 1.2 and half-size 1.2. Its full deck/rider endpoint envelopes enter opposite inferred arena halves; endpoint projections are -27.725447952886807 / 9.69505602083138, beyond the conservative radius 2.097056274847714. All 285 five-offset capsule checks are clear. These CPU checks establish source support and clearance; actual physical boarding remains a separate browser check. Retail 11.3.0 zone shape, goal positions, tower route and checkpoint timings are unverified.

Numeric checkpoint results, the exact accepted camera build fingerprint, software renderer conditions and remaining validation status are recorded in `urchin-verification.json`. Screenshots and per-frame logs stay in ignored `.browser-evidence/`.

## Reproduction

```sh
python3 patches/native-stages/tools/build-native.py --source .codex-stage-sources/KiTrix/stages --out .codex-stage-sources/generated --stages urchin
INKWAVE_NATIVE_STAGE_ASSETS="$PWD/.codex-stage-sources/generated" flock /workspace/actions/.ci-scratch/native-stage-cpu-heavy.lock node scripts/build-inkwave.mjs inkwave-public _site-native-urchin
flock /workspace/actions/.ci-scratch/native-stage-cpu-heavy.lock node scripts/build-inkwave.mjs inkwave-public _site-native-urchin-public
INKWAVE_NATIVE_STAGE_SOURCE="$PWD/.codex-stage-sources/KiTrix/stages" INKWAVE_NATIVE_STAGE_ASSETS="$PWD/.codex-stage-sources/generated" flock /workspace/actions/.ci-scratch/native-stage-cpu-heavy.lock node --experimental-vm-modules --test --test-concurrency=1 patches/native-stages/tests/*.test.mjs
NATIVE_STAGE_IDS=urchin flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-stages.mjs _site-native-urchin .browser-evidence/gameplay
NATIVE_STAGE_IDS=urchin flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-source-browser.mjs _site-native-urchin-public .browser-evidence/source-browser
NATIVE_STAGE_IDS=urchin NATIVE_HOST_WEAPON=s3-blaster-short flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-online.mjs _site-native-urchin .browser-evidence/online
NATIVE_STAGE_IDS=urchin NATIVE_RENDER_MOVING=1 flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-render.mjs _site-native-urchin .browser-evidence/render
NATIVE_STAGE_ID=urchin flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-camera-basis.mjs _site-native-urchin .browser-evidence/camera-basis
NATIVE_STAGE_IDS=urchin flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-projectiles.mjs _site-native-urchin .browser-evidence/projectiles
flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-urchin-source-input.mjs _site-native-urchin .browser-evidence/source-input
flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-urchin-orientation.mjs _site-native-urchin .browser-evidence/orientation
NATIVE_STAGE_IDS=urchin NATIVE_MOBILE_STAGE_IDS=urchin flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-lifecycle.mjs _site-native-urchin .browser-evidence/lifecycle
```

Public builds contain no original models, images or derived model buffers. The browser obtains authentic pinned source directly and verifies it before conversion. The software Chromium renderer does not establish physical mobile or Switch FPS. Source provenance is a third-party display export; rights and redistribution permission, 11.3.0 extraction date, coordinate units, native gameplay flags, shader parameters and original placements remain unverified.

The prepared `check-inkwave-urchin-source-input.mjs` check requires the accepted legal source-floor approach configuration. It has passed syntax validation but has not yet run against the final common code. Earlier tower capsule checks prove collision clearance only. They do not establish floor-input boarding.
