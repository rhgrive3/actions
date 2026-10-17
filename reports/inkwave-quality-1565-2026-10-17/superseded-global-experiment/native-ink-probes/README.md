# Historical native-ink shader probes

This archive records failed, mis-scoped and superseded diagnostics. **None establishes performance nondegradation or qualifies the final narrow grate fix.** No new probe was run to prepare this index, and the existing files were copied without compression or modification.

All four attempts use source `f2a9e79a75fd1f930c1bf7eb04498ab69e87bfed`, input hash `740727429c62619014ac7ebdcf4e37454f0a7c5c4df6783fc6ad178b996b5535` and emitted content `c70ff01bfc49cc9ff974336d902abaa85bf66c6e6b9752cac6dc189a21b5aba2`: the **superseded global-normalization variant**. They do not measure PR #1566 final head `602774b9` or the combined candidate.

A and B are test-only materials cloned from one frozen native Scorch ink overlay, in one Chromium 141/SwiftShader realm/context. A injects the original two-normalization expression; B injects the broad `mat3`/facing expression. They are not separately loaded baseline/candidate game builds. The native overlay is FrontSide. Boot workloads, paint counts and resident geometry totals differ between attempts; comparisons across attempts are not equivalent A/B measurements.

## Attempt index

| Attempt | Literal result | Classification and retained limits |
|---|---|---|
| [current](normal-codegen-current/normal-codegen.json) | `failed`, page/context/browser closed | Aborted during boot before any measured row. The operator's [note](normal-codegen-current/ABORTED.txt) records OS-temporary browser-profile storage as the reason for aborting. No timing result. |
| [persistent](normal-codegen-current-persistent/normal-codegen.json) | `failed`, final GL error **1282** | Invalid. The same attempt has finish-only timing, unbracketed attached/deleted-shader/translated-source getters, and missing `USE_TEXLIB` in both captured expanded shaders. Its 16 rows remain for debugging. The exact source of GL1282 was not isolated in this attempt. |
| [clean](normal-codegen-current-clean/normal-codegen.json) | `passed-diagnostic-only` | Zero-error **fallback-only** measurement. `Material.clone()` dropped custom defines; actual expanded GLSL lacks `#define USE_TEXLIB`. Native texlib uniforms in setup did not establish the active production path. The literal pass is preserved rather than relabeled. |
| [texlib](normal-codegen-current-texlib/normal-codegen.json) | `passed-diagnostic-only` | Correctly guarded production-texlib **component diagnostic only**. Adverse completed mean **+1.73%**, software GPU mean **+1.82%**. No adoption or causal conclusion. |

The finish-only and GL1282 failures belong to the **same persistent attempt**, not separate invented runs. Its first eight-draw batch labels 3.8 ms as completed while the elapsed query records 1,226.654414 ms. Mandatory readback completion was absent. Although its raw query objects contain `valid: true`, the enclosing run is invalid; no timing summary is promoted from it.

The clean attempt subsequently removes those getters, captures live shader-source strings, adds one-pixel completion readback and records 102 zero-error checks. It still exercises the wrong shader branch. Its retained fallback means are completed A 128.881250 → B 132.279687 ms/draw, and GPU A 128.049935 → B 131.409838 ms/draw. These are not production-texlib results.

## Final historical texlib component

The final attempt explicitly copies `base.defines` and requires `USE_TEXLIB` in both live expanded fragment sources before timing. Actual native geometry, 2048px paint atlas, texture library, lights and a frozen world-depth prefill remain resident; other draws are hidden. There are 12 warm draws per material, two ABBA/BAAB cycles, 16 windows of eight overlay draws. `gl.finish` plus mandatory one-pixel `readPixels` completes each timed batch. Full image reads and query polling are outside timing.

| Metric | A original | B broad rewrite | Change |
|---|---:|---:|---:|
| Completed ms/draw | 194.689062 | 198.051562 | **+1.73%** |
| Software GPU ms/draw | 193.582612 | 197.103953 | **+1.82%** |

| Cycle | Order | Completed change | GPU change |
|---:|---|---:|---:|
| 0 | ABBA | −6.63% | −6.60% |
| 0 | BAAB | +6.43% | +6.61% |
| 1 | ABBA | +2.90% | +2.99% |
| 1 | BAAB | +2.97% | +3.04% |

All 16 elapsed queries are available/nondisjoint. All 102 stage error checks and final GL error are zero; page/console errors are empty. Every window retains eight actual GL draws, 624,696 submitted indices, 208,232 triangles, unchanged geometry/index/draw range and resident counters of 415 geometries, 131 textures and 153 programs. These counters do not establish heap bytes, GPU-memory bytes or lifecycle equivalence. A/B and the repeated original image match exactly across 144,000 pixels; 3,168 pixels show the overlay.

The final run's positive mean changes remain adverse. Its paired blocks do not establish a stable performance bound, explain any whole-game result or prove zero degradation. No hardware GPU or general rendering conclusion follows. Expanded sources are live `gl.shaderSource` captures, not driver assembly or executed instruction counts. No further variant sweep is represented here.

## Audit artifacts

[index.json](index.json) provides separate normalized classifications and literal recorded statuses/errors, exact source/input/content/harness identities, raw-JSON SHA-256 values, shader define observations and a byte/hash inventory of all copied files. All four exact raw JSONs, four executed harness snapshots, invocation logs and contemporaneous invalidity notes are retained. The persistent raw JSON embeds its shader strings and 16 invalid rows. The clean/final expanded GLSL, shader templates, paired-block JSON and images are also copied.

For the final proper-path diagnostic, the [executed harness](normal-codegen-current-texlib/probe-inkwave-normal-codegen.mjs) SHA-256 is `33d761a402adc44d78b45fdbb9ed978e4dd3b5bf38959a687a7deaeef6a092ac`; the [raw receipt](normal-codegen-current-texlib/normal-codegen.json) SHA-256 is `b516f4d2c658794e31d4a7e1a4f7a30922b88bc6ac58e3501c1599ec984d6cff`. The [expanded normal-expression diff](normal-codegen-current-texlib/normal-expression.diff) and both exact source snapshots preserve the shader difference. Original files remain in `/workspace/render-1565/.ci-scratch/1565/normal-codegen*`.
