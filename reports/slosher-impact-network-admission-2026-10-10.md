# Source-derived Slosher impact paint admission

## Confirmed discrepancy

With the existing depth-ratio correction applied, a legitimate Slosher first-unit terrain impact has radius 4.44 and additive stretch 0. The generic untagged paint radius ceiling is 3.744, so the receiver discards it. A real impact gives 989 sender cells versus zero receiver cells in the deterministic CPU level. A separate complete native volley test calls `fireSlosh` and advances the real projectile simulation through birth, flight, terrain impact and terminal events; the integrated baseline also fails its sender/receiver grid comparison.

This patch does not increase the generic ceiling, divide a stamp, alter the source radius or change the existing source-to-world calibration.

## Bounded action-specific admission

- The existing `p` projectile event gains a Slosher-only epoch/life tag inside its existing opaque ink metadata slot. Packet length and all existing unit/identity fields remain unchanged. Other projectile producers retain their previous metadata and schema.
- The receiver uses the same production projectile packet parser and unit selection as ghost construction. It requires owned/member/remote actor identity, Slosher weapon/type, legal finite projectile fields and lifetime, match/life tag, unit index, projectile ID, and event sequence/tick. A duplicate projectile ID cannot manufacture another permit by choosing a new event sequence.
- Only the native terrain-impact paint call attaches the optional paint tag. The tag references the accepted birth, actor, projectile and life, and carries exact origin, hit point, normal and terminal velocity. Ghosts, release paint, flight trails and splash effects do not receive that tag.
- Exact origin is constrained to the existing rounded birth position. Exact hit point and normal reconstruct the existing `hit + normal * 0.14` paint center. The receiver reuses the current `fidelitySlosherImpactPaint` formula and requires exact radius, additive stretch and seed equality. Existing paint transport is already full precision under #1112, so no new quantization is introduced.
- Heading stays consistent with the birth's full-precision horizontal velocity. The receiver reproduces the native normalize, flatten, near-vertical fallback and normalize sequence using terminal velocity, rather than rejecting the legitimate `(0,0,1)` fallback of a nearly vertical impact.
- Each accepted projectile permits at most one terrain stamp. Ordinary projectile terminal playback closes an unused permit after actor hit, water removal or expiry. Impact-before-terminal remains valid. Used/retired projectile identities cannot be reapproved by a later birth.
- Existing kit proof deferral, sequence admission, original-envelope deadline evidence, bounded 256-row/two-second waiting and expiry recovery are reused. There is no second pending queue. Capacity and eviction watermarks are separated by owner and birth kind: 128 kit births and 128 Slosher births, preventing a fast multi-glob volley from evicting a still-flying kit bomb. Approved births survive owner death/respawn or weapon change, while unreceived old-life/old-match births cannot be relabelled at impact time.
- Network identity now includes both the new Slosher admission module and the previously omitted result-admission module. A focused test checks their generated hashes against actual file bytes.

## Source and confidence

The data basis remains the supplied Drive archive `part02.zip` member `Splatoon3-resources/splat3/data/parameter/1130/weapon/SlosherStrong.game__GameParameterTable.json`, SHA256 `1d20043ad7efaf2831801afbce601fb1e14bfd11947063903c6fadd6c98f5298`, pinned to Leanny/splat3 commit `7280ff9cde8bb1c5dcef46c700c326471584d2e6`. Its first active unit has WidthHalfNear 4.44 and DepthScaleNear 1. Width uses the existing one-world-unit-per-source-unit calibration; depth is dimensionless and reaches the renderer as additive stretch 0. The existing high-drop curve and asymmetric stamp remain local interpretations, not verified Nintendo executable behavior.

The new wire metadata, queue bounds, capacity policy and numerical admission are INKWAVE engineering. They prove consistency with an accepted sender-owned projectile action and the local sourced footprint formula. They do not establish actual ink payment, firing cadence, collision truth, server-authoritative anti-cheat or Nintendo network-protocol parity. No relevant executable decompile or raw source bundle is published.

## Verification

The tests execute the real production adapter chain, native projectile generation/simulation, encoded events, NetMatch admission/playback and PaintSystem CPU grids. Socket, scene/render and collision-world fixtures are deterministic; no browser, real relay or console capture is claimed.

Dedicated cases cover first/after units, near/mid/far range, high-drop shrink, complete native volley flight, absent/late/reordered births, forged radius/stretch/heading/center/origin/unit/identity/owner/match, duplicate impacts and projectile IDs, expired proof, original deadline commit, death/weapon-change survival, old-life/old-match relabelling, near-vertical fallback, ghosts, non-impact capacity retirement and kit quota isolation. Neighbor tests include the existing kit/capacity suite, ballistic and legacy packet contracts, owner validation, numeric paint admission, result integrity and actual Slosher birth sampling.
