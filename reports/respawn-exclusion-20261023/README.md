# Enemy exclusion at allied respawn (2026-10-23)

The owner requested that enemies be repelled from the player's own respawn area. This is an explicit **INKWAVE local rule change**, not a claim that retail Splatoon 3 has a universal spawn force field. Base: `7e027ac2ff7eea31c04155e0ee1e0d3e5604ed51`. No landing animation, weapon paint/physics, character/hair, stage mesh, damage or invulnerability duration is changed.

## Cause and design evidence

Production is `inkwave-public/` composed by `scripts/inkwave-source-composition.mjs`, then minified by `scripts/build-inkwave.mjs`. The original Actor has `_spawnBarrier()`, but `patches/splatoon3/adapter.mjs` intentionally removes its ordinary call for #807/#820. #848 separately removed the Super Jump charge call. These earlier changes allowed traversal through the pad's existing `spawnBarrier` radius. Spawn armor is a damage system and supplies no collision protection.

The existing source layouts and `src/world/decor.js` still define team pads, per-level radii and visible cylindrical barriers. The original rule's below-pad exception is `pad.y - 1`. This repair reuses those inputs. It excludes the **opposing** actor capsule from the radius with 0.02 units of skin for packet rounding; a 4.2 radius with the installed 0.38 body radius has a 4.6 actor-center boundary. Levels without a positive radius stay unchanged. The existing vertically unbounded rule above the lower height is retained so a jump cannot bypass protection. This is not an exclusion of the whole spawn deck or every route in the enemy base.

Nintendo's [official gameplay page](https://splatoon.nintendo.com/en/gameplay/) describes Squid Spawn's selectable launch/landing location. It does not establish this local geometric exclusion or a measured radius. The repository comparison baseline remains Splatoon 3 11.3.0, shooter/zero added gear unless stated. Console controller/frame measurements and exact retail collision equivalence remain unverified. Historical #807/#848 tests remain historical references; they do not override the owner's latest instruction.

## Scoped implementation

- `patches/splatoon3/runtime/spawn-exclusion.mjs`: `constrainSpawnPosition()` intersects one movement segment with one opposing pad volume. It catches fast complete crossings, slides on the tangent and removes inward horizontal velocity without a reflected impulse. Center recovery has a deterministic finite direction. Ordinary capsule `bodyFits` guards corrections; recovery considers at most eight ring candidates. No broad per-frame actor/map scan or new mesh is added.
- `installSpawnExclusion()` connects normal integration, collision resolution, action/frame completion and spawn placement. A WeakMap keeps sweep origins out of copied probe actors and packets. Allies never collide with their own volume. Existing clocks, vertical launch movement and weapon/resource ownership remain unchanged.
- `spawn-exclusion-adapter.mjs` and the production composition connect that module. Native `NetMatch.applyRemote()` also constrains the displayed sample so Hermite interpolation/rounding cannot cut inside. It does not mutate received snapshots or correction buffers and does not send a corrective teleport.
- `src/net/transport.js`: gameplay compatibility becomes `iw-gameplay-20261023-spawn-exclusion-v1`, retaining the existing owner-clock contract. Old owners are rejected by existing session/relay admission rather than rendered at a different simulated position. No server deployment or authentication/access changes.
- Focused regressions run in the automatic source suite and explicitly against the emitted site in CI.

## Preserved before/after evidence at code freeze

Commands run with Node 24.19.0:

```
node --experimental-vm-modules --test patches/splatoon3/tests/spawn-exclusion.test.mjs
INKWAVE_BUILT_SITE=<site> node --experimental-vm-modules --test patches/splatoon3/tests/spawn-exclusion.test.mjs patches/network-replication/tests/owner-clock-opening-adoption.test.mjs patches/reliability/tests/relay-compatibility.test.mjs
node scripts/build-inkwave.mjs inkwave-public <site>
node scripts/check-inkwave-startup-budget.mjs <site>
node scripts/check-inkwave-respawn-exclusion.mjs <site> <evidence> [--baseline]
```

- Identical final focused tests: original emitted build **3 pass / 22 fail** (`before-source.log.gz`); candidate source **25/25 pass** (`source.log`). The candidate includes both teams, local authoritative integration, bot-flagged bodies, variable dt (30/60/120 Hz and 0.1 s), fast complete crossings, eight approach angles, center recovery, below-pad/disabled controls, a high jump/lower-height crossing, normal wall collision and actual Tidewater/Kelpline/Halyard/Cargo geometry. Character/paint/audio are fixture stubs; these are real Actor/Physics tests, not a full renderer or autonomous bot-decision test.
- Frozen emitted runtime plus focused compatibility tests: **44/44 pass** (`emitted.log`). No skipped focused tests.
- Before browser: both real keyboard-controlled human owners walk/jump through the pad center. Owner minimum radius **0.016** for both teams; remote samples also penetrate. Four ingress cases and four allied exits pass the baseline reproduction script. 876 real relay-carried ticks. `before-browser.json.gz`, `before-wire.json.gz`, two before PNGs.
- Precommit candidate browser: two isolated Chromium contexts, full Game/Match/Actor/Character, real WebSockets and production Worker fetch/RoomDurableObject with only a local platform upgrade shim. Both teams × walking/jumping × 30/60/120 Hz produce **12/12 blocked ingress** and **12/12 free allied exits**. Owner/remote minimum radius **4.6**; every allied exit travels **11.106** units over the same two-second keyboard input. A fresh socket/room reconnect also starts a new eight-actor match. 2392 relay-carried ticks; zero page errors. Full raw traces/wire are lossless gzip, with `precommit-summary.json` for inspection. Software rendering/manually scheduled native frames are not device pacing evidence, and the relay is not the deployed public service.
- Screenshots show different match palettes and resulting camera positions; they are context evidence, not an aligned art/performance comparison. Numeric trajectories determine intrusion/exit acceptance. Failure logs are stored as lossless gzip to retain their original whitespace. Original and failed intermediate logs also remain in `.ci-scratch/respawn-exclusion/`.

## Existing failures and remaining acceptance

The selected related suites were also run on the preserved original build: **31 pass / 24 fail**. The candidate related group reproduces those same 24 failures (plus 69 other passing selected checks, 100 pass overall). Twenty-three old special tests assume inner-band damage exclusion at every native stage radius, and one respawn test expects a 23-field row when production sends 26. These failures were not weakened or rewritten. See `related-baseline.log.gz` and `related-candidate.log.gz`.

This report records precommit evidence. The final committed-head build, extended browser respawn/home-Super-Jump/host-owned-bot/reconnect checks, official ref/tree/blob readback and actual exact-head CI must be recorded separately in the PR/final handoff. Pending/failed CI is not acceptance. No merge, force push, public deploy, physical-device/retail parity or full native-source-stage collision acceptance is claimed.
