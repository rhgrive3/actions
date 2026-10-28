# Later core checks, once-only local verification

Full CI on sources `54465a5d` and `0706b35a` reached additional stale fixtures after the earlier admission repair. Before another push, the six agents checked the relevant later core commands once against the existing sealed production builds. This is targeted local evidence, not a successful full hosted run.

Root build: input `bdb851a80a79a984f15dc002c4fb0b997a8931c4d7b51caefc24f64cbd34210e`, content `fcec6e8db8e58c0ff5bd0c27da583e6a105b2949c27c1a8d0970152904c2429c`. Optimized build: input `930c0227c2d08bd3fcca6e691b117497766972f721dc185316c9f3c18d1c8879`, content `c14fbb326bdef2888af600b72e982e10e26b8cc380e4c57d510656df84720dde`. Node22.23.4 was used. No game build inputs changed in this fixture/CI batch.

| Owner | Target | Result and limits |
| --- | --- | --- |
| Root | Exact-source native attack comparison; exact emitted launch packets | 28 comparison cases passed; actual Roller/Splatling launches and ghosts passed with zero velocity error/duplicates. No source fallback for emitted launch. |
| Agent1 | Codec/auth JSON; ranked lifecycle/send; session/view/relay; queue/volume | 118/118, 24/24, 28/28, 18/18; zero skips. [Exact commands, selectors, hashes](emitted-network-sweep.json). An older ranked result used the wrong selector and was not reused as emitted proof. |
| Agent3 | Charger; spawn; source-backed ten-file command; sub/special27 | 2/2, 94/94, 55 pass/1 existing source-only counterfactual skip, 203/203. The ten-file command originally selected source for the two hurtbox cases; those cases were separately run with the actual `INKWAVE_EDGECASE_SITE` selector, 2/2. [Commands and caveats](emitted-weapon-sweep.json). |
| Agent4 | Optimized material handoff; BVH/collision; paint ownership; bot navigation | 25/25, 29/29, 10/10, 2/2; zero skips. Correct `INKWAVE_MATERIAL_HANDOFF_SITE` and `INKWAVE_BUILT_SITE` selectors audited. These totals include source-only oracle/harness controls alongside actual emitted cases. |
| Agent5 | Weapon holds; hit muzzle; music; Ballpoint; hair/pose; audio disposal | 13/13, 1/1, 23/23, 1/1, 8/8, 3/3; zero skips. Exact workflow selectors; sealed artifacts checked before and after. |
| Root | Isolated Turf finish; UI/controls; hidden-host/P0; map/gyro+Bubbler | 14/14 original isolated finish cases; 31 pass/1 existing source-only ordering counterfactual skip; 83/83; 16/16. No test-body transforms or lowered assertions. |

The fixture commands include modeled policy, source oracles and native methods; they are not all browser tests or GPU observations. Counts overlap and must not be added to earlier totals. No full-match benchmark was repeated. The emitted-site inventory and input hashes remain the authority for what game bytes were exercised.

The pointer-lock successful-pair repair retained all38 cases and passed source, both actual shipped sites and both compaction modes. Seven deliberately broken guards fail their intended assertions. The source command now runs in the existing full-checkout focused pointer-lock lane; the sparse admission probe failed because Three is excluded, so that probe is recorded as a dependency finding, not a pass. [Receipt](pointer-lock-fixture-repair.json).

The GPU22 repair executes the real composed ring methods and upload helpers, checks both static slots, birth and subsequent values, and steady-state quietness. It rejects missing color/style publication, invalid dirty state and a lost second slot. Both root and optimized whole-file suites passed10/10; related suites and emitted shell checks passed. It replaces an obsolete call-shape assertion without changing runtime code.

The local CI-control command initially lacked the Ruby wrapper, producing three subprocess-environment failures. Repeating it with the configured wrapper after identifying that cause passed11/11. YAML validation passed all81 workflows. This local environment mistake is not counted as a hosted code defect.

Raw logs, the complete14-case Turf receipt, mutation results and selector audit remain under `/workspace/scratch`. Hosted CI and the PR descriptions must separately report the acceptance of the final published heads. Physical devices, private asset delivery, retail behavior and the owner-authored fresh-action trust problem remain outside these local results.
