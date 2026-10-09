// Practice Range — stage layout (the INKWAVE test lab on a pier). Plugs into the stage-module registry
// (src/world/stages/index.js, via adapter.mjs) exactly like Cargo Terminal: LAYOUT here, prop pack in props.mjs, texlib
// surfaces in surfaces.mjs, floor markings in murals.mjs. All coordinates are world metres from zones.mjs.
//
// Unlike the arena stages nothing is mirrored: everything lives in `single`, `half` is empty. Floors are slabs from
// y −1.2 to 0 that tile without overlap (no coplanar tops → no z-fighting, exact paintable areas); walls, kerbs and
// posts stand on the 1 m rubber frames between zones, never on a test floor.
import { PATTERN, B, R } from '../../../src/world/mapkit.js';
import { SURF } from './surfaces.mjs';
import {
  X, Z, ZONES, FRAME_COLOR, SPAWN_DECK, SPAWN_RAMP, SPAWN, BRAVO_PAD, LAB, NORTH_FACE_Z, GALLERY_TARGETS, GALLERY_BACKSTOP,
  SIGNS, SWIM, TEST_WALL, CLIMB_BLOCK, STEP_BLOCKS, BOMB_SLOPE, BOMB_BLOCK, DODGE_TARGET, SPECIAL_TARGETS,
} from './zones.mjs';

// Murals 4…11 (murals.mjs draws them; the id is matched against the top face, normal +Y)
export const MURAL = { lane: 4, gallery: 5, hub: 6, special: 7, bomb: 8, roller: 9, dualies: 10, squid: 11 };

const C = {
  frame: FRAME_COLOR, wall: '#e8e4dc', wallWarm: '#efe7da', trim: '#3b4456', steel: '#8f9aa6', lab: '#f2efe8', labBase: '#3b4456',
  deck: '#ebe8e1', planter: '#b9ad9a', post: '#2f3646', plinth: '#3b4456', board: '#283042', backstop: '#e4e0d8',
};
const floor = (zone, o = {}) => {
  const [x0, x1, z0, z1] = ZONES[zone].rect;
  return B(x0, x1, -1.2, 0, z0, z1, { color: ZONES[zone].floor, pattern: SURF.court, tag: 'floor:' + zone, ...o });
};
const frame = (x0, x1, z0, z1, tag = 'frame') => B(x0, x1, -1.2, 0, z0, z1, { color: C.frame, pattern: SURF.rubber, paint: false, tag });
// dividing wall on a frame: runs along x (axis 'x') or z, with openings [[a, b], …] in that axis
function wallRun(axis, c, a0, a1, h, openings = [], o = {}) {
  const out = [];
  const cuts = [...openings].sort((p, q) => p[0] - q[0]);
  let s = a0;
  for (const [o0, o1] of [...cuts, [a1, a1]]) {
    if (o0 - s > 0.05) out.push(axis === 'x' ? B(s, o0, 0, h, c - 0.3, c + 0.3, o) : B(c - 0.3, c + 0.3, 0, h, s, o0, o));
    s = Math.max(s, o1);
  }
  return out;
}
const divider = { color: C.wall, pattern: SURF.panel, tag: 'divider' };
const parapet = { color: C.trim, pattern: PATTERN.metalpanel, paint: false, roof: true, tag: 'parapet' };
// perimeter: a 1.2 m parapet (no standing on it) + an invisible rail to 2.8 m so nobody hops into the sea by accident
const rail = (x0, x1, z0, z1) => B(x0, x1, 1.2, 2.8, z0, z1, { rail: true, paint: false, tag: 'perimeter-rail', color: C.trim });

const single = [
  // ================= floors (interiors: inkable test surfaces with the world grid)
  floor('hub', { mural: [{ n: [0, 1, 0], id: MURAL.hub }] }),
  floor('lane', { mural: [{ n: [0, 1, 0], id: MURAL.lane }] }),
  // the gallery slab runs on under its backstop (z 34–35) so the backstop never stands on the bomb pit floor
  B(X.gallery[0], X.gallery[1], -1.2, 0, 0, GALLERY_BACKSTOP.z[1], { color: ZONES.gallery.floor, pattern: SURF.court, tag: 'floor:gallery', mural: [{ n: [0, 1, 0], id: MURAL.gallery }] }),
  floor('bomb', { mural: [{ n: [0, 1, 0], id: MURAL.bomb }] }),
  floor('paint'),
  floor('dualies', { mural: [{ n: [0, 1, 0], id: MURAL.dualies }] }),
  floor('special', { mural: [{ n: [0, 1, 0], id: MURAL.special }] }),
  floor('squid', { mural: [{ n: [0, 1, 0], id: MURAL.squid }] }),
  floor('roller', { mural: [{ n: [0, 1, 0], id: MURAL.roller }] }),
  floor('wall'),

  // ================= frames (dark rubber borders between zones, never inkable)
  frame(X.f1[0], X.f1[1], Z.south, NORTH_FACE_Z),
  frame(X.f2[0], X.f2[1], Z.south, NORTH_FACE_Z),
  frame(X.west, X.rightIn[0], Z.south, NORTH_FACE_Z),
  frame(X.leftIn[1], X.east, Z.south, NORTH_FACE_Z),
  frame(X.rightIn[0], X.rightIn[1], Z.south, Z.hub[0]),
  frame(X.leftIn[0], X.leftIn[1], Z.south, Z.hub[0]),
  frame(X.rightIn[0], X.rightIn[1], 0, 1),
  frame(X.rightIn[0], X.rightIn[1], 33, 34),
  frame(X.leftIn[0], X.leftIn[1], 0, 1),
  frame(X.leftIn[0], X.leftIn[1], 21, 22),
  frame(X.west, X.east, Z.northWall[0], Z.northWall[1], 'frame:north'),
  B(LAB.x[0], LAB.x[1], -1.2, 0, LAB.z[0], LAB.z[1], { color: C.labBase, pattern: SURF.rubber, paint: false, tag: 'lab-plinth' }),

  // ================= perimeter
  B(X.west, X.west + 0.6, 0, 1.2, Z.south, Z.northWall[1], parapet),
  B(X.east - 0.6, X.east, 0, 1.2, Z.south, Z.northWall[1], parapet),
  B(X.west + 0.6, X.f1[1], 0, 1.2, Z.south, Z.south + 0.6, parapet),
  B(X.f2[0], X.east - 0.6, 0, 1.2, Z.south, Z.south + 0.6, parapet),
  rail(X.west, X.west + 0.6, Z.south, Z.northWall[1]),
  rail(X.east - 0.6, X.east, Z.south, Z.northWall[1]),
  rail(X.west + 0.6, X.f1[1], Z.south, Z.south + 0.6),
  rail(X.f2[0], X.east - 0.6, Z.south, Z.south + 0.6),

  // north wall: one continuous structure, its height steps per zone (inner face z = 50 is the measuring origin of the
  // Wall Lab and the lane's backstop). Inkable on the inner face; its top is off-limits.
  B(X.west + 0.6, X.f1[1], 0, TEST_WALL.h, NORTH_FACE_Z, Z.northWall[1], { color: C.wallWarm, pattern: SURF.panel, roof: true, tag: 'test-wall', noPaint: [[0, 0, 1]] }),
  B(X.f1[1], X.lane[0], 0, 4, NORTH_FACE_Z, Z.northWall[1], { color: C.wall, pattern: SURF.panel, roof: true, tag: 'bomb-wall', noPaint: [[0, 0, 1]] }),
  B(X.lane[0], X.lane[1], 0, 5, NORTH_FACE_Z, Z.northWall[1], { color: C.backstop, pattern: SURF.panel, roof: true, tag: 'lane-backstop', noPaint: [[0, 0, 1]] }),
  B(X.lane[1], X.east - 0.6, 0, 3.5, NORTH_FACE_Z, Z.northWall[1], { color: C.wall, pattern: SURF.panel, roof: true, tag: 'special-wall', noPaint: [[0, 0, 1]] }),

  // ================= dividers (1 m walls on the frames; openings where the walkways cross)
  // F1 (right column | hub, gallery, bomb pit)
  ...wallRun('z', -16.5, Z.hub[0], 0, 1.0, [[-9.5, -4.5]], divider),
  ...wallRun('z', -16.5, 0, 34, 1.0, [[1, 5]], divider),
  ...wallRun('z', -16.5, 34, NORTH_FACE_Z, 2.0, [[35, 38]], divider),
  // F2 (lane | paint floor, dodge pad, special arena) — the lane side stays low so lane shots read against the sky
  ...wallRun('z', 12.5, Z.hub[0], 0, 1.0, [[-14, -8]], divider),
  ...wallRun('z', 12.5, 0, 22, 1.0, [[1.2, 4.8]], divider),
  ...wallRun('z', 12.5, 22, NORTH_FACE_Z, 1.2, [[22.6, 27]], divider),
  // row dividers inside the side columns
  ...wallRun('x', 0.5, X.rightIn[0], X.rightIn[1], 1.0, [[-23, -17.6]], divider),           // swim course | roller court
  ...wallRun('x', 33.5, X.rightIn[0], X.rightIn[1], 1.0, [[-24, -19]], divider),           // roller court | wall lab
  ...wallRun('x', 0.5, X.leftIn[0], X.leftIn[1], 1.0, [[20, 26]], divider),                // paint floor | dodge pad
  ...wallRun('x', 21.5, X.leftIn[0], X.leftIn[1], 1.0, [[20, 26]], divider),               // dodge pad | special arena

  // ================= hub: the lab building, the spawn deck and its ramp
  // the lab building: a long low block, a taller stair tower at its east end, a glazing band, a roof cornice
  B(LAB.x[0], LAB.x[1] - 6, 0, LAB.h, LAB.z[0], LAB.z[1], { color: C.lab, pattern: PATTERN.metalpanel, paint: false, roof: true, tag: 'lab' }),
  B(LAB.x[1] - 6, LAB.x[1], 0, LAB.h + 3.4, LAB.z[0], LAB.z[1], { color: '#35405a', pattern: PATTERN.metalpanel, paint: false, roof: true, tag: 'lab-tower' }),
  B(LAB.x[0] - 0.2, LAB.x[1] - 6, LAB.h, LAB.h + 0.35, LAB.z[0] - 0.2, LAB.z[1] + 0.2, { color: C.trim, pattern: PATTERN.metal, paint: false, roof: true, tag: 'lab-cornice' }),
  B(LAB.x[0] + 0.6, LAB.x[1] - 6.6, 1.3, 3.1, LAB.z[1], LAB.z[1] + 0.06, { color: '#22304a', pattern: PATTERN.glasstile, paint: false, tag: 'lab-glazing' }),
  B(SPAWN_DECK.x[0], SPAWN_DECK.x[1], 0, SPAWN_DECK.h, SPAWN_DECK.z[0], SPAWN_DECK.z[1], { color: C.deck, pattern: PATTERN.spawn, tag: 'spawn-deck', noPaint: [[1, 0, 0], [-1, 0, 0]] }),
  R([SPAWN_RAMP.x, 0, SPAWN_RAMP.zLow], [SPAWN_RAMP.x, SPAWN_DECK.h, SPAWN_RAMP.zHigh], SPAWN_RAMP.w, { color: '#cfd5da', pattern: PATTERN.hazard, tag: 'spawn-ramp' }),

  // ================= B: target gallery — backstop, the 1.2 m plinth plates under each target (not inkable, 2 cm)
  B(X.gallery[0], X.gallery[1], 0, GALLERY_BACKSTOP.h, GALLERY_BACKSTOP.z[0], GALLERY_BACKSTOP.z[1], { color: C.backstop, pattern: SURF.panel, roof: true, tag: 'gallery-backstop' }),
  ...GALLERY_TARGETS.map((t) => B(t.x - 0.6, t.x + 0.6, 0, 0.02, t.z - 0.6, t.z + 0.6, { color: C.plinth, pattern: SURF.rubber, paint: false, tag: 'plinth', bevel: 0.006 })),
  B(DODGE_TARGET.x - 0.6, DODGE_TARGET.x + 0.6, 0, 0.02, DODGE_TARGET.z - 0.6, DODGE_TARGET.z + 0.6, { color: C.plinth, pattern: SURF.rubber, paint: false, tag: 'plinth', bevel: 0.006 }),
  ...SPECIAL_TARGETS.map((t) => B(t.x - 0.6, t.x + 0.6, 0, 0.02, t.z - 0.6, t.z + 0.6, { color: C.plinth, pattern: SURF.rubber, paint: false, tag: 'plinth', bevel: 0.006 })),
  // every board, pylon and sign panel (zones.mjs SIGNS): solid, never inkable; the artwork is session signage
  ...SIGNS.map((sg) => B(sg.box[0], sg.box[1], sg.box[2], sg.box[3], sg.box[4], sg.box[5], {
    color: sg.post ? C.post : sg.gauge ? '#f4f1ea' : C.board, pattern: sg.post ? PATTERN.metal : PATTERN.plain, paint: false,
    tag: sg.post ? 'sign-post' : 'sign', bevel: sg.post ? undefined : 0.02, ...(sg.tower ? { bevel: 0.05 } : {}) })),

  // ================= F: swim course — planted island (south nose 10 cm lower), ramps + plateau, chicane kerbs
  B(SWIM.island.x[0], SWIM.island.x[1], 0, SWIM.island.h, SWIM.island.z[0], SWIM.island.z[1], { color: C.planter, pattern: PATTERN.planter, paint: false, tag: 'swim-island' }),
  R([-33, 0, SWIM.rampGentle.zLow], [-33, SWIM.rampGentle.h, SWIM.rampGentle.zHigh], 6, { color: '#cfe0e3', pattern: SURF.court, tag: 'swim-ramp-gentle' }),
  B(-36, -30, 0, SWIM.plateau.h, SWIM.plateau.z[0], SWIM.plateau.z[1], { color: '#cfe0e3', pattern: SURF.court, tag: 'swim-plateau' }),
  R([-33, 0, SWIM.rampSteep.zLow], [-33, SWIM.rampSteep.h, SWIM.rampSteep.zHigh], 6, { color: '#cfe0e3', pattern: SURF.court, tag: 'swim-ramp-steep' }),
  // chicane: a kerb from the island's north end toward the straight leaves a 1.8 m gap, a second kerb closes the
  // outside so the line must snake (narrow turn); the south end is the wide turn around the island's nose
  ...SWIM.kerbs.map((k) => B(k.x[0], k.x[1], 0, 0.5, k.z[0], k.z[1], { color: C.planter, pattern: PATTERN.planter, paint: false, tag: 'swim-kerb' })),

  // ================= G: wall lab — climb block (inkable faces, standable top) + 1 m / 2 m step blocks
  B(CLIMB_BLOCK.x[0], CLIMB_BLOCK.x[1], 0, CLIMB_BLOCK.h, CLIMB_BLOCK.z[0], CLIMB_BLOCK.z[1], { color: '#e9d2c2', pattern: SURF.panel, tag: 'climb-block' }),
  ...STEP_BLOCKS.map((s) => B(s.x[0], s.x[1], 0, s.h, s.z[0], s.z[1], { color: '#e9d2c2', pattern: SURF.panel, tag: 'step-block' })),

  // ================= H: bomb pit — 30° bank wedge on the lane side, a bounce block
  R([(BOMB_SLOPE.x[0] + BOMB_SLOPE.x[1]) / 2, 0, BOMB_SLOPE.zLow], [(BOMB_SLOPE.x[0] + BOMB_SLOPE.x[1]) / 2, BOMB_SLOPE.h, BOMB_SLOPE.zLow + BOMB_SLOPE.h / Math.tan(Math.PI / 6)], BOMB_SLOPE.x[1] - BOMB_SLOPE.x[0], { color: '#e3d6a8', pattern: SURF.court, tag: 'bomb-slope' }),
  B(BOMB_BLOCK.x[0], BOMB_BLOCK.x[1], 0, BOMB_BLOCK.h, BOMB_BLOCK.z[0], BOMB_BLOCK.z[1], { color: '#e3d6a8', pattern: SURF.panel, tag: 'bomb-block' }),
];

// bounds: the facility's AABB + 1 m
const bounds = { minX: X.west - 1, maxX: X.east + 1, minZ: LAB.z[0] - 1, maxZ: Z.northWall[1] + 1 };

export const LAYOUT = {
  id: 'range',
  envBoats: false,
  bounds,
  spawnPads: [SPAWN, BRAVO_PAD],
  spawnBarrier: 4.2,
  // (no intro flight: the range skips straight to play — runtime/session.mjs)
  intro: { from: [-30, 26, 60], lookFrom: [0, 2, 20], toBack: 3.0 },
  art: { from: [44, 30, -40], look: [-6, 0, 18], fov: 55 },
  single,
  half: [],
  decor: { lamps: [], palms: [], flags: [] },
};
