# マンタマリア号: source stage verification

Manta is selectable as a native stage and retains the pinned ship geometry. The original opposed deck supports lead to both foredecks through actual source-supported climbs, drops and charged Surge. Turf, Zones, Tower, Rainmaker and Clams run with the existing Match, actors, bots, rules and multiplayer. This is a playable local calibration of exported display geometry; `version1130Verified` stays `false`.

The stage change is confined to `definitions/manta.json`, unique source/movement regressions, two uniquely named browser checkers and these reports. It consumes independently accepted common navigation/controller fixes; it changes no shared engine, Actor, weapon, physics or legacy behavior. Original assets, generated model buffers and screenshots remain ignored and unpublished.

## Original source and identity

KiTrix commit `0611f51b35c9736ee986fb2218461e2585b7875e`, stage `Vss_Pillar03`, tree `5e08b4fb4825f7bfdd138ad13139a3d1af6d29dc`. The OBJ is 63,601,709 bytes, SHA256 `8b7a26e0f71ed69c055e42ead154bd34bc08532ba89a95bea3a813766716ac1a`. Isolated LFS smudge failed with “Resource not accessible by integration”; the pinned public-media fallback matched the pointer's bytes and hash. The shared source repository remains at that commit with index SHA256 `0c8ac8d7ce7b8aac8e2f138143811abb37152e4df73670e50022b6cf12228a87`.

Independent streaming comparison passed for every Float32 position, normal and UV (595,742 each), every original face index (952,953), all 163 object names, all 321 PNGs and both MTL Git blobs (16,061,592 PNG/MTL bytes). Maximum buffer difference is zero. Complete source geometry contains 317,651 triangles; inferred collision has 130,605 triangles and 32,767 BVH nodes, with 71,877 paint charts and an 8,675,817-byte ownership grid. Worker/Python geometry and v4 polygon masks match. Source geometry, collision, roles and masks remain unchanged through every bank case.

The 11.3.0 SceneInfo/VersusSceneInfo records identify マンタマリア号, ID18, display order16, season3 and the two Pillar model preloads. They establish identity; they do not establish this OBJ's revision, native collision, console units, masks, placements or shaders.

The pads `[-12,8,-42]` and `[12,8,42]` sit on original `GroundRoof` triangles with real capsule clearance. Bounds are X ±34.5 and Z ±49.60279846. Original roofs, hull and the collidable `MetalFloor__SlopeMetalPlate_np` remain. The only unique semantic override marks three distant `^FldObj_Pillar03_Streetlight_` objects noncollidable (minimum X75.2597 or greater), retaining their display. Common source-role inference keeps background/decal display and marks the 50 Tricolor objects inactive without rewriting original vertex/index buffers. No source NoPaint surface is converted to paintable.

## Current sealed artifacts

Foundation `90040586c3728ca20d69ed43014528e0f68cbbdf` includes accepted main18ce compatibility and accepted Drop recovery. The stage uses accepted `wallClimb`, `highDrops` and `wallSurge` metadata; no provisional combat or Bluefin approach code is present.

- Private content hash: `7813cc7d5b226fe53b2c7a7cb23b145383800db7d4db694f22ce0132be8e3c4a`.
- Public content hash: `cf6f6f0dbadc7e3287fe900c5708f21e3700f9e067fc74135839c986b72ee3d4`.
- Native runtime SHA256: `1ba63b1bfeb62d7f75a3b10b9e4295ec297c01e446c3dfff4e592de687c5cb0e` in both.

Seven key emitted modules (native engine, Actor, BotBrain, movement, ranked bots, Clams and install) are byte-identical across the pair. The private catalog contains Manta; the public catalog contains Manta and the original five stages, downloads source directly and contains no source-model payload. Both packaging suites pass 9/9 with zero skips. Both startup gates pass: 131 core +14 practice preloads, 146 initial JS requests, and all current byte limits retained. The numeric report binds source/compiled/build hashes and every local receipt.

## Physical and gameplay verification

All production browser cases use real Chromium/SwiftShader. The full-bank and ranked/weapon clock proofs observe actual `Game._frame`/Actor/BotBrain simulation STEP1/60 while varying render/input cadence30/60/120. These cadences are not variable production physics rates. Canonical Shooter (`WeaponShooterNormal`), zero AP, ordinary existing inputs and initially empty paint are recorded. Controlled route cases retain eight real actors/seven bots and normal physics/perception; other actors begin on supported own-team positions with their AI inputs frozen. No actor pose, velocity, ink or source data is written after that setup.

| Current check | Result and exact scope |
| --- | --- |
| Source/worker/physics/paint/coverage CPU suite | 19/19, no skips; exact original buffers/PNG/MTL; source grates, walls, polygon holes, NoPaint/partial cells, enemy-wall release, render partition and directed ranked calibration. |
| Grounded Actor/Character CPU motion | Ordinary inward motion hits retained source railing block5578; ordinary tangent motion travels 2.443–2.512 units in0.5s on original triangle17766 at raw30/60/120. Original collision stays intact. |
| Production Actor/Character CPU banks | Both original pads → opposed Y8 foredecks at1/60: 48.25/38.70s, 106/84 waypoints, 5,217 Actor +5,217 movement capsule sweeps clear. 273/170 admitted projectiles own96/96 and48/48 genuine Surge-wall samples; grounded source-foot endpoints within0.75. One CPU actor per case, separate from full Game proofs. |
| Actual eight-actor bank routes | 6/6 from both original pads to `[12,8,30.8972]` / `[-12,8,-30.1028]`: 48.7333 /38.7167–38.7333s, 106/84 nodes, 2/4 climbs and4 drops per route. 15,742 Actor +15,742 movement capsules clear; human `.35/.35/1.45` and squid `.675/.16/.55` live profiles. 254/206 admitted projectiles own all96/48 sampled Surge-wall points. Both source-foot endpoints within1.5; zero replans. All10 original source buffers hash unchanged. |
| Initial launch/landing | All30 cases: both human teams and all four bot slots ×raw30/60/120 actual Actor integrator; genuine support and directed objective paths; maximum landing1s, minimum ordinary post-launch travel4.0959. Raw kernel scope is explicit. |
| Actual weapon → source wall | Three actual fixed-Game cases: precisely one ordinary admitted shot at each render cadence, real production muzzle/projectile source collision and source wall ownership. Manual floor stamps do not count as this proof. |
| Eight-actor gameplay and rules | Existing seven bots move in Turf; minimap and ownership update; all four ranked engines/rule snapshot contracts pass, including actual Zones scoring and human keyboard Tower boarding. |
| Real Zones/Rainmaker opening | 12/12, both pads ×render30/60/120; real rule-selected goals, bounded directed BotBrain routes and natural jumps → real static source-foot landings;1,660 continuous Actor capsules clear. This checks the opening, not complete ranked scoring routes. |
| Real Tower approach/ride | 6/6 actual fixed-Game source approaches, boarding and grounded ride/carry into both source-arena halves; progress≥0.990810. Full source deck/pole/rider clearance and human keyboard boarding remain verified. Local Tower route/placement is not retail placement. |
| Natural Clams | 6/6 actual fixed-Game cases from both pads collect small clams and naturally create Power Clams through the installed rule/controller; no inventory or goal assignment. Source-route callbacks preserve actual blocked/NoPaint guards. Complete match scoring and other loadouts remain unverified. |
| Real WebSocket | All5 modes, production RoomDurableObject,2,226 packets; actual Luna `3.84` radius proof, every full8,675,817-cell grid SHA equal across peers after playback; all paint/network queues settle to zero and ranked authority/counts synchronize. |
| Source rendering | Original single-mesh/reference comparison:3 views with zero changed pixels/channel error, plus12 moving views; index order/source attributes and CPU authorities preserved. |
| Camera/launch | Actual menu/pointer-lock mouse launch at all3 cadences; real two-peer opposing teams and inward alignment; legacy camera remains unchanged. |
| Lifecycle/touch | Quality changes retain CPU grid/source positions/authorities; corrupt vertices rejected with live world retained; cancellation and native→legacy→native cleanup; fingerprints reject changed/missing identity;844×390 actual touch emulation with8 actors. |
| Public download/cache | Browser downloads pinned Manta source over real TLS, converts recipev4, runs8 actors/7 bots and source human landing; derived cache hit makes zero new OBJ downloads. Altered OBJ fails closed, previous world retained, setup/loading rollback completes. |

The CPU VM reports its unavailable optional motion dynamic import. Those warnings are retained; CPU motor/source checks still pass, while all actual production browser runs record zero errors. Standard coverage, quality and render fixtures deliberately stamp source ownership; their scope is separate from the real shooter admission/paint proofs above.

A new opening checker initially required grounding at exactly2s and failed during a legitimate source jump, with a live54-node actual Zones goal/path and an alive moving actor. The failed receipt is retained. The corrected checker waits at most6s for genuine source-foot touchdown and continuously checks every intervening capsule; all12 cases pass without changing runtime or input policy. Historical shared-feature counterexamples remain in the separately accepted common reports and ignored evidence; none is reclassified as current Game-clock evidence.

## Performance, comparison and limits

Current low-quality eight-actor180-frame diagnostic: CPU p50 15.2ms /p95 41.2ms; source load4.428s and nav1.072s in that browser observation. Source-only render comparisons retain warm eight-actor timings; culling submits57,224/47,394/71,553 ink triangles versus92,885 at the three views with identical pixels. Touch emulation uses2048 atlas and93 visible source textures. Bank-frame timing includes independent capsule screens. These are software GL/local instrumentation observations, not a hardware speed or Switch/mobile FPS claim.

Splatoon3 11.3.0 identity, canonical weapon/zero-AP conditions, ordinary movement, retained ramps/railings, jumps, swim paint ownership, enemy release, wall climb/Surge, shooting, refill, initial spawn and camera are recorded separately from console equivalence. This PR proves current INKWAVE source-backed behavior and export fidelity. Native masks/collision/grates, retail spawns/ranked checkpoints/baskets, moving-object transforms/states, shader fidelity, all-loadout traversal/contested full-bank combat and Nintendo hardware measurements remain unverified. The ship's local ranked placements are source-supported calibration.

Actual gameplay/overhead/source-only, bank, shot, camera, mobile and public-source screenshots were inspected privately. The bank screenshot retains the initial human own-bank camera; numeric source/capsule measurements establish the controlled bot endpoint. Screenshots and original/derived model data are not committed.

## Reproduction and self-review

Set `INKWAVE_NATIVE_STAGE_SOURCE` to the pinned private `stages`, `INKWAVE_NATIVE_STAGE_ASSETS` to its verified generated catalog, and `NATIVE_STAGE_IDS=manta`. Serial CPU tests run with `node --experimental-vm-modules --test --test-concurrency=1` for the Manta tests and the source/geometry/paint suites. Build with `scripts/build-inkwave.mjs`, with and without the private assets environment, then run packaging and startup-budget validators. Every large CPU build/test holds `native-stage-cpu-heavy.lock`.

Every Chromium checker holds `native-stage-browser.lock`; use `NATIVE_STAGE_ID=manta` for camera, `NATIVE_MOBILE_STAGE_IDS=manta`, `NATIVE_RENDER_MOVING=1`, `NATIVE_HOST_WEAPON=s3-blaster-short`, `NATIVE_CLAMS_REQUIRE_POWER=1`, an owned TMPDIR, and the system Playwright module. Run the uniquely named Manta bank and Zones/Rainmaker-opening checkers plus the standard stages, game-clock-projectiles, spawn-landing, ranked-tower, clams-goals, render, online, camera-basis, lifecycle and source-browser checkers. Detailed command/exit/hash receipts remain under `.ci-scratch/manta-final`; browser receipts under `.browser-evidence/manta-final`.

Self-review checked the original pads/roles/roofs/NoPaint, same source/collision/ownership bytes, current emitted module binding, true clock/body profiles, admitted shots, each physical support/sweep and the preserved failed-fixture scope. No source or test guard was waived. The change contains only unique stage files; shared behavior fixes retain their separate accepted PRs. [Numeric verification](manta-verification.json) contains the exact current conditions and receipts.
