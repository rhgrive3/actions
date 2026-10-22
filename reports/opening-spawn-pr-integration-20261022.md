# Opening spawn and open PR integration — 2026-10-22

## Scope and baseline

Repository: `rhgrive3/actions`; baseline main: `e1fa66ad`.
The user explicitly requested the opening-spawn repair and integration of **all open PRs, including Drafts**. The nine open heads below were merged with ancestry preserved. Historical draft acceptance notes remain historical evidence; integration does not establish retail visual or hardware-performance parity.

| PR | Original head | Change |
| --- | --- | --- |
| #1747 | `fc2a5fc1fbecee3df7b8ad846cf7ba3b96f1d339` | fix(vfx): Explosherの飛翔glitterを核周辺と落下粒へ寄せる候補 |
| #1752 | `932f6002f34be78a1f5f5ce00ef4e201bff74525` | research(audio): capture official Charger video audio for waveform audit |
| #1755 | `429cc1352d9b13ffe83c579ed714b84acf6139ed` | test(ink): compare bounded wet micro-surface candidate in actual WebGL |
| #1765 | `ed1d739d44bd3dbbc7f11915a680880d05c55b4a` | test: combine QA dependency fixes for exact-head validation |
| #1766 | `b9c46f57f8a5427eaa71dd740688622490b61bb8` | test(ink): diagnostic native material frame comparison |
| #1770 | `8bc8d67452b75ba69f5d08412647648b575efd1d` | fix: preserve composed Three and native Charger reach with exact-head acceptance |
| #1773 | `ea92ea510b485a04e5a58558c422e2c21db7b2c2` | QA only: bounded common-source material A/A preflight (unaccepted) |
| #1774 | `19f271d47e486af365ec3d76ae94c8947cfe9fa3` | test(vfx): フィスト寿命テストの module スタブに Inkjet 予算・クロックの実モジュールを渡す |
| #1775 | `e0973f326dac4f96337728ce1eda48a7fd84decb` | fix(inkjet): 砲から照準点へ直進させて照準と着弾を一致させる＋マニューバー回避→タレット→通常照準の流れを固定 |

## Integration decisions

- Combined QA (#1765) and runtime acceptance work (#1770) preserve newer main changes, including Boss positive-proof validation. Overlapping source-readiness and diagnostics use the newer combined implementations.
- #1773 supersedes the canonical native material frame/paired scripts from #1766. The historical #1766 workflow checks out its original immutable QA head, preserving its original 429cc runtime pairing instead of running the newer cc0-only checker against the old compiler.
- The #1774 VFX fixture loads the actual Inkjet budget/clock modules. #1775's runtime aiming changes and Dualies tests are retained.
- #1755's surface candidate and #1747's Explosher candidate are included in the production composition. #1752 research tools and historical evidence are included without adding research recordings to game assets.
- Existing main test-fixture omissions discovered by integration are corrected: material-handoff alias discovery accounts for the static-menu expression, and the packaging audit explicitly recognizes `deferPrimaryWeaponIcon` as a source-transform helper. Runtime gates/assertions are retained.

## Updates captured during integration

Before publication, #1770 advanced to `8bc8d674` and #1773 to `ea92ea51`; both updated heads are included in the table and merge ancestry. #1770 adds borrowed native Flow skeleton ownership, native intro UI and source-admission controls plus terrain-fetch checks. #1773 adds bound postprocess-owner observations and tests while retaining its historical common-source identity. No source PR update was silently discarded.

## Spawn repair

Opening bots previously launched inside initial placement, then advanced their one-second flight during the 4.2-second intro; the local human remained on a spawner. All locally owned actors now stay in aim during intro and use the existing one-second **playing-time** opening auto-launch. Human FIRE can still launch earlier during play. Bot FIRE cannot skip the shared opening wait. Each bot retains its deterministic supported target while waiting; launch revalidates it using native collision.

All remote opening actors, including bots, mirror their owner's accepted aim/flight/landing snapshots. Their spawner presentation also updates through `NetMatch.applyRemote`, which bypasses `Actor.update`; no remote physics or launch clock is simulated by that drawing hook. Post-death bot auto-launch and ordinary human respawn input remain covered by existing lifecycle regressions.

## Evidence

- `initial-spawn-timing.test.mjs`: actual composed Match setup, eight actors and both teams, 30/60/120 Hz rendered schedules over fixed 60 Hz gameplay; intro, shared launch tick, distinct retained targets and real collision touchdown. 3/3 pass. The same tests with the baseline main lifecycle fail 3/3 because bots have already landed during intro.
- `issue-512-remote-initial-squidspawn.test.mjs`: production two-peer Actor/NetMatch snapshots, human and bot opening wait/launch/landing at 30/60/120 Hz. 6/6 pass. Position comparison observes native 0.01-unit network quantization.
- `spawner-geometry-fidelity.test.mjs`: shared geometry plus remote presentation/retirement at 30/60/120 Hz; 10/10 pass.
- Common material QA including the updated postprocess ownership tests: 287/287 pass with a separate immutable `8bc8d67452b75ba69f5d08412647648b575efd1d` source worktree.
- Spawn/respawn/armor/remote/handoff regression selection: 169 passed, 1 native-asset-dependent case skipped, zero failures.
- Full active browser on the initial integrated build: passed, 781 verified responses, canonical weapon/appearance selection and real gameplay movement/fire checks, zero JavaScript errors. Final emitted opening-spawn browser and build results are recorded below.
- Initial changed-PR selection: 354 passed, 2 skipped; the one setup failure lacked `INKWAVE_MATERIAL_COMMON_SOURCE`. That source-dependent suite subsequently passed as part of the explicit immutable-common run above.
- Build packaging, exact Pages sequencing and emitted Three composition: 18/18 passed on the spawn-repair build. The static-menu material fixture passed 25/25 after its alias-discovery correction.

## Comparison limits

Splatoon 3 reference remains Ver.11.3.0, Turf War, each player's hovering spawner and opening launch. Existing cited sources: [Nintendo gameplay](https://splatoon.nintendo.com/en/gameplay/), [Inkipedia Spawner](https://splatoonwiki.org/wiki/Spawner). The one-second opening delay and one-second flight are existing INKWAVE calibration, not newly inferred Nintendo values. Logic, CPU peer fixtures and Chromium SwiftShader evidence do not establish Switch timing or physical GPU/iPad parity. Historical diagnostic failures remain preserved.

## Final local verification before main integration

The emitted identity below binds the runtime modules after the latest PR heads. Final follow-up changes affect only verification fixtures and this report.

- Production build: passed. Content hash `e57bdcd82f9b82b0f1ede4491017c3683822ea98ae4e11684b646599822b93e5`; revision `6dccb72c5a675c4ab176f0ae0f21556112369c90baa930e7bbcc28b1b7302912`.
- `node scripts/check-inkwave-startup-budget.mjs _site`: passed, 146 initial JS requests, 494 precache entries.
- `CHROMIUM_PATH=/usr/bin/chromium node scripts/check-inkwave-opening-spawn.mjs _site .browser-evidence/opening-spawn-final`: passed all 30/60/120 Hz cases, eight actors each, no page errors. Every intro/playing-boundary sample stays on its original spawner, all eight enter flight, and each resolves actual collision support.
- Emitted packaging, Three composition/UUID isolation, Pages source identity/sequencing: 18/18 passed against that final build.
- Updated #1770 tests, including Flow borrowed-skeleton negative controls, source-pair admission, native intro browser/UI and fetch controls: 221 passed, 1 source-only case skipped, zero failures. Terrain-fetch Python tests are supplied by the integrated PR and not included in that Node count.
- Updated #1773/common material tests: 287/287 passed with `INKWAVE_MATERIAL_COMMON_SOURCE=/workspace/material-common` and VM modules enabled.
- Existing Pages fixture failures are reproducible in the prior main deployment log (run `39710944489`): four material-handoff alias-discovery failures and one static-menu composition-dependency failure. Fixed both test fixtures without changing their assertions or production guards; focused rerun passed 33/33.
- Loading-cache Python harness: 3 passed, 1 separately supplied acquired-baseline case skipped.

A full local Pages selection was also run; its initial material fixture failures precede the focused fixes above. Hosted CI/Pages outcomes remain separate from these local results. Browser evidence is workspace-local under `.browser-evidence/`; numerical tests and observed runtime receipts do not claim a retail or physical-device comparison.
