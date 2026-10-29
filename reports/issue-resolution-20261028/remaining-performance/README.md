# Remaining performance work — 2026-10-28

Final software verification completed on 2026-10-29 UTC. The user explicitly removed physical-device validation from this task's acceptance conditions. The software evidence below is therefore evaluated on its own merits. CPU query counts are not presented as frame-time or FPS gains, and a renderer fixture is not called a whole-match benchmark.

Baseline source: `60bbe35d4c5176fd86cb1b65f8e66336982ef6ca`. New runtime commits: `7d2f7f0e` (hidden source hair inputs and synchronous native ground memo), `7316e18b` (failed composer-pass cleanup), `4d638875` (active ScreenFX HDR requirement), `50521d42` (change only the fullscreen target precision while preserving post passes), and `2c3940ea` (establish eligible HDR/packed roles in every native generation). No main merge, push, Issue closure or comment was performed by this worktree. The owner's MOV-08b / whole-PR #1907 merge hold is unchanged; no character-model or squid implementation was copied from that PR.

## Newly implemented CPU work

The existing offscreen budget already suppressed locomotion hair inputs and accessory application. Idle and special clips still constructed hair targets, and a camera turn between simulation and submission could recover accessories without reconstructing the deferred locomotion inputs. The new build adapter skips these hidden inputs, materializes the exact previous inputs at state boundaries, and reconstructs current clip inputs before the existing first-draw accessory recovery. It never advances the motion clock. It reuses the existing sample pose and clip descriptors; manual poses, bank cleanup and disposal discard pending automatic inputs.

Native source foot contacts can query the same sole/anchor repeatedly during a single synchronous visual update even for visible actors. The existing exact memo was limited to hidden actors. It now covers ready source-motion actors as well, with unchanged keys (x/z, root height, Physics object), the same bounded pool, and mandatory end-of-call cleanup. Native triangles and moving support still use the original raycast; no result survives a tick.

| Hz | Hidden native rays: control → candidate | Visible native rays: control → candidate | Hair target adds: full evaluation → deferred |
| --- | --- | --- | --- |
| 30 | 228 → 198 | 280 → 250 | 166 → 42 |
| 60 | 438 → 380 | 542 → 484 | 225 → 28 |
| 120 | 869 → 753 | 1079 → 963 | 510 → 31 |

The native fixture uses actual composed source motion, native triangle holes and a moving dynamic support box. Every checked frame has identical bones, skin matrices, muzzle and contact state against memo-disabled control. The two-second hair fixture crosses idle, movement, air and landing states; body poses, clocks and prior-state targets are exact, including deferred first-draw inputs. Source and emitted results are retained separately.

The actual emitted Character/Renderer reentry test renders real offscreen frames and then draws each recovery side. At 30/60/120 Hz, its first visible RGBA, local bone transforms, hair targets and muzzle are exact against the continuously evaluated control. The native render-hook frame does not advance during camera-away exposure. Budget ticks are 23/53/113 and no browser or GL errors occur. This small rendered scene verifies reentry, not AI, full collision simulation or match throughput.

## Newly implemented compositor work

A native EffectComposer mutates its pass list before calling `pass.setSize()`. If that throws, the lazy proxy previously rolled back only its own list, leaving a rejected pass inside the native composer. Failed add/insert now roll back normalized indices and release the divergent target pair; the next render recreates only approved passes. Ten real-WebGL fault cycles recover exact RGBA, dispose two targets per rejected generation, and finish with 22 disposals across 11 generations.

An independent precision defect was reproduced in the unchanged baseline: the packed grade target's rounding is amplified by active ScreenFX. The same-format native/native and packed/packed controls are exact in all nine scenes, while eight active-effect scenes fail the existing mean-1.25 / p99-3 code tolerance (for example damage mean 1.462, p99 5; lens maximum 42). This is reproducible format error, not random workload drift. The failing receipt remains in `composer-baseline-control.json.gz`; no threshold was relaxed.

The renderer now retains HDR while the native ScreenFX pass contributes visible effects. Idle still uses the existing guarded packed target, and desktop, unsupported-FBO and negative-grade fallbacks remain HDR. On an actual precision edge, only target1's attachments are released and its format/type changes. The scene target, post passes, uniforms and shader programs survive. The factory establishes scene2/post1 roles in every eligible native generation, including active ScreenFX or negative-grade startup. The private injected update helper only changes target1 attachments; it never wraps the lazy proxy. Inactive lazy generations select the required format when recreated. The source regression executes 150 rendered transactions with four target1 disposals, zero scene-target disposals and zero composer rebuilds.

The initial real-WebGL shader check passes with eight active scenes exactly matching HDR; idle remains within its original tolerance. The first actual emitted Renderer/ScreenFX matrix covers LOW/MEDIUM/HIGH, stable effects, idle return, orientation, dynamic scale, negative grades, reset and inactive release. Its 45 cases pass, including 30 exact HDR comparisons, exact same-format repeats and a bounded actual WebGL live-texture set of at most five, dropping to zero on disposal. That receipt uses the preceding rebuild-based edge implementation and is explicitly retained as intermediate evidence, not the final in-place implementation's acceptance. The final `2c3940ea` production build passes 48 actual emitted Renderer/ScreenFX cases. All 48 preserve pass objects and the scene target across precision edges and directly query post depth NONE / scene depth RENDERBUFFER. All 33 active-effect/negative-grade HDR comparisons are exact; native/native and candidate/candidate repeats are exact in all 48. Idle packed output retains its original tolerance (observed p99 2). The actual WebGL live-texture set stays at most five and finishes at zero. A live context-loss/restoration probe confirms the existing paused/reload policy, unchanged frame count and no replacement post targets.

The mandatory post-depth browser gate also passes all original 78 pixel cases separately in Chromium 151.0.7922.34 and Linux WPE WebKit 26.5. Its updated assertions require the exact effect-dependent type, canPack eligibility, semantic render target2 and actual before-two / after-one depth renderbuffers for both packed and eligible HDR. Added lifecycle controls cover startup active HDR, hidden-to-active new native generations and injected packed-FBO rejection. Unsupported FBO and desktop preserve two HDR depth targets. All original scene-depth negative controls and six real context-loss/restoration/fresh-reconstruction controls remain and pass in each engine. No same-format pixel tolerance was introduced.

## Verification and reproduction

Node 22.23.4 and Playwright 1.62.1 / sandboxed Chromium 151.0.7922.34 were used. Browser rendering uses SwiftShader. The production inputs/artifacts were re-read against committed Git blobs before execution. Runtime build identities:

- `7316e18b2ec46cc0fe6da211b4bde9aa1aa73478`: content `1710e9a7d6c6b40f529160534f3db248bd5bb90d5aac61a5631f1184b782e3e9`.
- `4d6388755bf72c820d3f4a2031ea6ee0ef494a8d`: content `40a3383cb993d5dd464928d74eb968b8a25013b57e4890e8137a641997bdcc39`.
- `50521d42d17fdff64b2511ad2befebccde218618`: content `1fe54f115488f83b2f0865f7d9f5cd618f2dfb1c6bd02e3c2cca824f403022d1`.
- Final `2c3940ea3fc41402a35a02f963cb2aa3d8b3897c`: content `9999468f2d210c6a56ba2ed13875859a018d122fc67dcd04cd1e97dc266adee3`.

Focused commands (run from the repository root; select Node 22):

```sh
node --experimental-vm-modules --test patches/local-quality/tests/offscreen-hair-targets.test.mjs patches/local-quality/tests/native-offscreen-ground-memo.test.mjs
INKWAVE_BUILT_SITE=/path/to/site node --experimental-vm-modules --test patches/local-quality/tests/offscreen-hair-targets.test.mjs patches/local-quality/tests/native-offscreen-ground-memo.test.mjs
node --experimental-vm-modules --test patches/local-quality/tests/composer-residual-642.test.mjs patches/local-quality/tests/composer-target-adapter.test.mjs patches/local-quality/tests/composer-extra-pass-insertion.test.mjs
node scripts/check-inkwave-offscreen-hair-reentry.mjs --site /path/to/site --source-sha FULL_SHA --out .hair-evidence
node scripts/check-inkwave-offscreen-hair-reentry.mjs --composer-lifecycle --site /path/to/site --source-sha FULL_SHA --out .composer-evidence
node scripts/check-inkwave-post-depth-browser.mjs --site /path/to/site --source-sha FULL_SHA --browser chromium --out .post-depth/chromium.json
INKWAVE_WEBKIT=/path/to/available-webkit-launcher node scripts/check-inkwave-post-depth-browser.mjs --site /path/to/site --source-sha FULL_SHA --browser webkit --out .post-depth/webkit.json
```

The composer shader experiment additionally uses `INKWAVE_CHROMIUM`, `PLAYWRIGHT_MODULE` and `INKWAVE_BROWSER_PROFILE`; all paths must remain in persistent workspace storage. `scripts/check-inkwave-composer-webgl.mjs EVIDENCE --lazy-ref FULL_BASE_SHA --format-ref FULL_BASE_SHA --format-only` reproduces the old precision selection with immutable baseline helpers and preserves the strict repeated-image checks. The default command exercises the current helpers plus cleanup faults.

Successful checks: source three cases, final source hair two cases, emitted three cases, compositor 18 cases, existing context/clock/native-retirement 51 cases, final actual emitted compositor 48 cases, and the mandatory depth gate 78 cases in each browser. These suites overlap and are not added into one headline count. Raw logs, browser reports and hashes are in [receipts.json](receipts.json). The initial invocation of the compositor unit suite omitted the required VM flag and failed at module construction; it was rerun with the documented VM flag. An initial reentry runner tried a nonexistent `Renderer.dispose()` and was corrected to use the existing composer/renderer cleanup APIs before successful acceptance. No runtime assertion was weakened for either setup error.

## Disposition of the six assigned Issues

| Issue | New work and current software acceptance |
| --- | --- |
| #845 | New idle/special target deferral, precise first-draw inputs and visible native query reuse. Source/emitted exact state comparisons and real rendered reentry pass. Software fix is a resolution candidate after integrated CI. |
| #642 | New rejected-pass resource cleanup and output-preserving active-effect HDR precision. Baseline format error has exact self-controls. Final in-place rendered/resource acceptance passes, including the existing strict depth gate in both browsers. Software fix is a resolution candidate after integrated CI. |
| #1757 | Real unnecessary Character work is removed while retaining default visible quality. Existing merged menu/SVG and frame-pacing fixes are reused, not re-counted as new work. Whole-match CPU distributions remain separate evidence; these query counts do not establish an FPS gain. |
| #1671 | Native foot-query duplication is reduced with exact triangle/support outputs. Existing native paint/BVH/profile fixes and #1907 remain distinct work. Recovery of the reported dominant simulation category requires matching current whole-match/native workload evidence, not an inference from the reduced query count. |
| #1434 | Strict whole-game calibration is handled by the separate integration diagnostic lane. Its current same-native four-trial control was rejected: the fourth RGBA endpoint and background metadata differ, so no ABBA/BAAB performance claim is established. The old DO NOT MERGE scripts were located at `032e3678bd84efe1d4e9c3ef9b1179110bb8d71e`; they were not copied into production by this branch. This report's real-GL repeatability controls qualify only their explicit isolated scenes. |
| #1565 | G0 identities and focused performance/pose gates are extended here; G1 reuses existing shader/paint architecture; G2 retains the same body/weapon/contact ownership; G3 Lite Pose Search is conditional on a measured G2 deficit and net CPU/memory improvement, neither established here; G4 distance matching has no verified monotonic source curve and no extra evaluator/FX is added; G5 depends on final composed source/emitted/browser/CI and whole-game evidence. No unqualified new animation/search/render feature is enabled. |

The current software restrictions are specific: isolated fixtures do not prove all-stage, all-weapon gameplay equivalence or calibrated whole-match performance; historical optimized-branch tests are not re-labeled as this candidate's result. Physical-device checks are not an outstanding task requirement.

## Retained artifacts

`composer-final-live.json.gz` is the final 48-case receipt. `post-depth-{chromium,webkit}.json.gz` retain all 78 original image hashes, actual attachment/resource counts, added native-generation/fallback controls and six context-recovery controls per engine. The exact executed post-depth harness is retained compressed: the later metadata-only edit records its own hash in future runs; the original receipts are not re-labeled as executing that added field. `composer-old-*` explicitly identify intermediate evidence.

The source reentry PNG pair at 60 Hz is included for visual inspection; its original receipt has one actual render catch-up on each side and the saved images independently contain nonuniform character pixels. `lens-baseline-packed-shader.png` and `lens-selected-hdr-shader.png` illustrate the isolated shader precision control, not a retail or whole-match capture. Their original intermediate filenames used the initial idle format label for every effect; the retained target metadata identifies the actual per-effect format, and the current harness now names each output using that effect's selected target type.
