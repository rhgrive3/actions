// Playable architecture added after the frozen MAP3 blockout. These records
// describe real Level geometry, not a background skirt. Every route and wall
// is rotated for the other team; the original source remains independently
// auditable. See docs/stage-redesign/map3/built-space-review.md.
const floor = (id, rect, y, role) => ({ id: `A_${id}`, rect, y, bottom: -4, material: 'solid', role });
const ramp = (id, rect, axis, y0, y1, role) => ({ id: `A_${id}`, rect, axis, y0, y1, thickness: .6, role });
const wall = (id, rect, y0, y1, role, style = 'facade') => ({ id: `A_${id}`, rect, y0, y1, paint: true, role, style });
const route = (id, points, role) => ({ id: `A_${id}`, team: 'A', points, role });
const rotateRect = r => [-r[1], -r[0], -r[3], -r[2]];
const rotatePoint = p => [-p[0], p[1], -p[2]];
function paired(records, kind) {
  return records.concat(records.map(record => ({ ...record,
    id: record.id.replace(/^A_/, 'B_'),
    ...(record.rect ? { rect: rotateRect(record.rect) } : {}),
    ...(kind === 'ramps' ? { y0: record.y1, y1: record.y0 } : {}),
    ...(record.points ? { team: 'B', points: record.points.map(rotatePoint) } : {}),
  })));
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
function architecture(id, spec) {
  return freeze({ id, version: 1,
    floors: paired(spec.floors, 'floors'), ramps: paired(spec.ramps, 'ramps'),
    walls: paired(spec.walls, 'walls'), routes: paired(spec.routes, 'routes'),
    sightlines: spec.sightlines,
  });
}

const tidewater = architecture('tidewater', {
  floors: [
    floor('market_rear_west', [-18, -7, -64, -56], 3.6, 'rear market arcade joins west landing to arrival court'),
    floor('market_rear_east', [7, 18, -64, -56], 3.6, 'solid arrival shoulder beside the central descent'),
    floor('west_courtyard', [-18, -10, -46, -34], 1.2, 'lower courtyard joins the terrace return to civic court'),
    floor('east_forecourt_inner', [2, 12, -46, -38], 1.2, 'paved court beside a sheltered new descent'),
    floor('east_forecourt_outer', [18, 22, -46, -38], 1.2, 'quay connects the civic and eastern streets'),
    floor('east_forecourt_merge', [2, 18, -38, -34], 1.2, 'broad merge beyond the wall, not an isolated island'),
    floor('east_forecourt_to_cross', [10, 18, -34, -32], 1.2, 'continuous connection into the existing cross street'),
    floor('inner_street_west', [-16, -14, -20, -8], 0, 'market wall footing beside the new lower descent'),
    floor('inner_street_east', [-8, 0, -20, -8], 0, 'low inner street beside the main approach'),
    floor('inner_street_landing', [-14, -8, -14, -8], 0, 'lower market landing reconnects to the central basin'),
    floor('market_ground_arcade', [-36, -28, -18, -6], 0, 'walkable floor under the market hall, around real support walls'),
  ],
  ramps: [
    ramp('east_court_descent', [12, 18, -46, -38], 'z', 3.6, 1.2, 'six-wide alternative from arrival to the eastern civic court'),
    ramp('inner_market_descent', [-14, -8, -20, -14], 'z', 1.2, 0, 'six-wide return between civic court and low central street'),
  ],
  walls: [
    wall('arrival_arcade_wall', [-16.8, -8.2, -63.8, -62.4], 3.6, 7.3, 'long shop back wall beside the rear circulation loop'),
    wall('west_terrace_facade', [-37.5, -36.1, -48, -34], 2.4, 6.7, 'continuous terrace street facade with open ends'),
    wall('west_courtyard_facade', [-17.8, -16.5, -44, -38], 1.2, 6.4, 'tall building edge separates upper terrace and lower court'),
    wall('east_forecourt_screen', [3.4, 10.4, -44, -42.6], 1.2, 4.6, 'protects the new court without closing either side'),
    wall('inner_market_party_wall', [-16, -14.8, -17, -8], 0, 4.2, 'solid market sidewall makes the low lane read as a street'),
    wall('market_outer_foundation', [-36, -34.4, -18, -6], 0, 4.2, 'continuous real outer support below the raised market hall'),
    wall('market_arcade_partition', [-30.8, -29.6, -18, -8], 0, 4.2, 'divides the covered arcade; both ends remain accessible'),
    wall('bridge_street_wall_rear', [-16, -12, -6, -4.2], 0, 4.2, 'full-height bridge wall beside the existing lower passage'),
    wall('bridge_street_wall_front', [-16, -12, -1.8, 0], 0, 4.2, 'paired bridge wall leaves a 2.4-wide, 4.2-high opening'),
  ],
  routes: [
    route('rear_arcade_loop', [[-24,3.6,-60],[-12,3.6,-60],[-12,3.6,-56],[-5,3.6,-56],[-5,3.6,-50]], 'west landing to the arrival court through the new rear arcade'),
    route('east_court_loop', [[15,3.6,-49],[15,3.6,-46],[15,1.2,-38],[15,1.2,-28],[8,1.2,-28],[-4,1.2,-28]], 'arrival ramp to east cross street and back to civic court'),
    route('inner_market_loop', [[-11,1.2,-24],[-11,1.2,-20],[-11,0,-14],[-11,0,-9],[-8,0,-9],[-8,0,-3]], 'new inner descent rejoins the original low center route'),
    route('covered_market_loop', [[-25,0,-22],[-25,0,-16],[-28.5,0,-16],[-28.5,0,-9],[-25,0,-9]], 'covered quay beside the market partition and back to the low street'),
  ],
  sightlines: [
    { id:'market-bridge-wall', wallId:'A_bridge_street_wall_rear', from:[-18,1.3,-5], to:[-10,1.3,-5] },
    { id:'courtyard-wall', wallId:'A_west_courtyard_facade', from:[-20,3,-40], to:[-12,3,-40] },
  ],
});

const kelpline = architecture('kelpline', {
  floors: [
    floor('concourse_approach_west', [-20, -16, -50, -44], 3.6, 'solid terminal abutment beside the new descent'),
    floor('concourse_approach_east', [-10, -8, -50, -44], 3.6, 'boarding shoulder beside the main approach'),
    floor('concourse_approach_landing', [-20, -8, -44, -42], 3.6, 'terminal loop merges with the boarding court'),
    floor('boarding_east_shoulder', [8, 12, -50, -42], 3.6, 'continuous shoulder between main ramp and cargo approach'),
    floor('terminal_lower_apron', [0, 12, -28, -10], 0, 'real covered ground under the boarding deck'),
    floor('freight_lower_street', [12, 20, -24, -16], 0, 'low service street joins the covered terminal to loading ramps'),
    floor('freight_low_landing', [12, 14, -16, -10], 0, 'low ramp landing reconnects with the central service floor'),
    floor('freight_quay_landing', [20, 24, -16, -10], 1.2, 'continuous quay joins the existing ferry finger'),
  ],
  ramps: [
    ramp('concourse_loop_descent', [-16, -10, -50, -44], 'z', 4.8, 3.6, 'six-wide concourse-to-boarding alternative'),
    ramp('freight_quay_descent', [20, 26, -24, -16], 'z', 2.4, 1.2, 'six-wide freight loop from cargo court to the ferry quay'),
    ramp('freight_service_return', [14, 20, -16, -10], 'x', 0, 1.2, 'six-wide recovery between service street and ferry quay'),
  ],
  walls: [
    wall('concourse_approach_facade', [-20, -18.6, -49, -43], 3.6, 7.8, 'terminal facade encloses one side of the new concourse loop'),
    wall('gantry_warehouse_side', [-38, -36.6, -50, -36], 6, 9.6, 'solid warehouse sidewall beside the upper transfer route'),
    wall('cargo_warehouse_side', [38.5, 40, -48, -30], 2.4, 7.8, 'long warehouse wall anchors the cargo deck to a building'),
    wall('cargo_warehouse_return', [32, 38.5, -48, -46.6], 2.4, 6.4, 'lower return wall forms an open loading court'),
    wall('boarding_divider', [-2, -.6, -31, -19], 3.6, 7.4, 'terminal equipment wall divides two upper approaches with open ends'),
    wall('terminal_ground_wall_rear', [10.6, 12, -25, -18], 0, 3, 'full-height lower terminal wall meets the boarding slab'),
    wall('terminal_ground_wall_front', [10.6, 12, -14, -10], 0, 3, 'four-wide opening connects the covered street to freight quay'),
    wall('central_transfer_divider', [-4, -2.6, -7, -3], 3.6, 7, 'local bridge wall cuts lateral sightlines and preserves the tower crossing'),
    wall('central_transfer_side', [10.6, 12, -8, -1], 3.6, 6.8, 'terminal-side wall leaves the primary upper route clear'),
  ],
  routes: [
    route('concourse_loop', [[-13,4.8,-53],[-13,4.8,-50],[-13,3.6,-44],[-10,3.6,-44],[-10,3.6,-40],[-6,3.6,-38]], 'new concourse descent reconnects to boarding and high flank'),
    route('freight_service_loop', [[23,2.4,-29],[23,2.4,-24],[23,1.2,-16],[21,1.2,-13],[20,1.2,-13],[14,0,-13],[13,0,-13],[13,0,-16],[6,0,-16],[6,0,-8]], 'cargo to ferry quay to covered service street and low center'),
  ],
  sightlines: [
    { id:'transfer-wall', wallId:'A_central_transfer_divider', from:[-6,5,-5], to:[0,5,-5] },
    { id:'boarding-wall', wallId:'A_boarding_divider', from:[-5,5,-26], to:[4,5,-26] },
  ],
});

export const MAP3_ARCHITECTURE = Object.freeze({ tidewater, kelpline });
export function getMap3Architecture(id) { return MAP3_ARCHITECTURE[id] || null; }
