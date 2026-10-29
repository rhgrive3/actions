# #1665 / #1666 native authority building blocks

Both issues remain open. This work adds executable native replay, input policy
and effect APIs; it does not install a mandatory damage gate in NetMatch or a
trusted simulation in the relay. No server deployment, main merge or hardware
validation is performed. Existing damage/cadence/physics and wire tuples are
unchanged.

## Executable result

`patches/network-replication/trusted-native-replay.mjs` owns a dedicated native
realm lease, real source Actor construction/spawn, gear, raw command admission,
Actor/Projectiles phases and private native effects. The final canonical input
owner includes actual identity/life checks and native platform cancellation.
No owner-reported charge, ink, damage, grounded flag, muzzle, projectile velocity
or body snapshot initializes the private state. Native initial Squid Spawn can
own initialization rather than being rejected for resource0/effective-null;
actual spawn-generated life must match the trusted roster.

Native effects are branded, authority-serial-bound and one-use. Paid fire alone
does not grant a hit. Actual terrain/capsule/Boss collision paths, multiple
victims and piercing remain native. The worker adapter keeps capabilities inside
the realm and returns committed effects over a real MessageChannel; the test
does not claim an actual deployed server worker or authenticated WAN room.

The source suite covers all65 main owners' ordinary hold/release emission,
30/60/120Hz, real straight flight and Boss/crablet hit owners, cover/miss/team
negatives, resource/cooldown/dry input, copied/replayed claims, owner/life/epoch,
cancelHold, prepare/commit and exception/disposal. Character animation/muzzle
uses an explicit fixed-display seam in these65 tests, paint is dry/zero-credit,
and Boss combat methods run with fixed native combat state rather than its full
AI/hazard lifecycle. Emission does not require Projectiles.list/_push output:
legacy Charger keeps its native separate finite-flight queue.

## HP, armor and native effect semantics

`damage`/`requestedDamage` record the native damage request. They are not the HP
amount and must not be applied again to the already-simulated world. `hpDelta`
counts removed available HP; `rawHpDelta`/`hpAfter` retain native instantaneous
values. A160 Charger hit can temporarily produce HP−60 and defer death until
the next native update, so `hpAfterClamped`, `lethal` and actual current `killed`
are separate. Native rounding remains native.

Actual `actor:armorhit` observations are scoped to the precise private damage
invocation. Native Crab Tank activation, zero-HP absorption and later armor break
produce effects without pretending HP decreased. Actual final-damage rounding
credit below0.1HP is retained, including two identical effects in one frame;
replaying the first serial cannot spend the second. Pure invulnerability has no
HP/armor/credit effect and does not mint damage. Native projectile/seen behavior
still executes, and a later genuinely admitted shot works. Full-charge piercing
retains independent effects for both victims. Device/canopy/shield/kill-credit
effects outside these native owners are not a complete exported effect model.

## Existing fire commits versus version2 commands

The existing fire event can be considered a new input request in a server
design. It is not inherently impossible merely because the owner could fabricate
the event. The concrete instantaneous mapping tested here—raw fire press at a
full Charger's reported emission frame—does not reproduce the real native80-frame
charge/release and emits nothing at that claimed frame. A design that schedules
or reconstructs earlier charging must additionally define resource/cancellation,
spawn/form/keep, world and collision history, prediction and commit timing. This
test rejects only that instantaneous mapping, not every possible server design.

Independent same-prefix Charger traces diverge in later birth packets; they do
not prove identical full wire at claim admission. Curling's same birth from
different initial fractional ink is distinguishable by a server that already
retains the complete trusted resource history. Those observations motivate state
retention, not a universal impossibility claim.

`native-command-wire.mjs` implements an optional `nc` sibling, preserving existing
a/e tuples byte-for-byte. Trusted room policy fixes version2, build, epoch and
seed; the owner cannot omit cap/cmd or assert legacy to downgrade. Independent
transport `from` owns authentication. Each consecutive source frame includes
all owned actors' held inputs, optional Booyah/throw and native cancel flags,
move, aim and aimPoint. Pure preparation validates dt/time/sequence, actor life,
packet quota and cumulative receiver elapsed budget; prefix commit is one-use
and exact retries deduplicate. Reenrolling an owner cannot reset its timeline or
fund new resources. Native next-life enrollment is a trusted lifecycle operation.
The source positive encodes/decodes complete commands and executes real native
resources/flight/HP contact. Its receive clock is a modeled CPU clock, not WAN.

## Remaining contracts before mandatory admission

- **Trusted host wiring:** relay/RoomDurableObject does not yet construct and
  run the canonical native world or route every hit/Boss hit through its result.
  A client-owned worker cannot supply server trust. Owner-authored live proofs
  remain admitted by the unchanged production path.
- **World/order:** full historical paint, earned Turf/Special credit, native
  match pushes/external impulses, Boss hazards, other-owner order and deployed
  objects must belong to one trusted source timeline. The leaf's phase hooks
  need a complete match driver; no snapshot position assignment substitutes it.
- **Randomness and timing:** native gameplay shares Math.random with other
  callers. A canonical seed alone does not establish normal client random-call
  parity. Server-selected input clocks, network scheduling, delay and prediction
  require a complete compatible source contract.
- **Native muzzle context:** actual Character hashes its canonical actor name
  and uses camera/LOD-dependent life/breath pose. The leaf now retains trusted
  name/controller flags and explicitly supplied world.camera. Independent Node
  controls show identical name+camera gives bit-identical muzzle/matrix across65
  calls in that Charger fixture; the old fixed name/far camera controls remain different. This is a
  condition-specific source result, not proof that public clients use null
  camera or all camera/LOD source states are equivalent.
- **Late join/migration/lives:** retained original inputs/checkpoints, pause/
  loading and native lifecycle history must survive reconnect and ownership
  handoff. No later owner snapshot creates a fresh life/resource budget.
- **Wire effect handoff:** cumulative Slosher groups, rounded amounts, Boss/crab
  aliases, native effect serial/claim mapping and all object effects require a
  complete adapter. A native receipt is not a drop-in comparison of JSON `d`.

## Validation and negative controls

The final local command is Node22.23.4 with `--experimental-vm-modules --test`
over `trusted-native-replay.test.mjs`, `native-command-wire.test.mjs`, and
`canonical-weapon-actions.test.mjs`. Raw logs and source hashes are retained in
`trusted-native-replay/`. Both source fixtures use actual production composition.
In emitted mode the native fixtures require the supplied build; the wire test
explicitly imports its module from INKWAVE_BUILT_SITE and fails if absent, with
no source fallback. Current final emitted coverage is delegated to root's fresh
sealed integrated build, not claimed from a prior site lacking these files.

The earlier310eb4b1 replay module is substituted into the same current native
fixture for the legitimate cancel regression. It fails the new input contract;
the current implementation retains native cancellation without releasing a shot.
This is a bounded old-fails/new-passes control, not a claim the old production
path ever enforced the new API. A fresh unchanged-production gap probe still
exits1: authenticated owner-authored fire+hit deals36 actual HP in PvP, Boss and
crablet controls without a real launch/contact, while absent/foreign events do
zero. Therefore neither #1665 nor #1666 is closed by these building blocks.
