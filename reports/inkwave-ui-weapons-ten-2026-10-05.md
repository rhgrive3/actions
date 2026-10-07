# Fixed ten-Issue UI, lifecycle and weapons composition

Scope is frozen to #560, #564, #593, #589, #565, #555, #563, #590, #566 and #596. Base is published fixed-five head ef712f898753677b9d806b2f44cf3e473d2670ae / tree a80b019bd800fae2297482320a535c15755fa4f8, represented locally by9543e3e. Main remains fc057af9. PR322/469, PR496/568 and later candidates are excluded. This is PR-to-PR composition, not a main merge or Issue closure.

## Ownership and retained behavior

- HUD accuracy uses the actual projected spread once; ordinary Turf kills keep the card while independent team-wipeout events remain. Result podium uses the authoritative winning roster and victory choreography, while local XP/win/table/audio remain local-outcome based. Gear/Back restores the same winning roster.
- One Match.dispose producer runs before Boss/actor ownership disappears. Boss audio ends only for the matching active Boss. FxHooks weak Actor caches consume that same event and actor:removed; no second producer is introduced. Projectile cache ownership and native global-roster behavior are outside this change.
- Range LOW/touch uses1024 backing pixels, retaining logical2048 atlas packing, UVs and world geometry. Allocation is chosen at construction. Atlas images alone are insufficient: gallery/wall world images require visual review for readable labels.
- Storm rain runs through the existing full480-frame lifetime, independent of visual fade. Cloud lifetime belongs to its birth, not its now-dead owner; ghost rain damages only the recipient and does not repaint remotely.
- Dualies swim first-shot13-counted-frame and Charger fresh-start6-elapsed-frame gates use documented community targets and explicitly stated observation origins. They are not raw extracted timing constants or proof of physical input/display parity. Stored Charger charge remains a different owner. All existing profile values were preserved; the numeric mirror is regenerated with411 entries.
- Slosher release retiming changes the native pose-derived muzzle. It is not geometry-neutral. The initially discovered wall-sliver regression is closed by a Slosher-only full-segment guard retaining the native emitter in free space, then checking the native fallback before using the body origin. Actual wall and native owner/remote birth proofs are retained. An already-invalid body origin inside solid remains a native movement limitation, not a solved case.

## Composition and one-build validation

UI's exact e922..0b22 delta preserves the accepted Range contract correction. #555 is applied only after its existing #564 producer; its preparation commit is not duplicated. Shared fixture options network, fxHooks and fidelity are all retained, defaulting off independently. Shared comparison-report additions are preserved. The weapon patches modify separate runtime files; only profile/report context required manual combination.

One production build produced content33b65752e287b0fa32f0b4420a73e6632e46d8daf1dc50745b763e3b2345e979. The later changes are tests/reports only and reuse this exact build:
- Full gameplay/reliability aggregate:1167 passed,0failed,5 optional emitted cases. All five explicitly exercised in29/29 emitted Map/default-policy/tie cases.
- Complete quality suite with emitted modes and explicit GC enabled:298/298, no skips.
- Four new weapon groups against actual emitted modules:22/22, no skips.
- Complete final Practice Range suite:29/29, including the retained real out-of-strip Actor negative.
- Final differential weapon/input tests plus Boss/Fx lifecycle:12/12, including all five newly added cross-boundary cases and explicit-GC coverage. This targeted run followed the test-only addition; the identical broad runtime suite/build was not repeated.
- Startup:131 core+14 range module preloads; initial JavaScript3,189,678bytes;199 precache entries/4,591,124bytes. All artifact/dependency/cache hashes and budgets pass without raising limits.
- Independent UI review verifies all514 artifact hashes, unchanged saved UI output bytes and a single compiled Match.dispose producer.

The cross-boundary cases include water-death/cloud lifetime, main-state reset, actual hybrid Input/Mobile/Controller startup, calibrated gyro→blur/focus, and guarded Slosher owner birth→native33-field remote replay. They are real modules in a fixture, not a substitute for browser/hardware evidence. Detailed source: inkwave-weapon-fixed-five-composition-2026-10-05.md.

## Browser acceptance remains required

The full existing active/range suites execute the new shared assertions. A separate check-inkwave-ui-probes.mjs diagnostic entry is available but is not wired to a new workflow and is not full acceptance. It uses the same assertions/build, labels diagnostic receipts, retains failures before cleanup and cannot claim an old run as a new-head pass. Running both the standalone diagnostic and the unchanged full suites redundantly is not required.

The new browser cases still need exact combined CI: four accuracy reticles with applied spread/hidden/opacity negatives; both local-loss sides' real private Game→Showcase podium and Back restoration; Range LOW/HIGH atlas and gallery/wall world screenshots. The podium result input is a fixture, separate from actual Menus click/history and winner-computation evidence. Required full suites remain intact.

No local browser success is claimed: this environment's Chromium process cannot start because socket creation is denied by the OS. Node GC does not certify browser heap/long-soak, and CPU/byte counts do not certify mobile GPU/FPS. Physical audio, sensor, pose and Nintendo calibration limits remain in the individual reports.
