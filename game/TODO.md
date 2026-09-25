# TODO — Atomic backlog (510 items)

Format: `ID  Pn  [status]  task — AC: acceptance criteria`. Status: done / wip / open. P0 = playable core, P1 = 95-point fidelity, P2 = polish, P3 = optional.
Counts: Research 52 · Arch 31 · Character 56 · Camera 46 · Ink 66 · Weapons 61 · Stage 56 · Modeling 46 · Animation 41 · VFX 26 · AI 36 · Rules 21 · UI 31 · Audio 16 · Mobile 46 · Testing 51 = 510 (≥500).

## Research / measurement (RS)
RS-001 P0 [done] Confirm latest version via Nintendo update history — AC: REFERENCE_LOCK.md states 11.3.0 w/ date
RS-002 P0 [done] Record Ver 11.x changes relevant to Turf War — AC: Flow Aura, health indication noted
RS-003 P0 [done] Splattershot fire interval — AC: 6 f in matrix
RS-004 P0 [done] Splattershot damage/min — AC: 36/18
RS-005 P0 [done] Splattershot ink per shot — AC: 0.92 %
RS-006 P1 [done] Splattershot spread ground/air — AC: 6°/12°
RS-007 P1 [done] Splattershot move-while-firing — AC: 0.72 DU/f
RS-008 P1 [done] Splattershot refill delay — AC: 20 f
RS-009 P1 [wip] Splattershot projectile speed/drop from footage — AC: ±10 % arc match
RS-010 P0 [done] Roller flick damages — AC: 150/50 h, 150/40 v
RS-011 P1 [done] Roller startup frames — AC: 8 f / 17 f
RS-012 P1 [done] Roller roll speed — AC: 1.08 DU/f
RS-013 P1 [done] Roller contact damage — AC: 125/70
RS-014 P1 [wip] Roller glob distribution pattern — AC: overlay vs footage
RS-015 P0 [done] Charger full charge frames — AC: 60 f
RS-016 P0 [done] Charger damage min/full — AC: 40/160
RS-017 P1 [done] Charger ink min/full — AC: 2.25/18 %
RS-018 P1 [done] Charger charge storage — AC: 1.5 s stored
RS-019 P1 [wip] Charger partial damage curve — AC: 3 sample points
RS-020 P0 [done] Run/swim speeds — AC: 0.96/1.92 DU/f
RS-021 P1 [done] Enemy ink speed & damage — AC: values w/ confidence
RS-022 P1 [wip] Run accel/decel frames from footage — AC: ±2 f
RS-023 P1 [wip] Jump arc (height, airtime) — AC: ±3 f
RS-024 P1 [done] Squid transform timing — AC: 8 f estimate
RS-025 P2 [open] Squid Surge timing — AC: charge/launch frames
RS-026 P1 [done] Squid Roll armour window — AC: recorded
RS-027 P1 [done] Health recovery delay — AC: 60 f
RS-028 P1 [done] Respawn time — AC: 8.5 s
RS-029 P1 [done] Ink refill squid/kid — AC: 3 s / 10 s
RS-030 P1 [wip] Camera FOV from footage — AC: ±2°
RS-031 P1 [wip] Camera distance/offset — AC: screen occupancy match ±3 %
RS-032 P1 [open] Gyro response curve — AC: measured deg/s to camera deg mapping
RS-033 P2 [open] Recoil visual amplitude — AC: px deviation
RS-034 P1 [wip] Splat paint radius per weapon — AC: measured in character heights
RS-035 P1 [done] Roller strip width — AC: ~1.2 char heights
RS-036 P1 [done] Charger line paint — AC: dotted line + impact
RS-037 P1 [wip] Scorch Gorge overall dimensions — AC: spawn→spawn ±10 %
RS-038 P1 [wip] Scorch Gorge heights — AC: relative heights table
RS-039 P1 [done] Scorch Gorge lanes/perch/mid identification — AC: STAGE_SPEC
RS-040 P2 [open] Scorch Gorge landmark list — AC: 10 landmarks w/ positions
RS-041 P2 [open] Scorch Gorge colour palette sampling — AC: 8 swatches
RS-042 P1 [open] Hitbox sizes human/swim (Ver 11) — AC: values
RS-043 P1 [done] Turf War rules (floor only) — AC: doc
RS-044 P2 [open] Super Jump timing — AC: frames
RS-045 P1 [wip] Wall-swim speed — AC: ±10 %
RS-046 P2 [open] Ink drip cadence per shooter — AC: droplets/m
RS-047 P1 [done] Weapon range lines → metres — AC: matrix
RS-048 P2 [open] Splat/respawn animation timing — AC: frames
RS-049 P2 [open] Landing squash duration — AC: frames
RS-050 P1 [done] Confidence tagging for all matrix rows — AC: every row has conf.
RS-051 P2 [open] Flow Aura exact conditions — AC: sourced numbers
RS-052 P2 [open] Health indication display rules (Ver 11) — AC: sourced

## Architecture / infrastructure (AR)
AR-001 P0 [done] Vite + TS project — AC: build passes
AR-002 P0 [done] Fixed 60 Hz sim w/ accumulator — AC: Game.loop
AR-003 P0 [done] Render interpolation alpha — AC: prevPos lerp
AR-004 P0 [done] Spiral-of-death clamp — AC: max 5 steps, dt clamp 0.25
AR-005 P0 [done] Data-driven weapon definitions — AC: weapons.ts
AR-006 P0 [done] Tuning constants centralised — AC: tuning.ts
AR-007 P0 [done] Simulation/render separation — AC: simulate() vs render()
AR-008 P1 [open] GraphicsBackend interface w/ WebGPU detection — AC: interface + fallback log
AR-009 P2 [open] WebGPU ink backend — AC: parity test passes
AR-010 P0 [done] WebGL2 ink backend — AC: stamps render
AR-011 P0 [done] Object pools: projectiles — AC: 512 pooled
AR-012 P0 [done] Object pools: particles — AC: tier cap
AR-013 P0 [done] Object pools: stamp params — AC: stampPool
AR-014 P1 [open] Web Worker for AI path planning — AC: A* off main thread
AR-015 P1 [done] Event interfaces (GameEvents/WeaponEvents) — AC: decoupled SFX/VFX
AR-016 P1 [done] Quality tiers — AC: LOW/MEDIUM/HIGH
AR-017 P1 [done] Dynamic resolution — AC: scale steps on budget
AR-018 P2 [open] Deterministic RNG for all systems — AC: same seed → same match
AR-019 P1 [done] Seeded RNG for weapons — AC: LCG in WeaponSystem
AR-020 P2 [open] Snapshot serialisation of sim state — AC: JSON round trip
AR-021 P2 [open] Input recording/replay — AC: golden camera test
AR-022 P1 [done] Debug panel toggle — AC: dbg button / backquote
AR-023 P2 [open] Debug visualisations (colliders/nav/paths) — AC: toggles
AR-024 P1 [done] window.__game handle — AC: console access
AR-025 P2 [open] Error boundary UI — AC: friendly WebGL2 message (partial)
AR-026 P1 [done] Visibility change handling — AC: dt clamp + loops stop
AR-027 P2 [open] Asset pipeline (glTF/meshopt/KTX2) — AC: build script
AR-028 P2 [open] Lightmap baking script — AC: baked texture
AR-029 P3 [open] Netcode-ready command stream — AC: input struct per tick
AR-030 P1 [done] No per-tick allocations in hot loops — AC: reviewed
AR-031 P1 [done] Benchmark logging — AC: benchmarkSummary()

## Character / movement (CH)
CH-001 P0 [done] State machine enum — AC: 13 states
CH-002 P0 [done] Run accel/decel model — AC: separate params
CH-003 P0 [done] Camera-relative movement — AC: stick forward = camera forward
CH-004 P0 [done] Jump impulse + gravity — AC: airtime ≈ 0.5 s
CH-005 P0 [done] Fall gravity multiplier — AC: 1.15
CH-006 P0 [done] Air control fraction — AC: 0.55
CH-007 P0 [done] Step handling 0.55 m — AC: climbs ramps
CH-008 P0 [done] Swim on own ink 2× — AC: 9.6 m/s
CH-009 P0 [done] Squid on unpainted slow — AC: 1.8 m/s
CH-010 P0 [done] Enemy ink slow — AC: 1.2 m/s
CH-011 P0 [done] Enemy ink damage capped — AC: ≤ 40
CH-012 P0 [done] Enemy ink jump penalty — AC: 0.55×
CH-013 P0 [done] Wall swim on own ink — AC: SWIM_WALL
CH-014 P0 [done] Wall detach — AC: push-off velocity
CH-015 P0 [done] Wall top pop-over — AC: transitions to SWIM
CH-016 P1 [done] Squid Roll on reversal — AC: 20 f, armour
CH-017 P1 [open] Squid Surge — AC: charge on wall + launch
CH-018 P0 [done] Swim transition timing — AC: 8 f / 6 f
CH-019 P0 [done] Headroom check before standing — AC: stays squid under low ceiling
CH-020 P0 [done] Separate swim collision profile — AC: h 0.35 r 0.28
CH-021 P0 [done] Health & recovery — AC: 60 f delay
CH-022 P0 [done] Ink tank & refill — AC: 3 s squid
CH-023 P0 [done] Refill delay after firing — AC: per weapon
CH-024 P0 [done] Splat & respawn — AC: 8.5 s
CH-025 P0 [done] Kill plane — AC: y < −3
CH-026 P0 [done] Invulnerability on respawn — AC: 2 s
CH-027 P1 [done] Jump buffer — AC: 120 ms
CH-028 P1 [done] Coyote time — AC: 90 ms
CH-029 P1 [done] Body yaw lag & turn-in-place — AC: fast snap > 69°
CH-030 P1 [done] Landing squash — AC: scale response
CH-031 P1 [done] Movement multiplier while firing/charging/rolling — AC: speedFactor
CH-032 P1 [done] Movement lock during flick startup — AC: lockMovement
CH-033 P1 [done] Swim jump height — AC: 7.6
CH-034 P2 [open] Slope collision (true ramps) — AC: no micro-step jitter
CH-035 P1 [wip] Edge behaviour (no ledge snag) — AC: walks off cleanly
CH-036 P2 [open] Capsule body — AC: rounded corners
CH-037 P1 [done] Speed telemetry — AC: moveSpeedNow in debug
CH-038 P1 [open] Tune run accel vs footage — AC: ±2 f
CH-039 P1 [open] Tune jump vs footage — AC: ±3 f
CH-040 P1 [open] Tune swim accel — AC: ±10 %
CH-041 P2 [open] Ink contamination visual on humanoid — AC: enemy-ink tint
CH-042 P1 [done] Assist/last-hit tracking — AC: 4 s window
CH-043 P1 [done] Flow Aura state — AC: 10 s after 2 splats/8 s
CH-044 P2 [open] Super Jump — AC: to spawn
CH-045 P2 [open] Squid partially submerged visual — AC: sinks in ink
CH-046 P1 [done] Squid roll armour damage reduction — AC: 50 % < 100 dmg
CH-047 P2 [open] Turn response on stick reversal humanoid — AC: measured
CH-048 P1 [done] Slow crawl in enemy ink as squid — AC: uses enemy speed
CH-049 P2 [open] Wall swim lateral drift tuning — AC: footage compare
CH-050 P2 [open] Wall swim on ramps/inclines — AC: n/a for blockout
CH-051 P1 [done] Ground ink query ignores unpaintable tops — AC: groundBox check
CH-052 P1 [done] Kill credit from fall after damage — AC: 3 s
CH-053 P2 [open] Damage knockback (none in S3) — AC: none confirmed
CH-054 P1 [done] Squid on own-ink heals faster — AC: recoveryRateSquid
CH-055 P2 [open] Ink-tank drain on wall swim (none) — AC: n/a
CH-056 P1 [open] Stress: 8 players movement cost < 0.3 ms — AC: bench

## Camera / controls (CA)
CA-001 P0 [done] Camera rig chain — AC: CameraRig.ts
CA-002 P0 [done] Second-order follow horizontal — AC: 6 Hz
CA-003 P0 [done] Soft vertical follow — AC: 3.2 Hz, jump lag
CA-004 P0 [done] Shoulder offset — AC: 0.55 right
CA-005 P0 [done] Pitch clamp — AC: −55/+65
CA-006 P0 [done] Collision pull-in — AC: no wall clipping in tests
CA-007 P1 [done] Snap in / slow restore — AC: dist spring
CA-008 P1 [done] FOV changes (charger/swim) — AC: smooth
CA-009 P1 [done] Recoil kick — AC: shooter/charger
CA-010 P1 [done] Damage shake — AC: on hit
CA-011 P0 [done] Aim origin = camera for human shots — AC: reticle hits
CA-012 P0 [done] Touch drag aim — AC: 0.32°/px
CA-013 P0 [done] Floating virtual stick — AC: follows thumb
CA-014 P0 [done] Multi-touch stick + aim + buttons — AC: pointer ids
CA-015 P0 [done] Fire/Swim/Jump buttons — AC: pressed state
CA-016 P1 [done] V-FLICK contextual button — AC: roller only
CA-017 P0 [done] Fire cancels swim — AC: surfaces & shoots
CA-018 P1 [done] Gyro permission flow (iOS) — AC: requestPermission
CA-019 P1 [done] Gyro orientation normalisation — AC: landscape both ways
CA-020 P1 [done] Gyro bias estimate — AC: slow LP
CA-021 P1 [done] Gyro deadzone — AC: 0.6°/s
CA-022 P1 [done] Velocity-dependent smoothing — AC: 3 bands
CA-023 P1 [done] Gyro sensitivity param — AC: tuning
CA-024 P1 [done] Recenter button — AC: pitch 0
CA-025 P1 [open] Gyro sign verification on device — AC: tested iOS/Android
CA-026 P0 [done] WASD + mouse fallback — AC: pointer lock on click
CA-027 P1 [done] Pointer lock only from gesture — AC: no promise error
CA-028 P1 [done] Keyboard arrows look — AC: works
CA-029 P1 [done] Touch-action none / no scroll — AC: no bounce
CA-030 P1 [done] Contextmenu suppressed — AC: right click
CA-031 P2 [open] Sensitivity settings UI — AC: sliders
CA-032 P2 [open] Invert options — AC: toggles
CA-033 P1 [open] Camera golden test baseline — AC: JSON
CA-034 P1 [open] Verify no clipping at perch edge — AC: 30 s test
CA-035 P2 [open] Camera lag on Squid Roll — AC: footage
CA-036 P2 [open] Camera FOV kick on Super Jump — AC: n/a
CA-037 P1 [done] Camera aspect update on resize — AC: resize
CA-038 P1 [done] Camera reset on respawn — AC: snapTo
CA-039 P2 [open] Aim assist on touch (none in S3) — AC: none
CA-040 P1 [done] Reticle hit-confirm — AC: colour flash
CA-041 P2 [open] Haptics on fire (Android) — AC: vibrate
CA-042 P1 [done] Haptic on button press — AC: navigator.vibrate 8 ms
CA-043 P1 [done] Stick deadzone 8 % — AC: wantMove
CA-044 P2 [open] Stick sprint zone — AC: n/a
CA-045 P1 [done] Input buffering jump — AC: 120 ms
CA-046 P1 [open] Input latency measurement — AC: < 50 ms touch→sim

## Ink simulation (IN)
IN-001 P0 [done] Floor RT world projection — AC: 1024×2048
IN-002 P0 [done] Wall tile atlas — AC: 16×16
IN-003 P0 [done] Stamp queue + batch instanced draw — AC: 1 draw/target
IN-004 P0 [done] Procedural splat fragment shader — AC: irregular edge
IN-005 P0 [done] Team encoding R/G — AC: shader reads
IN-006 P0 [done] Wetness channel B — AC: spec varies
IN-007 P0 [done] CPU mirror grid — AC: floorTeamAt
IN-008 P0 [done] Wall CPU grid — AC: wallTeamAt
IN-009 P0 [done] Score-eligible mask — AC: walls excluded
IN-010 P0 [done] Live incremental score — AC: 8-slice scan
IN-011 P0 [done] Final GPU readback score — AC: finalScore()
IN-012 P1 [done] CPU/GPU parity log — AC: console at result
IN-013 P0 [done] Roller strip stamps — AC: continuous
IN-014 P0 [done] Charger line stamps — AC: dotted line
IN-015 P0 [done] Shooter drips — AC: every 3 f
IN-016 P1 [done] Secondary droplets — AC: 3 per stamp
IN-017 P1 [done] Shape per weapon — AC: 3 shapes
IN-018 P1 [done] Seeded randomness — AC: seed attr
IN-019 P1 [done] Aspect-stretched stamps (angle) — AC: wall base splash 1.6
IN-020 P1 [done] Wall→floor base splash — AC: within 1.2 m
IN-021 P1 [done] Splat burst paints floor — AC: 1.6 m
IN-022 P1 [done] Hit-player paint under victim — AC: 0.6×
IN-023 P1 [done] Isotropic rotation in metres — AC: per-instance k
IN-024 P1 [done] Buried wall faces culled — AC: tiles < 256
IN-025 P1 [open] Chunked secondary-UV atlas — AC: overlapping floors
IN-026 P1 [done] Ink shader spec/fresnel — AC: visible sheen
IN-027 P2 [open] Normal perturbation on ink edges — AC: subtle
IN-028 P2 [open] Fresh/dry time fade — AC: B decays
IN-029 P1 [open] Ink golden images — AC: baselines
IN-030 P2 [open] WebGPU compute stamp path — AC: parity
IN-031 P1 [done] MAX stamps/frame guard — AC: 4096
IN-032 P1 [done] Clear on rematch — AC: clear()
IN-033 P1 [done] No per-frame readback — AC: verified
IN-034 P1 [open] Downsampled histogram mid-match GPU (optional) — AC: n/a
IN-035 P1 [done] Ink query for AI coverage — AC: areaCoverage
IN-036 P1 [done] Ink cost for nav — AC: inkCost
IN-037 P2 [open] Ink on characters (contamination) — AC: tint
IN-038 P2 [open] Ink puddle depth parallax — AC: n/a
IN-039 P1 [done] Roller flick splash under roller — AC: 0.9 m
IN-040 P1 [done] Expired projectiles paint below — AC: dropToFloor
IN-041 P1 [done] Grates unpaintable — AC: paintFloor false
IN-042 P1 [done] Spawn deck unpaintable — AC: false
IN-043 P2 [open] Paintable/unpaintable debug overlay — AC: toggle
IN-044 P2 [open] Score texture debug view — AC: toggle
IN-045 P1 [open] Stress 4096 stamps/frame timing — AC: < 1 ms
IN-046 P1 [done] Texture memory budget — AC: 24 MB
IN-047 P2 [open] Half-res RT on LOW tier — AC: 512×1024
IN-048 P1 [done] Paint points for human stats — AC: paintedPoints
IN-049 P2 [open] Ink splash decals on walls near floor hits — AC: n/a
IN-050 P1 [done] CPU ellipse approximation — AC: aspect handled
IN-051 P2 [open] Edge anti-alias in stamp shader — AC: smoothstep
IN-052 P1 [done] Wall paint climbs → SWIM_WALL — AC: tested logic
IN-053 P2 [open] Ink on ramps visual slope — AC: projection ok
IN-054 P1 [done] Result bar equals readback — AC: hud.result.score
IN-055 P2 [open] Ink trails from swimming squid (none in S3) — AC: n/a
IN-056 P1 [done] Ink sampling for enemy-ink damage — AC: onEnemyInk
IN-057 P2 [open] Splat shape by impact angle — AC: aspect by normal
IN-058 P2 [open] Charger impact star shape — AC: shape 3
IN-059 P1 [done] Score % HUD live — AC: bottom meter
IN-060 P2 [open] Ink coverage minimap — AC: n/a
IN-061 P1 [done] Live score cadence 133 ms — AC: verified in code
IN-062 P2 [open] Ink readback async (WebGL2 PBO) — AC: no stall
IN-063 P1 [done] Ink flush before main render — AC: order
IN-064 P2 [open] Ink stamp culling outside bounds — AC: skip
IN-065 P1 [done] CPU grid bounds check — AC: no OOB
IN-066 P2 [open] Ink golden WebGPU vs WebGL2 — AC: IoU > 0.98

## Weapon logic (WP)
WP-001 P0 [done] Splattershot fire loop — AC: 6 f
WP-002 P0 [done] First-shot delay — AC: 3 f
WP-003 P0 [done] Ink consumption — AC: 0.92 %
WP-004 P0 [done] Damage falloff — AC: 36→18
WP-005 P0 [done] Projectile straight→drop — AC: 4 f
WP-006 P0 [done] Spread ground/air — AC: 6/12
WP-007 P1 [done] Spread degradation/recovery — AC: implemented
WP-008 P1 [done] 1/3 straight shots — AC: rng
WP-009 P0 [done] Move-while-firing multiplier — AC: 0.75
WP-010 P0 [done] Camera ray → muzzle direction — AC: reticle accuracy
WP-011 P1 [open] Muzzle obstruction handling — AC: no wall shots
WP-012 P0 [done] Player hit cylinder test — AC: segment
WP-013 P0 [done] World hit raycast — AC: paint at hit
WP-014 P0 [done] Roller tap/hold discrimination — AC: 0.16 s
WP-015 P0 [done] Horizontal flick — AC: 9 globs fan
WP-016 P0 [done] Vertical flick — AC: 7 globs line
WP-017 P0 [done] Flick startup lock — AC: no movement
WP-018 P0 [done] Flick recovery slow — AC: 0.55×
WP-019 P0 [done] Roll speed & strip — AC: 5.4 m/s
WP-020 P0 [done] Roll ink drain — AC: 5.4 %/s
WP-021 P0 [done] Contact damage dash/walk — AC: 125/70
WP-022 P1 [done] Contact cooldown — AC: 0.5 s
WP-023 P1 [done] Glob damage falloff — AC: 150→50
WP-024 P1 [open] Flick glob distribution tune vs footage — AC: overlay
WP-025 P0 [done] Charger charge accumulation — AC: 60 f
WP-026 P0 [done] Charger release fire — AC: damage/range by t
WP-027 P0 [done] Charger pierce full — AC: multiple hits
WP-028 P0 [done] Charger ink drain while charging — AC: 18 % full
WP-029 P1 [done] Charger stored charge — AC: 1.5 s
WP-030 P1 [done] Charger air charge slower — AC: 0.6×
WP-031 P1 [done] Charger laser sight — AC: visible line
WP-032 P1 [done] Charger recovery — AC: 20 f
WP-033 P1 [done] Charger FOV — AC: −8°
WP-034 P1 [done] Charger beam VFX — AC: fading cylinder
WP-035 P1 [done] Weapon events for SFX — AC: onFire kinds
WP-036 P1 [done] Projectile lifetime paint — AC: below
WP-037 P2 [open] Sub weapon (Suction Bomb etc.) — AC: n/a
WP-038 P2 [open] Special weapons — AC: n/a
WP-039 P1 [open] Shooter golden test — AC: 97 shots/10 s
WP-040 P1 [open] Roller golden test — AC: strip count
WP-041 P1 [open] Charger golden test — AC: 3 charges
WP-042 P1 [done] Refill delay per weapon — AC: data
WP-043 P1 [done] Weapon range data — AC: aim max dist
WP-044 P2 [open] Damage numbers debug — AC: toggle
WP-045 P1 [done] Firing animation hook — AC: firingAnim
WP-046 P1 [done] Roller drum spin — AC: visual
WP-047 P2 [open] Roller strip on walls when rolling into them — AC: n/a
WP-048 P1 [done] Roller can't flick while squid — AC: guard
WP-049 P1 [done] Charger can't charge while squid — AC: store
WP-050 P1 [done] Shooter can't fire while squid — AC: guard
WP-051 P2 [open] Ink-out click sound & low ink behaviour — AC: n/a
WP-052 P1 [done] Ink ≥ cost check — AC: guard
WP-053 P1 [done] Projectile pool exhaustion safe — AC: returns null
WP-054 P2 [open] Projectile-projectile (none) — AC: n/a
WP-055 P1 [done] Charger damage curve convex — AC: t²
WP-056 P2 [open] Hit reaction knock (none) — AC: n/a
WP-057 P1 [done] Hit confirm event — AC: onPlayerHit
WP-058 P2 [open] Shooter tracer thin — AC: stretch
WP-059 P1 [done] Projectile stretch by speed — AC: instancing
WP-060 P1 [done] Invulnerable skip — AC: respawn safe
WP-061 P1 [done] Kill credit via takeDamage — AC: kills++

## Stage (ST)
ST-001 P0 [done] Macro map — AC: STAGE_SPEC table
ST-002 P0 [done] Blockout boxes — AC: ~60/half
ST-003 P0 [done] Point symmetry helper — AC: half(±1)
ST-004 P0 [done] Spawn decks — AC: unpaintable
ST-005 P0 [done] Spawn ramps — AC: 8→5
ST-006 P0 [done] Plaza — AC: 5
ST-007 P0 [done] Perch + ramp — AC: 6.5
ST-008 P0 [done] Side descents — AC: 5→2.5
ST-009 P0 [done] Left low lane — AC: 2.5
ST-010 P0 [done] Right ledge — AC: 5
ST-011 P0 [done] Gorge floor — AC: 2.5
ST-012 P0 [done] Mid platform + ramps — AC: 4.5
ST-013 P0 [done] Grate bridges — AC: unpaintable
ST-014 P0 [done] Cover crates — AC: 6/half
ST-015 P0 [done] Outer cliffs — AC: 14 m
ST-016 P0 [done] Kill plane — AC: −3
ST-017 P0 [done] Spawn points — AC: 4/team
ST-018 P0 [done] Merged single mesh — AC: 1 draw
ST-019 P0 [done] Paint attributes — AC: aPaint
ST-020 P0 [done] Stage shader — AC: ink-aware
ST-021 P1 [done] Ramp visual slopes — AC: quads
ST-022 P1 [done] Sky gradient — AC: dome
ST-023 P1 [done] Distant mesas — AC: 40
ST-024 P1 [done] Hot-spring vents — AC: 4
ST-025 P1 [done] Spawn light towers — AC: team colour
ST-026 P1 [done] Void floor — AC: depth cue
ST-027 P1 [done] Slab grid lines — AC: subtle
ST-028 P1 [open] Playtest lane timings — AC: spawn→mid 9–11 s
ST-029 P1 [open] Height pass tune — AC: sightlines match
ST-030 P1 [open] Cover pass tune — AC: cover heights
ST-031 P1 [open] Paint surface pass audit — AC: all floors paintable
ST-032 P1 [open] Landmark pass (hot-spring pool, rock arches) — AC: 5 landmarks
ST-033 P2 [open] Environment art rocks — AC: procedural
ST-034 P2 [open] Materials variety — AC: 6 materials
ST-035 P2 [open] Props — AC: 20
ST-036 P2 [open] Baked lightmap — AC: texture
ST-037 P2 [open] Decals — AC: n/a
ST-038 P1 [open] Verify no holes/falls in blockout — AC: walk all lanes
ST-039 P1 [done] Wall tile registration — AC: exposed only
ST-040 P1 [done] Score mask from top-most box — AC: correct
ST-041 P1 [done] Nav grid from world — AC: auto
ST-042 P1 [done] Paint points for AI — AC: 18
ST-043 P2 [open] Steam particle vents — AC: VFX
ST-044 P2 [open] Signage (original) — AC: 4 signs
ST-045 P2 [open] Fog tuning — AC: horizon
ST-046 P2 [open] LOD for mesas — AC: n/a
ST-047 P2 [open] Merge mesas into 1 draw — AC: 1 draw
ST-048 P1 [open] Inkable wall audit (which are climbable) — AC: doc
ST-049 P2 [open] Sniper sightline check — AC: perch→mid clear
ST-050 P1 [done] Mid crate cover — AC: exists
ST-051 P2 [open] Spawn barrier (enemy can't enter) — AC: push-out
ST-052 P2 [open] Spawn ink at start — AC: n/a
ST-053 P2 [open] Stage intro camera fly-by — AC: 3 s
ST-054 P1 [open] Visual regression camera set — AC: 5 shots
ST-055 P2 [open] Colour grading to Scorch palette — AC: swatches
ST-056 P2 [open] Skybox sun disc — AC: n/a

## 3D modelling / materials (MD)
MD-001 P0 [done] Inkling head proportions — AC: big head
MD-002 P0 [done] Eyes w/ mask & pupil — AC: readable
MD-003 P0 [done] Tentacles (4 tubes) — AC: silhouette
MD-004 P0 [done] Ink tank — AC: fill level
MD-005 P0 [done] Compact torso/limbs — AC: shirt colours
MD-006 P0 [done] Shoes — AC: white soles
MD-007 P0 [done] Squid form — AC: fins/eyes/tentacles
MD-008 P0 [done] Splattershot model — AC: tank/nozzle/grip
MD-009 P0 [done] Splat Roller model — AC: drum/fork/handle
MD-010 P0 [done] Splat Charger model — AC: long barrel/scope
MD-011 P1 [done] Team colour application — AC: hair/squid/tank
MD-012 P1 [done] Skin/shirt variety — AC: seeds
MD-013 P1 [done] Weapon scale vs body — AC: visually checked
MD-014 P1 [done] Ears — AC: pointed
MD-015 P2 [open] Skinned glTF character — AC: replaces procedural
MD-016 P2 [open] LOD0/1/2 — AC: distance switch
MD-017 P2 [open] Eye blink — AC: n/a
MD-018 P2 [open] Mouth — AC: n/a
MD-019 P2 [open] Gear (headgear/clothes) — AC: 3 sets
MD-020 P2 [open] Materials stylised PBR — AC: MeshStandard
MD-021 P1 [done] Weapon tank ink visual — AC: exists
MD-022 P2 [open] Roller drum ink texture — AC: n/a
MD-023 P2 [open] Charger tank fill by charge — AC: n/a
MD-024 P2 [open] Merge character meshes — AC: 1 draw/char
MD-025 P1 [done] Blob shadows — AC: instanced
MD-026 P2 [open] Shadow maps HIGH tier — AC: toggle
MD-027 P2 [open] Rock materials — AC: 3
MD-028 P2 [open] Metal/grate materials — AC: n/a
MD-029 P2 [open] Crate texture — AC: n/a
MD-030 P2 [open] Ink material normal maps — AC: n/a
MD-031 P1 [done] Flow aura ring — AC: mesh
MD-032 P2 [open] Charger scope glow — AC: n/a
MD-033 P2 [open] Hair tip lighter colour — AC: done partially
MD-034 P2 [open] Squid transparency partially submerged — AC: n/a
MD-035 P2 [open] KTX2 textures — AC: n/a
MD-036 P2 [open] Meshopt — AC: n/a
MD-037 P1 [done] Material count low — AC: Lambert
MD-038 P2 [open] Toon ramp shading — AC: gradient map
MD-039 P2 [open] Outline pass HIGH — AC: n/a
MD-040 P2 [open] Hands with fingers — AC: n/a
MD-041 P1 [done] Body faces −Z convention — AC: eyes forward
MD-042 P2 [open] Spawn drone model — AC: n/a
MD-043 P2 [open] Landmark meshes — AC: n/a
MD-044 P2 [open] Sky clouds — AC: n/a
MD-045 P2 [open] Ink droplet mesh variety — AC: n/a
MD-046 P2 [open] Weapon LODs — AC: n/a

## Animation (AN)
AN-001 P0 [done] Walk/run leg cycle — AC: speed scaled
AN-002 P0 [done] Bob — AC: exists
AN-003 P0 [done] Lean into movement — AC: exists
AN-004 P0 [done] Aim pitch offset upper body/head — AC: exists
AN-005 P0 [done] Shooter recoil — AC: arm/weapon
AN-006 P0 [done] Roller roll pose — AC: low
AN-007 P0 [done] H-flick arc — AC: startup/swing
AN-008 P0 [done] V-flick arc — AC: overhead
AN-009 P0 [done] Charger raise — AC: exists
AN-010 P0 [done] Squid morph w/ anticipation — AC: no pop
AN-011 P0 [done] Swim bob/wobble/stretch — AC: exists
AN-012 P0 [done] Wall swim orientation — AC: tilt up
AN-013 P0 [done] Squid roll spin — AC: exists
AN-014 P0 [done] Landing squash — AC: exists
AN-015 P0 [done] Splat pop/spin/fade — AC: exists
AN-016 P0 [done] Respawn pop — AC: exists
AN-017 P1 [done] Tentacle sway — AC: exists
AN-018 P1 [done] Jump pose legs — AC: exists
AN-019 P1 [done] Invuln blink — AC: aura opacity
AN-020 P2 [open] Idle breathing — AC: subtle
AN-021 P2 [open] Turn-in-place foot shuffle — AC: n/a
AN-022 P2 [open] Strafe lean — AC: partial via lean
AN-023 P2 [open] Hand IK to weapon — AC: n/a
AN-024 P2 [open] Feet IK — AC: n/a
AN-025 P2 [open] Damage flinch — AC: n/a
AN-026 P2 [open] Squid surge crouch — AC: n/a
AN-027 P2 [open] Charger full charge pose hold — AC: n/a
AN-028 P2 [open] Roller dash pose — AC: n/a
AN-029 P1 [open] Foot sliding audit — AC: phase = speed
AN-030 P2 [open] Blend times — AC: n/a
AN-031 P2 [open] Additive recoil layer — AC: n/a
AN-032 P2 [open] Look-at head to target — AC: n/a
AN-033 P2 [open] Emotes — AC: n/a
AN-034 P2 [open] Victory/defeat poses — AC: n/a
AN-035 P2 [open] Intro pose — AC: n/a
AN-036 P2 [open] Skeletal clips — AC: n/a
AN-037 P1 [done] Weapon stays in hand — AC: parented
AN-038 P2 [open] Ink tank slosh — AC: n/a
AN-039 P2 [open] Swim exit splash pose — AC: n/a
AN-040 P2 [open] Air fall flail — AC: n/a
AN-041 P2 [open] Roller drum contact bounce — AC: n/a

## VFX (VF)
VF-001 P0 [done] Instanced particle pool — AC: 1 draw
VF-002 P0 [done] Impact splash — AC: burst
VF-003 P0 [done] Splat burst — AC: 40 particles
VF-004 P0 [done] Projectile instancing — AC: 1 draw
VF-005 P0 [done] Charger beam — AC: fade
VF-006 P1 [done] Laser sight — AC: lines
VF-007 P1 [done] Swim spray — AC: on fast swim
VF-008 P1 [done] Swim enter splash — AC: burst
VF-009 P1 [done] Player-hit splash — AC: burst
VF-010 P1 [done] Landing splash in ink — AC: burst
VF-011 P1 [done] Tier particle caps — AC: 300/600/900
VF-012 P2 [open] GPU particles (transform feedback) — AC: n/a
VF-013 P2 [open] Projectile trail — AC: n/a
VF-014 P2 [open] Roller roll spray — AC: n/a
VF-015 P2 [open] Steam vents — AC: n/a
VF-016 P2 [open] Respawn beam — AC: n/a
VF-017 P2 [open] Damage screen ink splats — AC: partial vignette
VF-018 P1 [done] Damage vignette — AC: CSS
VF-019 P1 [done] Enemy-ink pulse — AC: CSS
VF-020 P1 [done] Flow aura ring + glow — AC: exists
VF-021 P2 [open] Charger full-charge flash — AC: n/a
VF-022 P2 [open] Hit marker particles at reticle — AC: n/a
VF-023 P2 [open] Ink drip screen effect — AC: n/a
VF-024 P2 [open] Muzzle flash — AC: n/a
VF-025 P2 [open] Speed lines swim — AC: n/a
VF-026 P2 [open] Splat ink ring on ground — AC: paint exists

## AI (AI)
AI-001 P0 [done] Nav grid — AC: auto
AI-002 P0 [done] A* w/ ink costs — AC: path
AI-003 P0 [done] Danger field — AC: decays
AI-004 P0 [done] Perception LOS — AC: rays
AI-005 P0 [done] Memory last seen — AC: 3 s
AI-006 P0 [done] Utility objectives — AC: 4
AI-007 P0 [done] Paint goals — AC: coverage based
AI-008 P0 [done] Steering to path — AC: next node
AI-009 P0 [done] Aim w/ error/reaction/lead — AC: params
AI-010 P0 [done] Shooter behaviour — AC: bursts/paint
AI-011 P0 [done] Roller behaviour — AC: flick/roll
AI-012 P0 [done] Charger behaviour — AC: perch/charge
AI-013 P0 [done] Swim logic — AC: own ink
AI-014 P0 [done] Stuck recovery — AC: jump/repath
AI-015 P1 [done] Endgame paint bias — AC: < 35 s
AI-016 P1 [done] Retreat low hp/ink — AC: exists
AI-017 P1 [done] Climb edge behaviour — AC: paint+swim
AI-018 P1 [done] Strafing in combat — AC: exists
AI-019 P1 [done] Hidden squid perception — AC: rule
AI-020 P1 [done] Difficulty tables — AC: 3
AI-021 P1 [open] Difficulty selector UI — AC: menu
AI-022 P2 [open] Team communication (share targets) — AC: n/a
AI-023 P2 [open] Hearing model — AC: n/a
AI-024 P1 [open] Path planning in worker — AC: n/a
AI-025 P1 [open] AI cost < 1 ms/tick for 7 bots — AC: bench
AI-026 P2 [open] Super jump usage — AC: n/a
AI-027 P2 [open] Sub/special usage — AC: n/a
AI-028 P1 [open] Playtest: bots reach mid within 15 s — AC: observe
AI-029 P1 [open] Playtest: bots climb walls — AC: observe
AI-030 P1 [open] Playtest: charger holds perch — AC: observe
AI-031 P2 [open] Debug path draw — AC: toggle
AI-032 P2 [open] Bot personality variance — AC: n/a
AI-033 P1 [done] Bot squid refill — AC: needInk
AI-034 P2 [open] Avoid friendly fire lines (n/a) — AC: n/a
AI-035 P1 [done] Bots idle during intro — AC: no input
AI-036 P2 [open] Bot ledge awareness — AC: n/a

## Game rules (GR)
GR-001 P0 [done] 3:00 timer — AC: exact
GR-002 P0 [done] Intro countdown — AC: 3 s
GR-003 P0 [done] TIME UP freeze — AC: 2.5 s
GR-004 P0 [done] Turf calculation — AC: readback
GR-005 P0 [done] Winner — AC: result
GR-006 P0 [done] Draw handling — AC: −1
GR-007 P0 [done] Rematch — AC: cleared ink
GR-008 P0 [done] Change weapon — AC: back to select
GR-009 P0 [done] Team composition (all archetypes) — AC: setup
GR-010 P1 [done] 1-minute warning — AC: message+whistle
GR-011 P1 [done] Final 10 s tick — AC: sfx
GR-012 P1 [done] Killfeed — AC: 4 entries
GR-013 P1 [done] Stats: kills/deaths/painted — AC: result
GR-014 P2 [open] Overtime (none in Turf) — AC: n/a
GR-015 P2 [open] Points/XP screen — AC: n/a
GR-016 P2 [open] MVP — AC: n/a
GR-017 P1 [done] Respawn timers on pips — AC: exists
GR-018 P2 [open] Spawn protection zone — AC: n/a
GR-019 P1 [done] Score bar live — AC: exists
GR-020 P2 [open] Turf % per player — AC: n/a
GR-021 P1 [done] Flow Aura rule — AC: exists

## UI / UX (UI)
UI-001 P0 [done] Boot/menu — AC: BATTLE!
UI-002 P0 [done] Weapon select — AC: 3 cards
UI-003 P0 [done] HUD timer — AC: exists
UI-004 P0 [done] Team pips — AC: exists
UI-005 P0 [done] Reticle — AC: exists
UI-006 P0 [done] Ink gauge — AC: exists
UI-007 P0 [done] Charge bar — AC: exists
UI-008 P0 [done] Result screen — AC: exists
UI-009 P0 [done] Touch buttons — AC: exists
UI-010 P1 [done] Pressed states + haptic — AC: exists
UI-011 P1 [done] Safe areas — AC: env()
UI-012 P1 [done] Portrait prompt — AC: exists
UI-013 P1 [done] Killfeed — AC: exists
UI-014 P1 [done] Damage/enemy-ink overlays — AC: exists
UI-015 P1 [done] Health indication — AC: exists
UI-016 P1 [done] Weapon/roller state label — AC: exists
UI-017 P1 [done] Splatted + respawn — AC: exists
UI-018 P1 [done] Messages GO/1 MIN/GAME — AC: exists
UI-019 P1 [done] Debug panel — AC: exists
UI-020 P1 [done] Non-generic style (skew/blob/ink) — AC: no cards/gradient purple
UI-021 P2 [open] Settings (sens, invert, quality) — AC: n/a
UI-022 P2 [open] Pause — AC: n/a
UI-023 P2 [open] Tutorial hints first match — AC: partial in intro
UI-024 P2 [open] Localisation JP toggle — AC: n/a
UI-025 P1 [done] Gyro/recenter buttons — AC: exists
UI-026 P2 [open] Map overlay — AC: n/a
UI-027 P2 [open] Special gauge (n/a) — AC: n/a
UI-028 P1 [done] Low ink stripe — AC: exists
UI-029 P2 [open] Font fallback offline — AC: partial
UI-030 P1 [open] Small-screen (≤ 640 px h) layout check — AC: buttons don't overlap
UI-031 P2 [open] Result animations — AC: n/a

## Audio / haptics (AU)
AU-001 P0 [done] Synth SFX engine — AC: exists
AU-002 P0 [done] Shoot — AC: exists
AU-003 P0 [done] Roller flick/roll loop — AC: exists
AU-004 P0 [done] Charger charge/full/fire — AC: exists
AU-005 P0 [done] Impact/hit/splat — AC: exists
AU-006 P0 [done] Swim/jump/land — AC: exists
AU-007 P1 [done] Countdown/start/whistle/result — AC: exists
AU-008 P1 [done] Panning by position — AC: exists
AU-009 P1 [done] Rate limiting — AC: minGap
AU-010 P1 [done] Init on gesture — AC: exists
AU-011 P2 [open] Music — AC: original
AU-012 P2 [open] Ambience (steam/wind) — AC: n/a
AU-013 P2 [open] Volume settings — AC: n/a
AU-014 P1 [done] Haptic buttons — AC: exists
AU-015 P2 [open] Haptic on hit/splat — AC: n/a
AU-016 P2 [open] Squid voice — AC: n/a

## Mobile / performance (MB)
MB-001 P0 [done] Landscape-first layout — AC: exists
MB-002 P0 [done] touch-action none — AC: exists
MB-003 P0 [done] viewport-fit cover — AC: exists
MB-004 P0 [done] DPR cap — AC: 1.5/2
MB-005 P0 [done] Render scale — AC: exists
MB-006 P0 [done] Dynamic resolution — AC: exists
MB-007 P0 [done] Tier detection — AC: exists
MB-008 P0 [done] Single stage draw — AC: exists
MB-009 P0 [done] Instanced particles/projectiles — AC: exists
MB-010 P1 [done] Frame time clamp on resume — AC: exists
MB-011 P1 [done] Fullscreen + orientation lock attempt — AC: guarded
MB-012 P1 [done] No antialias (perf) — AC: exists
MB-013 P1 [open] Merge mesas → 1 draw — AC: n/a
MB-014 P1 [open] Merge character meshes — AC: n/a
MB-015 P1 [open] Measure draw calls on device — AC: < 200
MB-016 P1 [open] Measure 60 fps mid-range — AC: bench
MB-017 P1 [open] 1 % low > 45 — AC: bench
MB-018 P2 [open] Half-res ink RTs LOW — AC: n/a
MB-019 P2 [open] Shader precompile warm-up — AC: n/a
MB-020 P1 [done] Texture memory doc — AC: 24 MB
MB-021 P1 [done] Heap stat — AC: debug
MB-022 P2 [open] Thermal throttle detection — AC: n/a
MB-023 P1 [done] Resize handling — AC: exists
MB-024 P1 [open] iOS Safari test — AC: pass
MB-025 P1 [open] Android Chrome test — AC: pass
MB-026 P2 [open] PWA manifest — AC: n/a
MB-027 P2 [open] Offline fonts — AC: n/a
MB-028 P1 [done] No console errors in build — AC: verified statically
MB-029 P1 [open] Runtime console clean on device — AC: 0 errors
MB-030 P2 [open] Battery-saver 30 fps mode — AC: n/a
MB-031 P1 [done] Pointer capture on buttons — AC: exists
MB-032 P1 [done] Stick zone 42 % width — AC: exists
MB-033 P2 [open] Button size scaling by screen — AC: n/a
MB-034 P1 [open] Memory leak 60 s stress — AC: flat heap
MB-035 P2 [open] GC spike audit — AC: n/a
MB-036 P1 [done] Pool sizes bounded — AC: exists
MB-037 P2 [open] Reduce bot perception rays — AC: n/a
MB-038 P1 [open] Ink flush cost measure — AC: < 0.5 ms
MB-039 P2 [open] Sky dome poly reduce — AC: n/a
MB-040 P1 [done] Frustum culling on characters — AC: default
MB-041 P2 [open] Distance culling — AC: n/a
MB-042 P2 [open] Lower nav rebuild cost — AC: n/a
MB-043 P1 [done] Single-file build — AC: dist/index.html
MB-044 P2 [open] Code splitting — AC: n/a
MB-045 P1 [done] WebGL2 required message — AC: partial
MB-046 P2 [open] Low-memory mode — AC: n/a

## Testing / fidelity evaluation (TS)
TS-001 P0 [done] Build passes — AC: yes
TS-002 P0 [done] Typecheck strict — AC: yes
TS-003 P0 [wip] Boot in browser w/o errors — AC: device
TS-004 P0 [open] Shooter full match playtest — AC: result screen
TS-005 P0 [open] Roller full match playtest — AC: result screen
TS-006 P0 [open] Charger full match playtest — AC: result screen
TS-007 P1 [open] Shooter golden — AC: numbers
TS-008 P1 [open] Roller golden — AC: numbers
TS-009 P1 [open] Charger golden — AC: numbers
TS-010 P1 [open] Camera golden — AC: baseline
TS-011 P1 [open] Ink golden — AC: images
TS-012 P1 [done] CPU/GPU score parity log — AC: console
TS-013 P1 [open] Parity < 1 % verified — AC: run
TS-014 P1 [open] Visual regression set — AC: shots
TS-015 P1 [open] Reference side-by-side — AC: 6 comparisons
TS-016 P1 [open] Silhouette IoU character — AC: > 0.8
TS-017 P1 [open] Stage landmark overlay — AC: n/a
TS-018 P1 [open] Stress 60 s — AC: stable
TS-019 P1 [open] Memory leak check — AC: flat
TS-020 P1 [open] Backend parity (future) — AC: n/a
TS-021 P1 [done] Deterministic fixed-step design — AC: no dt in sim rules
TS-022 P1 [open] Movement timing test — AC: 4.8/9.6
TS-023 P1 [open] Jump test — AC: 0.5 s
TS-024 P1 [open] Swim test — AC: 9.6
TS-025 P1 [open] Wall climb test — AC: SWIM_WALL
TS-026 P1 [open] Ink state test — AC: floorTeamAt
TS-027 P1 [open] Turf scoring test — AC: walls excluded
TS-028 P1 [open] Fire rate test — AC: 6 f
TS-029 P1 [open] Damage test — AC: 36
TS-030 P1 [open] Range test — AC: 11.5
TS-031 P1 [open] Ink consumption test — AC: 0.92
TS-032 P1 [open] Charger charge test — AC: 60 f
TS-033 P1 [open] Roller timing test — AC: 8/17 f
TS-034 P1 [open] Respawn test — AC: 8.5 s
TS-035 P1 [open] Match timer test — AC: 180
TS-036 P1 [open] Winner calc test — AC: correct
TS-037 P1 [open] AI state transitions — AC: observed
TS-038 P1 [open] Vitest harness — AC: npm test
TS-039 P2 [open] Playwright device emulation — AC: n/a
TS-040 P2 [open] Screenshot automation — AC: n/a
TS-041 P1 [open] Adversarial pass 1 systems (20 items) — AC: DEVELOPMENT.md (7 fixed so far)
TS-042 P1 [open] Adversarial pass 2 fidelity — AC: 20 candidates
TS-043 P1 [open] Adversarial pass 3 mobile — AC: 20 candidates
TS-044 P1 [done] SCORECARD w/ evidence — AC: exists
TS-045 P1 [open] Top-20 gap list refresh — AC: after playtest
TS-046 P2 [open] Colour difference measure — AC: ΔE
TS-047 P2 [open] Travel-time comparison — AC: table
TS-048 P2 [open] Weapon rate error — AC: 0 %
TS-049 P2 [open] Camera trajectory error — AC: < 5 cm
TS-050 P2 [open] Paint mask IoU vs reference — AC: > 0.7
TS-051 P1 [open] Console error scan on all screens — AC: 0
