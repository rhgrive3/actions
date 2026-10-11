# Object Shredder target damage: 11.3.0 integration

## Reproduced defect and changes

Actual composed Actors equipped with Object Shredder lost only 100 armor HP for a 100-damage attack against Booyah Bomb / Crab Tank, instead of the pinned ObjectEffect_Up factors of 1.1 / 1.3. The equipment modifier existed but these damage contacts did not consume it.

This candidate connects the shoes-main equipment identity to Booyah armor, Crab armor, Wave Breaker (1.25), Super Chump decoys (2), Splash Wall (1.5), Beakon (10), and shootable Torpedo (1.3). It preserves ordinary damage with no gear. Armor-only amplification consumes the corresponding raw damage before forwarding any unabsorbed damage to the existing Actor path; it does not amplify the unarmored body. This retains INKWAVE's existing overflow model, whose exact retail transition remains unverified.

Device callbacks are once-only. Ghost contact remains presentation-only. The shooter's client sends raw damage with a boolean equipment identity, and only the admitted owner/life path computes the fixed target factor. No numeric multiplier from the network is accepted. Hit-scoped identity is cleared in finally. Accepted snapshots carry distinct bit27, separate from Respawn Punisher bit25 and special-ready bit26, and become invalid after owner/life changes. This preserves the existing owner-authoritative client protocol; it is not server-side attestation of a remote player's loadout. An accepted hit identity can be true while the last snapshot was false: the hit-local owner claim deliberately wins for that hit only, just as existing hit-local Respawn Punisher metadata does.

## Pinned primary reference

https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/misc/spl__DamageRateInfoConfig.pp__CombinationDataTableData.json

Only RowKey ObjectEffect_Up and the named target columns are used. The curated receipt records the entire original file's SHA-256 and Git blob cdf8dd8b14cc29912b94e966ccf65f382fb75137. CI retrieves the immutable raw file, verifies both hashes, compares every extracted row, then runs the same real-Actor tests on the actual composed build.

These are fixed gear factors, not 0–57 AP curves and not the table's separate per-weapon source damage rates. Those source-specific rates are not silently inferred or declared complete.

## Checks

- Actual Actor activation and armor damage, no-gear equivalence, ordinary body damage, and native bomb explosion paths.
- Actual Projectiles device candidates: direct contact, repeated callback, ghost contact, and target-specific factors.
- Real NetMatch sendHit through JSON: sender admission, fixed gear identity, once-only damage.
- Real catalogue record through JSON and a separate fixture: Wave Breaker, Chump, Wall, Beakon, Torpedo; wrong sender, duplicate events and stale attacker life where applicable.
- Accepted snapshot identity: independent flag, foreign/stale rejection and owner/life invalidation.
- Unknown target, wrong clothing slot, numeric multiplier, and ordinary AP cannot create the effect.

## Remaining work; no full-fidelity claim

- The initial Object Shredder tranche did not reach native Sprinkler records. The isolated follow-up now includes that contact and owner-confirmed destruction; see inkwave-native-sprinkler-damage-2026-10-11.md. Its inherited 120-HP profile and .42 hitbox remain calibration, not newly verified retail values.
- Explosions reaching Actors consume the new armor factors. General radial damage enumeration of every independent device remains a separate pre-existing gap; changing a multiplier is not proof that every blast can reach a device.
- Existing Bubbler and Splashdown fist factors already use 1.1 and are not multiplied a second time. Their complete source-rate/authority audit is separate.
- Rainmaker shield, stage sponge/rail and other absent targets are not invented here.
- The earlier stacked candidates passed their catalogue browser probes. The isolated main-based candidate requires its own exact-head browser CI; earlier results are not a substitute.
- Full gear-power fidelity, weight acceleration and airborne physics remain unfinished.

## Local evidence (2026-10-11)

- Initial real-Actor negative reproduction: 0/2 before the change; both exact armor factor assertions failed.
- Final composed production suite: 66/66, including 22 new checks plus existing all-specials/all-subs regressions; raw-source hash/rows verified without skips.
- Existing clothing-gear suite: 16/16.
- Production build and whitespace checks passed. Remote CI/browser review remains pending publication.

Armor-break boundary regression (50 armor HP, 100 incoming): Booyah body HP 50 without gear / 45.5 with gear; Crab body HP 87.5 / 84.7. These include the existing post-armor body factor and final 0.1-HP quantizer. They verify the implemented overflow contract, not retail equivalence.
