# PR1168 reconciliation into PR1175

- Original base: `69add0203d127b790f009e3502f7110212262066`
- Audited source: `eadc3fdf5a063bd492587ac8f7cfb9ba2cd083d9`
- Integration baseline: `20d49d2d807a8d1d595b5278b039f33e005f2281`
- Earlier independent import: `fc7db32520f4162f6b469c6e68b2e241e78e9331` (52 paths)
- This reconciliation owns 29 of the 35 shared paths. The six remaining shared paths are explicitly assigned to the separate loading/cache/build/budget reconciliation. Local-quality adapter's source delta already composes exactly with the current tree, so it needs no new write.

## Semantic decisions

1. Preserve the newer linear Charger first-legal coordinate (8/60); apply source minimum-range band to this same coordinate rather than regress to eased 1/6. Preserve retained Charger wall-drop before attributing terminal paint.
2. Merge native Dualies aim/helper injection with current Splatling sampled launch-speed ownership. Preserve canonical head prediction and turret collision.
3. Merge time-coherent actor motion with current hurtbox dimensions and source-guided InkFlight collision; remove duplicate superseded build hooks, not their behavior.
4. Add Roller depletion, minimum per-frame ink floor, dry continuation and owner-tagged temporal paint. Preserve unit paint, trail age, Slosher reset fields and current combat authority.
5. Preserve current tagged adoption/protection and source-guided projectile terminal protocol while adding canonical paint ordering and presentation-only Roller sidecars.
6. Restore the full 344-line report appendices from pre-main-merge `92fb642e1ce856abdfcea819a7b5c1f34ebde521`; retain the newer main and source1168 report additions together.
7. Repair the independently imported #479 adapter's compatibility shortcut: old/current/depleted admission and payment now use the same selected free-fall mode, with known installer signatures and current idempotence retained. Unknown selector shapes fail closed.
8. Update stale fixtures to use actual native start rejection, current wire slots and object lifecycle, actual Shooter projectile emission, and native NetMatch initialization. No gameplay threshold or acceptance gate is lowered.

## Path/source disposition

- `.github/workflows/validate-inkwave-update.yml`: Delegated: loading/cache/build/budget owner; not modified by this commit
- `patches/loading-cache/sw.js`: Delegated: loading/cache/build/budget owner; not modified by this commit
- `patches/loading-cache/tests/worker-descriptor-compatibility.test.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/loading-cache/tests/worker-template-compaction.test.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/local-quality/adapter.mjs`: Already represented: source delta three-way merge equals current content
- `patches/local-quality/composer-target-adapter.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/local-quality/install.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/local-quality/offscreen-visual-budget.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/local-quality/platform-game.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/local-quality/tests/composer-target-adapter.test.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/local-quality/tests/offscreen-visual-budget.test.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/network-replication/adapter.mjs`: Reconciled in this commit against current main and source delta
- `patches/network-replication/roller-presentation.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/network-replication/tests/armor-ready-flags.test.mjs`: Reconciled in this commit against current main and source delta
- `patches/network-replication/tests/dualies-turret-presentation.test.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/network-replication/tests/issue-1088-surge-presentation.test.mjs`: Reconciled in this commit against current main and source delta
- `patches/network-replication/tests/paint-canonical-order.test.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/network-replication/tests/robustness-fixture.mjs`: Reconciled in this commit against current main and source delta
- `patches/network-replication/tests/roller-presentation.test.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/network-replication/tests/roller-vertical-state.test.mjs`: Reconciled in this commit against current main and source delta
- `patches/practice-range/tests/ink-vac-weapon-change.test.mjs`: Reconciled in this commit against current main and source delta
- `patches/reliability/tests/hidden-host-clock.test.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/reliability/tests/hidden-host-harness.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/reliability/tests/host-teams-start-composition.test.mjs`: Reconciled in this commit against current main and source delta
- `patches/splatoon3/adapter.mjs`: Reconciled in this commit against current main and source delta
- `patches/splatoon3/issue-479-adapter.mjs`: Reconciled in this commit against current main and source delta
- `patches/splatoon3/movement-physics-adapter.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/splatoon3/paint-ownership-adapter.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/splatoon3/paint-splat-pool-adapter.mjs`: Reconciled in this commit against current main and source delta
- `patches/splatoon3/profile.json`: Reconciled in this commit against current main and source delta
- `patches/splatoon3/reference/numeric-status.json`: Delegated: loading/cache/build/budget owner; not modified by this commit
- `patches/splatoon3/reference/weapons-fidelity-reference.json`: Previously imported by fc7db325; retained in current integration
- `patches/splatoon3/roller-depletion-adapter.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/splatoon3/runtime/actor-motion.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/splatoon3/runtime/agent3-weapon-physics.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/splatoon3/runtime/clock.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/splatoon3/runtime/dualies-network.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/splatoon3/runtime/dualies-slide-paint.mjs`: Reconciled in this commit against current main and source delta
- `patches/splatoon3/runtime/gear.mjs`: Reconciled in this commit against current main and source delta
- `patches/splatoon3/runtime/install.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/splatoon3/runtime/kit-big-bubbler.mjs`: Reconciled in this commit against current main and source delta
- `patches/splatoon3/runtime/kit-subs.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/splatoon3/runtime/paint-ownership.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/splatoon3/runtime/roller-impact-paint.mjs`: Reconciled in this commit against current main and source delta
- `patches/splatoon3/runtime/roller-max-paint.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/splatoon3/runtime/roller-vertical-paint.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/splatoon3/runtime/roller.mjs`: Reconciled in this commit against current main and source delta
- `patches/splatoon3/runtime/sub-special-fidelity.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/splatoon3/runtime/weapon-edgecases.mjs`: Reconciled in this commit against current main and source delta
- `patches/splatoon3/runtime/weapon-motion.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/splatoon3/runtime/weapons-charger-flight.mjs`: Reconciled in this commit against current main and source delta
- `patches/splatoon3/runtime/weapons-fidelity.mjs`: Reconciled in this commit against current main and source delta
- `patches/splatoon3/runtime/weapons.mjs`: Reconciled in this commit against current main and source delta
- `patches/splatoon3/tests/charger-damage-curve.test.mjs`: Reconciled in this commit against current main and source delta
- `patches/splatoon3/tests/charger-min-range.test.mjs`: Reconciled in this commit against current main and source delta
- `patches/splatoon3/tests/dualies-motion.test.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/splatoon3/tests/issue-1040-time-coherent-projectiles.test.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/splatoon3/tests/issue-1160-step-clearance.test.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/splatoon3/tests/issue-264-paint-temporal-ownership.test.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/splatoon3/tests/issue-305-roller-depletion.test.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/splatoon3/tests/issue-537-roller-roll-ink-floor.test.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/splatoon3/tests/issue-541-roller-dry-roll.test.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/splatoon3/tests/issue-575-dualies-independent-aim.test.mjs`: Reconciled in this commit against current main and source delta
- `patches/splatoon3/tests/issue-626-roller-stop-interruption.test.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/splatoon3/tests/issue-915-bomb-capture.test.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/splatoon3/tests/kit-big-bubbler-blaster-contact.test.mjs`: Previously imported by fc7db325; retained in current integration
- `patches/splatoon3/tests/roller-foot-paint-composition.test.mjs`: Reconciled in this commit against current main and source delta
- `patches/splatoon3/tests/roller.test.mjs`: Reconciled in this commit against current main and source delta
- `patches/splatoon3/tests/splatling-jump-spread-native.test.mjs`: Reconciled in this commit against current main and source delta
- `patches/splatoon3/tests/weapons-fidelity-source.test.mjs`: Reconciled in this commit against current main and source delta
- `patches/splatoon3/weapons-adapter.mjs`: Reconciled in this commit against current main and source delta
- `reports/inkwave-splatoon3-behavior-2026-10-02.md`: Reconciled in this commit against current main and source delta
- `scripts/build-inkwave.mjs`: Delegated: loading/cache/build/budget owner; not modified by this commit
- `scripts/check-inkwave-actor-motion-preload.mjs`: Previously imported by fc7db325; retained in current integration
- `scripts/check-inkwave-composer-target.mjs`: Previously imported by fc7db325; retained in current integration
- `scripts/check-inkwave-motion-detail.mjs`: Reconciled in this commit against current main and source delta
- `scripts/check-inkwave-range.mjs`: Reconciled in this commit against current main and source delta
- `scripts/check-inkwave-startup-budget.mjs`: Delegated: loading/cache/build/budget owner; not modified by this commit
- `scripts/composer-target-three-loader.mjs`: Previously imported by fc7db325; retained in current integration
- `scripts/lib/inkwave-cache-manifest.mjs`: Previously imported by fc7db325; retained in current integration
- `scripts/lib/inkwave-worker-compaction.mjs`: Previously imported by fc7db325; retained in current integration
- `scripts/tests/inkwave-cache-manifest.test.mjs`: Previously imported by fc7db325; retained in current integration
- `scripts/tests/inkwave-integration-workflow.test.mjs`: Delegated: loading/cache/build/budget owner; not modified by this commit
- `scripts/tests/inkwave-motion-gate-fixtures.mjs`: Previously imported by fc7db325; retained in current integration
- `scripts/tests/inkwave-motion-gates.test.mjs`: Previously imported by fc7db325; retained in current integration
- `scripts/tests/inkwave-worker-compaction.test.mjs`: Previously imported by fc7db325; retained in current integration
- `scripts/weapons-fixture.mjs`: Previously imported by fc7db325; retained in current integration

## Verification receipts

- Full production composition: all 402 native and non-test patch JS modules parse, including 88 native source modules.
- Core minimum-range, actor-motion, depleted-Roller and source-anchor tests: 36/36 pass.
- Full network suite: 176/176 pass, zero skipped, with test concurrency 1; focused network/Practice Range source cases: 23/23 pass.
- Host-team start and setting invalidation: 2/2 pass after preserving current guard order.
- Wider 156-case gameplay sweep: 153 initially passed; all three failures were diagnosed and fixed (native Shooter shot owner, #479 legacy adapter shape, native NetMatch constructor). The complete affected fixture files plus depleted-Roller tests then pass 57/57, zero skipped.
- Source feature suite: 159/159 pass, zero skipped, across 23 source-feature test files with test concurrency 1. Earlier overlapping runs had test-worker exits without assertion reports; isolated reruns pass. The independent worker-compaction test requires esbuild, which is provided and verified by the build/budget owner, not this worktree.
- `git diff --check` and changed script syntax checks pass.

## Remaining acceptance boundary

This commit does not claim full exact-head CI, emitted browser, physical Switch or retail numeric parity. Source reports retain unverified pose, timing, hardware, paint and movement comparisons. The final combined branch must regenerate numeric-status, pass unchanged build/cache budgets, run canonical aggregate tests and exact-head CI before publication/merge. No inkwave-public source, PR401 content, GitHub push or merge is included here.

## Combined-branch supporting follow-up

- Bot-refill regression: 17/17 pass after replacing the stale Roller held-Fire expectation with actual admitted depletion/payment/latched-release and refill-exit assertions; Charger/Splatling negative controls remain unchanged. No production edit.
- Built-weapons gate passes against parent `_site` content hash `d7da7450c08660a4be946388d88efe3ddaa95882eb16be421fd43b518ea1b06c`: 15 measured cases, 3 network modes and 6 wall-drop cases. Four Charger receipt rows were independently remeasured in composed unminified source and the emitted build; exact tolerances, source/build equivalence and duplicate-burst controls are unchanged. Recorder fixtures now retain and assert native session-owned event sequence. Targeted Charger source regressions pass 22/22. No production edit.
