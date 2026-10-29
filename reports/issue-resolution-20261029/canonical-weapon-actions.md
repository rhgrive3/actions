# Canonical native weapon inputs, 2026-10-29

The new `patches/network-replication/canonical-weapon-actions.mjs` admits authenticated input requests to the existing native Actor/WeaponRunner, with native spawn, gear, charge, cadence, ink, gauge, projectile and device clocks owning the resulting action. It implements the weapon/resource boundary needed by the isolated trusted native replay for #1665/#1666. It does not turn a client projectile/snapshot claim into a legal shot or install a mandatory partial fallback in the legacy network path.

The baseline is `035233299348e5c3527f6106b98e721ed2dfd011`. Runtime commits are `0c8480d0`, `da1e3ed9` and `c53eada7`. The last two fix native hold cancellation and actual Actor owner/life binding, respectively. Root's source-identity change `e404a0b1aa3d3c4fec0d744b5c78d222811ef315` is present here as `f54c857e`; root already owns the former and must not integrate this duplicate identity cherry-pick.

## Contract and resource ownership

`createCanonicalWeaponActions(installedNativeApi)` resolves all 65 catalog mains and their installed kits, all 11 main families, 14 installed sub entries and 20 installed special entries. Variants resolve through the installed catalog/variant relationship. Its immutable descriptions include the pinned reference version, source commit, parameter path/SHA, actual installed/equipped budgets and 714 source timing/resource/multiplicity fields. These descriptions are diagnostics; no copied ink formula, charge formula or pellet-count oracle decides whether the action fires.

The pinned source is the repository's Splatoon 3 11.3.0 parameter catalog. Numerical meanings absent from that source are not inferred. Native simulation results establish compatibility with this repository's current implementation, rather than a separate claim of retail equivalence. Hardware verification is excluded from acceptance by the user's instruction.

The trusted scheduler registers an already-created native Actor with `{owner,life,epoch,firstTick}`. Actual `Actor.owner` and `Actor.netLife` must match that enrollment. `prepare(command,{tick,from})` requires an independently authenticated principal, current identity/life and the next consecutive 60 Hz tick. A raw `command.owner` is only checked against that principal; it does not authenticate itself. Registration and both prepare/apply reject native identity/life changes. A native respawn must be reenrolled from the trusted new Actor state.

Each command supplies `{nid,owner,life,input,aim}`. Required input levels are `fire,sub,jump,squid,special,move:[x,z]`; optional booleans are `booyah,throw`. Optional `aimPoint:[x,y,z]` is an explicit targeting input. Omitting it preserves the trusted Actor target. Optional `cancel:{fire,sub}` invokes the existing native `cancelHold` hook before Actor.update. A canceled button must be false. A deliberate release and a platform-canceled hold have different native behavior even when their final button levels match.

`prepare` copies/freezes a request without advancing native state. `apply` consumes a private one-use token, commits the tick and writes input/aim only, plus the existing native cancellation operation. A scheduler can prepare all actors before apply-all and the Actor/Projectiles phases. A native exception must poison the enclosing replay session, rather than continue after a partial tick. The separate trusted-native-replay implementation owns that scheduling and isolated realm.

Owner-supplied ink, charge, cooldown, gauge, damage, velocity, position, weapon, gear and birth/pellet/projectile results are rejected. Initial resources and loadout must come from trusted spawn/gear setup, never rounded snapshots. Native admission retains zero, one, multiple, depleted, charged, delayed and surviving-device emissions. In particular, a generic full-ink-price gate would reject the actual low-ink Roller depleted path.

## Verification

Both `canonical-weapon-actions.test.mjs` (8 tests) and `canonical-weapon-modes.test.mjs` (3 tests) pass against production-composed source and the actual minified emitted modules: 11/11 in each mode, no failures or skips. Commands and complete archived logs are in [verification.json](canonical-weapon-actions/verification.json).

The core tests cover all-65 resolution, owner/result rejection, independently authenticated principals, complete hold history, copied one-use tokens, prepare/apply ordering, native spawn/owner/nid changes, and ten representative main weapons using real Actor/WeaponRunner/Projectiles. Canonical inputs and direct native controls produce identical allocations, finite-flight starts, events, velocities and resource states. Empty-ink fire is accepted as an input request and produces the native zero-shot result. Native Charger and Splatling deliberate release and cancellation remain distinct.

The mode tests preserve every sampled native resource/state/position/event tick against direct-input controls, using real Actor integration and Physics. They establish full Charger charge before squid keep, native stored full charge and surfaced delay, then a full-charge release; Ballpoint's funded stream, paid recharge and second stream; and Dualies' dodge, glide, native seven-ink payment, collision movement and post-roll lock. Character appearance and muzzle geometry remain the explicitly controlled fixture, so these tests make no visual-geometry claim.

The initial emitted `0c8480d0` artifact fails the new cancellation positive case and the actual native-life positive case (one failure each, no skips). The final source and emitted versions pass both. Those archived controls show the two concrete regressions corrected by `da1e3ed9` and `c53eada7`; they do not claim that a standalone leaf changes the live legacy protocol's authority boundary.

Source and emitted inventories match byte for byte: 204,844 bytes, SHA-256 `7e0e1dd2b045c95cb7fe75d34150a7b1f65c0ae0365686c9a319a8c629e518d7`. The compressed inventory records all resolved definitions and source budget paths. These are installed entries, not a claim that every sub/special behavior has been independently replayed here.

The final emitted site is `/workspace/scratch/canonical-weapon-actions-final-site`, content hash `abc48a42e77cc42c7594bb798492ffade9a0079c666e4b74ddf69015e328dfdf`. All 2,231 declared artifacts were SHA-verified. The canonical source SHA is bound in the build input identity and matches the local source. See [build.json](canonical-weapon-actions/build.json) for all hashes. The fixture loads emitted modules when `INKWAVE_BUILT_SITE` is supplied and throws on missing files; it does not fall back to source or skip these tests. SHA verification is the separate recorded build check, not a claim about the fixture's loader.

## Wire information and native publication boundaries

Existing periodic actor/projectile/event rows are observations, not complete input commands. `legacyWeaponActionRequirement` rejects their promotion to a canonical input history. The independently collected native traces give concrete reasons:

- The main-weapon trace fixture obtains byte-identical first 20 Hz packets from the same trusted Squiffer initial state and seed with a one-tick press at tick 1 versus tick 2, while later native births differ. The accepted snapshot cannot reconstruct the missing 60 Hz hold/release history.
- The sub/special trace fixture (`d432b758`, canonical follow-up `8d2d8183`) obtains identical Curling actor rows and birth packets from precise trusted initial ink 64.51 versus 65.49. Actual remaining ink is 9.51 versus 10.49, and later affordability differs. Rounded snapshot ink cannot seed a resource clock.
- Native Curling cancellation after a common hold emits no bomb and leaves ink 100; deliberate release emits a bomb and leaves ink 35. The same false sub-button level cannot encode both operations without cancellation information. Latest source and actual emitted canonical sub/special tests pass 4/4 in that separate fixture.
- Curling contact and later blast can damage the same victim independently. Wave Breaker pulses continue from a surviving device after activation ends. A one-use receipt must correspond to a native contact, not grant or forbid all future damage from the whole birth.

The main-weapon fixture separately covers low-ink Roller depletion, real rolling contact, multi-pellet births and Slosher publication timing. Its all-65 source/emitted corpus and native receiver admission are tracked by its owner, rather than counted as this leaf's 11 tests. The final combined integration must pin the version of that corpus and the canonical leaf used.

Allocation is not publication: `_push` may allocate Slosher units before their source-owned delay/index receives a network ID and `recProj` publication. The pending flag can be set after `_push`. Legacy Charger uses native `_fidelityChargerFlights` finite flights, which are not ordinary list allocations. One Roller near unit may carry no weapon ID. The contract derives authority from trusted native execution and does not reject these cases by imposing guessed one-projectile-per-fire or all-birth-ID rules.

## Integration disposition

The canonical weapon/resource component for #1665/#1666 is implemented and software-verified. Root coordinates integration with the isolated trusted replay, worker/codec, complete authenticated input transport, and final server acceptance tests. The old wire alone cannot recover the missing history demonstrated above. That is a protocol input requirement, not an excuse to trust client charge/ink or to enable only one of the 65 mains.

No shared live network/server/weapon file was changed by this component. No GPU or hardware run was used. The required shared behavior-report update is supplied as an exact append proposal beside this report for root to integrate with the other components.
