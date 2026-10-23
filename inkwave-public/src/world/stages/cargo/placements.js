// Stage descriptors: no prop builders are imported here.
import { LOCAL, ROT_RAD, toWorld } from './layout.js';
const P = Math.PI;

// ==================================================================================================== placements
// Authored in the berth's local frame (like layout.js) and turned with it at the end: pos → toWorld, rotY + ROT
// (`worldRot`: rotY is already a world angle — loose kit parked square to the harbour; `world`: pos + rotY untouched).
// Alpha half (−Z); every entry is mirrored (x,z) → (−x,−z), rotY + π, unless `mirror: false`.
// Container + stair dressing is generated from the layout's local pieces (every stack box / stair), so the geometry
// and its dressing never drift apart.
const CODES = ['KRKU', 'TDBU', 'CRLU', 'KLPU', 'SLTU', 'HLBU', 'INKU', 'TIDU'];
function autoDressing() {
  const out = [];
  let k = 0;
  for (const d of LOCAL.half) {
    const tag = d.tag || '';
    if (d.kind === 'box' && tag === 'trailer') {
      out.push({ type: 'cargo_box', pos: [(d.min[0] + d.max[0]) / 2, d.min[1], (d.min[2] + d.max[2]) / 2], rotY: 0, len: 20, color: d.color, door: 1, code: 'KLPU 204816' });
    } else if (d.kind === 'box' && (tag.startsWith('box:') || tag.startsWith('boxx:'))) {
      const [kind, len, door, reefer] = tag.split(':');
      const alongX = kind === 'boxx', dp = door === '1';
      const rotY = alongX ? (dp ? P / 2 : -P / 2) : (dp ? 0 : P);
      const cx = (d.min[0] + d.max[0]) / 2, cz = (d.min[2] + d.max[2]) / 2;
      const code = `${CODES[(k * 5 + 3) % CODES.length]} ${String(100000 + ((k * 7919 + 1234) % 899999)).slice(0, 6)}`;
      out.push({ type: 'cargo_box', pos: [cx, d.min[1], cz], rotY, len: +len, color: d.color, door: 1, reefer: reefer === '1', code });
      k++;
    } else if (d.kind === 'ramp' && (tag === 'stair' || tag === 'ops-stair')) {
      const dx = d.high[0] - d.low[0], dz = d.high[2] - d.low[2];
      out.push({ type: 'cargo_stair', pos: [...d.low], rotY: Math.atan2(dx, dz), run: Math.hypot(dx, dz), rise: d.high[1] - d.low[1], width: d.width, ...(tag === 'ops-stair' ? { c: '#2f5b8c' } : {}) });
    }
  }
  return out;
}

const Q = P / 4;
const LOCAL_PLACEMENTS = [
  // K7 at mid, idle between the two berths with its boom raised; the two ships alongside, bows pointing at mid
  { type: 'cargo_crane', pos: [0, 0, 0], rotY: 0, mirror: false, boom: 80 },
  { type: 'cargo_ship', pos: [27.5, 0, -14], rotY: 0, mirror: false, name: 'TIDEBANK', line: 'TIDEBANK', hull: '#2e3f5c', boot: '#a3453a', seed: 11 },
  { type: 'cargo_ship', pos: [-27.5, 0, 14], rotY: P, mirror: false, name: 'CORAL MAXIMA', line: 'CORAL MAX', hull: '#3c4650', boot: '#35598a', seed: 23 },
  // crane rails along both aprons (the gate-side one stops at the water slot; the mirror copies run the Bravo half)
  { type: 'cargo_rail', pos: [21, 0, -41], rotY: -P / 2, length: 41, stop: true },
  { type: 'cargo_rail', pos: [-21, 0, -46.2], rotY: -P / 2, length: 46.2, stop: true },
  // the terminal beyond the back wall (visual) + the next crane along the quay, working the far end of each ship
  { type: 'cargo_backyard', pos: [0, 0, -48], rotY: 0, seed: 5 },
  { type: 'cargo_crane', pos: [0, 0, -64], rotY: 0, trolley: 40, num: 'K6', coarse: true },
  // Terminal Operations building (spawn) + control tower behind the back wall; high-mast lights behind the wall
  { type: 'cargo_ops', pos: [0, 0, -47.4], rotY: 0, tx: -6.5 },
  { type: 'cargo_mast', pos: [21.5, 0, -50.5] },
  { type: 'cargo_mast', pos: [-19.5, 0, -50.5] },
  // flood-light poles: spawn deck back corners, the gate corner, the reefer corner
  { type: 'lightpole', pos: [6.4, 2.6, -46.9], rotY: 0, variant: 1, height: 6.5, color: '#b9c0c6' },
  { type: 'lightpole', pos: [-6.4, 2.6, -46.9], rotY: 0, variant: 1, height: 6.5, color: '#b9c0c6' },
  { type: 'lightpole', pos: [19.9, 0, -46.7], rotY: -0.6, variant: 0, height: 10, color: '#b9c0c6' },
  { type: 'lightpole', pos: [-23.2, 0, -37.2], rotY: 0.9, variant: 0, height: 10, color: '#b9c0c6' },
  // truck gate (left corner of the base; its canopy overhangs the water slot)
  { type: 'cargo_gate', pos: [16.5, 0, -42.4], rotY: 0 },
  // quay edges along the new outline: bollards (low cover), cone fenders, ladders — the ships' lines run to the
  // bollards on the long ship-side edge. Runs go along local +X with the water on local +Z.
  { type: 'cargo_quayedge', pos: [20.6, 0, -41], rotY: P / 2, length: 6.4 },                                   // water slot, inner side
  { type: 'cargo_quayedge', pos: [24, 0, -41], rotY: P, length: 3.4 },                                         // water slot, head
  { type: 'cargo_quayedge', pos: [24, 0, -14], rotY: P / 2, length: 27, bollards: [4, 14, 24], fenders: [9, 19], ladders: [16.5] },
  { type: 'cargo_quayedge', pos: [30, -0.1, -8], rotY: 3 * Q, length: 8.485, bollards: [4.2] },               // mid bulge shoulder
  { type: 'cargo_quayedge', pos: [30, 0, 0], rotY: P / 2, length: 8, bollards: [4], fenders: [6.5] },          // mid bulge face
  { type: 'cargo_quayedge', pos: [-30, 0, -8], rotY: -P / 2, length: 8, bollards: [4], fenders: [1.5] },
  { type: 'cargo_quayedge', pos: [-24, -0.1, -14], rotY: -3 * Q, length: 8.485, bollards: [4.2] },
  { type: 'cargo_quayedge', pos: [-24, 0, -22], rotY: -P / 2, length: 8, fenders: [4] },
  // the reefer-side wing (stepped outline)
  { type: 'cargo_quayedge', pos: [-29.5, 0, -22], rotY: 0, length: 5.5, bollards: [2.7] },
  { type: 'cargo_quayedge', pos: [-29.5, 0, -27], rotY: -P / 2, length: 5 },
  { type: 'cargo_quayedge', pos: [-32, 0, -27], rotY: 0, length: 2.5 },
  { type: 'cargo_quayedge', pos: [-32, 0, -42], rotY: -P / 2, length: 15, bollards: [3.5, 11.5], fenders: [7.5], ladders: [5.5] },
  { type: 'cargo_quayedge', pos: [-29.5, 0, -42], rotY: P, length: 2.5 },
  { type: 'cargo_quayedge', pos: [-29.5, 0, -46.4], rotY: -P / 2, length: 4.4 },
  { type: 'cargo_quayedge', pos: [-24, 0, -46.4], rotY: P, length: 5.5, bollards: [2.7] },
  // the reefer rack over the alley, hatch-cover dressing (mid landing — square to the harbour — + apron)
  { type: 'cargo_reeferrack', pos: [-9.44, 0, -16.125], rotY: 0, length: 18.35, width: 2.0, name: 'R2' },
  { type: 'cargo_hatch', pos: [0, 0, 0], rotY: 0, w: 10.8, d: 6, h: 1.2, num: '4', mirror: false, world: true },
  { type: 'cargo_hatch', pos: [0, 0, 0], rotY: 0, w: 4.4, d: 3.2, h: 1.2, y0: 1.2, c: '#58779a', mirror: false, world: true },
  { type: 'cargo_hatch', pos: [18.6, 0, -23.5], rotY: P / 2, w: 7, d: 2.8, h: 1.2, num: '7' },
  // truck lane: tractor + chassis under the trailer box, the reach stacker reaching toward the landing
  { type: 'cargo_chassis', pos: [2.82, 0, -25.57], rotY: 0, len: 20 },
  { type: 'cargo_tractor', pos: [2.82, 0, -21.6], rotY: 0 },
  { type: 'cargo_reachstacker', pos: [-3.3, 0, -10.8], rotY: 0 },
  // straddle carrier over its box on the right apron
  { type: 'cargo_straddle', pos: [-20.2, 0, -25.97], rotY: 0 },
  // lashing cages + twistlock bins
  { type: 'cargo_cage', pos: [22.7, 0, -35], rotY: P / 2 },
  { type: 'cargo_cage', pos: [-22.9, 0, -12.5], rotY: P / 2 },
  { type: 'cargo_cage', pos: [1.2, 0, -7.6], rotY: 0.08, variant: 1 },
  { type: 'cargo_cage', pos: [-13.8, 0, -36.2], rotY: 0.04, variant: 1 },
  { type: 'cargo_cage', pos: [27.2, 0, -3.2], rotY: 0.15 },
  // flat rack with crated cargo on the left apron, light towers (cover by day, the lamps at dusk)
  { type: 'cargo_flatrack', pos: [19.2, 0, -14.0], rotY: 0, len: 20 },
  { type: 'cargo_lighttower', pos: [-18.6, 0, -17.2], rotY: 0.3 },
  { type: 'cargo_lighttower', pos: [12.6, 0, -35.6], rotY: -1.3 },
  // truck lane: barriers (parked square to the harbour, i.e. skewed across the lane) + cones
  { type: 'barrier', pos: [-3.0, 0, -26.0], rotY: 0, worldRot: true, variant: 1, length: 3.6 },
  { type: 'barrier', pos: [-3.8, 0, -20.4], rotY: P / 2, worldRot: true, variant: 0, length: 1.8, color: '#e8a33a' },
  { type: 'cone', pos: [-1.6, 0, -19.8] }, { type: 'cone', pos: [-5.2, 0, -21.3] },
  { type: 'cone', pos: [1.0, 0, -18.6] }, { type: 'cone', pos: [5.2, 0, -18.4] },
  // service vehicles: pickup on the right apron by the reefer corner, a forklift with a twistlock bin by the gate
  { type: 'cargo_pickup', pos: [-20.4, 0, -34.0], rotY: 0.12 },
  { type: 'cargo_forklift', pos: [19.3, 0, -36.6], rotY: -1.35 },
  // ships' gangways down to the quay (the mirror copy serves the other ship)
  { type: 'cargo_gangway', pos: [23.3, 0, -36.0], rotY: 0, run: 4.7, rise: 5.2 },
  // quay clutter: rope coils by the bollards, life rings on the edge, drums in the reefer corner, bins
  { type: 'ropecoil', pos: [22.6, 0, -17.2], rotY: 0.4 },
  { type: 'ropecoil', pos: [-30.9, 0, -40.4], rotY: 2.2 },
  { type: 'lifering', pos: [23.55, 0, -25.8], rotY: -P / 2 },
  { type: 'lifering', pos: [-31.55, 0, -30.5], rotY: P / 2 },
  { type: 'barrel', pos: [-21.4, 0, -40.6], color: '#3f6fb0' },
  { type: 'barrel', pos: [-20.8, 0, -41.1], color: '#c9453b' },
  { type: 'cargo_cage', pos: [-19.4, 0, -40.4], rotY: 0.2, variant: 1 },
  { type: 'trashbin', pos: [9.7, 0, -47.0], rotY: 0, variant: 1, color: '#3f7d5a' },
  { type: 'trashbin', pos: [10.5, 0, -47.0], rotY: 0, variant: 1, color: '#2f5b8c' },
  { type: 'hydrant', pos: [-16.6, 0, -39.3], rotY: 0.4 },
  // the reefer-side wing: shore-power kiosk, a lashing cage, a light tower out on the step
  { type: 'cargo_kiosk', pos: [-27.0, 0, -25.4], rotY: 0 },
  { type: 'cargo_cage', pos: [-25.4, 0, -30.8], rotY: 0.2 },
  { type: 'cargo_lighttower', pos: [-30.7, 0, -34.2], rotY: 0.4 },
  // mid landing zone: cones around the crane's working area
  { type: 'cone', pos: [7.2, 0, -4.4] }, { type: 'cone', pos: [8.9, 0, -0.6] }, { type: 'cone', pos: [-6.3, 0, -5.4] },
  // safety boards
  { type: 'cargo_signboard', pos: [-8.1, 0, -35.0], rotY: 0.2, variant: 0 },
  { type: 'cargo_signboard', pos: [15.5, 0, -33.6], rotY: -0.25, variant: 2 },
  { type: 'cargo_signboard', pos: [-16.9, 0, -33.0], rotY: 0.6, variant: 1 },
  // reefer technicians' cabin in the reefer corner (fittings on the front of the reefer yard box)
  { type: 'cargo_cabin', pos: [-14.41, 0, -44.86], rotY: 0, w: 6.06, sign: 'REEFER TECH' },
  ...autoDressing(),
];

// turn the berth: pos about the origin, rotY + ROT (see the note above). oboxCols: a turned prop hands the level
// colliders turned with it (PropKit._xfCols) instead of world-axis boxes that would swell past the real shape.
export const PLACEMENTS = LOCAL_PLACEMENTS.map((it) => {
  if (it.world) { const { world, ...q } = it; return { ...q, oboxCols: true }; }
  const { worldRot, ...q } = it;
  const [x, z] = toWorld(it.pos[0], it.pos[2]);
  return { ...q, pos: [x, it.pos[1], z], rotY: worldRot ? it.rotY || 0 : (it.rotY || 0) + ROT_RAD, oboxCols: true };
});
