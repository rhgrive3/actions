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
| presentation-only remote dome lifecycle driven by `replayBigBubbler()` | proposing a remote hit: the local client emits a flat proposal and changes nothing |
| side-effect-free contact candidate queries for local *and* remote domes | client prediction, interpolation, reconciliation, rollback |
| bounded, idempotent, **monotonic** replay ingest of `deploy` / `hit` / `expire`, with expire-before-deploy **tombstones** | — |
| the authoritative owner adjudication API `adjudicateBigBubblerDamage(payload, { host, roster })` | — |

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
  `hp`/`fieldHp` are finite in `[0, 1e9]`, `serial` is a non-negative safe integer,
  and `eventId` (hits) is a non-negative safe integer ≤ 1e9. The identity strings
  `shooter`/`domeOwner`, when present, are non-empty strings ≤ 64 characters and
  are never dereferenced. Anything else returns an explicit `reason`
  (`bad-dome-id`, `dome-id-too-long`, `bad-team`, `bad-position`, `bad-age`,
  `bad-hp`, `bad-field-hp`, `bad-serial`, `missing-event-id`, `bad-event-id`,
  `bad-shooter`, `bad-dome-owner`, `bad-shooter-team`, `not-an-object`,
  `unknown-event`) and creates nothing. It never throws.
- **Every hit carries its own identity.** A hit packet must carry `eventId`: the
  host's monotonic per-activation counter for hits. Without it a second real hit
  is indistinguishable from the first one's retransmission, so it is refused
  (`missing-event-id`) rather than guessed at. `serial`, when present, is checked
  as the **activation** identity, not the hit identity: a packet naming a
  superseded activation is `stale-activation`, never applied to whatever dome now
  wears the id.
- **Two distinct hits on one activation both land.** Dedupe is keyed
  `(domeId, eventId)`, never `(domeId, deploySerial)`. The previous key collapsed
  every second hit on one dome into a false `duplicate` and silently dropped real
  damage — a bug a client cannot detect on its own, because the dome simply stops
  taking damage.
- **Duplicate AND reordered packets are no-ops.** Suppression is a bounded FIFO
  of 256 keys *plus* a bounded per-dome monotonic cursor (64 domes). An
  `eventId` that is not newer than the one already applied is `duplicate`, so a
  late-arriving old hit cannot reapply damage with a different amount.
- **Expire before deploy is tombstoned.** `expire` writes a durable, bounded
  (256-entry) tombstone for the dome id *before* looking for anything on screen,
  so a reordered stream in which the expiry arrives first still ends that
  activation. A later deploy of the same id is refused
  (`expired-before-deploy`) and creates no scene object, and a hit against it is
  `expired`. Tombstones are per activation id: another dome is unaffected.
- **Idempotent deploy / hit / expire.** A duplicate deploy is `duplicate`, a
  duplicate hit is `duplicate` and cannot spend HP twice, a duplicate expire is
  `duplicate`. Dedupe keys live in a **bounded FIFO of 256 entries**, so a long
  match cannot grow the set without limit.
- **Never silently ignored.** Every call returns `{ ok, reason }`. An expire for
  a dome this client never saw is `ok: true, reason: 'already-absent'`, not a
  silent drop — and it is remembered as a tombstone regardless.
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
| local round → **remote** dome | `onHit()` returns 0, spends nothing, sets `candidate.proposal` and emits `kit:bubbler:damage-proposal` — a **flat** record (see below) carrying the real shooter identity, the dome owner identity, the activation serial and a monotonic per-hit `eventId` |
| ghost round (any dome) | intercepted for the image; `visualOnly`, `onHit()` 0, **no proposal at all** |
| neutral round (`p.team` missing or non-integer, any dome) | same as a ghost: it may be intercepted visually but can never spend a budget |
| `onHit()` on a stale candidate | re-checks that the dome is alive, still registered, **and still the same id and serial**, then spends/proposes 0 |

### The flat damage proposal

A locally owned round hitting a **remote** dome produces a record that is:

- **flat** — every field is a number, a string or a boolean. The native packer
  (`packEvent` in `inkwave-public/src/net/netmatch.js`) copies numbers, strings
  and booleans, converts an `Actor` to `{n:nid}` and a `Vector3` to a 3-array,
  and **drops everything else**. A flat record needs none of that conversion, so
  the parent can hand it straight to the native event path. A test reproduces
  `packEvent` exactly and asserts that no field is dropped and no value is
  reinterpreted.
- **JSON-safe** — `JSON.parse(JSON.stringify(p))` deep-equals `p`.
- **carrying the real identities**, not placeholders: `shooter` is
  `bigBubblerOwnerId(p.owner)` — the projectile's actual actor — and `domeOwner`
  is `bigBubblerOwnerId(dome.owner)` for the dome being shot. An identity that is
  genuinely unknown is **omitted**, never nulled (the native packer would drop a
  null, and the receiving side could not tell "unknown" from "field absent");
  adjudication then refuses it with the field named.

```
{ e:'damage-proposal', domeId, serial, team, target, amount, eventId,
  shooter?, shooterTeam?, domeOwner?,
  pointX, pointY, pointZ, normalX, normalY, normalZ }
```

It changes **nothing** on this client: the remote dome's HP is untouched, and the
record is inert until somebody adjudicates it.

### Authoritative adjudication

```js
adjudicateBigBubblerDamage(payload, { host: boolean, roster?: Map|Array })
Projectiles.prototype.kitBubbleAdjudicate(payload, authority)   // same thing
```

The owning side (in practice the host) calls this with the proposal a remote
client sent. Checks, each with a named reason:

| Check | Reasons |
|---|---|
| the caller declares itself the authority | `not-authoritative` |
| the dome is a **local authoritative** dome of this client, alive, same id **and** same serial | `unknown-dome`, `stale-activation` |
| the only thing this client has under that id is a picture of somebody else's | `foreign-ownership` |
| the claimed `domeOwner` is the **real** owner of that dome | `missing-dome-owner`, `foreign-ownership` |
| the shooter resolves in the roster and is hostile to the dome's team | `missing-shooter`, `unknown-shooter`, `bad-shooter-team`, `friendly-fire`, `shooter-team-mismatch` |
| the amount is positive and within the remaining HP of the part hit | `bad-amount`, `overkill` |
| this exact `(domeId, eventId)` was not already applied, and is newer than the last | `duplicate` |

A claim beyond the remaining HP is refused as `overkill`, **not** silently
clamped: clamping would let a hostile client choose how much damage a hit lands.
An unresolvable shooter is refused, never treated as neutral-and-therefore-fine.
Duplicate suppression runs before the remaining-HP comparison, so a retransmitted
packet reports `duplicate` whatever it claims.

**Remote HP is never mutated locally.** A proposal naming a presentation-only
dome is `foreign-ownership`, not a silent image update. On success it emits
`kit:bubbler:damage-adjudicated`.

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
| `kit:bubbler:damage-proposal` | the flat record above — outgoing, inert until adjudicated |
| `kit:bubbler:damage-adjudicated` | `{ domeId, serial, team, shooter, shooterTeam, domeOwner, target, eventId, amount, hp, fieldHp }` — the authority accepted a proposed hit |
| `kit:bubbler:replay:reset` | `{ reason, removed, presentationOnly }` |

`kitBarrierHitRecord(candidate)` adds `serial`, `remote`, `ownership`,
`shooter`, `shooterTeam`, `domeOwner` and `reachable` to the per-contact record.

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
| `resetBigBubblerReplay(reason)` | every **remote** dome removed and released, and **all** replay bookkeeping dropped: the 256-entry dedupe window, the 256-entry tombstone set, the per-dome hit cursors, the authority dedupe window and the proposal counter; `kit:bubbler:replay:reset` emitted | the match reset, so a stale tombstone (which would refuse the next match's first deploy) or a stale dedupe key cannot leak forward |

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
5. **Network** (parent-owned): the integration surface is
   `bigBubblerSnapshot()` out and `replayBigBubbler('deploy' | 'hit' | 'expire',
   proxy, payload)` in, plus `resetBigBubblerReplay()` on match reset. Subscribe
   to `kit:bubbler:damage-proposal` and route the flat record through the native
   event path (`packEvent` keeps it whole) to the dome's authority, which calls
   `adjudicateBigBubblerDamage(payload, { host, roster })`. Every hit packet the
   parent *sends* must carry a monotonic per-activation `eventId`; every deploy
   and expire must carry the dome's `serial`. Do not reconstruct positions or
   identities locally, and do not mutate a remote dome's HP on the proposing
   client. No online parity is claimed for either side.
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
  `tickRemoteBigBubblers()` exist and are tested, and `adjudicateBigBubblerDamage()`
  is the concrete owner-side API, but **nothing in this lane emits or receives a
  packet**. There is no transport, no packet framing, no rate limiting, no
  prediction, no interpolation, no reconciliation and no rollback. The parent
  wires its typed NetMatch events to them; until it does, no remote dome ever
  appears and no proposal ever leaves this client.
- **The proposal contract is a contract, not an end-to-end online test.** Both
  halves are exercised against the real composed runtime and against the real
  `packEvent` rules, but the two *clients* are simulated inside one process. The
  parent's integration (real transport, real latency, real reordering) is
  unmeasured by this lane and remains the parent's responsibility.
- **Adjudication is trust-based by construction.** `adjudicateBigBubblerDamage()`
  trusts `authority.host === true` from its caller and validates identity, team
  and amount against the roster **the caller supplies**. Nothing here
  authenticates the host or defends against a lying authority: the API is the
  seam a secured transport would sit behind, not the security itself.
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

`patches/splatoon3/tests/kit-big-bubbler.test.mjs` (39 tests) runs against the
**actual composed runtime** — the immutable `inkwave-public` sources adapted by
`patches/splatoon3/adapter.mjs` with the real `Actor`, `Projectiles`, `Physics`
and config objects. A synthetic level of real oriented boxes is driven by the
real `Physics` so native wall contacts are genuine distances, not stubs. Only
audio and the renderer are absent. **39/39 pass.**

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

Added by this network-correctness revision (39 tests, all passing):

- **Two distinct hits on one activation both land.** The regression the parent
  found: dedupe keyed `(domeId, deploySerial)` rejected every second hit on a
  dome as a "duplicate" and silently dropped real damage. Both hits now apply,
  each is individually retransmit-safe, and a **reordered** older `eventId`
  arriving late cannot reapply.
- **Expire before deploy is tombstoned.** An expiry that arrives first reports
  `already-absent`, and the deploy that follows is refused `expired-before-deploy`
  on every retry, creating no scene object; a hit against it is `expired`. Another
  activation is unaffected, and a match reset drops the tombstone so the next
  match's first deploy is accepted.
- **A stale candidate proposes nothing.** `onHit()` re-checks liveness *and*
  activation identity (same id **and** same serial) before either spending or
  proposing, so a candidate queried against one dome cannot act on a later one
  after the record is reused.
- **The proposal is flat, packEvent-compatible and identity-bearing.** The test
  reproduces the native `packEvent` exactly and asserts that no field is dropped
  and no value reinterpreted; the record carries the real `shooter` identity
  (the actual projectile `Actor`), the real `domeOwner` and a monotonic
  `eventId`. An unknown identity is **omitted**, never nulled, because the
  packer drops nulls.
- **Adjudication is exercised against every rejection path**: not the authority,
  unresolvable shooter, friendly fire, spoofed dome owner, missing identity,
  contradicting team claim, unknown dome, superseded activation, a
  presentation-only dome (`foreign-ownership`, with the remote image provably
  unmutated), overkill, retransmit, reordered, and the **next distinct hit on
  the same activation, which does apply**.
- **Two composed actors propose → transmit → adjudicate end to end**: a real
  snapshot packet, a real proposal from the shooter's own round, a JSON round
  trip through the packed payload, an authoritative application, a duplicate
  frame, and a second distinct hit — with the remote image never converging by
  local mutation.
- **Bounded state.** A 4000-activation hostile flood of deploy/hit/expire packets
  throws nothing, leaves no dome behind, and a legitimate packet still works; the
  match reset drops every trace, including an `eventId` already used.

Logs in `evidence/actions-freebuff-20261004/freebuff-6/` (prior receipts, retained
unchanged) and `evidence/actions-freebuff-20261004/cline-1/` (this revision):

| Log | Result |
|---|---|
| `bubbler-final-run5.log` | 33/33, exit 0 (the reviewed BUBBLER-FINAL revision) |
| `bubbler-final-regression.log` | 56/56, exit 0 |
| `bubbler-final-head.log` | 56/56, exit 0, rerun on the exact committed tree |
| `bubbler-final-gate-quick.log` | `check-inkwave-patches --quick` OK, upstream compatible, reference 11.3.0 |
| `cline-1/kit-big-bubbler.log` | 39/39, exit 0 — this revision's owned suite |
| `cline-1/regression.log` | the full `patches/splatoon3/tests/*.test.mjs` set on this revision |
| `cline-1/gate-quick.log` | `check-inkwave-patches` OK, upstream compatible, reference 11.3.0 |
| `cline-1/chain.log` | both owned files re-parsed through the full adapter chain |

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
## Parent integration correction checkpoint (2026-10-04)

Cline successor draft 9b01a80 is preserved; it was stopped after forbidden broad local test launches. Parent review corrected per-shooter proposal identities and a bounded 64-event reorder window, legitimate overkill destruction, actual actor fields and independent hit event serials in native packets, and pre-activation admission. Empty gauge, death, replica, Super Jump and active-special calls preserve gauge/counters/ink. A nested refused call cannot duplicate the valid outer deployment. Three new parent regressions fail on the preserved draft; the corrected module's 42 focused tests pass.

The candidate installer now installs the real Bubbler mechanics; complete weapon kit assignment is still BLOCKING until Trizooka and sub protocol integration are accepted. The actual native NetMatch pack/unpack/play path now forwards deployment/hit/collapse/proposals with transport-bound actor identity. Deployment position is normalized from the native unpacked Vector3 for the strict replay validator. Proposals require the named shooter's actual team and the local dome owner's identity, independent of room-host status. Candidate native packet tests (6) and defense tests (6) pass. Actual native swept-projectile arbitration stops at the Bubbler before an actor, ignores ghost durability damage and prioritizes nearer terrain. Explosion shielding remains a separate pending integration; this checkpoint does not claim it, full browser proof or final kit completion.

Parent follow-up: native actor blast hits now consult the dome at the native applyHit boundary for both projectile bursts and bomb explosions, retaining the existing LOS/reach/paint loop. A per-explosion durability ledger applies the maximum required contact damage once across protected actors, and inside-origin blasts remain hostile. Ghost explosions cannot author actor hits even after transport disposal. Native blast regression fails on the preceding defense module (2 protected actors hit), passes after the fix (0 actor hits, one5300durability spend). All7defense tests pass and15affected native packet/descriptor/defense tests pass. Boss splash shielding and full browser kit proof remain pending.
