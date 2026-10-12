# Controlled probe bootstrap audit

Comparison against patches/splatoon3/bootstrap.mjs (ed3 and f0da), source-fixture.mjs,
scripts/probes/inkwave-crowd-cpu.mjs and scripts/fixtures/paint-piece-workload.mjs.

Both probes call the production install(profile), retaining its complete ordered
weapon/kit/sub/special, movement/gear/flow/resources/scoring/clock, rendering/UI,
weapons-fidelity, network/catalog registration and bot paint-device wrappers.
Installing presentation wrappers does not mean display work is exercised.

Bootstrap then calls Hotfix A/B/C, DisconnectFidelity, SlosherIntermediatePaint,
Quality, WeaponsFidelity, IssueEightFollowup and MainWeaponCatalogRuntime in that
order. Both probes omit A/B/C, disconnect, slosher, quality, IssueEight. The second
WeaponsFidelity call is idempotent, already run by install(). Browser calls catalog;
published Node did not. A separate catalog-enabled Node diagnostic confirms that
calling catalog does not change this old 'shooter' fixture's grid: the chosen legacy
weapon has no catalogRecord and intentionally follows catalog's legacy fallback.
Thus f0da's new catalog shooting behavior is NOT exercised by that fixture. The new
catalog source regression does exercise its changed shooting equations and passed.

Node: real BotBrain, Physics, NavGraph, Projectiles, Actor/WeaponRunner and all Paint
simulation steps. Character is a test stub. source-fixture replaces _spawnBarrier,
_finishFrame and initial _integrate; probe restores real Actor._integrate only.
Match is a constrained object (playing=true, no respawn). Probe drives Bot/Actor/
Projectiles/Paint directly rather than real Game/Match/runSimulation. GPU is absent;
_pushQuad is counted, not rendered. Eight actors are legacy shooters on Tidewater.
Main defaults/player settings, scene/UI/environment, input, audio, net game and
character rig are not booted. Times cannot represent a whole actual match.

Browser: real Actor/WeaponRunner, Physics, Projectiles, Paint WebGL and floor/wall
Level materials. All actors have fixed firing intents, no BotBrain/NavGraph.
Character is a deterministic display/muzzle stub. Network uses actual NetMatch
serialization/receive decoding but no transport latency or full remote replay.
The controlled scene omits Game/Match boot, UI, character rig, environment and
postprocess. Six same-runner immutable builds require equal counts/grid/images.
This supports paint-workload behavior/performance only, not actual match FPS.

All quality pairs must be identical between baseline/candidate. Production mobile
passes 2048/18, desktop high 4096/30; effective ppm is constrained by atlas packing.
The updated browser probe reports all three values. Uninstrumented Node timers are
used for top-line fixture time; instrumented attribution remains diagnostic only.
