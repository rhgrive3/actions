# Short native RNG diagnostic only

005838474a18d435b11cc0e08e6cee09246ada99 run39674565340 failed short preflight. Its 53 Node tests and both builds passed, but full captures and all-frame acceptance did not execute. Artifact12381164115 is preserved, SHA256 3d1eae6cf7b3c5013d335ab4a1993f1e533807c2f2f5a9e2f7c149a90866538a.

Offline receipt comparison found equal style, scene clocks, startup, scene census/readiness, aim, camera and lighting. Physical state differs in seed: before is xorshift draw385, after draw3. Counts441 versus58 therefore include a difference before actual birth, not merely rendering. This does not establish a production VFX defect. Resources differ by30 triangles and3 geometries; active FX pools differ. Neither is excluded or accepted.

This head performs short preflight only. The long capture and full comparison steps are explicitly skipped even if preflight happens to pass. It is not final image, video, resource or whole-game acceptance.

The unchanged QA RNG function records at most the first512 draws of the shot phase in16 caller groups. It records reset, native-birth and draw-probe boundaries, existing native character/load/render flags, and actual FxHooks time/stamp/sprayT/featherT/trigger counts. It never adjusts the seed based on observed counts, rewrites retained timers, or changes runtime. Diagnostic stack collection is not performance evidence. These counters cover calls through the stable alias, not direct calls to the native presentation RNG.

Every existing short-preflight comparison is collected before the overall hard failure. Resource differences remain available in the original manifests and are not silently treated as passed. Full-pair378 checks, actual continuous video and retail fidelity review remain pending.
