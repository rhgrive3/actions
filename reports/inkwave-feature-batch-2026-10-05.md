# PR536 fixed follow-up batch

Base: current-main composition tree 791374ff50fffaa7e01ee13d2535354d63ae2603
(published head1109a7da). This follow-up addresses16 Issue IDs:
142,187,364,368,376,404,410,500,504,505,508,520,523,524,527,533.
Later530, duplicate382, and unaccepted534 are excluded. Source PR551 remains
separate history; its reviewed delta is included without closing it.

## Composition limits

- #523 corner-map default-off retains full Map, projected gyro targeting and A
  confirmation. Native/emitted Game, Match, Input and Diorama are exercised.
- #527 timing derives from community measurements and the documented raw-field
  offsets, not direct extraction of31/56/13 or our Switch measurements. Mode
  selection remains at runner admission; PR496 dynamic falling and post-shot
  sub/swim recovery are not declared resolved.
- #410 freezes Turf winner/coverage at the deadline; individual statistics,
  lingering paint/FX and host migration remain separate limitations.
- #508 shows profile-derived two-stage/paid-stream progress; its geometry is a
  web presentation choice, not Nintendo pixel equivalence.
- #505's new team bonus is offline-only after two-owner native traces exposed
  false/missed client-inferred wipes. #504 online extension transport remains
  dependent on accepted event ownership; this batch does not claim consensus.
- #500/#520 use community Flow rules with the existing native point mapping and
  fractional accrual. #544 assist-category differences are not changed.
- #187 guards fresh exactly-zero Android rotation-rate observations only. Bias,
  general drift, permission timing and physical-device calibration remain open.
- Gyro startup/no-data/permission ownership, ori-to-rate handoff and Map single
  consumption are composed with the current main lifecycle implementation.
- #142 cancels Map gyro/navigation at the portrait boundary even when offline
  simulation is skipped, while online world simulation continues.

## Verification

Final production build30af7443fcef. Startup file/dependency budgets pass without
raising limits:131 core +14 range preload hints, all extra helpers precached.
No native startup latency or physical GPU result is implied by those budgets.

Quality including all emitted modes:228/228. Dedicated emitted cross-feature
suites:62/62, with an additional full emitted Match controller path in the
corner-map-off/gyro tests. Final aggregate:1073 passed,0failed,5 emitted-only modes; all five were
explicitly exercised in the emitted suites. The strengthened full-emitted
Map/default-policy/controller combination passed13/13.

The final aggregate initially exposed missing classList.contains in older
headless action/touch fixtures. Fixtures now supply that DOM contract; the
production portrait guard was not weakened. All23 directly affected cases pass.
Both old WIPEOUT and new staged-reticle visibility assertions are retained and
scoped separately instead of counting unrelated later probes.

New canonical browser captures/probes remain pending exact composed-head CI.
No main merge, Issue closure or source-branch deletion is performed.
