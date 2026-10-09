// Scorch Gorge / ユノハナ大渓谷 — stage layout blockout
//
// Sourced from Splatoon 3 Ver. 8.0+ Turf War map topology (Wiki File:S3_Map_Scorch_Gorge_Turf_War_8.0.jpg)
// and in-game overhead visual references (scorch-overhead.jpg).
//
// HONEST BOUNDARY NOTICE:
// Metric coordinates, platform elevations and ramp widths below are local INKWAVE gameplay
// estimates (based on PLAYER height 1.45 m and standard run/swim speeds), NOT extracted retail
// Switch CAD or collision meshes. No exact retail geometry is claimed.
//
// Layout is 180° point-symmetric about the origin ((x, z) -> (-x, -z)).
// Team Alpha spawns at -Z (z = -44), Team Bravo spawns at +Z (z = 44).
//
// Key topological features:
// - Elevated spawn platforms (y = 3.2) with safety barriers and descent ramps
// - Upper Plaza base areas (y = 1.8) for staging and special charge
// - Asymmetrical flanks: Left low lane (y = 0.0) vs Right sniper perch (y = 2.6)
// - Central gorge basin (y = 0.0) with central climbable tower (y = 2.6)
// - High grate catwalk network (y = 3.2) crossing through mid (grate: true, unpaintable)
// - Lethal canyon abyss on mid flanks (no floor, falling below PLAYER.fallDeathY kills)

import { PATTERN, B, R, OCT, C } from '../../../src/world/mapkit.js';

export const LAYOUT = {
  id: 'scorch',
  bounds: { minX: -26, maxX: 26, minZ: -50, maxZ: 50 },
  spawnPads: [[0, 3.2, -44], [0, 3.2, 44]],
  spawnBarrier: 4.2,
  intro: { from: [12, 14, 18], lookFrom: [0, 2.8, 0], toBack: 3.0 },

  // Objects centered at origin (0, 0, 0)
  single: [
    // Central gorge basin floor (y = 0.0). Flanks beyond x = ±16 drop into open abyss.
    B(-16, 16, -1.2, 0.0, -14, 14, { color: '#d5b998', pattern: PATTERN.concrete, tag: 'gorge-basin' }),

    // Central tower / pillar: climbable on all sides, paintable top
    B(-3.5, 3.5, 0.0, 2.6, -3.5, 3.5, { color: '#c7a988', pattern: PATTERN.concrete, tag: 'mid-tower' }),
    // Central cover crate on top of tower
    B(-1.2, 1.2, 2.6, 3.8, -1.2, 1.2, { color: '#b58b5e', pattern: PATTERN.wood, tag: 'mid-crate' }),

    // Center crossing grate bridge (y = 3.2): unpaintable, kids walk, squids fall through
    B(-1.4, 1.4, 3.1, 3.2, -3.5, 3.5, { color: '#687480', pattern: PATTERN.grate, grate: true, thin: true, thickness: 0.1, tag: 'mid-grate-cross' }),
    B(-3.5, 3.5, 3.1, 3.2, -1.4, 1.4, { color: '#687480', pattern: PATTERN.grate, grate: true, thin: true, thickness: 0.1, tag: 'mid-grate-wing' }),
  ],

  // Team Alpha's half (-Z), automatically mirrored for Team Bravo (+Z)
  half: [
    // ---- 1. Spawn Platform (y = 3.2) ----
    B(-10, 10, 0.0, 3.2, -48, -40, { color: '#ded7c8', pattern: PATTERN.spawn, tag: 'spawn-deck' }),
    // Safety perimeter walls behind and beside spawn
    B(-10, 10, 3.2, 5.0, -48.4, -48.0, { color: '#929da6', pattern: PATTERN.metalpanel, paint: false, roof: true, tag: 'spawn-backwall' }),
    B(-10.4, -10.0, 3.2, 4.4, -48, -40, { color: '#929da6', pattern: PATTERN.metalpanel, paint: false, roof: true, tag: 'spawn-rail-left' }),
    B(10.0, 10.4, 3.2, 4.4, -48, -40, { color: '#929da6', pattern: PATTERN.metalpanel, paint: false, roof: true, tag: 'spawn-rail-right' }),

    // ---- 2. Spawn Ramp down to Upper Plaza ----
    R([0, 1.8, -35], [0, 3.2, -40], 6.0, { color: '#cfb291', pattern: PATTERN.hazard, tag: 'spawn-ramp' }),
    // Side rock shoulders beside the spawn ramp
    B(-10, -3.0, 0.0, 3.2, -40, -35, { color: '#c4a683', pattern: PATTERN.concrete, tag: 'spawn-shoulder-left' }),
    B(3.0, 10, 0.0, 3.2, -40, -35, { color: '#c4a683', pattern: PATTERN.concrete, tag: 'spawn-shoulder-right' }),

    // ---- 3. Upper Plaza / Base Floor (y = 1.8) ----
    B(-18, 18, -1.2, 1.8, -35, -22, { color: '#decbb2', pattern: PATTERN.concrete, tag: 'base-plaza' }),
    // Base cover crates
    B(-8.0, -5.5, 1.8, 3.2, -31, -28.5, { color: '#b58b5e', pattern: PATTERN.wood, tag: 'base-crate-left' }),
    B(5.5, 8.0, 1.8, 3.2, -31, -28.5, { color: '#b58b5e', pattern: PATTERN.wood, tag: 'base-crate-right' }),
    // Hydrothermal vent monument (landmark structure)
    ...OCT(11, -27, 2.2, 1.8, 4.2, { color: '#9c7a56', pattern: PATTERN.concrete, tag: 'vent-monument' }),
    // Plaza outer walls
    B(-18.4, -18.0, 1.8, 4.5, -35, -22, { color: '#8a96a0', pattern: PATTERN.metalpanel, paint: false, roof: true, tag: 'plaza-wall-left' }),
    B(18.0, 18.4, 1.8, 4.5, -35, -22, { color: '#8a96a0', pattern: PATTERN.metalpanel, paint: false, roof: true, tag: 'plaza-wall-right' }),

    // ---- 4. Central Ramp from Plaza down to Gorge Basin ----
    R([0, 0.0, -16], [0, 1.8, -22], 6.0, { color: '#cfb291', pattern: PATTERN.hazard, tag: 'mid-ramp' }),

    // ---- 5. Left Flank Route (Low Lane, y = 0.0) ----
    R([-14, 0.0, -20], [-14, 1.8, -26], 4.5, { color: '#cfb291', pattern: PATTERN.hazard, tag: 'left-ramp' }),
    B(-22, -14, -1.2, 0.0, -20, -6, { color: '#d5b998', pattern: PATTERN.concrete, tag: 'left-flank-floor' }),
    B(-19.5, -16.5, 0.0, 1.4, -14, -11, { color: '#b58b5e', pattern: PATTERN.wood, tag: 'left-flank-crate' }),
    B(-22.4, -22.0, 0.0, 3.0, -20, -6, { color: '#8a96a0', pattern: PATTERN.metalpanel, paint: false, roof: true, tag: 'left-wall' }),

    // ---- 6. Right Flank Route (Sniper Perch / High Ledge, y = 2.6) ----
    B(10, 20, -1.2, 2.6, -25, -12, { color: '#cbb092', pattern: PATTERN.concrete, tag: 'right-perch' }),
    R([15, 1.8, -29], [15, 2.6, -25], 4.0, { color: '#cfb291', pattern: PATTERN.hazard, tag: 'perch-ramp' }),
    B(10.5, 19.5, 2.6, 3.4, -12.5, -12.0, { color: '#687480', pattern: PATTERN.metalpanel, tag: 'perch-parapet' }),

    // ---- 7. Grate Catwalks from Right Perch into Mid ----
    R([4, 3.2, -6], [12, 3.2, -14], 2.0, { color: '#687480', pattern: PATTERN.grate, grate: true, thin: true, thickness: 0.1, tag: 'perch-grate' }),
    R([0, 3.2, -3.5], [4, 3.2, -6], 2.0, { color: '#687480', pattern: PATTERN.grate, grate: true, thin: true, thickness: 0.1, tag: 'mid-grate-link' }),

    // ---- 8. Mid Basin Cover ----
    B(-6.5, -4.5, 0.0, 1.5, -12, -9, { color: '#b58b5e', pattern: PATTERN.wood, tag: 'gorge-crate-left' }),
    B(5.5, 7.5, 0.0, 1.5, -9, -6, { color: '#b58b5e', pattern: PATTERN.wood, tag: 'gorge-crate-right' }),
  ],

  // Decor anchors for level.js
  decor: {
    lamps: [[-9, -42], [9, -42], [-17, -26], [17, -26]],
    flags: [[-8, 3.2, -47.5], [8, 3.2, -47.5]],
  },
};
