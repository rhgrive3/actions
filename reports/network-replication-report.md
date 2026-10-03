# Network replication repair

Baseline: `5e28dbd16f7829aebd88052ff5f7fdf71f39fdad` (remote main observed before work). Branch: `inkwave/network-sync`. Upstream INKWAVE sources and weapon tuning are immutable. No merge into main.

## Root cause

`WeaponRunner._roller` captures airborne/grounded mode at attack admission. `installWeapons.fireFlick` selects vertical/horizontal generation parameters and native `fireFlick` creates the authoritative volley. Native `_push` immediately calls `NetMatch.recProj`; the gameplay wrapper previously assigned gravity/drag **after** this publication. Local droplets therefore used gravity 144 and drag 6, while remote events contained gravity 26 and drag 0.4. This is a state publication ordering defect, not a range problem. The visual quality wrapper also used mutable actor mode and the remote curtain inferred vertical from cosmetic shape channels.

The active fireFlick attack parameters finalize physics before _push publication; reconstruction never substitutes the actor's mutable profile. Each birth explicitly carries mode and the existing appearance seed, plus a sender-scoped projectile identifier. Receiver reconstruction consumes those immutable fields. No range, speed, damage, spread, gravity, drag, lifetime, animation pose, input admission, or native random draw has been tuned.

## State and packet ownership

- Owner input and WeaponRunner admit the attack. The owner alone generates damage projectiles and their physics, and records paint results.
- `p` events retain the original positional fields, append mode, seed, and projectile identifier. Exact physics timing is preserved instead of rounding delay/life/straight boundaries. Initial position and velocity retain existing 0.01 quantization.
- Transport remains ordered, reliable WebSocket JSON through the existing relay. Snapshot frequency remains 20 Hz. No extra transport packet type or send timer.
- Remote ghosts are visual copies with zero damage and muted paint. Owner paint (`s`) and hit routing remain independent from ghost rendering. Remote actor interpolation continues to use the existing sender playback clock; projectile, bomb, storm cloud, and charger beam playback now shares it, mapped to executed owner simulation ticks. Each tick carries u; event schema r:2 adds [birth/terminal physics tick, ordered event sequence] footer. Receiver interpolation maps wall playback time to sampled owner ticks and holds beyond the newest completed tick. Events also wait for their owner tick; several physics steps within one render batch cannot cause premature terminal playback.
- Owner terminal (`pe`) events retire projectile-linked visuals for authoritative actor collisions. Ghost actor/boss collision guesses cannot replace owner outcomes. Static world collision uses native physics.
- Curtain droplets and puffs bind to immutable projectile identity/generation and positions; dead/recycled sources render no flying ink. There is no distance clamp.
- Stale/duplicate ticks are rejected before changing playback state. Projectile replay identity is scoped to the sender and actor ownership is checked before accepting births, terminals, bombs, triggers, and actor events.

## Trace through the full path

Input → `WeaponRunner.update/_roller` → gameplay mode selection → native `Projectiles.fireFlick` spawn/aim/spread and active-attack physics finalization → visual/gameplay `_push` → `NetMatch.recProj` → `_sendTick` → `Transport.broadcast` → relay `handleSession` → `Transport.onMessage` → `NetMatch._tick` → actor snapshot interpolation and event playback → `ghostProjectile` → sender-clock native integration → linked curtain generation → actual instance attributes/GPU render. Damage, paint, and cosmetic FX have different ownership; ghost simulation cannot score paint or damage.

## Agent findings

`agy-yolo-2` independently confirmed publication ordering and reviewed event/state separation and clock risks. Its simplified analytical range estimates are diagnostic only; acceptance uses native integrator measurements. `cline-3` could not obtain a usable provider response and was stopped; its durable send-lane handoff moved to `cline-4`. `cline-4` receive review/probe identified stale/default field risks; after DeepSeek daily exhaustion it continued through Muse xhigh to MiMo after both daily quotas exhausted, completed durable receive/send reviews, and took the send lane. `freebuff-3` supplied comparison tests and a first harness. Parent rejected its shadow integrator as acceptance evidence, replaced it with actual native update/_step/JSON receive replay, seeded both contexts, and verified all weapon cases. `freebuff-4` supplied delayed/duplicate/stale/reconnect/late-join tests; parent checked the fixture profile installation and the limitations of the late-join case. Parent verifies artifacts and tests, not agent completion claims. The independent architecture review exposed late curtain lookup, skipped terminal airburst, bomb/event replay, and orphan cleanup; each gained a regression. Its proposed storm-cloud +1 offset was rejected after native replay: bombs and clouds both integrate on their birth frame, so the existing minus-one birth offset is correct. Several review probes imported raw unadapted visual sources; those assertions were not accepted as final build verification.

## Validation and measurements

The harness uses the real native projectile updater and collision integrator in two VM module contexts, with the build adapter chain, deterministic seeds, real event generation/JSON encoding/receive and 20 Hz snapshots. Floor collision and paint sinks are bounded fixtures; the paint sink records authoritative landing/seed, rather than asserting GPU paint-mask pixels. Both states are compared at the same projectile age; fixed reconstructed steps cannot silently skip missing owner timestamps. Values below describe this fixture and are not weapon range calibration.

| Attack | Owner distance before/after (m) | Remote before → after (m) | Owner lifetime (s) | Remote lifetime before → after (s) | Worst fixed position error (m) |
|---|---:|---:|---:|---:|---:|
| horizontal | 9.089499 | 68.484250 → 9.089551 | 0.483333 | 1.416667 → 0.483333 | 0.000865 |
| vertical | 16.554965 | 120.839065 → 16.554674 | 0.650000 | 1.416667 → 0.650000 | 0.000964 |

All 24 before/after cases passed: horizontal/vertical roller, shooter, dualies, blaster, splatling, slosher, bomb, storm, and zero/half/full charger. Splatling also had a one-frame gravity/retirement mismatch from rounded straightTime; exact timing fixes it. Fixed bomb bounce position differs by at most 0.01223 m from existing spawn/velocity quantization. Owner/remote paint counts and seeds agree; paint position error remains below 0.00741 m from existing 0.01 m coordinate quantization. Beams retain zero charge/length and native age/lifetime; storm cloud timing includes native birth-frame integration.

Two isolated Chromium profiles use actual NetSession/Transport, actual WebSocket sockets, the production RoomDurableObject.handleSession relay, native physics, Fx/FxHooks and GPU instance attributes. The test adapts only Cloudflare's upgrade to Node ws. The arena omits full menus, character meshes and audio; existing full-game browser gates remain separate. Each owner performs horizontal → vertical → horizontal → vertical → horizontal. 92 corresponding projectiles are checked, with strict per-age trajectory comparison. Zero-delay and ordered six-frame (100 ms simulation) delivery both pass. Worst delayed position error is 0.001033 m; spawn error zero; initial velocity error below 0.008 m/s. Both clients retire all ghosts. Droplet centers stay on their source prev→pos segment, puff centers on their source position, and no dead/recycled source leaves visible linked ink. Shader radii retain normal bounded cosmetic silhouette. Actual renders/screenshots and 76 loaded module byte hashes accompany the receipt.

40 focused network contracts pass, covering delay, duplicate/stale/non-finite packets, missing snapshots, catch-up bounds, multi-tick render hitches, event tick gating, consecutive mode changes, actor-hit termination and zero ghost damage, slam event idempotence, disposal and ownership handoff. The late-join test exercises ownership binding only; joining a locked running relay is unsupported by the existing protocol. A missing snapshot is recovered by a newer snapshot; losing an event packet is not repaired by inference.

### Bandwidth and allocation measurements

| Native one-attack trace, 12.5 s | Before bytes | After bytes | Packets/s | Event tuple allocations before → after | Projectile objects owner/remote before → after |
|---|---:|---:|---:|---:|---:|
| horizontal | 22444 | 25997 | 20 → 20 | 25 → 37 | [12, 12] → [12, 12] |
| vertical | 21279 | 24243 | 20 → 20 | 11 → 16 | [5, 5] → [5, 5] |
| shooter | 20559 | 23173 | 20 → 20 | 3 → 4 | [1, 1] → [1, 1] |
| bomb | 20636 | 23316 | 20 → 20 | 7 → 7 | [0, 0] → [0, 0] |

The two-player burst fixture sends 274 tick packets over 6.833 s before and after (137/player). JSON application bytes, including b| envelopes, increase from 60,200 to 78,238 (+29.96%); this includes sparse seeds/mode/IDs, sequence/tick footer, and terminal records. It excludes WebSocket/TLS framing. Idle snapshots add only u (about 10 bytes at the harness's tick values); r is present only with events. No per-projectile periodic snapshots, new packet timer, or position streams were added.

Peak per-client remote projectile count falls 17 → 12; projectile pool allocations fall 29 → 24; total projectile peak 29 → 24. Droplet FX peaks are 45/44 → 48/45; puff peaks 38/38 → 35/39. FX is stochastic, so these are observed counts, not a deterministic benchmark of every draw. No new FX class or per-frame vector/object allocation was added by production linkage: one lazily retained source-reference array and Uint32 generation array per puff pool; 40 flat wall-time/tick sample pairs per peer. Sequence metadata lives on existing event tuples; one volley event copy occurs per roller attack. Native owner random draw counts are unchanged in all isolated cases (horizontal 96, vertical 40, shooter 4, bomb 47); appearance seed overwrite retains the existing ghost birth RNG draw. Corrected ghost impacts naturally execute native cosmetic RNG at different times; no global gameplay RNG isolation is claimed.

### Exact-source regression receipts

Candidate topic branch validation is run with `.github/workflows/validate-inkwave-update.yml` and an immutable source_sha input. Gameplay, local-quality, network and motion verifier suites run in validate; active full-game, complete catalog, Chromium/WebKit UI/lifecycle/responsiveness, and two-player network browser families run with maximum parallelism two. All source verifiers now resolve network-replication inputs; a forged uncommitted network overlay must fail identity checking. Final run IDs, commit identity and downloaded artifact verification are recorded below after completion.


## Remaining risks

WebSocket provides ordered delivery; arbitrary loss of an individual application event requires a protocol-level repair scheme, not silent visual inference. Late joining an already locked match remains the existing unsupported behavior. The existing hit/paint channels are trusted-peer channels, not an anti-cheat system; this change does not redesign that security boundary. Mixed old/new build clients must refresh to the same release for the corrected contract. Browser simulation and native integrator tests do not attest a physical iOS device; no iOS lifecycle changes are in this workstream.
