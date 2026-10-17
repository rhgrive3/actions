# Double-sided grate component diagnostic

The lighting checks pass within the predeclared component bounds. **This run does not establish performance nondegradation or authorize adoption.** Underlit front and back views are slower in both paired orders. No cause for the timing differences has been established.

This is the narrow grate candidate, not the superseded global-normalization experiment or the combined contact candidate. A is baseline `d5265f73d9dad69f1afd9690e374caee45195f11`; B is PR #1566 head `602774b9caf8a5cbb12290096a09d4d17cc756b0`. B content hash is `50b919d25d49699574f9846c99400b8486c70c60d1634d94bc7bc75121211bb3`; A content hash is `8f56a1470c72ecf04250ba7be2cf74a3c89f7267674c840d7d63c14fa3b29775`. Full source/input/material hashes, served-artifact identities and exact arguments are retained in the receipts.

## Measurement

One Chromium 141.0.7390.37 realm/WebGL2 context uses software SwiftShader at 480×300, DPR 1. The exact emitted baseline and candidate `createLevelMaterial` factories share a real generated 25-layer 64px texlib, a zero-paint atlas, authored-Level pattern-12 grate face, uniforms and lights. Grates retain their production unpaintable attributes. This is procedural Level geometry, not an imported source-stage mesh.

All programs, textures and both geometric orientations are warmed before samples. Each of four views has ABBA followed by BAAB: eight windows of 32 draws, four windows per variant. CPU submit excludes completion waiting. Completed duration includes `gl.finish` and mandatory one-pixel `readPixels`; full images, oracle checks, query polling and resource validation are outside timing. These serialized durations are not display FPS or input latency.

All values below are milliseconds per draw. Positive change means B is slower. No adverse view is excluded or pooled away.

| View | Completed A | Completed B | Change | GPU A | GPU B | Change |
|---|---:|---:|---:|---:|---:|---:|
| Front, top light | 25.436719 | 24.503906 | −3.67% | 25.316906 | 24.385745 | −3.68% |
| Front, under light | 23.046094 | 24.128125 | **+4.70%** | 22.938617 | 24.011780 | **+4.68%** |
| Back, top light | 24.373437 | 23.601562 | −3.17% | 24.297286 | 23.529469 | −3.16% |
| Back, under light | 22.147656 | 22.994531 | **+3.82%** | 22.064097 | 22.922151 | **+3.89%** |

| View | CPU submit A | CPU submit B | Change |
|---|---:|---:|---:|
| Front, top light | 0.094531 | 0.098437 | +4.13% |
| Front, under light | 0.061719 | 0.099219 | **+60.76%** |
| Back, top light | 0.057031 | 0.055469 | −2.74% |
| Back, under light | 0.054688 | 0.056250 | +2.86% |

Each variant/view mean contains all four 32-draw windows. Within each view the two paired blocks are:

| View | Order | Completed change | GPU change |
|---|---|---:|---:|
| Front, top light | ABBA | +1.11% | +1.21% |
| Front, top light | BAAB | −8.32% | −8.43% |
| Front, under light | ABBA | +7.08% | +7.09% |
| Front, under light | BAAB | +2.20% | +2.17% |
| Back, top light | ABBA | +5.39% | +5.45% |
| Back, top light | BAAB | −10.54% | −10.58% |
| Back, under light | ABBA | +1.84% | +1.88% |
| Back, under light | BAAB | +5.77% | +5.86% |

The top-lit views change sign between paired blocks; both underlit views are adverse in both blocks. Four windows per variant/view and one execution do not establish a general performance bound. No timing is discarded, and no compiler, driver or scheduling explanation is asserted.

## Correctness and workload receipts

The independent reference is the original two-normalization FrontSide material on the same indexed face with winding and authored normals reversed. Its sampled tangent-normal x is reflected to account for the reversed tangent-frame handedness. A/B backside pixels intentionally differ; the candidate is compared with this geometric oracle.

| View | Covered pixels, A/B/oracle | Candidate vs oracle | A vs B |
|---|---:|---|---|
| Front, top light | 14,584 each | 0 changed, max 0 | 0 changed, max 0 |
| Front, under light | 14,584 each | 0 changed, max 0 | 0 changed, max 0 |
| Back, top light | 14,518 each | 0 changed, max 0 | 14,518 changed, max 119/255 |
| Back, under light | 14,518 each | **9/144,000 changed, max 1/255** | 14,518 changed, max 246/255 |

The last oracle difference is 0.00625% of pixels. The component's predeclared limits were max channel error 1/255 and at most 1% changed pixels; neither limit was relaxed after execution. This is separate from the committed PR's **strict-zero FrontSide controls**. This component's two front views also happen to match exactly. All eight A/B frozen-image repeat checks are exact.

All **32/32 elapsed queries** are available, positive, nondisjoint and valid. All **145 WebGL error checks** contain zero error codes; page/console errors are empty. Every window has exactly 32 actual GL triangle draws, 64 triangles and 192 indices, totaling 1,024 timed draws. Geometry, draw range, attribute versions and uniform values remain fixed. Resident counters stay at **2 geometries, 5 textures, 3 programs**, including both timed programs and the oracle. These counters do not establish heap bytes, driver GPU-memory bytes or production lifetime usage.

The actual expanded vertex GLSL is identical. After replacing only the exact guarded normal block and stripping comments, expanded fragment GLSL and shader templates match; both timed paths contain `USE_TEXLIB`, `DOUBLE_SIDED` and `GRATE`. Sources were captured at live `gl.shaderSource` calls. They are not driver assembly or executed-instruction/sample counts.

## Scoped oracle proof

Only normals and triangle winding change in the reference. Position, UVs, tangent, colors and face flags are copied without rebuilding planar UVs. Guards require identity mesh transform, horizontal unit N, orthogonal tangent, nonpaintable pid 12, identity top/wall remaps, zero stair metadata, no mural, no see-through fade and no AO lightmap. The pid-12 texlib coordinates/samples and both cutout masks therefore remain the same. Normal-dependent modelled-detail branches do not apply to pid 12.

`faceData.y=0` skips ink evaluation, so `gInk=gInkD=0`. Gel, wakes and ripples are inactive; `USE_TEXLIB` disables the fallback corrugation slope. Thus the procedural slope is zero. For unchanged authored tangent F and reversed normal N′=−N, `T′=normalize(F−N′·dot(F,N′))=T` and `B′=cross(N′,T′)=−B`. Reflecting sampled x gives `q′=T·(−x·s)+(−B)·(y·s)+(−N)·z=−q`. The original FrontSide expression supplies the expected opposing perturbed normal, subject to floating-point rounding.

This proof is limited to this unpaintable horizontal grate. It does not cover arbitrary painted slopes, stairs, ramps, other slots or decals. The 64px texlib, absent world lightmap/environment/shadows/postprocessing and software renderer also limit performance scope. No Nintendo shader or console pixel equivalence is established; Splatoon 3 Ver.11.3.0 remains an unmeasured reference for that comparison. General dark-scene enemy/ink recognition is not tested.

## Retained evidence

[Compact receipt](grate-component.json) retains all 32 rows/queries, eight paired blocks, error checks, oracle preconditions, source/harness/shader hashes and artifact-copy manifest. [Original raw receipt](grate-performance.raw.json) is copied byte-for-byte. The [exact executed harness](probe-inkwave-grate-performance.mjs) has SHA-256 `fdd1f2aeb8c4fcc61b42fbb8821a8d6ccfe554f3564fd0c9db4f1cee80ab7568`. All twelve A/B/oracle template and expanded GLSL snapshots are copied and hashed. Eight additional front/oracle PNG hashes remain in the raw receipt; their files remain in the original persistent scratch directory.

The four copied before/after images were visually inspected. The corrected underside becomes dark under top lighting and bright under bottom lighting, as the oracle predicts. PNG backgrounds retain transparency.

| Lighting | Original A | Candidate B |
|---|---|---|
| Top | [Before](back-toplight-A.png) | [After](back-toplight-B.png) |
| Under | [Before](back-underlight-A.png) | [After](back-underlight-B.png) |
