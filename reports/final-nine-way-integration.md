# INKWAVE final nine-way integration

## Scope

This integration intentionally includes the following nine workstreams and excludes #64 Weapons / Ballistics:

| Workstream | PR | Final source head |
|---|---:|---|
| Motion / Animation / Visual | #324 | `eed27876f10d463e416652e2a75d4f85d1c6cf78` |
| Network / Replication | #182 | `f0f546176a0f169363e6d0b354fa483a6f92b8fc` |
| Input / Action Reliability | #62 | `979263f8155fa559ff6a53c9fb162ce3c715acfb` |
| Runtime Performance / UI | #184 | `a9fdd738499fc1525f6c505e524e5bd60d004f1c` |
| Bomb / Special / Ink Distribution | #259 | `55805cf25aad507ef05dce4b016e052588a55e93` |
| Movement Physics | #59 | `a0e118408d80e68293f8e626907b22b73847fa9c` |
| iOS PWA / Gyro / Lifecycle | #60 | `25797fb0bc70f8690a66cf75fbd581f40ba7037b` |
| Loading / Cache / PWA Startup | #61 | `e8ebe3c5a55d4920611965b4867467268fcd7316` |
| Practice Range | #183 | `04e8ee973470ce68126d503f6916229775565cd1` |

Baseline main at final source refresh: `17602ab094da6efb663d872934458e818ae3c93e`.

Excluded Weapons / Ballistics PR #64 final observed head: `33db80691e65ea5e620cfff4abaa17be9eefc7ae`.

## Integration head

Pre-CI integration content head before adding this report: `e25a746f7abe753062a5dc5044be6a82d1bb4536`.

The report commit itself becomes the final integration head used for CI; its SHA is recorded below after the branch update.

- final integration head SHA: **PENDING_CI_HEAD**
- full CI run ID / result: **PENDING**
- main merge commit SHA: **PENDING**
- merge-post main CI run ID / result: **PENDING**

## Conflict resolution

1. **Movement / Sub-Special / Network shared build layer**
   - Direct #59 -> #259 merge reproduced a real GitHub merge conflict.
   - Reused the previously green #59 + #259 + #182 semantic combined resolution, then retained the latest main CI baseline and the latest #182 network delta.
   - #59 and #259 latest heads only added the then-current main CI merge on top of their workstream payload; the final integration is based on that same current main and preserves their workstream payload rather than replacing shared adapter/workflow files wholesale.

2. **Loading / Runtime / Practice shared CI and build verifiers**
   - Reused the previously green #61 + #184 + #183 combined integration, whose head contains all three final PR heads.
   - Preserved network verification while composing loading/startup/range namespaces into browser, identity, wall, flow and motion-catalog verification.
   - The final workflow keeps active Chromium, catalog Chromium, UI Chromium+WebKit, network Chromium, range Chromium+WebKit and startup Chromium as independent browser shards.

3. **Lifecycle / Runtime UI**
   - #60 and #184 both touch local-quality menu ownership and the local-quality adapter.
   - Used the previously combined-acceptance-resolved `menu.mjs` and `local-quality/adapter.mjs` versions so hidden/menu rAF work and platform suspend/resume ownership coexist.
   - Kept the stronger final workflow and added the platform lifecycle smoke gate without restoring the older smaller browser matrix.

4. **Input / Sub-Special / Network / Loading / Practice**
   - #62 source-fixture changes were applied as hunks on top of the already combined #259 fixture, retaining the configurable adapter parameter without dropping sub/special connections.
   - #62 browser action-admission proof was applied on top of current network/loading/practice browser verification.
   - #62 responsive selector intent was preserved by the newer generalized `.iw-screen:not(.is-leaving) .iw-code-input` active-input locator rather than replacing it with the narrower older selector.
   - Reliability-owned files otherwise use the final #62 source head.

5. **Movement vs Motion ownership**
   - Movement owns authoritative root velocity, acceleration, collision integration, dodge distance and roller movement ownership.
   - Motion consumes root state for gait/pose/roller/squid presentation and does not retune authoritative movement speed.

6. **Bomb/Storm vs Network ownership**
   - Bomb / Ink Storm authoritative damage, paint and timing remain gameplay-owned.
   - Network replication carries/reconstructs remote state and FX without reapplying authoritative gameplay outcomes.

## Final CI acceptance

Required gates in the final workflow include:

- validate / gameplay patch contracts
- deterministic network replication and authoritative/reconstructed comparison
- movement physics smoke regression
- practice-range measurement/rules/battle isolation
- loading/cache tests and startup budget
- local-quality and lifecycle smoke
- motion/render gates
- active Chromium
- network Chromium including delayed delivery
- startup/cache Chromium
- Practice Range Chromium + WebKit
- catalog Chromium
- responsive/touch Chromium + WebKit
- input/lifecycle Chromium + WebKit
- forged identity checks
- runtime performance comparison when final integration PR activates the runtime-performance gate

No existing test is intentionally removed, skipped or weakened for this integration.

## Device-only pending

The following remain physical-device acceptance items and are not merge blockers for automated integration:

- iPhone/iPad Home Screen Web App DeviceOrientation / DeviceMotion permission behavior under actual iOS WebKit.
- Repeated real-device background/suspend/resume including OS-level app eviction and audio/network behavior.
- Real-device cold/warm/installed-PWA startup timing, especially iOS storage/cache behavior.
- Representative mobile runtime/GPU/thermal observation on actual iPhone/iPad/Android hardware.

## #64 Weapons / Ballistics follow-up

Do not merge #64 by replacing final shared files wholesale. Its current branch overlaps at least:

- `.github/workflows/validate-inkwave-update.yml`
- `patches/splatoon3/adapter.mjs`
- `patches/splatoon3/bootstrap.mjs`
- `patches/splatoon3/profile.json`
- `patches/splatoon3/reference/numeric-status.json`

and adds the weapons-fidelity adapter/runtime/reference/test stack.

When integrating #64 later:

- compose its weapons adapter into the already combined adapter chain rather than choosing one side;
- preserve Movement Physics ownership of root movement and dodge/roller integration;
- preserve Bomb/Special authoritative ownership and Network remote-only reconstruction;
- re-check Charger/Dualies/Roller values against the final combined profile instead of accepting an older profile snapshot;
- run the full nine-way workflow plus the #64 weapons-fidelity reference, deterministic range/ballistics, local/remote parity and motion/render gates;
- do not use remote visual symptoms to retune authoritative weapon range.
