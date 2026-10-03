// Practice Range — the one source of truth for where everything is. Pure data (no three.js, no DOM): the layout,
// floor markings, signage, session (dummies, pads, travel) and the tests all read these numbers.
//
// WORLD SCALE. INKWAVE's world unit is the metre: src/config.js PLAYER is declared "meters, seconds" (runSpeed 6.0 m/s,
// player height 1.45, radius 0.38) and every stage is laid out in the same units (Tidewater is 50 × 88). Every distance
// mark in the range is therefore a WORLD COORDINATE, not a drawing: 1 m on a sign = 1.000 world unit. The relation of
// INKWAVE metres to Splatoon 3's internal distance units is NOT established (patches/splatoon3/profile.json
// calibration.distanceScale: factor 1, status "inferred") — the range measures INKWAVE, it does not certify parity.
//
// AXES. Facing north (+Z) from the spawn deck, +X is to the player's LEFT and −X to the RIGHT (three.js: a camera
// looking down +Z has −X on screen-right). Floor top is y = 0 everywhere except where noted.
//
// THE MEASURING CONVENTION (identical in the Long Lane and the Target Gallery):
//   z = 0 is the FIRING LINE. Every number painted, posted or shown on the HUD in those two zones is the world z
//   coordinate = metres downrange of the firing line. The measuring grid in every zone is world-aligned: thin lines on
//   every whole metre of x and z, bold lines on every multiple of 5 (levelMaterial branch, see adapter.mjs).
//   Wall zone: the test wall's face is at z = WALL_FACE_Z = 50, so the bold floor lines there are 5 / 10 / 15 m from it.
//   Wall height lines are world y: every 0.5 m, bold every metre (floor y = 0).

export const FIRE_Z = 0;               // firing line (Long Lane + Target Gallery)
export const NORTH_FACE_Z = 50;        // inner face of the north wall (lane backstop / test wall / bomb + special back wall)
export const WALL_FACE_Z = NORTH_FACE_Z;
export const GRID_MINOR = 1, GRID_MAJOR = 5;   // metres (world-aligned)

// ---- column / row edges (frames are 1 m dark rubber borders that carry the dividing walls; never inkable)
export const X = {
  west: -37,                 // outer west edge of the frame
  rightIn: [-36, -17],       // right column interior (squid course / roller court / wall zone)
  f1: [-17, -16],            // frame between the right column and the gallery
  gallery: [-16, 0],
  spine: 0,                  // distance-board posts between gallery and lane (no wall: the two share the firing line)
  lane: [0, 12],
  f2: [12, 13],              // frame between the lane and the left column
  leftIn: [13, 33],          // left column interior (paint floor / dualies / special arena)
  east: 34,                  // outer east edge of the frame
};
export const Z = {
  south: -21,                // outer south edge (frame) — the lab building stands behind the hub
  hub: [-20, 0],
  north: NORTH_FACE_Z,
  northWall: [NORTH_FACE_Z, NORTH_FACE_Z + 1],
};

// ---- zones (interior floor rectangles: x0, x1, z0, z1). `letter` is the signage code, `accent` the zone colour.
export const ZONES = {
  hub:     { letter: '',  name: 'Hub',            ja: 'ハブ',             rect: [-16, 12, -20, 0],  floor: '#e7e2d6', accent: '#35405a' },
  lane:    { letter: 'A', name: 'Long Lane',      ja: 'ロングレーン',       rect: [0, 12, 0, 50],    floor: '#dde4e8', accent: '#3f6f9a' },
  gallery: { letter: 'B', name: 'Target Gallery', ja: 'ターゲットギャラリー', rect: [-16, 0, 0, 34],   floor: '#ebe0cb', accent: '#b5523f' },
  paint:   { letter: 'C', name: 'Paint Test',     ja: '塗りテスト',         rect: [13, 33, -20, 0],  floor: '#f3f2ee', accent: '#2f8f86' },
  roller:  { letter: 'D', name: 'Roller Court',   ja: 'ローラーコート',     rect: [-36, -17, 1, 33], floor: '#e3ddef', accent: '#6e5fb6' },
  dualies: { letter: 'E', name: 'Dodge Pad',      ja: 'スライドパッド',     rect: [13, 33, 1, 21],   floor: '#d9ece4', accent: '#3d8a63' },
  squid:   { letter: 'F', name: 'Swim Course',    ja: 'スイムコース',       rect: [-36, -17, -20, 0], floor: '#d4e6e9', accent: '#2c7f91' },
  wall:    { letter: 'G', name: 'Wall Lab',       ja: 'カベラボ',           rect: [-36, -17, 34, 50], floor: '#eee0d4', accent: '#b8693c' },
  bomb:    { letter: 'H', name: 'Bomb Pit',       ja: 'ボムピット',         rect: [-16, 0, 35, 50],  floor: '#ece3c4', accent: '#a9822a' },
  special: { letter: 'I', name: 'Special Arena',  ja: 'スペシャルアリーナ', rect: [13, 33, 22, 50],  floor: '#f0dcd8', accent: '#b54b62' },
};
export const FRAME_COLOR = '#4a5263';
export const ZONE_ORDER = ['lane', 'gallery', 'paint', 'roller', 'dualies', 'squid', 'wall', 'bomb', 'special'];

// ---- spawn + hub
export const SPAWN_DECK = { x: [-6, 6], z: [-20, -15], h: 1.0 };            // raised 1 m: the first view looks down the lanes
export const SPAWN_RAMP = { x: 0, zLow: -11, zHigh: -15, w: 6 };              // ramp down to the hub floor (14°)
export const SPAWN = [0, SPAWN_DECK.h, -17.6];                                 // team Alpha pad (you)
// Team Bravo's pad exists only because the engine needs two: it is parked 30 m below the sea, 160 m out — never
// reachable, never on screen, its spawn barrier never touches the range (barrier only acts above pad.y − 1).
export const BRAVO_PAD = [0, -40, 210];
export const LAB = { x: [-16, 12], z: [-26, -20], h: 7.2 };                   // the lab building behind the spawn deck

// weapon carousel (stand on a pad to switch): 7 pads on a ring around the WEAPONS tower
export const CAROUSEL = { center: [-8.5, -9], r: 3.6, pad: 0.95 };
// training console pads (hub, right of the ramp as you face the lanes)
export const CONSOLE = [
  { id: 'resetPaint',  pos: [5.6, -11.6], color: '#2f8f86' },
  { id: 'resetDummies', pos: [9.0, -11.6], color: '#b5523f' },
  { id: 'inkCourse',   pos: [5.6, -8.2], color: '#2c7f91' },
  { id: 'resupply',    pos: [9.0, -8.2], color: '#a9822a' },
];
export const PAD_R = 0.95;            // action-pad radius (m); standing inside for PAD_DWELL seconds triggers it
export const PAD_DWELL = 0.55;
// extra resupply pads where the resources run out fastest
export const RESUPPLY_PADS = [[-2.2, 37.2], [15.2, 24.2], [15.2, 3.2]];

// ---- A: Long Lane — marks every metre (grid), boards every 5 m from 5 to 50
export const LANE_BOARDS = Array.from({ length: 10 }, (_, i) => (i + 1) * 5);   // 5 … 50 m
export const LANE_STAND = [6, FIRE_Z];                                           // reference stand on the firing line

// ---- B: Target Gallery — one dummy per column so none hides another from its own stand mark on the firing line.
// x = column centre (2.6 m apart), z = distance downrange of the firing line (= the number on its plinth).
export const GALLERY_TARGETS = [
  { x: -14.6, z: 5 }, { x: -12.0, z: 10 }, { x: -9.4, z: 15 }, { x: -6.8, z: 20 }, { x: -4.2, z: 25 }, { x: -1.6, z: 30 },
];
export const GALLERY_BACKSTOP = { z: [34, 35], h: 3.2 };

// ---- C: Paint Test — the inkable test floor is exactly this rectangle (nothing stands on it): 20 × 20 = 400 m²
export const PAINT_FLOOR = { x: [13, 33], z: [-20, 0] };
export const PAINT_STAND = [23, -19];

// ---- D: Roller Court — 25 m roll strip (start line z = 5) + an open court with a painted S-bend
export const ROLL_STRIP = { x: [-21.5, -17.5], z: [5, 30] };
export const ROLL_STAND = [-19.5, 5];
export const FLICK_STAND = [-29, 5];                            // flick distance = z − 5 (bold lines at 10, 15, 20 …)

// ---- E: Dodge Pad (dualies) — stand mark, a fixed target 8 m ahead, a rail target crossing 12 m ahead
export const DODGE_STAND = [23, 6];
export const DODGE_TARGET = { x: 23, z: 14 };
export const DODGE_RAIL = { z: 18, x: [16, 30] };               // the rail target's span (14 m)

// ---- F: Swim Course — loop around a planted island: 20 m speed straight (east), gentle + steep ramps (west),
// a wide turn (south) and a narrow chicane (north)
export const SWIM = {
  get chicane() { return { gap: Math.round((this.kerbs[1].x[0] - this.kerbs[0].x[1]) * 100) / 100 }; },
  island: { x: [-30, -23], z: [-15, -5.5], h: 0.8 },
  straight: { x: [-23, -17], z: [-20, 0] },                     // timing gates every 5 m: z = −20, −15, −10, −5, 0
  rampGentle: { x: [-36, -31], zLow: -14, zHigh: -7, h: 1.2 },  // 1.2 m over 7 m  → 9.7°
  plateau: { x: [-36, -31], z: [-7, -4.6], h: 1.2 },
  rampSteep: { x: [-36, -31], zHigh: -4.6, zLow: -2.5, h: 1.2 }, // 1.2 m over 2.1 m → 29.7°
  // chicane kerbs (0.5 m, not inkable): the narrow turn is the gap between them
  kerbs: [{ x: [-29, -24.6], z: [-5.5, -2.4] }, { x: [-22.8, -21.2], z: [-1.8, 0] }],
  stand: [-20, -19],
};

// ---- G: Wall Lab — 6 m paint-height wall (north face z = 50), a 3 m climb block with a walkable top, step blocks
export const TEST_WALL = { x: [-36, -17], h: 6 };
export const CLIMB_BLOCK = { x: [-36, -31], z: [44, 50], h: 3 };
export const STEP_BLOCKS = [{ x: [-22, -20], z: [48, 50], h: 1 }, { x: [-20, -18], z: [48, 50], h: 2 }];
export const WALL_STANDS = [2, 5, 10].map((d) => [-26.5, WALL_FACE_Z - d]);   // reference stands 2 / 5 / 10 m off the wall

// ---- H: Bomb Pit — radius rings (every metre) around the target spot, a slope, a bounce block, a corner
export const BOMB_TARGET = [-8, 43];
export const BOMB_RINGS = [1, 2, 3, 4, 5, 6];
export const BOMB_STAND = [-8, 36];                             // 7 m short of the target spot
export const BOMB_SLOPE = { x: [-3, 0], zLow: 40, zHigh: 46, h: 1.6 };   // 30° wedge along the lane side (bank shots)
export const BOMB_BLOCK = { x: [-15.4, -13.4], z: [45, 47], h: 1.2 };     // bounce block

// ---- I: Special Arena — rings every 2 m to 10 m around the centre, endurance targets on fixed radii
export const SPECIAL_CENTER = [23, 36];
export const SPECIAL_RINGS = [2, 4, 6, 8, 10];
export const SPECIAL_TARGETS = [
  { x: 23, z: 39, r: 3 },        // 3 m north of the centre
  { x: 28, z: 36, r: 5 },        // 5 m east (screen-left)
  { x: 23 - 8 * Math.SQRT1_2, z: 36 - 8 * Math.SQRT1_2, r: 8 },   // 8 m south-west
];
export const SPECIAL_STAND = [23, 36];

// ---- travel points (pause menu + their floor marks): exact stand position + facing (yaw 0 = north, +Z)
const yawTo = (from, to) => Math.atan2(to[0] - from[0], to[1] - from[1]);
export const TRAVEL = [
  { id: 'spawn', zone: 'hub', pos: SPAWN, yaw: 0 },
  { id: 'lane', zone: 'lane', pos: [LANE_STAND[0], 0, LANE_STAND[1]], yaw: 0 },
  { id: 'gallery', zone: 'gallery', pos: [-6.8, 0, FIRE_Z], yaw: 0 },
  { id: 'paint', zone: 'paint', pos: [PAINT_STAND[0], 0, PAINT_STAND[1]], yaw: 0 },
  { id: 'roller', zone: 'roller', pos: [ROLL_STAND[0], 0, ROLL_STAND[1]], yaw: 0 },
  { id: 'dualies', zone: 'dualies', pos: [DODGE_STAND[0], 0, DODGE_STAND[1]], yaw: 0 },
  { id: 'squid', zone: 'squid', pos: [SWIM.stand[0], 0, SWIM.stand[1]], yaw: 0 },
  { id: 'wall', zone: 'wall', pos: [WALL_STANDS[1][0], 0, WALL_STANDS[1][1]], yaw: 0 },
  { id: 'bomb', zone: 'bomb', pos: [BOMB_STAND[0], 0, BOMB_STAND[1]], yaw: yawTo(BOMB_STAND, BOMB_TARGET) },
  { id: 'special', zone: 'special', pos: [SPECIAL_STAND[0], 0, SPECIAL_STAND[1] - 9], yaw: 0 },
];

export function zoneAt(x, z) {
  for (const [id, zn] of Object.entries(ZONES)) {
    const [x0, x1, z0, z1] = zn.rect;
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return id;
  }
  return null;
}

// ---- SIGNS: every board / pylon / sign panel in the range. layout.mjs turns `box` into a solid, never-inkable block
// (shots stop on a board like on any wall); runtime/signage.mjs puts the artwork on the listed faces, 3 mm proud.
// face n: '+x' '-x' '+z' '-z' (the side the artwork faces). art: what is drawn (signage.mjs ART).
const board = (x0, x1, y0, y1, z0, z1, faces, extra = {}) => ({ box: [x0, x1, y0, y1, z0, z1], faces, ...extra });
const pylon = (x, z, faces, art, h = 3.4) => [
  { box: [x - 0.12, x + 0.12, 0, h - 0.6, z - 0.12, z + 0.12], faces: [], post: true },
  board(x - (faces.some((f) => f.endsWith('z')) ? 0.85 : 0.06), x + (faces.some((f) => f.endsWith('z')) ? 0.85 : 0.06), h - 1.1, h, z - (faces.some((f) => f.endsWith('x')) ? 0.85 : 0.06), z + (faces.some((f) => f.endsWith('x')) ? 0.85 : 0.06), faces.map((n) => ({ n, art }))),
];
export const SIGNS = [
  // A/B distance boards: the spine (both faces), the lane's outer edge (facing the lane), the gallery's (facing the gallery)
  ...LANE_BOARDS.filter((z) => z < NORTH_FACE_Z).flatMap((z) => [
    { box: [-0.08, 0.08, 0, 1.5, z - 0.08, z + 0.08], faces: [], post: true },
    board(-0.05, 0.05, 1.45, 2.25, z - 0.62, z + 0.62, [{ n: '+x', art: { kind: 'dist', value: z, zone: 'lane' } }, { n: '-x', art: { kind: 'dist', value: z, zone: 'gallery' } }]),
    { box: [12.42, 12.58, 0, 1.5, z - 0.08, z + 0.08], faces: [], post: true },
    board(12.2, 12.3, 1.45, 2.25, z - 0.62, z + 0.62, [{ n: '-x', art: { kind: 'dist', value: z, zone: 'lane' } }]),
  ]),
  ...LANE_BOARDS.filter((z) => z < GALLERY_BACKSTOP.z[0]).flatMap((z) => [
    { box: [-16.58, -16.42, 0, 1.5, z - 0.08, z + 0.08], faces: [], post: true },
    board(-16.3, -16.2, 1.45, 2.25, z - 0.62, z + 0.62, [{ n: '+x', art: { kind: 'dist', value: z, zone: 'gallery' } }]),
  ]),
  // the firing-line gantry (props.mjs range_gantry, beam 4.5–5.2 m): lane headers + the zero plate hang under it
  board(2.4, 9.6, 3.55, 4.4, -0.68, -0.56, [{ n: '-z', art: { kind: 'head', zone: 'lane' } }, { n: '+z', art: { kind: 'head', zone: 'lane' } }]),
  board(-12.2, -3.8, 3.55, 4.4, -0.68, -0.56, [{ n: '-z', art: { kind: 'head', zone: 'gallery' } }, { n: '+z', art: { kind: 'head', zone: 'gallery' } }]),
  board(-1.3, 1.3, 3.55, 4.4, -0.68, -0.56, [{ n: '-z', art: { kind: 'zero' } }]),
  // the lane backstop: 50 m + the zone name, high on its face
  board(2.2, 9.8, 3.0, 4.6, NORTH_FACE_Z - 0.08, NORTH_FACE_Z, [{ n: '-z', art: { kind: 'head', zone: 'lane', value: 50 } }]),
  board(-12.5, -3.5, 2.05, 3.05, GALLERY_BACKSTOP.z[0] - 0.08, GALLERY_BACKSTOP.z[0], [{ n: '-z', art: { kind: 'head', zone: 'gallery' } }]),
  // zone pylons at the entrances
  ...pylon(11.6, -0.9, ['-z'], { kind: 'zone', zone: 'lane' }),
  ...pylon(-15.4, -0.9, ['-z'], { kind: 'zone', zone: 'gallery' }),
  ...pylon(-16.5, 5.7, ['+x', '-x'], { kind: 'zone', zone: 'roller' }),
  ...pylon(12.5, 5.5, ['+x', '-x'], { kind: 'zone', zone: 'dualies' }),
  ...pylon(-16.5, 38.7, ['+x', '-x'], { kind: 'zone', zone: 'wall' }),
  ...pylon(-0.7, 36.2, ['+x'], { kind: 'zone', zone: 'bomb' }),
  ...pylon(12.5, 27.7, ['+x', '-x'], { kind: 'zone', zone: 'special' }),
  // hanging signs under the two hub gantries (paint test, swim course)
  board(12.36, 12.46, 2.95, 3.6, -13.6, -8.4, [{ n: '-x', art: { kind: 'band', zone: 'paint' } }, { n: '+x', art: { kind: 'band', zone: 'paint' } }]),
  board(-16.46, -16.36, 2.95, 3.6, -9.1, -4.9, [{ n: '+x', art: { kind: 'band', zone: 'squid' } }, { n: '-x', art: { kind: 'band', zone: 'squid' } }]),
  // hub: the weapons tower (4 faces) and the control kiosk header
  board(CAROUSEL.center[0] - 0.42, CAROUSEL.center[0] + 0.42, 0, 2.9, CAROUSEL.center[1] - 0.42, CAROUSEL.center[1] + 0.42,
    ['+x', '-x', '+z', '-z'].map((n) => ({ n, art: { kind: 'tower' } })), { tower: true }),
  ...pylon(7.3, -14.4, ['+z'], { kind: 'control' }, 2.9),
  // the lab building's facade over the spawn deck
  board(-7.5, 7.5, 3.6, 6.0, LAB.z[1], LAB.z[1] + 0.12, [{ n: '+z', art: { kind: 'lab' } }]),
  // the lab's stair tower carries a tall INK LAB banner (seen from every zone)
  board(LAB.x[1] - 4.6, LAB.x[1] - 1.4, 1.6, LAB.h + 2.8, LAB.z[1], LAB.z[1] + 0.1, [{ n: '+z', art: { kind: 'banner' } }]),
  // wall lab: the height gauge strip (world y 0 … 6 m) at the middle of the test wall
  board(-27.1, -25.9, 0, TEST_WALL.h, NORTH_FACE_Z - 0.06, NORTH_FACE_Z, [{ n: '-z', art: { kind: 'gauge', h: TEST_WALL.h } }], { gauge: true }),
  // wall lab: reference stands 2 / 5 / 10 m off the test wall — non-inkable floor plates (still there after painting)
  ...WALL_STANDS.map(([x, z]) => board(x - 0.55, x + 0.55, 0, 0.025, z - 0.55, z + 0.55, [{ n: '+y', art: { kind: 'stand', value: Math.round((WALL_FACE_Z - z) * 10) / 10, color: ZONES.wall.accent } }], { plate: true })),
  // swim course: timing gates on the F1 wall top (distance from the south end of the straight) + slope plates
  ...[5, 10, 15].map((d) => board(-16.56, -16.44, 1.0, 1.65, SWIM.straight.z[0] + d - 0.4, SWIM.straight.z[0] + d + 0.4, [{ n: '-x', art: { kind: 'gate', value: d } }])),
  board(-36.4, -36.3, 1.2, 1.85, -11.0, -10.0, [{ n: '+x', art: { kind: 'slope', deg: Math.atan2(SWIM.rampGentle.h, SWIM.rampGentle.zHigh - SWIM.rampGentle.zLow) * 180 / Math.PI } }]),
  board(-36.4, -36.3, 1.2, 1.85, -4.0, -3.0, [{ n: '+x', art: { kind: 'slope', deg: Math.atan2(SWIM.rampSteep.h, Math.abs(SWIM.rampSteep.zLow - SWIM.rampSteep.zHigh)) * 180 / Math.PI } }]),
];
