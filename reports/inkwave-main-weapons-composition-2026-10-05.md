# Main weapon composition after PR587

Baseline: main fc057af (PR587 Weapons/Ballistics), composed with PR536 after adeff3ce. This reconciliation uses the new main's canonical collision and finite Charger flight owners. It does not introduce another physical distance calibration.

- #403: remove the old closest-point source hook and legacy radius snapshots. The main continuous solver uses raw Heavy .225 and Shooter .285, preserving the required .225/.285 ratio. Earlier .118421/.15 absolute anchors are both superseded by main's mapping; they are not mixed with the new solver. #470 charge-walk 3.72 and stream4.2 remain, with lock priority and gear/Flow multiplication.
- #407/#420: retire the old synchronous Charger paint source hooks and pure legacy mapping helpers. Main's finite flight now owns impact and line paint. The raw impact min/full .906/3.263 preserves the old endpoint ratio and full>=.999 discontinuity; spacing min/full4.7775/2.0592 preserves the ratio. The old impact and spacing scales are superseded by main by uniform factors2.2658333 and3.98125 respectively. These are implementation-scale relationships, not Switch physical measurements.
- #414/#431: preserve the native final `_push` forward-velocity hook and pooled applied flag. Main configures Roller launch first; forward inheritance then runs once before native network recording. Ghost guards remain. No second inheritance consumer exists in main fidelity.
- Splatling integer reservation and4F cadence, #527 Roller31/56F and13F squid gate, and #530 main/sub admission retain their existing owners. Main's Splatling wrapper captures charge for launch velocity then delegates the existing runner, rather than replacing reservation logic.

Focused acceptance uses canonical source/emitted fixtures: actual continuous capsule grazing (Shooter hit/Heavy miss), real OBB wall-before-player obstruction, immutable collision records and pool reset, ghost no-damage/no-paint, full charge/prepaid22.5 ink/4F spacing, finite Charger flight onto actual floor/wall OBBs, impact event/paint equality, charge0/.5/.998999/.999/1 ratios, update subdivision, and existing Dualies/Roller forward-velocity tests. Legacy helper values alone are no longer acceptance evidence.

The previous source fixture's4 charge tests have been moved to the canonical weapons-fidelity fixture, so emitted mode exercises the actual new runner stack. Renderer/physical Switch equivalence remains unmeasured. Network owner-clock reconciliation is handled separately by the integration owner.

## Network and loading connection fixes

PR587's own run37275438491 failed native Charger owner/remote comparison (4.8 versus2.4 at equal beam age). Its finite-flight job advanced on render time while the beam already used owner playback time. Flights now consume the same bounded60Hz owner tick/time envelope, stop on duplicate/frozen packets, and retire when their peer beam is retired. No new wire field is introduced. New real-NetMatch event regressions cover delayed catch-up, changing render cadence with frozen playback, integer ticks, peer-beam retirement and world clear (3/3). Full network regressions52/52 and authoritative/reconstructed comparisons28/28 pass; maximum fixed projectile position difference0.0090893 within the existing0.08 gate.

The new weapons fidelity verifier also assumed obsolete27-field packets and bypassed native recording. It now invokes actual `_rec` and requires all32 fields, explicitly matching birth mode, seed, projectile identity, owner tick and sequence. All15 existing range/paint goldens and3 reconstruction modes pass without changing their target values.

Three new weapons runtime modules are excluded only from eager preload hints, using the existing deferral policy; all remain precached and in the dependency graph. Core131 plus range14 and all original byte/dependency budgets pass.

## Final local composition evidence

- Full gameplay/reliability1121 pass/0fail/5 emitted-only cases; all five separately exercised in the29-case emitted Map/defaults/tie set.
- Complete quality/emitted/verifier contracts267/267.
- New main/sub and special-boundary source31/31 and actual emitted31/31, with the new fidelity installer present. The existing PR302 refund and PR318 admission narrow probes also pass; those full PRs remain separate.
- Pinned seven raw weapon files match SHA256;63 explicit fields and1045 mirrored numeric leaves/38 bindings verify. Mirroring is not proof of runtime use or Nintendo engine parity.
- Final production content `43ea1bb0ea73d4460f5f7bb54987eb92219f3adf6cf460e312151f3848f1c601`.

The previous head's six successful CI jobs and repaired catalog evidence do not certify this new-main composition. Exact combined CI, including the repaired Dualies catalog scenario, remains required. Additional local Issue candidates are excluded; main is not changed by this integration branch.

## Browser network boundary follow-up

Run37279097038 passed validate plus active, catalog, UI, range and startup. Catalog independently verified44 runtime/83 total loaded receipts and854 image byte hashes, including the repaired240-frame Dualies scenario. Its network browser failed the unchanged0.08 trajectory bound. The verifier previously saved traces only after acceptance, so this correction also saves complete traces before any comparison and the maximum-error pair before the tolerance assertion, with phase/collider metadata.

An actual native floor replay with seed13 reproduces0.254664773 trajectory error: rounding launch velocity to two decimal places moves the Roller braking/free-fall threshold crossing by a tick. Keeping the three existing birth-velocity fields at their original JSON numeric precision reduces the same case to0.007670789 (the existing position quantization), with zero birth-velocity difference. Physics values and acceptance tolerances are unchanged. A permanent seeded real-floor/wire regression and exact three-component round-trip assertion cover this boundary.

Separately, immutable Roller unit identity is now transmitted as one field before the unchanged tick/sequence footer; complete packets are33 fields. This prevents received moving vertical shots from choosing a different field collider by nearest-speed inference. Valid legacy27/30/32 packets keep historical fallback; unsupported lengths and malformed new unit records are rejected before allocation/identity advancement. See inkwave-roller-unit-replication-2026-10-05.md for exact compatibility and scope.

The combined correction's gameplay aggregate passes1121 cases with5 emitted-only modes explicitly covered by29/29. The strict packet follow-up is verified by the final full network suite and canonical15-golden/3-network-mode gate. Startup remains131core+14range, all deferred modules precached. Browser acceptance requires the new exact-head CI; the earlier failed run is not promoted to success.

Final strict network suite61/61; canonical15 goldens and3 exact33-field reconstruction modes pass. Final content hash: f917ec92d1d0dd4b24b6aebfcd063acb846b878d56c3d244c8e94c12711d26ad. Only the two network-production boundaries, their regressions and failure diagnostics are changed in this follow-up; no additional Issue candidate is included.
