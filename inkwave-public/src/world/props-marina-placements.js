// Placements (same format as src/world/dressing.js; mirrored by the map's 180° rotation unless mirror: false).
export const HALYARD_VESSELS = [
  // ---- the ferry (hull side + end, saloon side; the mirror copies dress the far side and end)
  { type: 'ferry_hull', pos: [0, 0, 0] },
  { type: 'ferry_cabin', pos: [0, 0, 0] },
  { type: 'ferry_bridge', pos: [0, 3.8, 0], mirror: false },
  // cover pieces (Alpha half; mirrored)
  { type: 'ferry_locker', pos: [11.75, 1.3, 2.15] },
  { type: 'ferry_cargo', pos: [14.2, 1.3, 0.4] },
  // ---- the tug on blocks in the boatyard
  { type: 'tug_dress', pos: [17.5, 0, -18.5] },
  // ---- ramp dressing: ferry sun-deck stair (stringers + handrails) and the tug ramp's scaffold guardrails
  { type: 'ferry_stair', pos: [0, 0, 0] },
  { type: 'tug_ramp_rails', pos: [0, 0, 0] },
  // ---- the houseboat in the Long Pier slip
  { type: 'houseboat_dress', pos: [-15, 0, -18.9] },
  // ---- dinghy on its trailer (boatyard cover piece)
  { type: 'dinghy_trailer', pos: [22.1, 0, -27.7] },
  // ---- the marina beyond the boatyard (mirrored beyond the Long Pier): quay gate + gangway, walkway, fingers, boats
  ...marina(),
];

// The marina layout (Alpha half, x > 24; mirrored). It lives in the basin behind the dock kit's breakwater (rocks
// from x ≈ 38.7, head at z 10) and south of its channel markers (z 17…22): a walkway along Z at x 26.7…28.5 reached by a
// gated gangway from the quay at z -37.9, fingers off its outer side every 4.2 m, boats in the berths (sterns to the
// walkway, bows toward the breakwater, ≤ 8.6 m so they clear the rocks), a RIB + kayaks alongside its inner side.
// Also clear of the environment's moored boats (+X fishing boat at z 20…29; the mirror side's rowboat at x -26.4…-25.1).
function marina() {
  const P = Math.PI, out = [], SEA = -1.6, WX = 27.6, WW = 1.8, Z0 = -38.8, Z1 = 4.0;
  out.push({ type: 'marina_gate', pos: [24.0, 0, -37.9], run: 3.3, width: 1.4 });
  out.push({ type: 'marina_pontoon', pos: [WX, 0, Z0], rotY: -P / 2, length: Z1 - Z0, width: WW, unit: 4.3,
    piles: [{ s: 3.4, side: 1 }, { s: 20.5, side: 1 }, { s: 33.2, side: 1 }, { s: 42.2, side: 1 }],
    pedestals: [7.5, 15.9, 24.3, 32.7], boxes: [12.0, 29.0], rings: [5.0, 38.2], kayaks: 36.2 });
  const fingers = [];
  for (let k = 0; k <= 9; k++) fingers.push(-35.5 + k * 4.2);
  for (const z of fingers) out.push({ type: 'marina_pontoon', pos: [WX + WW / 2, 0, z], length: 4.8, width: 0.7, unit: 2.4, cleatSides: [-1, 1], piles: [{ s: 4.95, side: 0, h: 2.8 }] });
  const berths = [
    ['yacht_sail', 7.8, 'SALT SPRAY'], ['yacht_sail', 7.4, 'KITTIWAKE'], ['yacht_motor', 7.6, 'REEL TIME'], ['yacht_sail', 7.8, 'HALCYON'], ['yacht_sail', 7.6, 'PIPIT'],
    ['boat_fishing', 7.6, 'MARY ANN'], ['yacht_sail', 7.2, 'TERN'], ['yacht_sail', 7.9, 'MARGUERITE'], ['yacht_motor', 7.4, 'SEA BISCUIT'],
  ];
  berths.forEach(([type, L, name], k) => {
    const z = -33.4 + k * 4.2;
    out.push({ type, pos: [WX + WW / 2 + 0.5 + L / 2, SEA, z + (k % 2 ? 0.12 : -0.12)], rotY: P / 2 + ((k % 3) - 1) * 0.015, length: L, name, fenderSide: k % 2 ? -1 : 1 });
  });
  // alongside the inner side of the walkway (broadside to the arena)
  out.push({ type: 'boat_rib', pos: [25.58, SEA, -24.6], rotY: 0.02, length: 4.0 });
  out.push({ type: 'boat_rib', pos: [25.58, SEA, -9.8], rotY: P - 0.02, length: 4.0, color: '#e9703a' });
  return out;
}
