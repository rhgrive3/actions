# Armor Helmet Replica coating correction — 2026-10-18

## Scope and reference
User clarified that the outstanding request means a coating finish. Preserve the accepted geometry, flat purple ear print, rear face winding, base colors and all other headgear.
Reference: Splatoon 3 worn image https://gamewith.jp/splatoon3/362845 and https://img.gamewith.jp/img/caaf01105814adc92b1347dc03c36b84.png . This is third-party game imagery, not published Nintendo material parameters. It shows localized surface reflections over the woven base; numerical material parity is not claimed.

## Implementation
Base: main 60cc6bf569561113b263e39cb094a05d45e491f9.
Only the shell material changes from MeshStandardMaterial to MeshPhysicalMaterial, adding clearcoat 0.55 and clearcoatRoughness 0.18. Existing color 0x363b3e, roughness 0.58 and metalness 0.13 are unchanged. No geometry, light, camera, texture, character or hair modifications. The printed ear material stays unchanged.

## Verification stages
- Independent source readback and main snapshot validation completed: 4,681 tracked blobs match the GitHub main tree.
- All geometry arrays match the original across LODs; triangle/draw counts unchanged (far 1100/3, game 3090/4, hero 4722/4).
- Normal production build and startup budget passed. All 27 existing lifecycle tests plus three new all-LOD Physical material/signal/disposal regressions passed (30/30). The new three tests fail against the original Standard material. Issue-483 tests passed 10/10, with 81 owned builds/disposals and zero retained native hair/inverse-cache entries.
- Same-camera/light/exposure five-view Blender material emulations are diagnostic previews only. They do not prove Three.js appearance or GPU performance.
- Exact-head native browser run [39086914122](https://github.com/rhgrive3/actions/actions/runs/39086914122) passed for 264677d04e481832adc909ce5042b267a49286fd. Both suite sourceSha/checkoutSha receipts match; all 228 saved PNG hashes, byte sizes and 720×720 dimensions were independently verified. There were zero browser/shader errors or blocked requests. All 24 effect cases and 28 LOD/quality cases passed; six disposal cycles returned to 23 geometries and three textures. Independent visual review found the final 228 images identical to the approved initial coating run. This establishes tested appearance and function, not performance equivalence.

## Load and limitations
No extra meshes, textures or render passes. Physical clearcoat adds fragment BRDF arithmetic; unchanged geometry/draw counts do not establish unchanged GPU cost. Reliable GPU-only timing remains unmeasured. No extra detail modeling or broad quality changes are included.


## Initial cost diagnostic: inconclusive, preserved

The same-head comparison in run 39086914122 used one/eight game-LOD native characters, an original Standard shell comparator, identical substrate/geometry/lights/camera and 24 samples per variant. The renderer was ANGLE Vulkan SwiftShader (software rendering). All 96 timer queries timed out despite the extension being advertised; there are zero valid GPU timing samples.

Recorded render + gl.finish wall times, without excluding any samples:

| Characters | Standard p50 / p95 ms | Physical p50 / p95 ms |
| --- | --- | --- |
| 1 | 540.0 / 2261.7 | 550.2 / 12944.0 |
| 8 | 1522.3 / 1535.9 | 1526.6 / 1567.9 |

These medians must not be read as proof of near-equal GPU cost. One-character Physical samples include 12.944, 13.248 and 12.760 second outliers in the first Physical block; Standard also reaches 6.517 seconds. Later blocks still mix approximately 1–2 ms submissions with roughly 0.55-second or 1.53-second samples. The cause has not been established: shader warmup, timer-query/driver behavior and host scheduling are possible contributors, not grounds to discard data. gl.finish wall timing alone did not provide convincing comparable completion boundaries in this environment. All original samples remain in that run artifact and the independent verification receipt. No performance acceptance follows from this diagnostic.

## Revised bounded diagnostic: acceptance pending

The next QA-only revision disables the unusable timer queries. It adds a one-pixel readPixels completion/readback boundary inside each timed render, after gl.finish. Both variants receive 12 actual readback-completed warmup renders with animation-frame scheduling. It then measures 24 paired samples per variant for each of one/eight characters, alternating Standard/Physical order every pair. RAF waits occur outside the timed section; all raw samples and paired deltas are retained with no trimming or outlier exclusion. Temporary comparison materials are restored and disposed; production material values are unchanged.

This measures synchronized CPU/driver/software-render/readback wall cost, not GPU-only duration, physical-device performance or gameplay FPS. The readback adds common overhead and does not eliminate host scheduling noise. There is no arbitrary performance pass threshold. The revised exact-head CI result and interpretation remain pending; functional and visual acceptance above do not substitute for this remaining performance assessment.
