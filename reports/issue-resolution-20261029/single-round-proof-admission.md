# Single-round proof admission: bounded production repair

Issues #1665 and #1666 remain open. Commit `08aa60ca` fixes a separate,
reproducible amplification defect in the mandatory production plausibility gate:
one Shooter, Dualies or Splatling proof could remove HP from two distinct local
victims or from both a Boss body and a crablet. Their actual native round ends
at its first body contact. Both projectile-birth and fire-event proofs now have
one use for these three families, including catalogue weapons. Existing Charger,
area and multi-unit capacities remain unchanged.

No wire tuple, damage definition, cadence, resource cost, launch, flight,
geometry or native damage method changed. This remains a plausibility gate:
an authenticated owner can still invent a fresh plausible attack stream.

## Actual native controls and receiver regressions

The new 54-case file uses production-composed source modules. Six controls run
actual native legacy/catalogue Shooter, Dualies and Splatling emission and flight
against two stationary native Actor bodies in a line. Every round produces one
actual first-body contact and retires. Catalogue controls use the installed
WeaponRunner; the three legacy controls call their installed native launchers.
The Character/muzzle is an explicit fixed display input; terrain is flat and
paint is dry/zero-credit.

The other 48 cases run composed NetMatch through native Actor damage or native
Boss.remoteHit/applyDamage/_hitCrab. They cover both proof encodings, direct and
deferred delivery, all three families, legacy/catalogue selection, actual HP,
proof use and native hit/nonce state. A distinct later shot can deliver the
otherwise-deferred second claim. They do not fabricate a second collision.

Two older modeled positives assumed a single Shooter proof could damage two
targets. The Boss/crab positive now supplies two distinct shots and asserts the
intermediate one-hit result. The two-victim positive asserts the Shooter's one
hit and adds an explicit Charger two-victim control. All previous test cases
remain; no test or assertion was removed or skipped.

Node v24.19.0 passed the exact final six-file source run **153/153**, with no
failures or skips. The same new 54-case fixture with only the unchanged
`e44cc218` runtime leaf substituted passed all six native flight controls and
failed all 48 admission regressions. The old runtime hash is
`7a68fa0156b5b1cf59d2423e57f9b6f391f96f3b807d0b5f12b3f8960927a4a4`;
the repaired runtime hash is
`55c3fb63f6a5f0d9096516221b0ce387383e8f0cc7e23e62e032f2e009087ceb`.

An initial native fixture run omitted its Character.actor backreference; the
six flight controls correctly failed before that display binding was repaired.
The first combined run loaded the earlier Boss/crab modeled expectation and
passed152/153. Its sole failure is retained in the initial-combined receipt.
The complete final rerun includes both fixture corrections and passes153/153.
Raw final/control/initial logs, hashes and the current production gap are in
[`single-round-proof-admission/summary.json`](single-round-proof-admission/summary.json).
The final command is recorded by these six files:

```sh
node --experimental-vm-modules --test --test-concurrency=2 --test-reporter=tap \
  patches/network-replication/tests/combat-single-round-targets.test.mjs \
  patches/network-replication/tests/combat-boss-proof-targets.test.mjs \
  patches/network-replication/tests/combat-native-proof-receipt.test.mjs \
  patches/network-replication/tests/combat-native-receipt-order.test.mjs \
  scripts/tests/inkwave-combat-provenance.test.mjs \
  scripts/tests/inkwave-boss-positive-proof.test.mjs
```

## Exact remaining production boundary

A fresh unchanged-production-path probe still exits1: owner-authored fire+hit
removes36 HP in PvP, Boss and crablet controls with zero actual sender launches
and zero receiver projectile contacts. The server authenticates transport senders
and forwards game JSON; it does not import or execute native-command-wire,
trusted-native-replay or its worker. Installing the isolated replay globally
would currently reject normal production gameplay because those clients do not
send the complete raw frame history and the relay owns no native match world.

Safe mandatory integration still needs sender frame capture before every native
Actor update, authenticated server frame scheduling, a retained full native
Match/level/paint/Boss world and random stream, lifecycle/late-join/handoff state,
and effect delivery that replaces every hit/bhit claim route. Dry-paint/display
component fixtures do not supply those production owners. No optional client
flag or a client-owned worker supplies the missing server trust.

The comparison reference remains Splatoon3 Ver.11.3.0. This repairs a difference
from INKWAVE's already-installed native collision behavior; it does not assert
Nintendo's private authority design or new retail weapon/gear/frame values.
Root owns sealed emitted integration, hosted CI and the shared behavior-report
append. No remote push, server deployment, main merge, issue close or hardware
test was performed by this workstream.

Root review found a malformed-local-state edge in the new helper: unlike its
previous optional kind lookup, it dereferenced a missing weapon. The follow-up
returns a zero-use budget when the local definition is absent. An actual
composed receiver regression clears that definition, admits a native owner birth
row, and verifies no exception, no usable proof and unchanged victim HP. That
focused source regression passed1/1 with no skips. The153/153 and54-case hashes
above deliberately retain the exact original code-commit receipt rather than
claiming that they cover this later guard.

The complete final six-file source rerun after the missing-definition guard
passes **154/154**, with no failures or skips. Its separately hashed raw log and
final code/test hashes are retained as guardFollowup in the same summary.
