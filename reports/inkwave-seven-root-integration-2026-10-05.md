# Seven-root integration on current main

Base: b4d5c31e33258a0b6f874e42234448e404eec2d4. This new dedicated batch does not overwrite the separately owned, currently conflicted #536 or duplicate the pending A/C dependency bridges.

Refs #681, #676, #682, #683, #616, #672, #685.

## Reviewed sources and ownership

- Movement #681/#676: local ccaf2b7cc3e970fd2d95db1d48ec7a877daacba2 / tree8c9c0c13224b16aafed4c46bdd961f21d1fc7d9f. Neutral rebasing considers only consumed axes0..3; pad disconnect clears stale camera filter/edge state before disabled-controller early return. Mouse and other input owners remain live. Exact #701 Map-look composition was separately checked in both source orders and minified execution.
- Weapon PR #702: c37b6b6e remote / local28ca899cc2312a92adbb6812adab9e11a850d085, same treeb7129d34. Horizontal Roller flight removes only unsupported generic recurring trail; impact/vertical ownership remains. Storm Player coverage uses the same current radius scale already used by Boss/FX. Numerical values and physics solver are unchanged.
- UI PR #703: final7b000d956461dbd68d6fa8eec9cc68539ff0a4c6 / local099d19ac, tree9ddaf9a5315118bf0746d63d8fde7d428ceeda0a (runtime unchanged from initial49fda75). Match-bound HUD/Diorama caches release only the retiring owner, including departed/empty rosters. Closed/retired pins cannot jump. Minimap FX uses scalar identity through a WeakMap rather than retaining Actors. This does not introduce a second match:dispose event producer.

The production files have separate owners. The only report conflict was resolved by retaining both appended sections. No raw inkwave-public, main branch, source PR or Issue closure is changed here.

## Inherited validation repairs

1. Exact PR701@5e78a21e131fd8f3110b97a3d6fa4845ff5ccaa0's scripts/check-inkwave-weapons-fidelity.mjs delta is reused: installed native recorder,32-field envelope and existing birth mode/seed/id/tick/sequence. All15 range/paint goldens and trajectory tolerances remain. No PR701 gameplay or #536's separate33-field protocol is imported.
2. Pure mainb4d already fails the131-core preload budget after PR694 made superjump.mjs reachable (132core+14range). Only that helper is added to the existing preload-only deferred set. It remains in the immutable dependency graph and full service-worker precache; budgets are not raised.
3. The new UI test originally imported esbuild even in ordinary source mode. Loading the optional minifier only when requested removes a clean-CI package prerequisite; actual source/emitted assertions remain unchanged.

## Evidence

Source-lane evidence is reused for unchanged modules: movement47 source tests,16 old-source negatives,18 exact701 composition/minified tests and10 actual-emitted boundaries; weapons7source/7emitted and21related tests; UI11source/11minified/11emitted and100quality tests. Weapon broad S3 test run had503 passes plus2 ENOSPC environment failures; the same2 cases passed after storage recovery. That initial failure is not erased.

Combined build: ce28155b43828e108faeb3ea3744f7b196e8a99272859fe30aa231fd7d267495. Startup131core+14range; all helpers precached. Canonical15 goldens/3network modes pass. Combined focused24pass (pad17/weapon7) plus UI actual-emitted11/11; the initial optional-minifier import failure was corrected before the successful UI rerun. Complete combined quality100/100 including explicit GC.

The local aggregate invocation did not yield an accepted result: its default log directory inherited the /tmp checkout and the persistent-storage guard rejected it after execution. The guard was not weakened; persistent log storage is now configured. No aggregate success is claimed. The required exact-head CI validate job will run and report the complete aggregate before acceptance. No source-lane or previous-head success substitutes for that exact combined acceptance. Physical gamepads/sensors, device heap/GPU/long-soak and Nintendo parity remain unverified. Node GC proves the targeted reachability property only. No new browser verifier claims are fabricated.

## Prepared verifier-only follow-up

Reuse the accepted Range paint-kind fixture plus real displaced-Actor negative (27/27), and allow the existing validate command sequence12 rather than10 minutes (workflow contracts9/9). Runtime/build ce28155b is unchanged. The old active job completed successfully. Its remaining six acceptance jobs were still queued when the base changed; the approved follow-up supersedes those unstarted jobs rather than waiting for obsolete-base work. No unfinished or cancelled result is counted as success.


## Main37ab reconciliation

Main advanced to37ab02fcb7314eee8a6b3e6e8e6b0593610e7bff (PR698) during the initial cycle. Its Roller/Tenacity/Alpha-Turf/Flow owners are retained. Three textual conflicts were resolved: quality identity includes both new owners; Range keeps native paint-kind separation plus the existing stronger progress/displaced-Actor controls. Main now owns the Super Jump/Tenacity preload deferral, deduplicated rather than applied twice.

The rescued Tenacity helper also reintroduced the previously diagnosed Practice Range dummy deficit: a1-versus4 training roster gained7.59points/s. Reuse the already-reviewed one-condition opts.range exclusion and native/emitted reentry/negative tests. No unrelated Batch B runtime is imported.

New build97b27b35635c829e65f36945f3ecb7cbdcff64ffb1941d72b3e67a317bffa66b,480 artifacts; startup131core+14Range passes. Combined complete quality122/122, actual-emitted UI/Tenacity/projectile40/40 and canonical15goldens/3network modes pass. The new-base full aggregate runs with actual persistent workspace logs; its acceptance result is recorded separately when available.

Historical run37379408769 active job111997170088 passed at merge source6a116b681a6fe0339e9def6d6d91804ca8c48f40/contentce28155b. At22:24UTC, no job was running and the other six required jobs remained queued. These old-base results do not certify the reconciled head; the new exact CI must complete all required gates.
