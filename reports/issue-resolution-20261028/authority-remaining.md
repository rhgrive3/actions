# Remaining combat authority: bounded repairs and exact open boundary

Issues [#1665](https://github.com/rhgrive3/actions/issues/1665) and [#1666](https://github.com/rhgrive3/actions/issues/1666) remain open. This change fixes independently reproducible Boss admission defects; it does not turn an owner-authored attack stream into trusted authority.

## Implemented behavior

- One straight-fire main proof can connect with each Boss body/crablet object once. Fresh transport nonces cannot spend the same collision twice. Existing separate-target capacity, including Charger penetration, remains available.
- The generic crablet `w:'crab'` marker is bounded by the matched proof's actual equipped slot. A Shooter proof cannot borrow the equipped bomb/Special ceiling. Roller contact likewise uses its main slot rather than the largest equipped slot. Legitimate bomb crablet damage remains available.
- Invulnerable/hidden Boss body claims reject before spending attack proof or native nonce, and never remain as pending future damage. A deferred claim that reaches a blocked body retires. Crablet immunity remains independent of the body.

The runtime change is confined to `patches/network-replication/combat-provenance.mjs`. No wire fields, weapon timing, damage definitions, projectile flight, collision geometry, movement, rendering or native Actor/Boss damage functions changed.

## Verification

Node 22.23.4 ran the following five files:

```sh
node --experimental-vm-modules --test --test-concurrency=2 \
  patches/network-replication/tests/combat-boss-proof-targets.test.mjs \
  patches/network-replication/tests/combat-native-proof-receipt.test.mjs \
  patches/network-replication/tests/combat-native-receipt-order.test.mjs \
  scripts/tests/inkwave-combat-provenance.test.mjs \
  scripts/tests/inkwave-boss-positive-proof.test.mjs
```

The source suite passed **99/99**. Two existing receipt tests previously injected callbacks with unminified text replacements. Their initial emitted run passed97/99 because the minifier removed both anchors and the hooks silently did nothing. The repair locates the unique imported `commitOwnerTick` call and native accepted-actor-list `push` with Acorn, inserts the same callbacks after those calls, preserves their return values, and retains every original assertion. The repaired receipt file passed **17/17 source and17/17 emitted**. The final complete five-file emitted rerun passed **99/99**, with no failures or skips.

The optimized build used the normal production builder and esbuild. Its content hash is `1d86791e1a35f5f4b84ba5b084737186942ef7ebbf9179545585b788dc104b72`. All **2,229 emitted artifacts** were individually hash-checked against the sealed manifest; the manifest declares1,521 inputs, and the changed runtime input also matches its recorded source hash. The runtime SHA-256 is `7a68fa0156b5b1cf59d2423e57f9b6f391f96f3b807d0b5f12b3f8960927a4a4`.

The new13-case file fails **8/13** on the unchanged baseline runtime and passes **13/13** after the runtime repair. It runs composed NetMatch through native `Boss.remoteHit`, `applyDamage` and `_hitCrab`, checking HP, native nonce, proof use and damage credit. Its legitimate Shooter controls run native `fireShooter`, native projectile flight and `Boss.segHit` at30/60/120Hz, capture the final contact routing, then deliver the actual recorded projectile birth through receiver admission and native Boss HP. Display, flat world and Boss placement are explicit component inputs; the sender Actor/WeaponRunner input loop is not simulated. This is source/component and actual emitted-module evidence, not a browser/socket/full-match/device or Nintendo retail acceptance.

The baseline and final results, raw logs and remaining owner-forgery rows are retained alongside this report. Early fixture attempts corrected a missing display `getMuzzle` seam, an upward bomb test direction, an absent optional native presentation-forwarding assumption and an incorrect `roller.damage` field. They did not change game physics or the original suites' expectations.

## Concrete trust blocker

`server/src/index.js` authenticates the connected sender, validates the relay envelope and forwards the game JSON. It does not run Actor input, weapon resources, projectiles, Boss geometry or damage simulation. `NetMatch.recProj` and `_onLocalEvent` encode an owner's local action; the receiver observes that same owner's pose, birth and fire rows. A fabricated but plausible owner-authored action and a genuine action can therefore have identical authenticated wire bytes. Another client-supplied flag, hash or signature would authenticate the same owner's assertion, not whether a shot occurred.

The committed diagnostic can be rerun independently:

```sh
node --experimental-vm-modules \
  patches/network-replication/tests/combat-owner-claim-gap.probe.mjs \
  /tmp/combat-owner-claim-gap.json
```

It intentionally exits1 while the security gap remains. Its9 controlled rows use real composed NetMatch and native Actor/Boss damage, with no socket/browser. Absent and foreign-owner fire produce0 damage. A fresh owner-authored `weapon:fire` followed by `hit`/`bhit` still deducts36 HP in each of PvP, Boss body and crablet, with0 actual sender weapon invocations and0 receiver projectile contacts. The same limitation holds after the repairs above.

Completing either issue requires a mandatory authority that derives legal attack/contact receipts from trusted initial state and bounded inputs, including all65 main owners, subs/Specials, resource/cooldown state, historical cross-owner world order, victim/Boss geometry and lag, first Squid Spawn, late join, ownership migration and delivery/stat/result semantics. The earlier experimental native Charger replay on commit `353a42a5db1b44d8432bf10ac3a025fcf819ea54` supports1/65 mains in landed fixtures, rejects the real initial Turf spawn path and is not attached to mandatory damage admission. Connecting it globally would exclude legitimate gameplay; its source is available and was inspected, so this is a concrete missing authority contract rather than missing source access.

The Splatoon3 comparison target remains Ver.11.3.0. No Nintendo weapon/gear/frame values were invented or changed here, and no public evidence of Nintendo's private network authority implementation is claimed. Existing native flight/damage behavior is the preserved INKWAVE comparison boundary. Root owns integration, hosted CI and any shared behavior-report update; no main merge, push, issue close or external comment was performed by this workstream.
