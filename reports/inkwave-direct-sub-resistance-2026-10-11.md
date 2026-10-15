# Direct sub damage resistance — 11.3.0

Pinned source: https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/misc/params.json . The exact fixture `patches/splatoon3/reference/gear-params-1130.json` has SHA-256 `7d01dc1542316bc496425a35efe1a7ece553b2e1b8140ebc4b465555e754788e`.

Both DamageRt_LineMarker and DamageRt_Sprinkler store [high, mid, low] = [.5, .75, 1]. Main a5b7d86e actual Actors ignored these fields: 57 AP still took 40 Angle Shooter or 20 Sprinkler damage. Zero-AP cases passed, four AP10/57 cases failed before the candidate. This independent change computes victim-local coefficients and admits only the exact angleShooter / sprinkler source tags. The existing bomb eligibility predicate is unchanged. Attacker gear cannot grant victim reduction; raw damage stays in hit packets.

Actual JSON exposed an existing second omission: the build-only reliability hit cause set omitted registered catalogue angleShooter. The candidate adds just this known direct source, deriving its 40-damage ceiling from ALL_SUB_SPECS.angleShooter. The generic 220 ceiling and other allowed causes remain unchanged. Unknown tags, foreign senders, over-40 Angle claims and duplicate hits remain rejected. Collision truth remains client-authoritative, not server-attested.

Source focused validation: 67 tests, 66 pass, one optional external raw object-damage fixture skipped, zero fail. Includes victim AP0/10/57, actual projectile/drop contacts at 30/60/120Hz, actual JSON raw damage and one-time victim calculation, existing bomb classification, object armor and Object Shredder interactions. Full source/network, production-built and actual browser validation remain pending.

A separate pre-existing Crab residual is preserved: after catalogue armor is exhausted, the native armor flag still multiplies spillover by .25. A raw40 hit against armorHP10 therefore causes 7.5 body damage at AP0 and 3.7 at AP57 after existing 0.1 truncation. Booyah's equivalent case is 30 and 15. The candidate does not claim retail fidelity of that Crab behavior or change it without a separate source-backed review.

The marking-duration candidate is independent and is not included in this branch. Toxic Mist movement reduction and other gear effects are not changed here.

The same 67 focused tests also passed against the generated production site (66 pass, one optional raw-file skip), runtime contentHash `9d0f5c10d2ecb619b4aeea14e10142dae30f8983f297898648ace9ee2a4570d6`. An additional extracted browser probe passed against that actual build: six native contacts plus four real JSON owner/ACK cases. It records raw outgoing damage, authoritative reduced ACK damage, duplicate/foreign rejection and the Angle40 bound. This is an exact runner extraction, not yet Chromium/WebKit execution.

## Direct-hit ceiling primary-source verification
Pinned WeaponLineMarker.game__GameParameterTable.json (Leanny commit 7280ff9cde8bb1c5dcef46c700c326471584d2e6, parameter/1130/weapon) is saved as line-marker-1130.json. SHA-256: aae1cbb683bdf95e4318d639b5b3ea183e3e6b030665891a7ac5d0f2acfc0dda. GameParameters.MoveParam.DirectDamage is 400 in source damage units, corresponding to 40 runtime HP at the existing 10:1 conversion. The fixture now checks the admission ceiling against that field. Sprinkler's existing base damage is unchanged and is not claimed to have been extracted from this file.

## Latest-main aggregate validation
Base: official main d1ad48d1c10b5ded6a4fe273fe953e49e8bd7b04. Runtime head 0c1f3cd passed the full source gate: 4,840 tests, 4,821 pass, 19 optional skips, zero failures (1,922.9 seconds). All network tests: 448/448. Production-built related regressions: 77 pass and one optional raw-source skip. Follow-up source-only fixture commit 061ed41 strengthens the Angle raw ceiling assertion; that assertion passes in source and built modes without a runtime change. Actual Chromium/WebKit checks will run on the published PR; no browser or retail comparison completion is claimed here.
