# Grate backside lighting correction — Issue #1565 subset

Base: `d5265f73d9dad69f1afd9690e374caee45195f11` (main including PR #1564). This change corrects one measured lighting defect. It does not complete Issue #1565, improve general team-ink readability, or establish physical-device performance parity.

The level shader replaced Three's already-oriented normal and dropped the front/back facing sign. Grates use `DoubleSide`, so visible backsides incorrectly received front-face lighting. The correction now compiles **only under `DOUBLE_SIDED`**. The `#else` branch keeps the exact original two-normalization FrontSide expression, including the native source-stage ink overlay. There is no runtime branch and no new FrontSide use of `gl_FrontFacing`. The existing clearcoat normal receives the corrected double-sided normal.

Within the double-sided branch, normalization occurs after the linear view transform and uses Three's existing facing sign. The redundant earlier normalization is omitted there. This is a source-level algebra observation; no compiled GPU instruction reduction or speed gain is claimed. Three nonexecuting comment blocks in the same generated normal block are removed through guarded build-time replacements to offset the added inactive shader text. The documented upstream `inkwave-public/` source remains unchanged. The existing material cache identity is advanced through the practice-range composition.

## Current verification

Focused orientation, existing texlib and workflow source regressions pass **36/36**. The production build completes with the pinned upstream source unchanged. The current exact-source shader input commit is `5d82908b96c199de14b3d79d048e7474f98365d8`, with content hash `50b919d25d49699574f9846c99400b8486c70c60d1634d94bc7bc75121211bb3`. Evidence-only follow-up commits do not change those runtime inputs.

Actual emitted-material checks pass in **Chromium 141 / SwiftShader and WebKit**:

| Condition | Chromium baseline differing pixels | WebKit baseline differing pixels | Narrow candidate, both engines |
|---|---:|---:|---:|
| Grate top | 0 | 0 | 0 |
| Grate back, light above | 40,260 | 40,275 | 0 |
| Grate back, light below | 40,260 | 40,275 | 0 |
| Flat painted FrontSide vs independent original expression | 0 | 0 | 0 |
| Tilted painted FrontSide vs independent original expression | 0 | 0 | 0 |
| Tilted dry texlib FrontSide vs independent original expression | 0 | 0 | 0 |
| Tilted painted texlib FrontSide vs independent original expression | 0 | 0 | 0 |

Every comparison uses 172,800 pixels. The baseline backside maximum channel errors are 102/255 and 107/255. Candidate grate-front hashes also match baseline hashes exactly. The previous broader variant's WebKit one-level rounding difference is absent. The verifier now requires **zero** changed pixels for the independent FrontSide controls; no rounding tolerance remains. Frozen redraws, coverage, WebGL/shader/page errors and warmed draw/resource/program comparisons pass. The emitted authored-Level grate and the real generated 25-layer, 64px diagnostic texlib are used; these are not imported source-stage meshes or a full quality-resolution matrix. Representative new before/after and painted images were inspected.

Grate rows retain one draw, two triangles, two textures and two warmed programs; after both geometries are warm there are two geometries. Front reference rows retain one draw, two triangles, three geometries, six textures and four warmed programs on both sides. Those counts include diagnostic reference objects and do not establish heap/GPU-memory or lifetime bounds. The direct-render fixture has no postprocessing passes; production adds no pass, texture sample, object, particle, geometry, material, dependency or runtime allocation. Quality, LOD, atlas and pool policies are unchanged.

The captured `onBeforeCompile` **shader template**, before include expansion, retains 15 texture-call expressions. It now contains 14 normalization expressions because both preprocessor branches are represented in its text. These are template syntax counts, not compiled GPU instructions or dynamic fetch counts. FrontSide keeps the original arithmetic; the double-sided correction is the only active normal-expression change.

All **929 versioned production payload files** retain their paths/count. Only `src/world/levelMaterial.js` changes: **37,007→36,843 bytes (−164)** and gzip level 9 **12,363→12,288 bytes (−75)**. The aggregate versioned payload has the same reductions. Texture/image payloads are byte-identical.

The aggregate file population is explicit in `payload-comparison.json`. The versioned set includes its unchanged `sw.js` (13,185 bytes; gzip 4,799) and omits the empty root `.nojekyll` (0 bytes; gzip 20). The integration's root logical-asset set excludes root `index.html`/`sw.js` and includes `.nojekyll`, also totaling 929 files. Shared logical paths have identical hashes. Normalized to that root logical set, totals are **62,667,454→62,667,290 raw bytes** and **56,162,283→56,162,208 gzip bytes**; the deltas remain −164/−75. These two aggregate scopes must not be compared as if their file populations were identical.

The four receipts verify committed build inputs, artifact hashes and `inputHash`, and bind the tested source SHA and verifier SHA-256 `9dbea84c1affaeec716513c72257358339a51261a796c0832cbd845c5e1cfc77`. Software draw/drain samples were collected during concurrent correctness work and are deliberately omitted from compact receipts as nonqualifying diagnostics. They establish neither whole-game performance nor physical-device parity. The final exact-head CI passes, but combined and component measurements do not establish performance nondegradation. **PR #1566 remains Draft and unadopted.** See the [final shared record](../inkwave-quality-1565-2026-10-17/README.md) for all raw measurements, adverse rows, resource diagnostics and unresolved gates.

![Incorrect grate underside before](chromium-before-back-toplight.png)
![Correct grate underside after](chromium-after-back-toplight.png)

The existing `active` CI browser shard retains both source-bound Chromium and WebKit commands immediately after post-depth checks. Both reports are mandatory in the existing source/content-hash evidence binding. No new job or timeout change is introduced.

Reproduce the focused checks:

```sh
node --experimental-vm-modules --test patches/local-quality/tests/grate-normal.test.mjs patches/local-quality/tests/texlib-stage-pack.test.mjs scripts/tests/inkwave-integration-workflow.test.mjs
ESBUILD_MODULE=/workspace/actions/node_modules/esbuild/lib/main.js node scripts/build-inkwave.mjs inkwave-public /workspace/inkwave-render-narrow
node scripts/check-inkwave-grate-normal.mjs --site /workspace/inkwave-render-narrow --source-root /workspace/render-1565 --source-sha 5d82908b96c199de14b3d79d048e7474f98365d8 --evidence-dir .ci-scratch/1565/narrow-chromium --executable-path /home/agent/.cache/ms-playwright/chromium-1194/chrome-linux/chrome
node scripts/check-inkwave-grate-normal.mjs --site /workspace/inkwave-render-narrow --source-root /workspace/render-1565 --source-sha 5d82908b96c199de14b3d79d048e7474f98365d8 --evidence-dir .ci-scratch/1565/narrow-webkit --browser webkit --executable-path /workspace/browser-libs/webkit-headless.sh
```

## Preserved earlier experiments

The [global normalization experiment](global-normalization-experiment/README.md) and all its images, browser receipts, source/build logs, payload comparison and workflow test log are preserved unchanged. That broader variant altered FrontSide arithmetic, and WebKit showed one front-facing texlib pixel differing by 1/255. It is superseded by the double-sided-only implementation.

Whole-game calibration of that broader variant preserved workload/state/full pixels but observed about an 11% completed-time slowdown in a small software-rendered sample. Its cause was not established. A subsequent single-realm actual native Scorch ink/texlib shader diagnostic measured original/current GPU means 193.583/197.104 ms per overlay draw, with paired changes −6.60%, +6.61%, +2.99%, +3.04% and marked chronological variability. It did not consistently reproduce the whole-frame magnitude and did not establish nondegradation. The raw diagnostic, expanded shader source and failed-attempt scope notes remain in persistent scratch at `.ci-scratch/1565/normal-codegen-current-texlib/` and sibling attempt directories. No claim that the narrower fix resolves a demonstrated cause follows from those results.

The narrower version is preferred because the requested grate correction does not require changing the FrontSide/native-overlay normal expression. Full-game performance acceptance remains separate from source-level scope reduction.

## Comparison scope and remaining limits

The project's comparison reference remains Splatoon 3 Ver.11.3.0. The affected interaction is viewing a grate from below or through its openings while walking, swimming or jumping with the gameplay camera. This patch changes illumination only, preserving movement, collision, weapon, paint, recovery, damage, gear and animation rules.

Correctness is referenced to the shipped Three facing-normal contract and independently reversed authored-Level triangle geometry. No Nintendo internal shader curve, original-console timing or exact original-game pixel equivalence is inferred. Imported source-stage meshes, the complete texlib quality/resolution matrix, general gameplay ink readability, physical-device FPS/thermals/power, long matches and the wider Issue #1565 acceptance matrix remain separate. Current callers use FrontSide or DoubleSide; BackSide behavior is not claimed.
