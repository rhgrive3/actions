# KNOWN_DIFFERENCES (vs Splatoon 3 Ver. 11.3.0)

Ordered by fidelity impact. "Gap" is the estimated score cost in SCORECARD.md.

| # | Area | Difference | Gap | Fix path |
|---|---|---|---|---|
| 1 | Stage | Scorch Gorge is a measured **blockout** with stylised materials, not the full art pass (no detailed rock sculpting, signage, hot-spring props beyond vents/towers). Layout, heights, lanes, perch, mid platform, grates and cover are represented. | high | Environment art pass (procedural rock meshes, decals, props), lightmaps |
| 2 | Character | Procedural primitive-built Inkling (no skinned mesh / blendshapes). Silhouette (big head, tentacles, tank, weapon) reads, faces are simplified. | med | Author glTF character with skeleton, replace procedural anim with clips + IK |
| 3 | Ink backend | WebGL2 render-target path only; no WebGPU compute path. Both paths share the same API/encoding so parity tests are possible later. | low (mobile perf OK) | Implement `WebGPUInkBackend` via three WebGPURenderer / raw WebGPU |
| 4 | Ink surface mapping | Floors use a world-XZ projected texture (overlapping floors would share texels — Scorch Gorge blockout has no overhangs except grates which are unpaintable). Walls use per-face tiles. | low-med | Chunked secondary-UV atlas |
| 5 | Squid Surge | Not implemented (wall-swim charge jump). Squid Roll is implemented. | low-med | Add SQUID_SURGE state: hold jump on wall → charge → launch |
| 6 | Sub / special weapons | Not implemented (Turf War kits have subs/specials). Main weapons only, per brief. | med | Data-driven sub/special module |
| 7 | Flow Aura | Trigger numbers are unpublished; implemented as visual aura only (no gameplay buff). | low | Update when documented |
| 8 | Super Jump | Not implemented (map-tap jump to teammates/spawn). | low-med | Map overlay + jump arc |
| 9 | Physics | Custom AABB world, ramps as micro-steps (no slopes in collision; visual slopes exist). Character body is an AABB not a capsule. | low | Swept-capsule vs. convex slopes |
| 10 | Animation | Procedural (leg swing, lean, recoil, flick arcs, morph) instead of authored clips; no IK. | med | see #2 |
| 11 | Audio | Fully synthesised; no music. | low | Original music track |
| 12 | Hitboxes | Simplified: humanoid cylinder-ish (radius 0.32, h 1.5), swim (0.28, 0.35). Ver. 11 hitbox tweaks not reproduced numerically. | low | |
| 13 | Damage falloff timing | Approximated from published min/max; exact frame windows estimated. | low | |
| 14 | Shooter shot pattern | 1-in-3 perfectly straight shot approximation of S3's spread rule. | low | |
| 15 | Bots | No voice/emote, no super-jump; fixed "normal" difficulty (easy/hard tables exist). | low | Expose difficulty in menu |
| 16 | Lighting | Real-time lambert + hemisphere + baked-style shading in shader; no lightmaps/IBL/shadows (blob shadows). | med | Bake lightmap for stage mesh |
| 17 | UI | Original design language; no Nintendo assets. Some panels (weapon select) are more static than the reference. | low | |
| 18 | Spawn | Spawn platform not inked at start / no spawn drone animation. | low | |
| 19 | Score | Live score uses CPU mirror (fast); final uses GPU readback of the floor texture. Small differences (<1 %) expected from splat edge noise. | low | Log both at result (console) |
| 20 | Network | Simulation is separated but no netcode. | n/a | see ARCHITECTURE.md |
