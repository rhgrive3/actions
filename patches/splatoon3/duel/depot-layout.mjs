// Inkbox Depot / インクボックス倉庫 — indoor warehouse for 2v2 and 1v1 (owner request 2026-11-06).
//
// Original INKWAVE layout. The brief: indoors, not flat, real cover, not too wide, a few
// compound objects, and no low walls that leave a body half visible — every piece of cover
// is at least 2.2 m (PLAYER height is 1.45 m), anything lower is under knee height. The
// owner pointed at the long, boxy feel of Splatoon 2's warehouse stage as a mood reference;
// no retail geometry, names or measurements are used or claimed.
//
// 26 m wide × 60 m long (Scorch Gorge is 52 × 100), sized for 1–2 players a side.
// 180° point-symmetric about the origin ((x, z) -> (-x, -z)): Alpha spawns at -Z, Bravo at +Z.
//
// Levels: floor y 0, spawn deck 2.2, loading dock 2.6 (one flank), container tops 2.6 / 5.2.
// Routes per half: centre lane past the cross container, a left lane between the container
// stack and the partition wall (under the overhead conveyor), and the right loading-dock
// high ground reached by its ramp. The middle pallet rack has walk-through outer bays and a
// stocked centre bay that breaks the long centre sightline.
import { PATTERN, B, R } from '../../../src/world/mapkit.js';

const C = {
  floor: '#cfcac0', wall: '#9aa3ab', beam: '#5d6670', roof: '#7f8891', spawn: '#e6e2d8',
  container: '#c75b4a', containerB: '#4f7fa8', containerC: '#d9a441', dock: '#bdb6aa',
  rack: '#3f4d5c', crate: '#c49a6c', fork: '#e2b53b', forkDark: '#383d44', conveyor: '#6f7a85',
  partition: '#b8bec4',
};
const wall = { color: C.wall, pattern: PATTERN.metalpanel, paint: false, roof: true, tag: 'depot-wall' };
const beam = { color: C.beam, pattern: PATTERN.metal, paint: false, roof: true, tag: 'roof-beam' };
const post = (x, z, y1, tag = 'post', s = 0.14) => B(x - s, x + s, 0, y1, z - s, z + s, { color: C.rack, pattern: PATTERN.metal, paint: false, tag });

// Forklift: chassis, counterweight, overhead guard on four posts, mast, forks and a loaded
// crate. Its top is 2.2–2.4 m and the crate on the forks is 2.25 m: full-body cover.
function forklift(cx, cz) {
  const x0 = cx - 1.1, x1 = cx + 1.1, f = { color: C.fork, pattern: PATTERN.metal, tag: 'forklift' };
  return [
    B(x0, x1, 0, 2.2, cz - 1.4, cz + 1.4, f),                                                   // chassis + cab
    B(x0, x1, 0, 2.4, cz - 1.9, cz - 1.4, { ...f, color: C.forkDark, tag: 'forklift-weight' }),
    ...[[x0 + 0.08, cz - 1.3], [x1 - 0.08, cz - 1.3], [x0 + 0.08, cz + 1.3], [x1 - 0.08, cz + 1.3]]
      .map(([x, z]) => B(x - 0.07, x + 0.07, 2.2, 3.3, z - 0.07, z + 0.07, { ...f, color: C.forkDark, paint: false, tag: 'forklift-guard-post' })),
    B(x0, x1, 3.3, 3.45, cz - 1.4, cz + 1.4, { ...f, color: C.forkDark, paint: false, roof: true, tag: 'forklift-guard' }),
    B(cx - 0.95, cx - 0.75, 0, 3.7, cz + 1.4, cz + 1.6, { ...f, color: C.forkDark, paint: false, tag: 'forklift-mast' }),
    B(cx + 0.75, cx + 0.95, 0, 3.7, cz + 1.4, cz + 1.6, { ...f, color: C.forkDark, paint: false, tag: 'forklift-mast' }),
    B(cx - 0.8, cx - 0.55, 0.05, 0.15, cz + 1.6, cz + 3.0, { ...f, color: C.forkDark, paint: false, tag: 'forklift-fork' }),
    B(cx + 0.55, cx + 0.8, 0.05, 0.15, cz + 1.6, cz + 3.0, { ...f, color: C.forkDark, paint: false, tag: 'forklift-fork' }),
    B(cx - 0.9, cx + 0.9, 0.15, 2.4, cz + 1.65, cz + 2.95, { color: C.crate, pattern: PATTERN.wood, tag: 'forklift-crate' }),
  ];
}

// Overhead conveyor on legs: 2.4 m clearance (walk and swim under it), belt frame 2.4–2.8 m
// with rollers on top. Shots pass under it; it never forms a waist-high wall.
function conveyor(x0, x1, z) {
  const out = [B(x0, x1, 2.4, 2.8, z - 0.7, z + 0.7, { color: C.conveyor, pattern: PATTERN.metalpanel, paint: false, roof: true, tag: 'conveyor-frame' })];
  for (let x = x0 + 0.4; x < x1 - 0.2; x += 2.6) { out.push(post(x, z - 0.55, 2.4, 'conveyor-leg', 0.09), post(x, z + 0.55, 2.4, 'conveyor-leg', 0.09)); }
  for (let x = x0 + 0.25; x < x1 - 0.1; x += 0.55) out.push(B(x, x + 0.18, 2.8, 2.88, z - 0.62, z + 0.62, { color: '#aab3bb', pattern: PATTERN.metal, paint: false, roof: true, tag: 'conveyor-roller' }));
  return out;
}

export const LAYOUT = {
  id: 'depot',
  bounds: { minX: -13.6, maxX: 13.6, minZ: -30.6, maxZ: 30.6 },
  spawnPads: [[0, 2.2, -27.3], [0, 2.2, 27.3]],
  homeSuperJumpPoints: [[0, 0, -18.5], [0, 0, 18.5]],
  spawnBarrier: 3.6,
  intro: { from: [7, 8.2, 12], lookFrom: [0, 2.2, 0], toBack: 2.6 },

  single: [
    // ---- floor and shell (9 m walls, roof beams and edge roof panels: an indoor hall)
    B(-13, 13, -1.2, 0, -30, 30, { color: C.floor, pattern: PATTERN.concrete, tag: 'depot-floor' }),
    B(-13.6, -13, 0, 9.2, -30.6, 30.6, wall),
    B(13, 13.6, 0, 9.2, -30.6, 30.6, wall),
    B(-13, 13, 0, 9.2, -30.6, -30, wall),
    B(-13, 13, 0, 9.2, 30, 30.6, wall),
    ...[-24, -16, -8, 0, 8, 16, 24].map(z => B(-13, 13, 8.6, 9.2, z - 0.3, z + 0.3, beam)),
    B(-6.8, -6.2, 8.6, 9.2, -30, 30, beam),
    B(6.2, 6.8, 8.6, 9.2, -30, 30, beam),
    B(-13, -8.5, 9.2, 9.6, -30, 30, { ...beam, color: C.roof, tag: 'roof-panel' }),
    B(8.5, 13, 9.2, 9.6, -30, 30, { ...beam, color: C.roof, tag: 'roof-panel' }),

    // ---- mid: pallet rack. Outer bays are open (2.6 m clearance under the shelf); the
    // stocked centre bay (2.5 m crates) blocks the straight spawn-to-spawn sightline.
    ...[-5, -1.7, 1.7, 5].flatMap(x => [post(x, -1.25, 5.1, 'rack-post'), post(x, 1.25, 5.1, 'rack-post')]),
    B(-5.15, 5.15, 2.6, 2.75, -1.4, 1.4, { color: C.rack, pattern: PATTERN.grate, grate: true, thin: true, thickness: 0.15, paint: false, tag: 'rack-shelf' }),
    B(-5.15, 5.15, 5.1, 5.25, -1.4, 1.4, { color: C.rack, pattern: PATTERN.metalpanel, paint: false, roof: true, tag: 'rack-top' }),
    B(-1.5, 1.5, 0, 2.5, -1.1, 1.1, { color: C.crate, pattern: PATTERN.wood, tag: 'rack-stock' }),
    B(-4.6, -2.1, 2.75, 4.6, -1.0, 1.0, { color: C.crate, pattern: PATTERN.wood, paint: false, tag: 'rack-stock-high' }),
    B(2.1, 4.6, 2.75, 4.2, -1.0, 1.0, { color: C.containerC, pattern: PATTERN.container, paint: false, tag: 'rack-stock-high' }),
  ],

  // Alpha's half (-Z); mirrored for Bravo.
  half: [
    // ---- spawn deck and its ramp (deck sides are open 2.2 m drops)
    B(-4.5, 4.5, 0, 2.2, -30, -24.5, { color: C.spawn, pattern: PATTERN.spawn, tag: 'spawn-deck' }),
    R([0, 0, -18.8], [0, 2.2, -24.5], 4.5, { color: C.dock, pattern: PATTERN.treads, tag: 'spawn-ramp' }),

    // ---- left flank: two-high container stack (2.6 / 5.2 m) by the base
    B(-12.4, -9.8, 0, 2.6, -22, -15.5, { color: C.container, pattern: PATTERN.container, tag: 'container-stack' }),
    B(-12.4, -9.8, 2.6, 5.2, -20.5, -15.5, { color: C.containerB, pattern: PATTERN.container, tag: 'container-stack-top' }),
    // partition wall (3.4 m) splitting the left lane from the centre
    B(-6.4, -6.0, 0, 3.4, -13.5, -7.5, { color: C.partition, pattern: PATTERN.metalpanel, tag: 'partition' }),
    // overhead conveyor across the left lane
    ...conveyor(-12.6, -6.6, -5.2),

    // ---- centre: cross container (2.6 m) with lanes either side, and the forklift
    B(-3.0, 3.0, 0, 2.6, -13.6, -11.2, { color: C.containerB, pattern: PATTERN.container, tag: 'cross-container' }),
    ...forklift(-3.4, -7.2),

    // ---- right flank: loading dock high ground (2.6 m) with its ramp from base, and a
    // tall crate stack on the dock for cover up there
    B(7.6, 13, -1.2, 2.6, -14.5, -4.0, { color: C.dock, pattern: PATTERN.concrete, tag: 'loading-dock' }),
    R([10.3, 0, -21.0], [10.3, 2.6, -14.5], 3.6, { color: C.dock, pattern: PATTERN.treads, tag: 'dock-ramp' }),
    B(10.4, 12.6, 2.6, 5.0, -10.0, -7.4, { color: C.crate, pattern: PATTERN.wood, tag: 'dock-crates' }),
    // base cover on the right (2.6 m container end-on)
    B(4.6, 7.0, 0, 2.6, -24, -20.4, { color: C.containerC, pattern: PATTERN.container, tag: 'base-container' }),
  ],

  decor: { lamps: [], palms: [], flags: [[-3.5, 2.2, -29.6], [3.5, 2.2, -29.6]] },
};
