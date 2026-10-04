# Big Bubbler (issue 177 kit work) — INKWAVE public runtime

Scope: `inkwave-public/` composed through `patches/splatoon3`. `game/` is out of
scope and was removed from `main` by merged PR #185. This lane owns **only**
`patches/splatoon3/runtime/kit-big-bubbler.mjs`, its own test file and this
report. Profile, install/adapter, gear and network composition belong to the
parent; the exact hooks are listed below and are not applied here.

## Reference and pinned receipts

Target: Splatoon 3 **Ver. 11.3.0**, splat3 commit
`7280ff9cde8bb1c5dcef46c700c326471584d2e6`. Primary receipts (pinned, unmodified)
in `evidence/actions-freebuff-20261004/kit-primary/`:

| Receipt | What it fixes |
|---|---|
| `base-kit-fields.json` | `Roller_Normal_00` → `SpGreatBarrier` special, `SpecialPoint` 180 |
| `WeaponInfoSpecial.json` | `__RowId "SpGreatBarrier"`, `Id 2`, `StandAlone false` (not a standalone special) |
| `WeaponSpGreatBarrier.game__GameParameterTable.json` | every geometry/HP/duration number used below |

`SpGreatBarrier` is Big Bubbler. `SpBlower` in the same receipts is **Ink Vac**
(Splat Charger), and `SpUltraShot` is Trizooka (Splattershot) — they are not
this module and are not implemented here.

Pinned values, verbatim (module constants `BIG_BUBBLER_RAW`):

| Field | Raw |
|---|---|
| `MaxHP.Low / Mid / High` | 15360 / 16896 / 18432 |
| `MaxFieldHP.Low` | 30720 |
| `TimeDamage` / `TimeDamageOnVLift` | 921 / 1842 |
| `MinRadius` / `MaxRadius` | 2.255 / 7.5 |
| `RadiusRatioCurve`, `AscendCurve` | Hermit2DSmooth, `MaxX 1.0` |
| `AscendFrame` / `AscendHeight` / `IgnitionFrame` | 30 / 8.5 / 15 |
| `FieldCollisionRadius` | 0.4 |
| `OverlapFieldDamage` / interval | 5 / 5 |
| `BaseParam.PaintRadius` | 4.5 |
| `CanopyKnockBack` / `DamgeRatio` | 700 / 0.64 (recorded, not used) |

## What is calibrated, not sourced

`BIG_BUBBLER_CALIBRATION` is a declared mapping. Per AGENTS no unconfirmed value
is presented as a Nintendo one.

- **`rawPerDamageUnit = 100`** — raw dome HP per INKWAVE damage unit. The 11.3.0
  tables state no such factor. It is deliberately **not** the weapons' damage
  factor and is **not** applied as HP/10; at 100 a 36-point Splattershot direct
  hit costs ~6.7 % of a 0-AP canopy. The scale-independent part of the data (the
  ratio `MaxHP / TimeDamage`) is what the implementation actually relies on.
- **`timeDamageIntervalSeconds = 1`** — TimeDamage read as a per-second rate. A
  per-frame reading ends a full canopy in 16.7 ticks (0.28 s), which contradicts
  the observable multi-second dome, so that reading is rejected **as an
  inference, not as a source**. One constant switches it; the module's exported
  tests then need re-basing.
- **`radiusGrowthSeconds = 45/60`** — mapped onto the pinned drone frames
  (`AscendFrame` + `IgnitionFrame`). The tables carry no growth window.
- **`deployDistance = 3`** — landing point ahead of the owner. The tables carry
  no throw distance or arc.
- **`radius = MinRadius + (MaxRadius - MinRadius) * curve`** — declared mapping
  of `RadiusRatioCurve` onto the named Min/Max radius pair.
- **`OverlapFieldDamage` is OFF.** Its unit is unresolved: read through the
  canopy mapping it is 5/100 = 0.05 INKWAVE damage per 5-frame tick. Enabling it
  would assert gameplay no receipt supports. The code path exists and is gated
  by `profile.kits.bigBubbler.overlapFieldDamage`.
- **`eraseOnOwnerReset = false`.** `Actor.reset()` is the *respawn* path, so
  erasing there would delete the dome immediately after the owner's own death,
  which the reference does not do. See "Expiry" below.

No new guessed Nintendo value was introduced by this revision. The only new
numbers are the *candidate's own* test tolerances (brute-force march step size).

Unverified and not implemented: the throw arc/animation, the emitter's own
damage model beyond its HP, `CanopyKnockBack` knock-back, `DamgeRatio`, the
`MaxHP.Mid/High` Ink Resistance tiers, and `TimeDamageOnVLift`.

## The contact-query contract (what changed in this revision)

The previous revision shipped a **predictive `_step` fallback**. It is gone. The
parent rejected it for two reasons, both correct:

1. It duplicated the native gravity/drag integration, so a round was integrated
   twice with two different truths.
2. It intercepted **before** checking the native wall/actor/boss contacts, so a
   dome behind a nearer wall could claim a hit that the wall already owned.

`Projectiles.prototype._step` is now **untouched**; a test asserts it is
identical to the composed native method. There is no fallback switch, no
`barrierProjectile` and no extra pass over `Projectiles.list`.

What the module exposes instead is a **side-effect-free candidate query**:

```js
Projectiles.prototype.kitBarrierCandidate(p, start, end) -> candidate | null
kitBarrierCandidate(p, start, end)                        // module-level, same thing
```

- `p` is the native projectile record; `start`/`end` are the two points the
  native step is *already* testing (normally `p.prev` → `p.pos`). Defaults are
  `p.prev` / `p.pos`.
- Reading a candidate mutates nothing: no position, no HP, no turf, no paint, no
  event. That is proven by a test that snapshots all four around the call.
- `candidate.distance` is a **WORLD** distance: first-entry fraction `t` times
  `start.distanceTo(end)`. It is directly comparable with `Hit.dist` from the
  native `G.physics.segment`, the actor-capsule distance and the boss
  `segHit`. A dome behind a wall therefore *must* report a larger distance.
  A test measures both against the same segment in a real `Physics` level and
  asserts the wall wins; removing the wall flips the same query to the dome.
- The candidate also carries `t`, `point`, `normal`, `target`
  (`'canopy' | 'field'`), `dome`, `domeId`, `team`, `damage`, `visualOnly`,
  `settled` and `onHit()`.
- `onHit()` is the **only** mutation: it spends the dome HP, emits
  `kit:bubbler:hit` (or `kit:bubbler:burn` / `kit:bubbler:overlap` for internal
  ticks, so an incoming contact is never confused with the TimeDamage burn),
  spawns the native FX, and is **idempotent** — a second call returns 0.
- The candidate reuses **one** internal record, so it is valid only until the
  next query. The caller must arbitrate and settle before asking again.

Long steps and inside origins:

- A 120 m step reports the same world distance as a short step covering the same
  entry point (verified against a brute-force march of the segment), so a large
  `dt` cannot inflate or hide a contact.
- A segment that **starts inside** the sphere yields `null`, so anyone — owner
  or hostile — inside the dome may shoot out. That is also what makes the
  hostile-inside shielding rule below work.
- Friendly rounds (`p.team === dome.team`) are never candidates.

The exposed emitter is a **distinct** target: once armed it is a separate sphere
above the shell with its own `MaxFieldHP` budget, so it can be shot without
crossing the canopy, and draining it collapses the dome.

### Ghost rounds

A ghost round (`p.ghost`, the native remote-image flag) **may** be stopped at the
dome — that is what makes the remote image match — but `visualOnly` is forced and
`onHit()` is a no-op: no HP, no turf, no paint, no event. A test proves all four.

## What else the module does

`installKitBigBubbler(api, profile)` exports only this module's behaviour:

- **Activation, guarded** — wraps `Actor.prototype._startSpecial`. The native
  activation has no branch for this id, so it still owns the gauge cost, the
  `stats.specials` bump, the form change and the audio; the module only deploys
  the structure afterwards, and only when all four hold: the gauge actually held
  a full charge **before** the call, the native activation ran exactly once
  (`stats.specials + 1` and `special` back to 0), the actor is alive, and the
  call is not re-entrant. A manual `_startSpecial()` on an uncharged, dead or
  re-entrant actor therefore deploys nothing, and a re-entrant chain fails
  closed. No renamed Tidal Slam / Ink Tempest state is created and no
  invulnerability is granted. **The module never touches `ink`**: the refill
  stays with the parent's `resources.mjs` (see the gaps section).
- **Stationary dome** — never moves after landing; the owner may leave.
- **Radius growth** — `Hermit2DSmooth` evaluation of the pinned curve between
  `MinRadius` and `MaxRadius`, monotonic, capped at the pinned `MaxRadius`.
- **Timed activation** — arms exactly on the pinned `IgnitionFrame` (15), paints
  the interior with the pinned `BaseParam.PaintRadius`, then applies the pinned
  `TimeDamage` to the canopy until it collapses.
- **Emitter** — rises on the pinned `AscendCurve` to `AscendHeight`, above the
  shell, and has its own `MaxFieldHP` budget.
- **Structure clock** — `tickBigBubblers(dt)` drives growth, ignition and the
  burn only. It reads no round list and integrates nothing native. It is wired
  to `Projectiles.update` so the dome lives on the native clock, and the caller
  may drive it directly instead.
- **Paint/damage ownership** — paint only through `G.paint.splat`; damage only
  through this module's HP budgets and, where used, the native
  `G.projectiles.applyHit`. There is no second physics, damage or paint engine.
- **Visual** — a real `THREE` hemisphere plus emitter mesh in `G.scene`, team
  coloured; every geometry and material is disposed on removal.
- **Disposal** — `Projectiles.clear()` (the match-disposal path in `main.js`)
  removes every dome and releases its scene objects.

Actors walk into the dome freely: no push, no damage for standing inside, no
invulnerability for anyone. Only enemy rounds are candidates.

## Explosion shielding handoff

```js
Projectiles.prototype.kitBarrierShelter(p, start, end) -> descriptor | null
kitBarrierShelter(p, start, end)                          // module-level
```

This is a **handoff, not an integration**: the module does not touch any blast,
bomb, `_blastBurst` or `los` path. It adds exactly one more candidate to the
*same* native first-contact arbitration the parent already performs, so that when
the dome is the first thing a blast segment touches, the parent consumes the blast
at the dome instead of at the target.

It deliberately does **not**:

- touch `Actor.invuln` — nobody inside the dome becomes invulnerable, so there is
  no universal player invulnerability;
- shield a blast whose origin is **inside** the dome (an inside origin yields no
  candidate), so an attacker standing in the dome keeps its native hostile
  behaviour and is still hittable;
- add a wall test or replace `Physics.los`, so native cover keeps working. A
  test asserts `G.physics.los` is still the native method and that asking for a
  shield does not change its answer.

A test proves all of the above plus: a missing dome, a blast that misses the dome
and a friendly blast all return `null`, and the shielding query itself spends no
HP (that stays the caller's `onHit()` decision).

Sweeping enemy rounds that were *inside* the dome when it collapses is **not**
implemented. If the parent wants it, subscribe to `kit:bubbler:collapse` and route
the burst through the native blast path; the burst radius and parameters are not
pinned by any receipt and no value is guessed here.

## Remote replay API (concrete, no online parity claim)

### Ownership, stated rather than implied

`BIG_BUBBLER_OWNERSHIP` is exported and frozen. It names what this lane owns and,
just as importantly, what it does **not**, so the network lane never has to guess
whether a gap is a decision or an omission:

| Owns | Does not own |
|---|---|
| authoritative local dome lifecycle (deploy, growth, ignition, TimeDamage burn, expiry) | packet transport, framing, rate limiting, any NetMatch wiring |
| presentation-only remote dome lifecycle driven by `replayBigBubbler()` | authoritative HP of a remote dome |
| side-effect-free contact candidate queries for local *and* remote domes | client prediction, interpolation, reconciliation, rollback |
| bounded, idempotent replay ingest of `deploy` / `hit` / `expire` | adjudicating whether a proposed remote hit is accepted |

`remoteHpAuthority` is the host: a local round hitting a remote dome yields
`kit:bubbler:damage-proposal` and changes nothing on this client.

### The ingest call

```js
replayBigBubbler(eventName, owner, plainPayload) -> { ok: boolean, reason: string, ... }
Projectiles.prototype.kitBubbleReplay(eventName, owner, payload)   // same thing
```

`eventName` is `'deploy' | 'hit' | 'expire'`. `owner` is the **local actor proxy**
for the remote owner; the payload is treated as untrusted plain data and is never
dereferenced, so a payload-supplied `owner` is ignored.

Guarantees, each proven by a test:

- **The transmitted position is restored exactly.** It is never re-derived from
  the proxy's aim: aim is local state the sender does not own, and re-deriving it
  put the dome tens of metres away from where the host said it was.
- **Bounded validation.** Nothing allocates from the payload: `domeId` is a
  non-empty string capped at 64 characters, `team` is an integer in `[0, 3]`,
  `pos` is exactly three finite numbers within ±1e4, `t` is finite in `[0, 600]`,
  `hp`/`fieldHp` are finite in `[0, 1e9]`, `serial` is a non-negative safe integer.
  Anything else returns an explicit `reason` (`bad-dome-id`, `dome-id-too-long`,
  `bad-team`, `bad-position`, `bad-age`, `bad-hp`, `bad-field-hp`, `bad-serial`,
  `not-an-object`, `unknown-event`) and creates nothing. It never throws.
- **Idempotent deploy / hit / expire.** A duplicate deploy is `duplicate`, a
  duplicate hit is `duplicate` and cannot spend HP twice, a duplicate expire is
  `duplicate`. Dedupe keys live in a **bounded FIFO of 256 entries**, so a long
  match cannot grow the set without limit.
- **Never silently ignored.** Every call returns `{ ok, reason }`. An expire for
  a dome this client never saw is `ok: true, reason: 'already-absent'`, not a
  silent drop.
- **A remote dome is presentation only.** `tickRemoteBigBubblers(dt)` advances
  only what may be drawn — age, radius, emitter height, the armed flag. It applies
  **no paint, no TimeDamage burn, no authoritative HP**, never expires a dome on
  its own, and emits only `kit:bubbler:remote:ignite` /
  `kit:bubbler:remote:gone`, both flagged `presentationOnly`. The authoritative
  `kit:bubbler:*` streams stay empty for a remote dome.

### Identity and serials

Dome ids are `${team}:${ownerKey}:${serial}` with a monotonic per-session
`serial`, and `ownerKey` is `bigBubblerOwnerId(owner)`:

- `n${owner.nid}` when a live net id exists — `match.js` assigns `Actor.nid` from
  the room roster, so that is the real identity;
- otherwise a stable per-actor-instance key minted once on the actor.

The previous `owner.slot ?? 0` fallback is **gone**. It was not an identity: two
actors on the same team with the same special count produced the same dome id. A
test asserts two same-team actors still get distinct ids and that no
`team:slot:count` identity is emitted, and that a later `nid` is preferred.

### Remote domes and local rounds

A candidate now carries `ownership`, `reachable`, `serial` and `remote`:

| Situation | Behaviour |
|---|---|
| local round → authoritative dome | `onHit()` spends HP once, as before |
| local round → **remote** dome | `onHit()` returns 0, spends nothing, sets `candidate.proposal` and emits `kit:bubbler:damage-proposal` with a JSON-safe `{ domeId, serial, team, target, amount, point, normal }` |
| ghost round (any dome) | intercepted for the image; `visualOnly`, `onHit()` 0, **no proposal at all** |
| neutral round (`p.team` missing or non-integer, any dome) | same as a ghost: it may be intercepted visually but can never spend a budget |
| `onHit()` on a stale candidate | re-checks that the dome is alive and still registered, then spends 0 |

`candidate.reachable = { canopy, emitter }` reports which of the two targets the
exact segment can reach, so "the emitter is exposed" is distinguishable from
"this shot passes over it".

### The wire form of a local dome

`bigBubblerSnapshot()` returns exactly the payload `replayBigBubbler('deploy', …)`
accepts: `[{ id, domeId, serial, team, t, pos, radius, emitterY, hp, fieldHp, ignited }]`,
all plain JSON-safe data. Positions and normals are built as array literals rather
than `Vector3.toArray()`, because the vendor THREE is loaded from the host module
and `toArray()` would hand callers arrays whose prototype comes from that realm.

### Authoritative event streams

| Stream | Payload |
|---|---|
| `kit:bubbler:deploy` | `{ owner, domeId, serial, team, pos, hp, fieldHp }` |
| `kit:bubbler:ignite` | `{ owner, domeId, team, pos }` |
| `kit:bubbler:hit` | `{ owner, domeId, team, target, amount, cause:'shot', hp, fieldHp }` |
| `kit:bubbler:burn` | same shape, `cause:'burn'` (the internal TimeDamage tick) |
| `kit:bubbler:collapse` | `{ owner, domeId, serial, team, pos, reason }` |
| `kit:bubbler:damage-proposal` | `{ domeId, serial, team, target, amount, point, normal }` — outgoing, needs the parent's adjudication |
| `kit:bubbler:replay:reset` | `{ reason, removed, presentationOnly }` |

`kitBarrierHitRecord(candidate)` adds `serial`, `remote`, `ownership` and
`reachable` to the per-contact record.

**No online parity is claimed.** There is no net code, transport, packet format,
prediction, reconciliation or rollback in this lane. What exists is bounded,
idempotent ingest and a presentation clock — enough for a parent to drive a
remote image, and nothing more.

## Expiry, disposal and reset

| Event | Effect | Why |
|---|---|---|
| `TimeDamage` drains the canopy, or the emitter is destroyed | dome removed, scene released | pinned |
| `Projectiles.clear()` (match disposal, `main.js`) | **every** dome removed, remote domes included, replay state reset | the meaningful match reset |
| Owner `splat()` | **nothing** | the reference does not erase the structure when its owner dies |
| Owner `reset()` (respawn) | nothing by default; erases only when the parent sets `profile.kits.bigBubbler.eraseOnOwnerReset = true` | `reset()` is the respawn path |
| `clearBigBubblers(reason)` | explicit | shutdown / parent use |
| `resetBigBubblerReplay(reason)` | every **remote** dome removed and released, the 256-entry dedupe window cleared, `kit:bubbler:replay:reset` emitted | the match reset, so stale dedupe cannot leak into the next match |

A non-positive timestep is a **strict no-op** for both clocks: `dt <= 0` returns
before anything is touched, so a paused match (`Projectiles.update(0)`) can never
grow a dome, ignite it, paint, or start the TimeDamage burn. There is no epsilon
fudge and no boundary ignition on a paused tick.

## Concrete parent handoffs

1. **Profile** (`patches/splatoon3/profile.json`, parent-owned): set
   `weapons.roller.special = "bubbler"` and `weapons.roller.specialCost = 180`
   (pinned `Roller_Normal_00 SpecialPoint`), register `SPECIALS.bubbler`, and add
   an optional `kits.bigBubbler` calibration block. This lane did not touch the
   profile; the tests stand in for that composition locally and say so.
2. **Adapter** (`patches/splatoon3/adapter.mjs`, parent-owned) — one exact
   `replaceOnce` in the `src/game/weapons.js` branch. The anchor is verified
   unique by a test in this lane:

   ```
   before: "      p.pos.addScaledVector(p.vel, dt);\n      let dead = false;"
   ```

   The replacement keeps the native chronology (actor loop → boss → world) and
   adds the dome as one more candidate in the *world* branch, comparing world
   distances, calling `onHit()` only on the winner:

   ```js
   if (!dead) {
     const kit = this.kitBarrierCandidate(p, p.prev, p.pos);
     const hit = G.physics.segment(p.prev, p.pos, _hit, true);
     if (kit && (!hit.hit || kit.distance < hit.dist)) { kit.onHit(); dead = true; }
     else if (hit.hit) { ...existing native wall response... }
   }
   ```

   The module never scans or re-integrates the round list, and never settles a
   candidate the parent did not select.
3. **Blast path** — the same arbitration with `kitBarrierShelter(p, prev, pos)`
   in the native blast/impact branch. See "Explosion shielding handoff" for the
   three rules the call must preserve.
4. **Install** (`patches/splatoon3/runtime/install.mjs`, parent-owned): import
   and call `installKitBigBubbler(api, profile)` after the other installers.
   There is **no** fallback to disable. Until (2) lands the module ships inert:
   the domes deploy, grow and expire, but nothing queries them.
5. **Network** (parent-owned): the whole integration surface is
   `bigBubblerSnapshot()` out and `replayBigBubbler('deploy' | 'hit' | 'expire',
   proxy, payload)` in, plus `resetBigBubblerReplay()` on match reset and a
   subscription to `kit:bubbler:damage-proposal` to route a local round's hit on
   a remote dome through the authoritative path. Call it from the typed NetMatch
   events; do not reconstruct positions or identities locally. No online parity
   is claimed for either side.
6. **Remote domes need a `Projectiles.update` tick** — already installed by this
   module, so `tickRemoteBigBubblers(dt)` runs on the native clock. It is a strict
   no-op while paused and emits nothing authoritative.

## Explicit gaps — not claimed as complete

- **The public installed pipeline does not yet query the dome.** Wiring is
  parent-owned (items 2–4 above). Until then the kit deploys and expires but no
  round is stopped by it. This lane's tests are therefore contract tests, not an
  end-to-end interception test, and they do not pretend otherwise.
- **Explosion shielding on collapse** (the inside-the-dome sweep) is not
  implemented; see the handoff section for the concrete subscription point.
- **Remote replay is ingest + presentation only.** `replayBigBubbler()` and
  `tickRemoteBigBubblers()` exist and are tested, but nothing in this lane emits
  or receives a packet. The parent wires its typed NetMatch events to them; until
  it does, no remote dome ever appears.
- **The ink refill does not fire for the bubbler today.** The parent's
  `resources.mjs` refills only when `_startSpecial` leaves `specialActive` set,
  and the bubbler deliberately sets none. This module does not refill either, by
  design and by test, so the current behaviour is *no refill on the bubbler*.
  Whether Splatoon 3 refills here is **unconfirmed** from the receipts in hand,
  and the fix is the parent's to make in `resources.mjs`, not this module's.
  No value is guessed either way.
- **Bomb interaction**: only the bullet pipeline (`Projectiles.list`) is
  queried. Thrown bombs (`Projectiles.bombs` / `_updateBombs`) are unaffected,
  which is consistent with a dome that stops rounds rather than thrown
  explosives.
- No physical-device, browser or Switch parity is claimed. The evidence is a
  composed-runtime logic measurement under `node --experimental-vm-modules`.

## Test evidence

`patches/splatoon3/tests/kit-big-bubbler.test.mjs` (33 tests) runs against the
**actual composed runtime** — the immutable `inkwave-public` sources adapted by
`patches/splatoon3/adapter.mjs` with the real `Actor`, `Projectiles`, `Physics`
and config objects. A synthetic level of real oriented boxes is driven by the
real `Physics` so native wall contacts are genuine distances, not stubs. Only
audio and the renderer are absent. **33/33 pass.**

Covered: pinned curve endpoints and monotonicity; deploy/pinned durability/native
gauge+stat/no-`specialActive`/no-invulnerability; stationary; growth, arming on
the pinned frame and the radius cap; `TimeDamage` collapse with real GPU disposal
of all four resources exactly once; **querying alone changes no position, no HP,
no turf and emits nothing**; `distance === t × segmentLength`, the entry point on
the inflated shell, misses and degenerate steps; **a dome behind a real wall
reports a larger distance and loses, and the same segment with the wall removed
wins**; **the winning handler spends HP exactly once and is idempotent**, with a
serializable replay record; **a 120 m step reports the same world distance as a
short step and matches a brute-force march**, and an inside origin may leave;
friendly rounds are never candidates; the emitter is a distinct target with its
own budget, and draining it collapses the dome; **ghost rounds are stopped but
spend no HP, turf or paint**; actors inside take no damage and get no
invulnerability; owner death and respawn do not erase, match disposal does;
the opt-in reset flag; zero-dt freeze; the snapshot is plain serializable data;
the **explosion shielding handoff** preserves native LOS, inside-origin hostility
and grants no invulnerability; the **deploy/ignite/hit/burn/collapse replay
streams** are emitted once each with JSON-safe payloads; uniqueness of the
parent adapter anchor together with `_step` being untouched.

Added by the replay/lifecycle revision: an uncharged, dead or re-entrant manual
`_startSpecial()` deploys nothing while the ordinary path deploys exactly one
structure with exactly one native activation; the module source contains no ink
assignment at all; `dt <= 0` is a strict no-op for both clocks with no ignition
and no paint; dome ids use the real `nid` identity and two same-team actors never
collide; a replayed deploy restores the transmitted position verbatim rather than
re-deriving aim; twenty malformed payloads are each rejected with an explicit
reason and create nothing; duplicate deploy / hit / expire packets are reported as
`duplicate` and cannot be applied twice; a remote dome's clock paints nothing,
burns nothing, never expires on its own and emits no authoritative event; a local
round against a remote dome returns 0, mutates nothing and hands the parent one
JSON-safe damage proposal, while a ghost or neutral round proposes nothing at all;
a candidate reports which targets are reachable and refuses to spend a dome that
died after the query; a match reset clears remote domes, their scene objects and
the dedupe window; and two composed actors round-trip a real snapshot packet
through JSON with duplicate delivery, a hit, an expiry and a match reset.

Logs in `evidence/actions-freebuff-20261004/freebuff-6/`:

| Log | Result |
|---|---|
| `bubbler-followup-run1.log` … `run5.log` | the five revision runs; run5 is the passing set |
| `bubbler-followup-run5.log` | 19/19, exit 0 (the candidate-query revision) |
| `bubbler-followup-regression.log` | 42/42, exit 0 (`kit-big-bubbler` + `public-issues-6` + `adapter`) |
| `bubbler-final-run2.log` … `run5.log` | the replay/lifecycle revision; run5 is the passing set |
| `bubbler-final-run5.log` | 33/33, exit 0 |
| `bubbler-final-regression.log` | 56/56, exit 0 |
| `bubbler-final-head.log` | 56/56, exit 0, rerun on the exact committed tree |
| `bubbler-final-gate-quick.log` | `check-inkwave-patches --quick` OK, upstream compatible, reference 11.3.0 |

Additionally, both the module and its test file were re-parsed through the full
adapter chain (`adaptSource` → `adaptTouchLayout` → `adaptReliability` →
`adaptQualitySource`, then `new vm.SourceTextModule(out)`); both constructed
cleanly.

Task B logs (`kit-big-bubbler-after.log`, `kit-focused-regression.log`,
`kit-head-rerun.log`) describe the superseded fallback revision and are kept only
for audit.

## Superseded revision

The first pass (commit `dbced19`, `SECOND-DONE.json`) shipped the predictive
`_step` fallback. It is superseded by this revision; both the module and the test
file were rewritten, and `SECOND-DONE.json` is preserved unchanged for audit.