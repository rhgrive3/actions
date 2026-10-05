# Dependency-owner handoff: Batch A #665 and Batch C #668

These are unapplied review patches, not an accepted update to either Batch. The current Batch B #536 runtime is unchanged by this handoff. No main merge.

At 2026-10-05 16:27 UTC, #600 was closed as superseded by #665 and #322 was closed as superseded by #668. Accordingly the full dependency composition prepared on Batch B was NOT published to #536. The narrower fixes below are offered to the owning Batches instead.

## Exact inspected owners
- Batch A #665: 9837cfe7a36abb63ce0932ec581f98b35535d202. Resources still overrides ordinary shooter/bomb QuickRespawn because cause differs from literal weapon. The pause adapter does not cancel a queued Shooter first shot.
- Batch C #668: 5deb57e1b88ff31249d6799f67db7f1692f3969f. Its adapter already supports collector-style rain damage, so do not blindly apply the older collector hunk. Its coverage predicate still ends at dur - .3. Batch B HUD snapshot/Tenacity owners are not present in this Batch yet.
- Batch B #536: ff402cf968e2457da6383503e5f01c792b5dec30, tree d41943ce44a9c9b2dc29ecdb5257ab7c7a94fc69, main f62f9c6b9229cc3201143fbc9ab27f0c688c71ac. Its newer Charger flight is retained in the local composition.

## A: PR600 dependency bridges
1. pr600-quick-respawn-bridge.patch: apply the Resources condition by intent, preserving other resource owners. Only known environmental aliases override Gear's result. Ordinary/unknown death causes retain Gear QuickRespawn. Native 0/57 AP, eligibility and nine causes (36 combinations), actual shooter/bomb lethal hits, duplicate death and current-life kill exclusions pass (3 grouped tests).
2. shooter600-cancel-bridge.patch: requires Batch B's sub-action, platform and controls owners plus PR600 pending/swim fields. Reuse one dedicated Shooter cancellation method for blur, explicit hard cancellation and masked mouse/touch Map input. Preserve normal short-tap buffering, unadmitted sub and independent pad ZR. Pad receipt promotion changes neither pending timer nor shot count. 18 source tests and 20 independent boundary observations pass.
3. startup-fixture-pause-600.patch: follows #2. One online-pause call to the same dedicated cancellation method; pending-first and swim queue cannot fire after menu suppression. Both fail without that call. Ordinary short tap and committed Blaster windup remain. Included fixture updates retain the accepted 3F Shooter and 8F Charger timing contracts; 70 affected tests pass. Latest #600 already has some timing-only fixture updates; deduplicate them.

## C: PR322 / Issue469 bridges after Batch B
1. storm-gauge-display-469.patch: source delta over exact PR322 9f1fcacb. Display projects the existing 480F lock clock without modifying readiness or network charge. Native/emitted 18/18. Requires integration of the actual Storm owner first.
2. storm-composition-322-469.patch: project into the reused HUD snapshot BEFORE its mobile copy; prevent Tenacity from bypassing the Storm lock. Requires B's HUD snapshot/Tenacity. Four focused tests pass.
3. storm-remaining-connections-322-469.patch: require exactly one direct or collector damage path (reject absent, duplicated or mixed shapes), preserve the last-catch-up recipient-time rule, and use the full live rain interval for pre-update recovery coverage. C already implements collector support; port only missing safeguards and tests. Eight bridge tests plus 21 dt/order traces, native 480-tick 192HP, hold/throw death-respawn clocks and ghost terminal probes pass.

The frozen ghost policy remains asymmetric: no retrospective damage, while live coverage can continue under the existing clock policy. This is not a claim of complete online/hardware parity.

## Local composed evidence, not CI acceptance of A or C
Composition: Batch B f46 with PR600 91981db production, PR322 9f1fcacb, Issue469 and the bridges, then exact newer B Charger-flight delta. Local head 0666c048f800abaafa3fd47fa6a04c516a23b235 / tree 66650e5429c86bf44d2147c1238bc832aa7d037a.

- Aggregate 1226 pass / 0 fail / 5 existing optional modes. Separate optional/emitted modes were exercised in the preceding same-owner composition; final exact browser acceptance remains required.
- Final build da662c95f3fc2f719b0438b82829e47283a58bf3af8c88497a8d20bd7be6864a; 518 artifact hashes agree; 131 core + 14 Range preloads, all deferred helpers precached.
- Canonical 15 weapon range/paint goldens and 3 network modes pass on the final emitted build. Range source 29/29. Quality/emitted 302/302 and new Storm/Shooter/QuickRespawn emitted 39/39 passed before the narrow pause and latest-main flight update; these are scoped evidence, not relabeled as final-head CI.
- Main-flight delay/retirement/integer-tick 3/3 pass. Source network comparison 28 cases passed before that latest-main delta.
- Motion-detail's former instant Shooter expectation is updated locally to exact frame 2 then native 6F cadence, with missing/instant-timing negative controls (5/5 gates).
- The separate runtime-evidence test is CI-path-only here and fails locally because /mnt/workspace does not exist; no assertion was weakened to hide it.
- Local browser cannot launch due OS restrictions. No A/C new CI or physical acceptance is claimed.

Important latest-source difference: PR600 dd4d7a94 additionally permits effective non-squid inp.fire to count as held. That newer condition was not silently imported into this older-production composition; the receiving owner must preserve its current contract and rerun the focused cancellation boundaries. The full original dependencies are deliberately not republished by this handoff.
