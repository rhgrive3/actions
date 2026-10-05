# PR705 network precision repair

Fixed source: local073ba14 (same tree2f3de482 as public2b929820), parent main37ab02fc. Failed CI37382496541/job112007701543 used merge sourcef0879d697e41347d642ccf61b7cd96e04bd6225a and content97b27b35635c829e65f36945f3ecb7cbdcff64ffb1941d72b3e67a317bffa66b.

The browser failed the unchanged0.08 trajectory tolerance. Its old verifier saved network-traces.json only after that assertion, so the exact offending CI projectile is unavailable. This report does not identify that absent projectile by inference.

A confirmed current-source defect was reproduced independently using the previously reviewed native-floor seed13 fixture, actual Projectiles/Physics and actual JSON NetMatch send/playback:

- Horizontal with PR705 unchanged: max position error0.25466477317562897.
- Restore only pre-#682 horizontal trail behavior: the same0.25466477317562897. This defect does not require the new trail correction.
- Preserve the existing three birth-velocity fields as full JS numbers: error0.007670788940933417; velocity error0;193 compared steps.
- Vertical control: error0.0007356557753073046 / velocity error0.005896520544928072 before; approximately5.55e-17 /0 after;61 compared steps.

The old PR536 repair established the mechanism: two-decimal velocity rounding crosses the nonlinear brake/free vertical threshold one tick apart. Reuse only its numeric-preservation line, not its separate33-field Roller-unit protocol extension. Current native packet stays32 fields; existing owner tick/sequence remain at30/31. Physics, gravity, thresholds, collision and tolerances are unchanged.

Browser diagnostics now save raw traces before any comparison assertion and save the maximum-error source/remote pair before tolerance admission. Existing phase/mode/movement/collision metadata is retained in the trace for diagnosis. A negative executes the actual acceptance block with an intentionally0.2-divergent pair and confirms both raw evidence and worst pair survive the unchanged failure.

Focused tests:17/17 (native floor/precision and32-field footer checks, diagnostic contracts/forced-failure negative, existing network contracts). The native comparison helper gains only seed/native-floor options already reviewed in PR536. Its persistent-storage gate remains unchanged for CLI execution; importing its no-write replay function no longer creates an evidence directory.

No new build or full suite is claimed here: integration owns one combined build and exact browser rerun. This is a candidate current-source repair, not retrospective proof of the missing CI trace. No shared checkout, public PR or main was edited by this worker.
