# Trusted native replay building block

This leaf is not installed on production NetMatch or the relay. It does not
close #1665 or #1666. A client-owned worker is not a trusted authority. The
host must execute this API in its own isolated native realm/worker, behind an
authenticated command scheduler, and retain the canonical world there.

`createTrustedNativeReplay(api, options)` leases one realm. `api` is the fully
installed source runtime; no weapon costs, timings, damage or geometry are
reimplemented. Options provide a trusted epoch, RNG seed, initial time, level,
Physics, paint, match and roster. The roster accepts equipment/spawn identity,
not ink, charge, HP, special gauge or body witnesses. Native `spawnAt` executes
once; a trusted `world.initializeActor` can instead run initial Squid Spawn.
Its actual resulting native life must equal the roster life. Later-life state
cannot be bootstrapped by assigning the life counter or accepting a snapshot.

`advanceTrustedNativeReplay(handle, {tick, dt, commands}, {epoch, owners})` takes a
complete frame request and an independent trusted Map of authenticated owner
identities. It validates every command before applying any, writes only raw
intent/move/aim/optional aimPoint, and executes Actor.update for the roster,
then Projectiles.update. `world.beforeActors`, `afterActors`, and
`afterProjectiles` are synchronous trusted native phase hooks: a full match
adapter must preserve world/match/soft-push/Boss order. They are not network
callbacks. Native early-return action owners, resource updates, cooldown,
multi-projectile output and collisions are retained.

Native HP, observed armor absorption/break and actual fractional rounding credit
produce private effect capabilities. A claim can
only select an already executed effect with the same epoch, frame, attacker,
attacker life, victim/life, source, authority effect serial and native requested amount. Copying a token
or a record cannot commit it. Commit is one-use and validates current lives;
fault/disposal revoke all outstanding contacts. Separate victim/phase contacts
are separate effects: a blast is not globally consumed by its first victim.
Requested amount and final HP change are both recorded because native armor,
rounding and overkill can differ. This selector is not yet a wire hit decoder:
wire cumulative groups, Boss/crablet aliases, delayed claims and generation
handoff need a complete authenticated adapter before mandatory admission.

`damage` is an alias of `requestedDamage`, the amount passed to the native
damage owner, not an instruction to apply that amount to HP again. `hpDelta`
counts removed available HP; `rawHpDelta` and `hpAfter` preserve the actual
native values, which can briefly include negative HP before native delayed
death runs. `hpAfterClamped`, `lethal` and the actual current `killed` flag are
separate. Armor entries are observed native armor events scoped to the exact
private Actor.damage invocation; native object multipliers can make absorbed
armor differ from requested damage. Fractional `roundingCredit` comes from the
actual final-damage ledger. Zero-HP armor absorption/break and admitted credit
therefore remain effects. Pure invulnerability creates no HP/armor/credit effect;
native flight/seen/contact behavior still executes unchanged. This is not a
complete device, canopy, shield, kill-credit or other world-object effect model.

The authority owns the native mulberry32 stream. Owner-reported spread, birth
velocity or seed cannot initialize it. Current public clients do not share a
dedicated canonical gameplay random stream; rendering and other native callers
also use Math.random. Matching a diagnostic fixed seed does not establish
normal multi-client random-order equivalence.

The current public wire contains snapshots and birth/impact/hit events, not the
complete raw frame history accepted by this API. A birth may be interpreted as
a new input command in a future server design, but that requires a defined
native action schedule, resource/lifecycle/world/target history and compatible
prediction/commit timing. An equal early snapshot prefix alone does not prove
that all such designs are impossible. No missing frames are invented and no
reported result scalars are accepted as the private native state.

Validation on the first implementation: 17 source CPU cases pass with actual
production-composed Actor/Physics/WeaponRunner/Projectiles and native Boss
collision/damage methods. It includes 30/60/120 Hz, real paid fire/contact,
wall/miss/friendly negatives, multiple blast victims, final rounding, invalid
results/owner/life/tick, copied receipts and exception/disposal cleanup. The
Character/muzzle is an explicit display seam; paint is dry/zero-credit and the
Boss has fixed combat state rather than a running AI/hazard lifecycle. These
tests are not rendered, browser, hardware, WAN or production-server acceptance.

The next stage connects `canonical-weapon-actions.mjs` as the default input
owner. A source run now has 110 passing cases across the replay, canonical and
wire files, including all 65 native main owners' ordinary hold/release emission.
Those 65 use the same explicit display seam, not 65 source-banked Characters.
The worker adapter exercises a real MessageChannel with copied data; it keeps
capabilities in the native realm and returns only a committed native effect.
That is a worker RPC test, not an actual deployed server worker or network room.

`native-command-wire.mjs` adds a proposed `nc` sibling envelope without changing
an existing actor/event tuple. A trusted policy fixes version2/build/epoch/seed.
Missing/legacy capability or input does not negotiate down. A separate `from`
argument owns authentication. Exact input serials/source dt/time and receiver
elapsed budget reject gaps and speedup without inventing held input. Preparation
is pure and prefix commit is one-use; exact retry deduplicates. An owner cannot
enroll twice to reset time or resources. Life enrollment advances only through
a trusted native lifecycle hook; late join/migration needs retained checkpoints
or original input history, not a new first-life budget. This policy is not yet
installed in RoomDurableObject or NetMatch, and cannot be called production
backward compatibility merely because its unchanged tuples round-trip.

Independent first-spawn work confirms 398 source/native replay frames and the
first full-charge event with equal body/life/resources. It also records a
0.0006324268558987452-world-unit source/private Character muzzle difference.
Later independent controls match the trusted native name and camera context and
remove this fixture's difference bit-for-bit, while preserving the old differing
condition. That Node/Charger result does not establish every public camera/LOD
condition or socket equivalence for all65 native owners. The API preserves
trusted name/isLocal/isBot and explicitly supplied world.camera (including null);
camera values are not accepted from a hit claim.

Same-session frame reentry is rejected before tick/time or input admission can
change. A trusted native phase callback cannot select or commit effects while
the frame is executing; they remain available after it finishes. An old d81
module control fails the same actual native callback regression by poisoning
the outer update, whereas the guarded module preserves its tick and receipt.

Optional `command.cancel:{fire,sub}` preserves native cancelHold behavior before
Actor.update; it is not an ordinary button release. Both flags must be boolean
and a cancelled button must be false in that frame. The draft v2 sidecar keeps
these two flags alongside the seven held-input bits, without changing any old
tuple. A source negative control substitutes the earlier 310eb4b1 replay leaf
while retaining the same current test/native fixture: the legitimate cancellation
regression fails, whereas the current leaf passes without firing a release shot.
