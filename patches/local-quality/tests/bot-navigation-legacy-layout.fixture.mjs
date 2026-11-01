// Historical dry-trench regression geometry, retained after the MAP3 replacement.
// Exact Kelpline layout from maps.js at 0582bb1ee6ac03dfb54e292ea839d18463e33fcc.
// The y=-2 dry trench specifically exercises the former sea-height heuristic;
// MAP3 has no dry floor below the sea-death height. This is not a public map.
import { B, R, PATTERN } from '../../../inkwave-public/src/world/mapkit.js';

const K = {
  asphalt: '#9da3a9', concrete: '#ddd6c8', deck: '#b9c5d0', steel: '#5f7592', teal: '#5f9ea0', rust: '#c47a5e',
  navy: '#58668e', mustard: '#d6ae52', cream: '#e8dfcf', spawn: '#e9e6df', wood: '#c29a72', trench: '#8f969c', planter: '#b9ad9a',
  pavers: '#d6c7ad',
};
export const LEGACY_KELPLINE_TRENCH = {
  id: 'kelpline',
  bounds: { minX: -24, maxX: 24, minZ: -48, maxZ: 48 },
  spawnPads: [[0, 3.2, -44], [0, 3.2, 44]],
  homeSuperJumpPoints: [[0, 0, -38.5], [0, 0, 38.5]],
  spawnBarrier: 4.2,
  single: [
    // sunken service trench across the middle
    B(-24, 24, -3.0, -2.0, -3, 3, { color: K.trench, pattern: PATTERN.concrete }),
    // central gantry deck on four pillars (steel sides can't be inked → climb the front/back)
    B(-7, 7, 2.0, 2.8, -7, 7, { color: K.deck, pattern: PATTERN.metalpanel, noPaint: [[1, 0, 0], [-1, 0, 0]] }),
    B(-1.6, 1.6, 2.8, 4.4, -1.6, 1.6, { color: K.steel, pattern: PATTERN.metalpanel }),
  ],
  half: [
    // ground (the two halves either side of the trench)
    B(-24, 24, -1.2, 0, -48, -3, { color: K.asphalt, pattern: PATTERN.asphalt }),
    // trench retaining wall below the deck slab (closes the gap down to the trench floor)
    B(-24, 24, -3.0, -1.2, -3.8, -3, { color: K.asphalt, pattern: PATTERN.asphalt }),
    // pillars under the gantry
    B(5.4, 6.6, 0, 2.0, 5.4, 6.6, { color: K.steel, pattern: PATTERN.metalpanel }),
    B(-6.6, -5.4, 0, 2.0, 5.4, 6.6, { color: K.steel, pattern: PATTERN.metalpanel }),
    // grate bridges over the trench (flanks)
    B(12, 16, -0.15, 0, -3, 3, { color: K.steel, pattern: PATTERN.grate, grate: true }),
    // ramp out of the trench on your own side
    R([-9, -2.0, 2.2], [-9, 0, -3], 3, { color: K.concrete, pattern: PATTERN.hazard }),
    // sea railings (+ trench ends)
    B(-24, -23.4, 0, 1.05, -47.4, -3, { color: K.steel, pattern: PATTERN.metal }),
    B(-24, -23.4, 0, 1.05, 3, 47.4, { color: K.steel, pattern: PATTERN.metal }),
    B(-24, -23.4, -2.0, 0.2, -3, 3, { color: K.steel, pattern: PATTERN.metal }),
    // back wall
    B(-24, 24, 0, 4.2, -48, -47.4, { color: K.cream, pattern: PATTERN.concrete, mural: [{ n: [0, 0, 1], id: 0 }] }),

    // ---- spawn deck (front drop + two side ramps)
    B(-10, 10, 0, 3.2, -47.4, -40, { color: K.spawn, pattern: PATTERN.spawn }),
    R([-18, 0, -43.4], [-10, 3.2, -43.4], 4, { color: K.concrete, pattern: PATTERN.hazard }),
    R([18, 0, -43.4], [10, 3.2, -43.4], 4, { color: K.concrete, pattern: PATTERN.hazard }),
    B(-10, -7, 3.2, 4.0, -40.6, -40, { color: K.cream, pattern: PATTERN.concrete }),
    B(7, 10, 3.2, 4.0, -40.6, -40, { color: K.cream, pattern: PATTERN.concrete }),

    // ---- base yard
    B(-20, -17.6, 0, 2.6, -36, -30, { color: K.teal, pattern: PATTERN.container, mural: [{ n: [1, 0, 0], id: 3 }, { n: [-1, 0, 0], id: 3 }] }),
    B(12, 18.1, 0, 2.6, -33, -30.56, { color: K.rust, pattern: PATTERN.container, mural: [{ n: [0, 0, 1], id: 3 }] }),
    B(12.6, 18.7, 2.6, 5.2, -33, -30.56, { color: K.navy, pattern: PATTERN.container, mural: [{ n: [0, 0, 1], id: 3 }] }),
    B(-4, -2.6, 0, 1.4, -32, -30.6, { color: K.wood, pattern: PATTERN.wood }),
    B(2.6, 4, 0, 1.4, -29, -27.6, { color: K.wood, pattern: PATTERN.wood }),
    B(2.6, 4, 1.4, 2.8, -29, -27.6, { color: K.wood, pattern: PATTERN.wood }),

    // ---- left raised side deck + grate catwalk into the central ramp
    B(-24, -15, 0, 2.0, -22, -8.6, { color: K.pavers, pattern: PATTERN.pavers }),
    R([-19.5, 0, -29], [-19.5, 2.0, -22], 4, { color: K.concrete, pattern: PATTERN.hazard }),
    B(-24, -23.6, 2.0, 2.95, -22, -8.6, { color: K.steel, pattern: PATTERN.metal }),
    B(-15, -6, 1.85, 2.0, -10.6, -8.6, { color: K.steel, pattern: PATTERN.grate, grate: true }),
    B(-18.6, -17.2, 2.0, 3.2, -16, -14.6, { color: K.wood, pattern: PATTERN.wood }),

    // ---- mid-base cover
    B(-11, -6, 0, 1.0, -20, -19.4, { color: K.concrete, pattern: PATTERN.concrete }),
    B(4, 9, 0, 1.0, -13.6, -13, { color: K.concrete, pattern: PATTERN.concrete }),
    B(-3, 1, 0, 0.8, -23, -20.5, { color: K.planter, pattern: PATTERN.planter, tag: 'planter' }),
    B(15, 21.1, 0, 2.6, -20, -17.56, { color: K.mustard, pattern: PATTERN.container, mural: [{ n: [0, 0, 1], id: 3 }, { n: [0, 0, -1], id: 3 }] }),
    B(9, 11.44, 0, 2.6, -26, -19.9, { color: K.teal, pattern: PATTERN.container, mural: [{ n: [-1, 0, 0], id: 3 }] }),
    B(16, 19, 0, 2.2, -9, -8, { color: K.cream, pattern: PATTERN.concrete, mural: [{ n: [0, 0, 1], id: 1 }, { n: [0, 0, -1], id: 1 }] }),
    B(-14, -12.8, 0, 1.4, -8, -6.8, { color: K.wood, pattern: PATTERN.wood }),

    // ---- central ramp up to the gantry deck
    R([-4, 0, -16], [-4, 2.8, -7], 4, { color: K.concrete, pattern: PATTERN.hazard }),
  ],
  decor: {
    lamps: [[-23, -40], [-23, -25], [23, -12], [-8.5, -46.5], [8.5, -46.5]],
    palms: [[-1, -21.75]],
    flags: [[-9.2, 3.2, -46.6], [9.2, 3.2, -46.6]],
  },
};

