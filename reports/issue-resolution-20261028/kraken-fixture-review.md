# Independent Kraken activation-order fixture review — 2026-10-28

Reviewed commit`3f855091782d734c48198a171fdc88849213d96f`, based on1d6e6810. Only `patches/splatoon3/tests/kraken-dash-occlusion.test.mjs` changed. No production/reviewer edits; no blocking finding.

The existing positive had advanced attackerlife2→3 before delivering the original life2activation, so native admission correctly rejected the activation and no committed proof existed. The correction first admits the actual owner tick, asserts native Special snapshotlife2 and unused committed Kraken proof, then changes attackerlife3 and delivers the same captured hit. The original one-damage-call/−20HP assertions remain. A new opposite-order negative asserts no prior proof, no proof minted by stale activation, zero damage calls and100HP. Existing wall, ground/height/width, sender/owner/victim-life/duplicate and remote-recipient checks remain intact.

Independent Node22 verification in `/workspace/wt-ci-admission`:

- Source: `node --experimental-vm-modules --test patches/splatoon3/tests/kraken-dash-occlusion.test.mjs`: **32/32pass**,1.99s, zero skips. `/workspace/scratch/agent3-kraken-source-review.log`.
- Actual emitted modules: same command with `INKWAVE_BUILT_SITE=/workspace/scratch/agent2-optimized-site`: **32/32pass**,1.40s, zero skips. `/workspace/scratch/agent3-kraken-emitted-review.log`. Emittedcontenthash starts`c14fbb326bde`; this is the existing optimized artifact, not a new production build of the test-only commit.

These are production-composed source/emitted VM fixtures with real native admission/Actor/Physics paths and explicit display/world stubs. They do not establish browser/WAN, physical-device performance or retail parity. No acceptance threshold or runtime behavior changed.
