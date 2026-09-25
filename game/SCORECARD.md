# SCORECARD — honest self-assessment vs Splatoon 3 Ver. 11.3.0

Scoring rule: points are only awarded for behaviour that exists in code AND has evidence (data source, measurement, or code-level verification). Items not runtime-verified on a device in this session are capped. **This session had no browser/GPU runtime available to the agent** — build/typecheck passed, systems were desk-checked in two review passes, but on-device inspection, benchmark and playtests remain open (see DEVELOPMENT.md). Scores therefore reflect implementation completeness × confidence, not a claim of 95.

| Category | Max | Score | Evidence | Remaining discrepancy | Conf. |
|---|---|---|---|---|---|
| Movement / character controller | 14 | 9 | 13-state controller; accel/decel/air/step/jump/coyote; swim 2×, wall swim, squid roll, enemy-ink penalties, transform morph timing 8 f/6 f from footage; values in REFERENCE_MATRIX | Squid Surge missing; AABB body & micro-step ramps; accel/jump not yet frame-matched on device | MED |
| Camera / touch / gyro | 10 | 6.5 | Rig chain with second-order dynamics (6 Hz / 3.2 Hz), shoulder offset, collision, FOV/recoil; floating stick, drag aim, iOS gyro permission + filter pipeline, recenter | Gyro sign/feel untested on device; no sensitivity UI; camera golden baseline not captured | MED-LOW |
| Ink simulation / painting / turf | 15 | 10.5 | GPU RT floor+wall atlas, batched instanced stamps, procedural shapes per weapon, roller strip/charger line/drips, CPU mirror for gameplay, score mask (floor only), exact readback at TIME UP w/ parity log | World-XZ projection (no chunked UV atlas), WebGL2 only, no fresh/dry fade, golden images not captured | MED |
| Weapons | 12 | 8.5 | All 3 weapons data-driven from published frame data (6 f/36 dmg/0.92 %; flick 150→50, 8/17 f; 60 f charge 40→160, storage 1.5 s, pierce); camera-ray→muzzle; spread rules | Golden tests not run; falloff windows estimated; no subs/specials; muzzle obstruction | MED |
| Stage geometry / combat flow | 12 | 6 | Measured blockout w/ spawn/plaza/perch/lanes/gorge/mid/grates/cover, point-symmetric, climbable walls, auto nav | Dimensions LOW-MED confidence; no art pass; lane timings unverified | LOW-MED |
| Modeling / character / weapon / animation | 10 | 5 | Procedural Inkling silhouette (head, eyes, tentacles, tank), squid form, 3 weapon models with correct component silhouettes; procedural locomotion, flick arcs, morph, squash | Primitive-built; no skinning/IK/clips; faces simplified | MED |
| Rendering / material / VFX / audio feel | 8 | 5 | Stylised ink shader (wet spec, fresnel), sky/mesas/fog, instanced particles, beams, laser sights, synthesised SFX w/ panning & loops | No lightmaps/IBL/shadow maps; no music; particles CPU-simulated | MED |
| AI / match rules | 6 | 4.5 | 7 bots, layered utility AI w/ perception memory, ink-cost A*, role behaviours, difficulty tables; full Turf rules, respawn, killfeed, 1-min warning, result | Bot behaviour not observed at runtime this session | MED |
| UI / UX | 5 | 4 | Original energetic skewed/blob UI, safe areas, pressed states + haptics, contextual V-FLICK, portrait prompt, debug panel hidden by default | Small-screen overlap check pending; no settings | MED-HIGH |
| Mobile performance / robustness | 8 | 4.5 | Tiers, DPR cap, dynamic resolution, single stage draw, pooling, dt clamp, single-file 243 KB gz | No on-device benchmark yet; mesas/characters not merged (draw calls est. 150–250) | LOW-MED |
| **TOTAL** | **100** | **63.5** | | | |

Critical-category check (must each be ≥ 90 % for a 95 claim): Movement 64 %, Camera 65 %, Ink 70 %, Weapons 71 %, Stage 50 % → **not met**. The Fidelity Gate is therefore **not passed**; the build is a complete, buildable vertical slice awaiting the runtime → benchmark → compare → fix loop.

## TOP 20 fidelity gaps (impact/cost ordered)
1. Run on device; fix any runtime error (blocking everything else)
2. Stage art pass / landmark pass (Stage 12 → +3)
3. Verify & tune movement accel/jump/swim vs footage (+2)
4. Camera golden + on-device gyro feel (+2)
5. Skinned character model (+2.5)
6. Weapon golden tests + falloff window tuning (+1.5)
7. Ink golden images; splat shapes vs footage (+1.5)
8. Squid Surge (+1)
9. Benchmark on mid-range phone; merge draws (+2)
10. Lane timing playtest; height tune (+1.5)
11. Bot behaviour observation & tuning (+1)
12. Lightmap/IBL (+1.5)
13. Music + ambience (+0.5)
14. Chunked UV ink atlas (+1)
15. Sub/special weapons (+1.5, scope decision)
16. Settings UI (sensitivity/invert) (+0.5)
17. Small-screen layout check (+0.5)
18. Super Jump (+0.5)
19. WebGPU compute backend (+0.5)
20. Deterministic replay for regression (+0.5)
