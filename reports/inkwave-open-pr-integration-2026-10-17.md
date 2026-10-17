# INKWAVE open PR integration, 2026-10-17

## Scope

Integrate #1547 (profile/start/roster recovery), #1550 (remaining weapon variants and opponent palettes), #1556 (Crab Tank and simultaneous touch/gyro), #1561 (shared CI fixtures and volley rendering), #1562 (body proportions and ready stance), and #1563 (weapon holds, visual handoff and shorter torso) in one branch based on main `85acc45d`.

The owner subsequently requested #1563 too; its latest head `d31dc8eb` is included through merge `2a821bed`. Only PR #401 is excluded. Source PR histories are retained with merge commits. No changes are made to `inkwave-public/`.

## Conflict resolution

- Keep main's ink footprint composition and add both opponent-palette adapters after it. Retain all production preview imports and the source-backed paint and collision changes.
- Preserve main's current special gauge ownership, Zipcaster impact, Wail tails and cleanup while adding Crab's fixed-source-tick firing, splash rendering and disposal.
- Use the existing Brella/Stringer volley identity WeakSet for firing sheets. Remove the duplicate Brella-only guard brought by #1561; individual physical pellets, RNG, paint and damage remain unchanged.
- Keep the stronger native async Toxic Mist VM test and current Trizooka 0/4/8F assertions. Preserve both branches' comparison records.
- Keep #1550's parallel projectile captures and main's immutable PR-base alignment, pinned birth/paint baseline preparation, full-roster controls and complete physical comparator. All prior regression gates remain enabled.

## Existing main CI regressions

The pre-integration #1547 run `39036249840` failed on stale or incomplete test conditions. These are repaired against the already merged behavior, without reverting sourced runtime logic:

- Bind the actual `splashdownProtected` import in the isolated `packActor` handoff fixture.
- Check Dualies maximum damage at birth and the 7F..15F sourced damage reduction at completed 8F (28.125).
- Distinguish an admitted jump clock from an airborne ledge fall in Splatling and Shooter/Blaster accuracy tests. Explicitly initialize jump clocks when testing the jump envelope.
- Sprinkler middle duration follows the first duration (8+15s at AP0, 13+17s at AP57). Run the cadence/paint and wire ownership checks beyond both transitions.
- Super Chump births follow the 13F throw wind-up. Require zero births before and twelve after the boundary.
- Keep the bomb defense gate's current Tacticooler fallback in the source assertion.
- Exercise replay Splash Wall pending/activation before checking sixty active frames of HP decay, including its transmitted activation delay.
- Update only the fixed-seed Splatling endpoint for the already audited multiplicative speed-rate correction. Preserve four RNG draws, exact same-composition A/B flight/paint equality, pinned paint source fields and independent cell enumeration. See `inkwave-spinner-kinematics-source-audit-2026-10-17.md` and `inkwave-weapons-golden-reconciliation-2026-10-17.md`.

## Verification and comparison limits

Production minification and the unchanged startup dependency/size gate passed locally (131 core preloads, 14 range preloads, 146 initial JS requests). Final committed-head CI, focused source/emitted tests and browser results are recorded on the integration PR.

The comparison reference remains Splatoon 3 Ver.11.3.0 under the weapon, gear and input conditions recorded by each source PR. These integration checks establish INKWAVE regression behavior, not Nintendo executable equivalence or Switch/iOS/Android hardware measurements. Existing unverified source defaults, paint masks, model pattern accuracy and real-device measurements remain explicitly unverified in the original reports.

## Integration CI follow-up

The first integration run found three additional cases:

- The pool regression still expected a Slosher index leak already fixed in main. It now requires exact clean/dirty Roller equality in production and removes exactly the one allocator reset in an isolated negative control to reproduce the original leak. All six pool controls pass.
- The paint baseline's wide context windows included adjacent imports and post-paint hooks that Crab/opponent palettes legitimately extend. Three context windows are narrowed while retaining exactly the same32 paint edits, pinned full modules, unique occurrence requirements, and byte-identical preservation of all non-paint baseline code. Preparing the separate current-main reference passes with zero writes: main already contains every reviewed birth/pool/paint change.
- The S3 proportioned rig exposed a folded Roller clipping the floor by13.8mm during a120Hz vertical landing. The grip solver now evaluates the actual folded drum centre and guards the full grounded recovery after the runner clears its flick token. Existing actual indexed-vertex floor checks and both grip tolerances remain strict; all16 Roller/fold tests pass. Only the visual wrist/orientation correction changes; weapon timings, movement, damage, ink and hit volumes remain unchanged.

Local verification of the initial committed build `cc561406` also passed109 existing-failure regressions,47 emitted Crab/palette/model checks,10 exact packaging checks,105 Chromium Crab cases, and22 simultaneous pointer/synthetic-gyro cases. A persistent Chromium profile saved Patternz, closed the browser context, reopened it fresh, and rendered both palette teams with the saved kit and appearance retained and no page errors. These are scoped results of that build, not substitute results for later commits. The final integration head still requires its own CI.

The UI shard found one additional stale source pin: `runtime/install.mjs` gains only the reviewed body-proportion import/call relative to main. Refresh that one installer input SHA-256 and identify the reviewed source commit as `e8b89e55`; keep both Menus and menu-layout pins unchanged. The exact emitted installer/UI files are still checked against the manifest and observed HTTP consumption. All104 real emitted menu-focus checks pass locally with no page errors. The final `e8b89e55` production build also passes all10 packaging checks and the unchanged startup gate (2,674,012 initial JS bytes), and its fresh Patternz save/reopen/team rendering probe passes.

## Final acceptance repairs

The full local-quality sweep completed1111 tests:1102 passed,8 optional tests skipped, and the sole failure was the scoped resource fixture missing Character's real opponent-palette contract. Apply the production Character palette adapter on both fixture sides, retaining the original quality-only A/B difference. All23 consumers of that fixture and the37 targeted portrait/resource checks now pass without a replacement Character guard.

The initial exact projectile comparison found the documented #1562 muzzle changes (including a5.8mm wall-shot height change), not a projectile algorithm discrepancy. A separate baseline preparation pins exactly eight reviewed character/pose files from `85acc45d` to `e8b89e55`, requiring the complete original or final file hash before writing any file. No weapons-fidelity, paint, collision, movement or RNG module is part of this pose allowlist. It explicitly makes the reference main plus the reviewed pose, rather than claiming unchanged main. Five regressions cover altered manifests, unknown baseline/candidate bytes, preservation of unrelated physical code and late rejection before writes. With that pose alignment, the local48-scene diagnostic matches all physical states and post-fire RNG exactly, with zero GL errors. That local run omits performance workloads; the complete CI comparator still requires both desktop and mobile performance rows, all48 original captures and the unchanged18 synthetic mutation controls. Numeric tolerances are not relaxed.

The source-motion walking coverage was35 supported frames against a36-frame minimum in the240-tick episode. Preserve the original micro/walk/run/fire/stop sequence and append a second native walk/stop, extending the episode to300 ticks. The real emitted diagnostic records196 gait ticks,110 supported frames and82 settled frames (minimum43/12); all original slip, geometry, shader, grip and disposal requirements remain. This increases actual coverage rather than lowering a denominator. The full27-scenario browser gate is still required.

The enlarged/lowered head also exposed actual Rainmaker tail/skin triangle intersections for native Shooter/Dualies carriers. Translate only the fish outline forward4cm, lengthen its existing12-triangle support by the same amount, and keep the native fist origin unchanged. Geometry stays444 triangles /15948 bytes /one draw; model metadata advances to revision3. Rule state, Actor/hand matrices, aim, shot origins and visibility/disposal ownership remain under their existing owners. The independent mesh/skin intersection and exact hand-attachment assertions remain strict.

The overlapping fixture repair arrived independently on the shared integration branch as `aebef1d2`. Retain that commit and its explicit native-guard assertion, using its narrower Character/weapon-definition adapter scope rather than overwriting it. Its seven portrait checks pass locally. Rainmaker's final4cm candidate passes all10 geometry/carrier tests, covering all three weapons and both teams for90 ticks each with zero head/chest solid penetration, zero selected skin/fish triangle intersections, exact hand attachment and single resource disposal.


## #1563 addition

The latest weapon-hold branch is included in this same integration PR, retaining its pre-face shoulder-drop ordering and all prior integration fixes. Bind the real splashdown protection function once in the shared network fixture; keep both behavioral records and refresh only the reviewed installer UI pin.

The shorter torso moves each clavicle in the chest local frame. The Roller floor search had subtracted5cm on world Y regardless of chest lean, which over-corrected a held rolling drum into a hover. Evaluate the actual chest quaternion and kid transform for that displacement instead. Existing real indexed-vertex floor/contact limits and both hand-grip limits remain unchanged, including30/60/120Hz landing/restart episodes.

The fixed-color Dualies variant check compares raw, unscaled variant geometry for palette-only changes as before, and separately compares its registered model against the explicitly scaled1.3x definition. Geometry layout, indices, all non-color attributes, resource sizes and corruption controls remain exact.

Extend the strict character reference to the reviewed16 pose/model-hold paths needed by #1563. Both full candidate and reference blobs remain pinned. For the two shared registry/catalog files, exact pinned reverse edits keep #1550's independent new variants and menu repair exclusively on the candidate side; they are not copied into the reference. All physical/RNG/performance comparator requirements are retained.


The first broader emitted diagnostic passed33/41 tests; all eight failures were Roller episodes that set `grounded=false` without an admitted jump. The compiled #479 owner correctly retains horizontal flicks during25F of natural free fall, while those tests intended jump-start vertical swings. Use the real `recordMovementLaunch` helper for those synthetic jump episodes, retaining separate natural-fall boundary tests. The repaired combined Actor/rig and hold checks pass25/25 locally. The source-only motion helper remains distinct from fully emitted Character coverage.

The #1563 hold test previously ignored `INKWAVE_BUILT_SITE`. Its loader now reads the actual compiled installer, runtime, Character and source bank when that variable is set, without applying source adapters twice; the core workflow also runs this emitted check explicitly. The repaired local hold checks include this compiled path and keep exact faded/unfaded gameplay-muzzle equality at every sampled frame. Rainmaker's final six-PR emitted geometry/carrier checks pass10/10. The local48-scene low-quality visual diagnostic matches all paired physical states and post-fire RNG, with no GL errors; complete desktop/mobile performance workloads remain CI requirements.


## Final source-suite follow-up

Run39043105002 was interrupted by runner shutdowns (exit143) in several long-lived patch shards. Shard0 also exposed the stale #1096 pose fingerprint retained by #1563. Reproduce the unchanged test independently on original head `d31dc8eb` and integration `25faf3be`: all16 output digests agree over600 actual Character frames per family. Refresh only those reviewed pose/recoil values and the Splatling drawn-grip layer digest; retain all breath digests, the other three layer digests, exact identity/cache bounds and all independent firing checks.

Split the same860 test files into eight immutable, disjoint shards (107/108 files each) instead of four, with eight workers. The existing mandatory `/validate` fan-in still requires the core and every shard to succeed; syntax composition still runs exactly once in shard0. Tests prove complete coverage with no duplicates or missing files at shard count8. No checks or tolerances are removed.


The completed fourth shard found one additional stale pool-audit assertion: its acquisition regex omitted the existing Torpedo `drop.owner` call. Count all ten acquisitions and all ten releases, retaining the six named-loop sites. Add an actual Torpedo splash hit-callback exception case that proves its nested buffer returns to depth0 and is reusable. All five pool controls pass; no runtime change is needed.


The same eight-way suite was retried at identical head `2c8c6cb9` after the core, all seven browser families, all48 paired projectile captures,18 mutation controls and desktop/mobile performance checks succeeded. Some full-Character patch workers again received runner shutdown/exit143 without any failed test assertion. A shutdown message alone does not establish its infrastructure cause. Limit each patch VM to two Node test processes while retaining all eight workers, all860 source files and the unchanged required fan-in. This halves the maximum simultaneous full-Character test processes from32 to16 and reduces per-VM peak memory pressure; no test, timeout or numeric tolerance is removed.


The independent local completion of all four interrupted partitions exposed four remaining palette/registry tests that compared unscaled raw definitions with #1563's registered1.3x Shooter/Dualies definitions: dualie-light, fixed-shooter, neo-marker and nozzlenose-d. Apply the same explicit1.3x registered-model expectation already used for fixed Dualies. The raw base/variant palette comparisons remain unscaled and exact; topology, attribute layout, geometry bytes, all noncolor values and corruption controls remain unchanged. Use `Buffer.equals` with bounded assertion messages for these exact byte checks, retaining binary equality without serializing enormous buffer diffs on a failure. All46 finish regressions across all seven related files pass locally. The separate local hidden-host failure came from the initial sparse checkout omitting `server/`; restoring that unchanged directory and rerunning its six cases passes. The other tests in the four complete local partitions passed, apart from their existing optional skips. No production runtime bytes change.
