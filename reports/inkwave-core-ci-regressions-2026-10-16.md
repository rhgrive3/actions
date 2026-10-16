# Core integration: strict CI fixture repairs

The first integrated head `d820a72cbe307f710cb6aede100cd4cf7566a013` failed two steps in Validate INKWAVE run [38836639907](https://github.com/rhgrive3/actions/actions/runs/38836639907). This follow-up changes verification scripts and fixtures only. The production build inputs and gameplay remain unchanged.

## Missing import in the isolated identity checker

The real browser checker statically imports `inkwave-canonical-kit-input.mjs`, but the standalone dirty-source fixture did not copy it. The isolated process exited with `ERR_MODULE_NOT_FOUND` before it could compare the dirty overlay against its Git commit. Copy the actual helper, keeping the requirement for the specific `Build input differs from commit` rejection. All three standalone touch/network/reliability modes then passed. The clean-source and prematurely imported minimap negative controls remain mandatory.

## Stale weapons expectations on existing main

A separate detached checkout of main `9c0703298aed297667837533c32454cc60980603` reproduced the original Slosher failure (`19 !== 10`). Its actual minified build has content hash `5ea37882b9a2ad740bbb9a47111fb09ac7df237906f7991e7b718358aa66bd36`. The unchanged main fixture emits one nearest splash, nine falling flight splashes and nine native impacts. The depth-one falling splashes have circular footprints; the older oracle required all splashes to have a stretch vector.

The six source/generic-mask, obsolete-scale and obsolete-depth controls were independently executed in that clean main checkout and in the Core candidate. Their complete summarized receipts are byte-identical (SHA-256 `d5efddda50f4b97553e67685fd08fc75e273ae0562ce0177780aa3608e32ffad`). `scripts/fixtures/slosher-paint-9c070329.json` pins the metrics and hashes of every scoring cell, stamp and impact. The oracle now independently intersects circles as well as directional ellipses, scans every cell, and requires all 19 physical stamps. All three negative controls remain different from the accepted mask/scale/depth.

The broader built-weapons check also had earlier-composition roller/Slosher expectations. The clean main build supplied these current values; no production collision or paint code was altered to obtain them:

| Fixture | Old hit/full/paint-maxZ | Existing main and Core |
| --- | --- | --- |
| Horizontal roller | 11.1 / 6.1 / 13.875 | 11.4 / 6.1 / 14.125 |
| Vertical roller | 16.3 / 6.9 / 18.625 | 16.4 / 6.9 / 18.625 |
| Slosher | 13.5 / 13.5 / 16.125 | 14.8 / 14.8 / 17.375 |

`scripts/fixtures/weapons-fidelity-9c070329.json` pins all 15 cases, adding exact hashes of the complete hit sweep, initial projectiles and every scoring cell. Its SHA-256 is `b79883e3c0e14e0a4ba9577d01d162dbcfe530a7d03c75b22187df18c0ea1259`. The existing independent scalar raster, unminified source/build comparison, packet checks, wall drops and ghost paint rejection still run. These are deterministic INKWAVE fixtures, not new Nintendo range measurements or proof of retail parity.

To cross-check against main, create a clean worktree at the pinned main SHA, build it with esbuild 0.28.2, then run the repaired candidate's checker with `--site /absolute/path/to/main-site`. Run the Slosher test with `INKWAVE_BUILT_SITE` pointing at that same main build. The candidate's unminified graph is then compared directly with the independently emitted main graph, in addition to the pinned receipts.

## Local verification

- Full source suite on the unchanged production graph: 6,339 total, 6,316 passed, 23 conditional skips, zero failures (official Node 22.23.3, concurrency 4).
- Identity helper/Pages identity units: 6/6; standalone dirty touch, network and reliability: 3/3.
- Slosher source/minified candidate: 2/2; candidate source versus independently emitted main: 2/2.
- Candidate built-weapons fidelity: all 15 cases, 3 packet modes, 4 wall-drop families and 6 wall-drop cases passed.

The initial failed checks are retained as failures in the PR history. Final-head CI must pass before merging. Physical iPad stability and the remaining Splatoon 3 behavior comparisons are still unverified.
