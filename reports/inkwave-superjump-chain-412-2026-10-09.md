# Super Jump destination inheritance (#412)

Base: current main `5d0be6b7fdebfd07e696e75497aaa97aa5ff5648`, rechecked on 2026-10-09 UTC. The published target is `inkwave-public/` plus the production adapters; the upstream mirror is unchanged.

## Reference and scope

- Comparison target: Splatoon 3 Ver. 11.3.0, living same-team Super Jump targets, ordinary weapons/no special gear requirement. [Inkipedia's Super Jump mechanics](https://splatoonwiki.org/wiki/Super_Jump) document that selecting an already-jumping teammate inherits that teammate's destination, rather than their airborne position. This establishes the qualitative destination rule, not version-specific measured timing or trajectory values.
- [Issue #412](https://github.com/rhgrive3/actions/issues/412), all comments, latest main and open PR scopes were checked before the [takeover comment](https://github.com/rhgrive3/actions/issues/412#issuecomment-6079169697). The earlier partial attempt was not assumed to be implemented. Current #362 already commits an ordinary target's destination at confirmation, including charge phase; #412's remaining rejection was present in Actor, keyboard/touch, standard-controller confirmation, respawn navigation, HUD and diorama.
- No Nintendo frame count, speed, flight curve, Quick Super Jump profile or render scale is introduced or retuned. No browser, two-device session or Switch comparison is claimed.

## Reproduction and correction

B confirms a Super Jump to a point distinct from B's position. While B is in charge or flight, A selects B on the Turf Map. Previously Actor and map input guards rejected B solely because `superJumpState` existed. Before the change the new seven-case composed-source suite had six failures and one passing invalid-target control.

A dependency-free `hasCommittedSuperJumpDestination` predicate now accepts only a living target in charge/flight with a finite Vector3 `to`. `superJumpTarget` copies that committed point instead of the target's current position or remembered last-ground location. Actor retains self/enemy/dead rejection, and its existing destination clone ensures a later target mutation, death or movement cannot retarget A. A further teammate can inherit A's committed destination the same way, without recursive live tracking.

The last reliability adapter connects this same predicate to keyboard/raw input, standard D-pad plus A confirmation, touch, deferred respawn requests, HUD eligibility and diorama confirmation. It uses fail-closed unique anchors and participates in build identity. A target is revalidated at actual admission, including after a queued respawn request. The independent Big Bubbler target owner and ordinary #362 snapshots are unchanged.

Current network replication already reconstructs charge/flight `to` from its authenticated owner/life/schema-validated snapshot. The fix uses that established state, without adding a packet field or trusting a separate stale `net.sjTo` presentation hint. Legacy phase-only state and non-finite or unconfirmed destinations remain unavailable.

## Validation

- New composed-source tests: seven cases cover charge/flight inheritance, A→B→C chains, immutable snapshots after target mutation/death, real Actor/Physics landing at the inherited point, malformed/unknown/dead/enemy/self rejection, keyboard/controller/touch, HUD/diorama confirmation and identical fixed-step traces at 30/60/120 Hz.
- Two added network integration cases use the real send/receive/sampling owner path for charge and flight; the local actor inherits the accepted remote destination. Both reject legacy phase-only state even when an old flight hint remains.
- Two added respawn-navigation cases confirm the inherited destination after revival and reject a destination lost between selection and admission.
- Focused native tests: 121/121 pass, zero skipped, split between the 91-case chain/network/navigation/Bubbler/pin/status run and the existing 30-case `superjump-gameplay` suite. The pin-tap fixture now links the real dependency-free predicate, rather than replacing it with a permissive mock.
- Production build: `553411fcbda0`. All seven new regressions also pass against its emitted/minified modules using `INKWAVE_BUILT_SITE`.
- `scripts/check-inkwave-patches.mjs --quick` and `git diff --check`: pass.

These are bounded native-logic, replication and build checks. Geometry/DOM/presentation fixtures are not GPU rendering, hardware latency or retail trajectory measurements. Full repository CI and browser/device validation remain separate.

## Follow-up: respawn Bot selection (2026-10-09 UTC)

PR #1182 head `2eaec912f4eeaa54982a698e1ac41576b7d574e4` already passed
the Actor/map inheritance cases. Its native `BotBrain.update()` still rejected
every `o.superJumpState` in the one-time post-respawn teammate selector, before
Actor's repaired admission could run. This is a remaining caller of the same
capability, not another claim that the original seven tests were a new fix.

The [Super Jump mechanics page](https://splatoonwiki.org/wiki/Super_Jump#Multiplayer_matches)
was opened again: it documents inheriting a jumping teammate's destination.
That qualitative rule is unchanged. INKWAVE's automatic teammate-choice policy
is its own AI, not a claimed Nintendo multiplayer-bot behavior.

The final reliability adapter now uses the existing finite committed-destination
predicate for that Bot guard too. The bot's existing random choice, distance
filter and ranking are preserved, as are ordinary teammate admission, input,
trajectory, timing, gear, collision and network owners. No table or coefficient
was changed. Phase-only legacy targets remain unavailable.

New complete-bootstrap tests run actual `BotBrain` and Actor death/respawn,
the installed Squid Spawn flight, Super Jump charge/flight and native Physics
landing. With deterministic choice input, both charge and flight teammates were
rejected before the patch. The four-case suite had three failures and one valid
rejection/control pass. After the change it verifies inherited snapshots survive
target mutation/death, unknown/nonfinite/dead/enemy rejection, ordinary teammate
selection and identical full traces at 30/60/120 Hz. Independent navigation data,
paint queries and character/audio sinks are fixture boundaries; the gameplay
owners above are real. Ground-resolution position comparisons allow only
`1e-9` WU floating-point error; fixed-cadence traces are compared exactly.

The new suite and adjacent bot, map/respawn and Super Jump suites pass 117/117,
zero skipped. Existing wall-roll and wall-start suites also pass 18/18 without
new runtime repairs for #714/#904. Production build `1d5098354091` succeeds;
all 11 Bot/map chain cases pass against emitted/minified modules. Quick upstream
and numeric provenance checks and `git diff --check` pass. Full CI, physical
controller/browser and retail Switch tests are not represented by these logic
tests. This is one implementation residual on the existing Issue, not another
completed Issue.
