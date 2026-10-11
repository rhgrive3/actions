# Accepted gear loadouts and host adoption

## Reproduced defect

The production-composed Actor sends weapon and gameplay adoption state but previously did not send its three-piece gear loadout. A separate JSON receiver therefore kept empty equipment. When the owner left and the host adopted that actor as a bot, run speed, main-only abilities and gear-derived special cost were lost.

## Implementation

A versioned `gg` sidecar carries only three garment/main/sub identity rows, bound to the existing match, actor, life and adoption sequence. It is read only after native sender/owner and adoption admission succeeds. Legal fixed slots are validated with the same `abilityAllowed` contract as local equipment. No remote AP or multiplier is accepted. Frozen copies prevent packet mutation from altering admitted state.

Remote sampling refreshes the accepted loadout without running remote movement. Host takeover restores the latest accepted equipment, even when the visual interpolation sample is older. The refresh preserves authoritative absolute special points, avoiding a second Special Charge Up conversion. Existing actor tuple fields remain unchanged.

## Validation so far

- Separate production-composed Actor/NetMatch realms, actual JSON sender→receiver→owner-leave adoption: AP 0, 3, 10, 30 and 57.
- Actual adopted movement at 30/60/120 Hz retains the owner's run-speed modifier.
- Fixed Tenacity, Special Charge Up and Object Shredder slots survive; adopted Tenacity advances through 60 real Actor updates without double-scaling special points.
- Main-only/subslot misuse, excess slots, numeric multiplier IDs, wrong match/actor/life/sequence, foreign sender, stale/duplicate packet, same-match roster rebind and previous-owner traffic fail to grant or roll back equipment.
- Real respawn starts a new life; a re-enveloped old-life snapshot cannot overwrite its gear.
- Legacy absent sidecars remain readable; accepted rows are immutable copies.
- Splatfest Tee preserves doubled legal subs while fixed primary slots remain enforced. Lower special cost preserves the owner fraction; full gauge remains ready without duplicate ready events. Immediate post-respawn takeover restores new-life gear before visual sampling.
- Source and production-built focused cases: 17 each; broader network regression: 448 passed. The isolated full Splatoon source gate completed with 3,630 passes, 9 conditional skips and no failures (3,639 tests, concurrency 4). The combined 1237/1239 source gate and actual browser validation remain pending.

## Cost and limits

A representative eight-owned-actor sidecar with a 32-character match ID is 976 JSON bytes. On this cloud CPU, 10,000 repetitions of packing and JSON serialization averaged 34.8 microseconds per eight-actor sidecar. This is a local microbenchmark, not a frame-rate or real-network benchmark. Sidecars are repeated for snapshot recovery and are not yet delta-compressed.

This change transfers static legal equipment. Comeback remaining duration, extended Opening Gambit deadlines, drink state and other transient conditional clocks are not yet transferred or declared complete. The existing client-owner trust model is preserved; legal claimed equipment is not independently verified by a server. This work does not claim all retail gear behavior, physics, online authority or presentation are complete.

## Primary slot evidence

All 27 INKWAVE equipment identities, including `none`, map one-to-one to the pinned 11.3.0 GearSkillTraits table. The source's `KindLimit` validates head/clothes/shoes primary-only restrictions and ordinary abilities' unrestricted slot kind. The Splatfest Tee requirement remains an additional local identity constraint. `ConsistsOfChip` is crafting data and is deliberately not interpreted as active AP effects.

Source: https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/misc/spl__GearSkillTraitsParam.spl__GearSkillTraitsParam.json

Exact retrieved bytes are kept in `patches/splatoon3/reference/gear-traits-1130.json`, SHA-256 `853f8eb25077ec5d7017a7ec1da3b9cddf4b0ddba5f7c361f2fd51f7a12d0a57`. The test checks all 27 × 3 × 4 slot combinations against that primary table.

The combined 1237/1239 candidate also passes 52 production-built adoption/object/native cases and all 448 network regressions. The exact newly added browser-probe body passes in source and built Actor/NetMatch fixtures; actual Chromium/WebKit execution is still pending.

## Fractional special-cost handoff boundary

An additional actual-Actor test exposed a native quantization edge: a 200-point weapon with 3 AP Special Charge Up has a computed cost of 194.36893751135847, while its full gauge is sent as integer 194. Remote presentation already uses the admitted ready bit, but ordinary bot adoption discarded that bit and became unready.

The candidate now reconstructs this boundary after adoption only when legal gear was admitted, the existing owner `spCost` agrees with the locally recomputed cost, the life matches, and the native gauge is within its valid rounded range. It reuses the existing ready flag; no new multiplier or cost authority is accepted. A true ready flag must also agree with the rounded full-cost gauge. False readiness prevents an upward-rounded near-full gauge from becoming a gameplay activation. No readiness event is synthesized. Spawn-state exact gauges and active/locked-special lifecycles remain separate.

Actual JSON tests cover full and near-full gauges at 3/10/30/57 AP, forged remote costs, and ready flags far below full gauge. The browser probe additionally exercises the fractional full-gauge takeover. Source focused 20/20 plus exact browser-probe contract pass; rebuilt and final full gates are being rerun for this correction.

The readiness correction passes a separate 7,540-case numerical matrix: 65 canonical base costs × AP 0–57 × full/near-full. This deliberately covers the continuous integer AP domain, including values not constructible from normal 10/3 slots; it is not 7,540 real-browser matches. Legal actual-Actor loadouts are covered separately. Final production-built adoption/object/native/browser-contract regressions pass 56/56 and network regressions pass 448/448.

## Final local gate before publication

The final readiness-corrected combined candidate completed the full Splatoon source gate: 3,683 tests, 3,673 passed, 10 explicitly conditional skips, no failures, 944.9 seconds at concurrency 4. The raw Object Shredder case skipped in that generic gate was separately enabled and passed in the 56-case production-built run. The separately added 7,540-case cost matrix also passed. All 448 network cases passed. Production content hash: `9d28f9b129102095dbf150b83f30195e2f50d3a5bf2e55169232b3be95e3b57e`.

Publication and exact-head Chromium/WebKit validation remain pending until the parent 1239 changes are accepted into main. Existing 1237 browser evidence establishes the underlying object/native changes, not the new gear-adoption browser probe.

## Death timeline before visual sampling

A further actual JSON case reproduces an initially dead owner whose death event is played before its first visual sample. Native death playback clears the snapshot buffer, so adoption previously lost the already-admitted equipment. The adapter now restores the newest validated equipment immediately before native death playback clears that buffer. A regression proves that all 57 legal Run Speed AP survive this event ordering and subsequent host adoption. Conditional ability clocks remain a separate candidate.
