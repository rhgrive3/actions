# INKWAVE #511: boss-hit transport admission

Baseline:83d6b088246f760a34d0921c118482bca7cde777. Native `NetMatch.onMessage` forwarded bhit without validating the actual sender. Native Boss.remoteHit accepted negative damage, which could heal the boss and corrupt credit.

The quality adapter admits the real sender only when it owns the referenced remote actor, validates finite positive damage and weak/crab/weapon fields, and checks the existing shared start config.id plus accepted attacker combat life. A boss-only monotonic sequence is separate from normal hit counters. Accepted owner life uses max(rendered life, latest admitted owner snapshot), so delayed render interpolation cannot reopen old-life hits. Native boss/crablet application and body damage cap stay intact; remote presentation cannot also apply damage.

Focused tests compile full native NetMatch and Boss modules through production source transforms, with real vendored Three/native context and presentation/unused dependency stubs. They exercise native health/stat/crab mutation, raw spoof/heal negative controls, actual sender serialization to receiver, duplicates, malformed packets, accepted-vs-rendered life, owner handoff/host adoption, old match packets, Storm amounts, body cap and independent normal-hit routing/counters. They do not execute a full network socket or physically measured boss model.

Current generated clients send additive boss-only m/l/q metadata. Legacy bhit packets lacking metadata fail closed, since ownership/once-only/session guarantees cannot be proved for those packets. This compatibility limit is deliberate and confined to this defensive boss-hit boundary; ordinary player-hit and paint formats are untouched.

Initial external implementations stalled/exhausted with no accepted source. Parent completed this narrow root after stopping the last lane and verifying it was dead. All prior logs remain evidence of handoff, not passing tests. Canonical CI runs on GitHub at final pushed head and native candidate.

## PR868 adoption from PR751

Source PR751 `e5640caa09d84560d1fdf792a74511b806384081`, adapter blob `8ef6d5f4b6623ea7147fbff13749df41488e018d`, is preserved byte for byte. Current composition retains the #427 normal-hit ACK owner: Boss admission is registered immediately after that adapter because both connect the native bhit switch case. No network-replication or gameplay runtime module changes.

The dedicated fixture now loads actual current NetMatch/Boss and their dependency modules through all six production adapter layers, rather than stubbing imports added since PR751. Five source cases pass. The negative disables only the new bhit admission call in the otherwise identical compiled source, reproducing spoof damage and negative-damage healing; the actual receiver/sender, boss HP/credit/crablet mutations and body cap are retained. These tests do not establish real socket/browser/full-build acceptance. Legacy bhit without session/life/sequence remains deliberately rejected as documented above.
