# INKWAVE #204 — idle menu attract budget

## Decision and baseline

- Issue: [#204 — Idle menus run a full 8-bot attract simulation and world render continuously](https://github.com/rhgrive3/actions/issues/204).
- Independent candidate partition: `[659, 589, 564, 510, 384, 283, 204]`.
- Source baseline: `f31f5da439134fe49bb89018dad5557671a49c67`.
- Branch: `inkwave/c-add100-codex2-r20`; dedicated worktree: `/mnt/workspace/.dev-state/agent-work/checkouts/inkwave-batch-c-add100/codex2-resume-r11`.
- Selected one uncovered root: ordinary visible menu attract performs fixed 60 Hz simulation and world work while idle.

## Ownership and candidate proof

Before editing, all seven issues were checked for current assignees/comments and local atomic claims. The first six were excluded:

| Issue | Decision |
| --- | --- |
| #659 | Existing C claim for the same `ShadowCache.setStaticRoots` stale-stage-caster root; recorded as duplicate sibling of #659. |
| #589 | Foreign Tibo ownership and same-root work in Draft PR #536. |
| #564 | Foreign Tibo ownership and boss-audio work in Draft PR #536. |
| #510 | Weapon-lane ownership and work in Draft PR #536. |
| #384 | Covered by merged PR #399. |
| #283 | Same root is already implemented by open PR #664, despite no explicit issue link: `patches/local-quality/resource-adapter.mjs` selects effective-quality reflection scale/cadence. |
| #204 | No assignee, comments, direct/duplicate atomic claim, or same-root open/draft PR at recheck. Selected. |

Issue #204 was atomically claimed by owner C using the batch helper before editing. The public C(codex2) ownership comment was posted and read back before the first source change: [comment 6013108953](https://github.com/rhgrive3/actions/issues/204#issuecomment-6013108953). Atomic claim: `/mnt/workspace/inkwave-issue-claims/204/claim.json`.

Installed-code trace proved the root: `runSimulation()` called `Match.updateController`, `Match.update`, projectile update, and `_updateAttract` on each 60 Hz fixed tick in ordinary menu attract. The installed `Game._frame()` also updated FX, environment, paint, screen FX, decor, props, camera/diorama and rendered the world on each render frame. The default menu showcase currently creates eight bots, so the full actor/bot path ran while the title/settings presentation was idle.

## Change

- `patches/local-quality/idle-resources.mjs`: define a 20 Hz presentation budget, enabled only for menu attract when touch is present or quality is LOW. Full-frame showcase is excluded.
- `patches/splatoon3/runtime/clock.mjs`: accumulate native 60 Hz fixed ticks and run attract simulation in 20 Hz elapsed-time steps. `G.time` still advances at 60 Hz; input edge cleanup, menu handling and network pumping remain on their existing render/fixed cadence.
- `patches/local-quality/idle-adapter.mjs`: on budgeted menu frames, update and render the world at the due 20 Hz frame and pass accumulated elapsed render time to world systems. Menus/showcase presentation stays on render cadence. Live matches, desktop HIGH, and full-frame showcase remain outside the budget.
- `patches/local-quality/tests/idle-attract-budget.test.mjs`: compose installed main through the network and Practice Range adapters and exercise its actual `_frame` body with the production fixed clock.

This is presentation scheduling only. No live weapon, movement, actor, input tuning, network packet, Nintendo-law or raw upstream source was changed. `inkwave-public/` and `game/` are untouched.

## Focused counterexample and regression

Evidence log: `/mnt/workspace/inkwave-batch-c/evidence/additional-100/codex2/idle-attract-budget.test.final2.log`.

- `node --test patches/local-quality/tests/idle-attract-budget.test.mjs`: **2/2 passed**.
- At render schedules of 30, 60 and 120 Hz over one second, touch/LOW menu attract performs 20 Match/controller/projectile/attract/world-render updates. The counter fixture models the installed eight-bot/eight-actor workload per Match step, or 160 update opportunities each over the second; it does not instantiate the production bots.
- Each world updater receives the elapsed time across its 20 calls; the simulation clock remains one second. Menu/showcase and network callbacks retain 30/60/120 render-cadence calls.
- Controls show desktop HIGH menu attract and live matches stay at 60 Hz; desktop LOW menu attract is budgeted at 20 Hz. Full-frame showcase, non-attract and non-menu states do not activate the budget.

The native composed-source test proves scheduling/count reduction in the fixture. It does not prove a device CPU/GPU improvement. No browser/device run or full build was performed; mobile frame pacing, visual smoothness and GPU time remain unmeasured. The focused test does not claim performance from synthetic CPU/GPU counters.

## Splatoon 3 comparison

The project behavior record uses Splatoon 3 Ver.11.3.0 as its reference. This menu-only change has no weapon, gear or battle state. The official references already catalogued in the project do not establish a numeric attract-menu simulation/render cadence, so INKWAVE's 20 Hz is a local presentation budget, not a claimed S3 match. Reproduce in INKWAVE by opening the title/settings menu on touch or setting quality to LOW and observing the ordinary attract backdrop. Battle simulation and controls are unchanged. Browser presentation and same-condition Switch comparison remain unverified; see the [behavior ledger](inkwave-splatoon3-behavior-2026-10-02.md).

## Open/Draft PR overlap inventory

The parent C26 audit supplied actual diffs and head SHAs for 28 open/draft PRs. Current open/draft metadata was refreshed; 23 heads were unchanged and reused from that receipt. Only the five changed actual patches were fetched and inspected:

| PR | Actual changed patch review | Result for #204 |
| --- | --- | --- |
| [#822](https://github.com/rhgrive3/actions/pull/822) | RESULT-state simulation retirement in the fixed clock. | Distinct state; ordinary menu attract is not retired or throttled there. |
| [#818](https://github.com/rhgrive3/actions/pull/818) | Quality composition and gyro capability path. | No menu-attract cadence overlap. |
| [#790](https://github.com/rhgrive3/actions/pull/790) | Match intro audio timing. | No menu-attract cadence overlap. |
| [#787](https://github.com/rhgrive3/actions/pull/787) | Dualies behavior. | No runtime presentation overlap. |
| [#785](https://github.com/rhgrive3/actions/pull/785) | Score/HUD behavior. | No menu-attract cadence overlap. |

Relevant unchanged actual patches were reused without refetch: [#664](https://github.com/rhgrive3/actions/pull/664) owns #283's reflection resource root; [#536](https://github.com/rhgrive3/actions/pull/536) contains the already-owned #589/#564/#510 work; [#782](https://github.com/rhgrive3/actions/pull/782) freezes offline pause time and does not alter normal menu attract. Full head/diff inventory and hashes are retained at `/mnt/workspace/inkwave-batch-c/evidence/additional-100/C26-publication-overlap-278b8c3074964489ae056721176fe296/receipt.json` and adjacent `pr-*.diff` files. No broad re-fetch or repeated diff dump was used.

## Scope and acceptance limits

Only the four installed implementation/test files listed above and these three reports are in scope. Acceptance is complete for the isolated scheduling root and regression; it is incomplete for browser/device performance, rendered visual quality, a full production build, and physical S3 comparison. No PR, push, merge or deployment was performed.
