# Original hosted projectile pair, 2026-10-28

The unchanged comparator passed **52/52 original capture pairs**, exact physical state and post-native-fire RNG. Complete capture/workload checks passed; all **94 original full/crop PNG hashes per side** verified, with **zero GL errors**. Both hosted capture jobs and [hosted comparison job123043229422](https://github.com/rhgrive3/actions/actions/runs/40747856762/job/123043229422) succeeded. Independent local analysis of the downloaded original artifacts agrees. [Machine-readable receipt](projectile-pair-7e968611.json) records complete hashes and conditions.

The true source pair is fixed PR base **`e67c636b81762df56b346a09ef570964d43084df` → `7e9686118e2137e6c4c0b8bc5786bc0aad65c1fb`**. The before job verified `.ci-baseline` at e67c636b and built it with its own build script; no baseline alignment/preparation step executed. Both capture scripts ran from checkout7e968611, which explains their identical capture-harness checkout identity. Their game builds are distinct:

| Field | Before: base e67c636b | After: head7e968611 |
| --- | --- | --- |
| Build input hash | `f0a8e4371c43bf72000bcb18252856e8c7ec41d9d1a301f7e65b668ccaf92340` | `930c0227c2d08bd3fcca6e691b117497766972f721dc185316c9f3c18d1c8879` |
| Build content hash | `6e633396004b30383fcadba05bdc9ea83e3b84ff823110ecad90ba7da6455c34` | `c14fbb326bdef2888af600b72e982e10e26b8cc380e4c57d510656df84720dde` |
| Artifact ID | `12844601571` | `12843004025` |
| Original ZIP SHA-256 | `021475c80de2ea2d95e0c18aadf761bc363e720986daa6141bbe2e46c48f96dc` | `232a91ae39afe783dabf87cba034d26b6b23101ced11fe307765348a63808243` |

This compares the full production delta between those fixed sources, including common reliability/gameplay corrections and the remaining optimized-head changes. It does **not** isolate an optimizer on/off effect. The baseline already includes merged Library queue optimizations (#1897) and normal-play FK/audio optimizations (#1903); both histories share that baseline ancestry, while individual candidate modules may receive further changes. It is not a comparison against an unoptimized game or a claim about a later mutable main.

The 52 receipts cover seven named projectile scenarios: wall-shooter, floor-slosher9, floor-washtub, shooter, roller-horizontal, roller-vertical and slosher9, plus the declared desktop/mobile firing workloads. The separate Wiper catalog capture is not one of these seven scenarios. This does not certify every weapon/stage, WAN play, hardware performance or Nintendo retail behavior. The unchanged comparison verifies original image files against their recorded hashes; it records before/after visual hashes without requiring pixel equality.

The exact command was:

```sh
python3 scripts/compare-inkwave-projectile-captures.py \
  --before /workspace/scratch/agent3-projectile-pair-7e968611/before \
  --after /workspace/scratch/agent3-projectile-pair-7e968611/after \
  --output /workspace/scratch/agent3-projectile-pair-7e968611/paired-verification.json \
  --require-complete
```

Comparator SHA-256: `98cbde37607cdfde958991f4b218d04d0fae17e1c956ff67a17e55ec943e1cd7`, verified unchanged from head7e968611. No recapture, CI rerun, input edits or tolerance changes occurred. Original ZIP digests match GitHub artifact metadata. Explosher resource checks also passed on both sides. Full Validate acceptance remained separate from this successful capture/comparison workflow and its known test-fixture failures.

[Independent Kraken fixture review](kraken-fixture-review.md) covers source commit3f855091: the corrected positive admits activation at life2 before advancing life3; the opposite-order negative remains rejected. Its source and actual emitted suites each passed32/32, with no runtime changes.
