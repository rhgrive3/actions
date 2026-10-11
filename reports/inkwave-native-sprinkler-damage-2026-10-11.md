# Native Sprinkler destruction follow-up

The published runtime uses the native Projectiles.bombs lifecycle for Sprinkler. The old custom-device HP branch therefore did not make the actual native Sprinkler destructible. This candidate adds a swept hit contact for that existing bomb record, without creating another object, paint source, or projectile simulation.

- Ordinary attacks consume the existing 120-HP profile. Object Shredder uses the pinned Wsb_Sprinkler factor 10. The 120 HP is inherited from the existing profile; the fetched WeaponSprinkler table omits an explicit HP field, so it is not claimed as a newly extracted value.
- Damage only applies on the device owner's client. Ghost hits propose raw damage and fixed shoes identity. An owner-confirmed zero-HP state retires both native and remote ghost bombs without a generic bomb explosion.
- Existing native birth sequence, match ID, owner and life identify one device. Native wire arrays and paint metadata are unchanged. Legacy births without an accepted sequence cannot fabricate an authoritative object target.
- Wrong sender, stale life or birth, wrong match, distant contact, invalid damage and duplicate proposals fail closed. Remote numeric gear multipliers cannot grant Object Shredder. Existing owner-authoritative raw damage claims are retained; there is no new server-side attack attestation.
- Candidate callbacks settle once. Retired states cannot resurrect/heal devices. Recorder interception restores its exact prior function even on exceptions.

Validation: new source suite 8/8 and the integrated authority suite 2/2; actual composed build 49 passed plus one unrelated optional raw-reference skip across new Sprinkler, Object Shredder and all-subs tests. A new Chromium/WebKit catalogue probe exercises native birth, equipped/unequipped contact, once-only damage and retirement; remote browser CI has not run yet.

The physical sphere radius .42 is an INKWAVE collision calibration, not an extracted retail hitbox. General radial damage to independent devices remains separate. The separate PR #1233 safety change is included as a dependency: retired catalogue sprinklerDrop paint is rejected and native raycast hit records initialize their reusable point and normal. Those changes are preserved unchanged.

## Review-driven corrections

The initial 1024-key FIFO replay ledger was insufficient. An actual JSON regression sent 1026 accepted proposals and then placed the old payload in a fresh transport envelope; the old hit applied again. The candidate now retains a monotone application high-water mark by match / owner / actor ID / life, without evicting replay protection. A 4096-owner limit rejects new keys instead of reviving old ones. The shared counter covers both hit and state phases and is seeded from the session's persistent transport sequence. Rebinding the same remote Actor identity does not reset the ledger.

A real tick-ingress test reverses three legitimate events inside a normal protocol-v2 packet, verifies the outer transport orders them, and observes all three damage applications. This relies on the existing ordered accepted-event contract; arbitrary previously dropped old tick packets are not newly recovered by this module.

Native bomb records are allocated afresh. A retirement / owner reset / next-life new Sprinkler test verifies no HP, destroyed flag or birth identity is reused and an old-life target proposal cannot damage the replacement.

Pinned 1130 source exploration checked the 221-entry weapon tree, 20-entry misc tree, params and the sole WeaponSprinkler file. There is no explicit HP/MaxHP field in that Sprinkler file; no invented original value replaces the inherited profile.
