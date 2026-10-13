# デカライン高架下 / Urchin Underpass (`urchin`)

**Verified for review:** earlier private tower candidates have been removed. The current stage uses accepted foundation `460da559` (including the default-OFF source drop implementation and final online settlement checker). Fresh immutable private/public builds pass the affected CPU, gameplay/Tower, real WebSocket, public-source/cache, lifecycle/touch and death-reset checks. Prior exact `29c01b4f` render, actual shot and physical camera proofs remain explicitly tied to their original artifact; geometry, profile and controller are unchanged. Source definitions contain no `wallClimb`, `highDrops` or `wallSurge` flag.

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

The accepted `33cecb05` camera proof uses actual setup-menu stage selection and start-button clicks. The native offline cinematic endpoint and offline/online camera yaw derive from the supported-pad basis. At 30/60/120 Hz, three offline human launches and both real WebSocket human teams align with that basis and land on source support. Minimum alignment is 0.999885373583625; rig and actor aim yaw equal the inferred yaw. Actual canvas pointer lock and physical mouse fire record 1,213 packets, no browser errors, and unchanged ordinary Tidewater yaw/aim. The later exact `29c` artifact also passes all nine physical camera cases with 1,211 packets and minimum alignment 0.9998943968451207. These are local inferred endpoints and directions, not recovered retail intro coordinates.

Production source implementation: `patches/native-stages/runtime/native-physics.mjs`, `native-nav.mjs`, `native-ranked.mjs`, `native-spawn.mjs`, `native-bots.mjs`, `native-minimap.mjs` and source conversion/cache/registry modules. This stage changes the catalog and source semantics only; original source render buffers and the existing controller remain intact.

The dedicated CPU test constructs production Actor and Character and retains normal integration/frame finishing. It uses legacy `shooter`, default gear with no ability loadout supplied, kid form and inward unit-X movement for 0.5 s from both source-supported pads at 30/60/120 Hz. All remain alive and grounded and move more than one source unit. It also checks 12 human/bot death-state resets and native launch landings across both teams and all three rates, using a controlled dead flag followed by production respawn; the browser separately exercises actual splat/death. Controlled launch fire is distinct from an ordinary weapon shot. Caught optional motion-import warnings in the VM do not establish browser motion loading. Generic `fixture.make()` tests retain a fixed world-Z muzzle and no-op integration/frame finishing unless explicitly replaced; production browser evidence covers muzzle-dependent shooting and live bots. These checks do not establish retail speed or unit equivalence.

The final source produces 12,883 navigation nodes, 8,294 valid nodes after accepted spawn-seeded reachability pruning. From each team's spawn-adjacent node, all 69 zone, Rainmaker center/goal/checkpoint, clam and tower-floor targets have directed paths. The local tower has 57 poses, 57 legal source-floor approaches, inferred lift 1.2 and half-size 1.2. Its full deck/rider endpoint envelopes enter opposite inferred arena halves; endpoint projections are -27.725447952886807 / 9.69505602083138, beyond the conservative radius 2.097056274847714. All 285 five-offset capsule checks are clear. These CPU checks establish source support and clearance; actual physical boarding remains a separate browser check. Retail 11.3.0 zone shape, goal positions, tower route and checkpoint timings are unverified.

Exact before/after comparison shows unchanged pads/supports, navigation-node and valid-node counts, spawn node IDs, all 69 directed target path lengths per team and the complete inferred ranked configuration after the unused source drop imports. The current all-five-rule browser match has 8 alive actors and 7 live bots. Ordinary W+Space from verified source floor boards the real tower at 30/60/120 Hz in 14/28/56 frames; 57 waypoints plus three interior samples per segment produce 450 actual capsule deck supports. The prior `29c` physical floor-input probe additionally verifies one counted team rider and score 100→97 at each rate, without placing the actor on the deck.

The current real WebSocket/production RoomDurableObject matrix passes all five actual modes with 2,028 packets. The entire 2,539,305-cell ownership grid agrees on both peers; Tower includes 100 dynamic deck cells, for 2,539,405 total. Host Luna (`s3-blaster-short`) uses its owned 3.84-radius transport control. Initial and post-ranked-snapshot waits retain genuine watermark, growth, replay and outbound checks; every final queue is empty and ranked values agree. This controlled ownership transport proof is separate from ordinary shot admission. Its checker-only correction is independently reviewed and promoted in PR [#1378](https://github.com/rhgrive3/actions/pull/1378); the original Rainmaker negative receipt is preserved privately.

Public menu acquisition/conversion/cache and altered-source rollback pass with two actual OBJ requests; cached re-entry causes no download. Lifecycle passes exact-one corrupt binary rejection, retained CPU grid/source geometry/authorities through quality changes, cancellation to Tidewater, clean native↔legacy switches and same/changed/missing fingerprint checks. The 844×390 touch check has 8 actors and a grounded human launch. Actual game, overhead, source-only, public HUD and touch screenshots were inspected privately.

| Check | Result and scope |
| --- | --- |
| Current source-enabled Node suite | 71 pass, 9 explicit stage/asset skips, 0 fail; includes production Character walking and human/bot death resets |
| Current private/public packaging | 9/9 each; unchanged request and byte guards |
| Current source/physics/ranked | Exact source buffers, 195 textures, original indices; both-team directed access and full Tower envelopes/normal keyboard boarding |
| Current real WebSocket | All five modes, complete grids and ranked values equal after both genuine settlement phases |
| Current source/lifecycle | Worker/cache/corrupt rollback, quality authority, cancellation, fingerprint and 844×390 touch pass |
| Prior exact `29c` render | All three A/A and B/B comparisons 0 pixels; 12 moving views; source geometry, CPU paint and authorities unchanged |
| Prior exact `29c` ordinary shots | Production Character/Actor→WeaponRunner→Projectiles, legacy `shooter` alias / `WeaponShooterNormal`, 0 ability points, one admitted shot, frozen bots and RNG 0.5; source WallMetal00 triangle 96 hit/painted at 30/60/120 Hz |
| Prior exact `29c` camera/launch | Nine actual menu/physical-fire camera cases including both online teams; 30 production Actor opening launches with support/routes and normal post-launch movement |

Current private/public revisions are `29345d7929012bbd4f595969124d5324589950cc2260f1e2d00801d1ffc9cf9f` / `e9719e6f4c29dddbbc974577d5e4833a319c71734b63e35aaf7d72c0bf5fabdf`. The scoped prior full-matrix private revision is `d7f93d077dda20300c7f6e9043ba6ec1743aad7c59e6e0b0e41e6a9e97b8531c`. Current startup remains 146 JS requests / 145 preloads (131 core, 14 range); private/public initial JS is 2,891,815 / 2,894,666 bytes, precache 5,785,908 / 5,788,759 bytes, declared revision 10,403,948 / 10,406,799 bytes. No budget or guard was weakened.

Software diagnostics: current 180-frame gameplay CPU p50/p95 17.4/44.7 ms; current touch CPU p50/p95 20.5/71.7 ms and GPU-drain render 6.6 ms. Prior single/chunked render p50 is 7.7/8.3 ms (gameplay), 1.7/2.0 (center), 7.7/9.6 (overhead); selected ink triangles are 93,634 / 37,697 / 95,930 versus 95,930 reference. These runs use shared-host SwiftShader, have different producer states, and establish neither a hardware FPS comparison nor a rendering speed improvement.

Full numeric results, artifact fingerprints, validation scopes and unverified assumptions are in `urchin-verification.json`. Screenshots and detailed logs stay ignored in `.browser-evidence/`.

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

`check-inkwave-urchin-source-input.mjs` passed the physical source-floor W+Space, real-deck contact, counted rider and 100→97 score probe at all three rates on the explicitly scoped `29c` artifact. The current generic stage checker independently repeats normal keyboard boarding and full swept route/deck support. Historical manual capsule probes remain clearance evidence only.
