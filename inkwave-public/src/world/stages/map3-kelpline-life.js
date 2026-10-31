// Kelpline's passenger and working-waterfront details. These are static skins
// on existing solid objects, or props on the separated exterior quay. Nothing
// here changes the playable floor, colliders, navigation or paint surfaces.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const INK = '#374f57', CREAM = '#ede4cf', TIMBER = '#b18762', RUST = '#ae775d';
const HEADER_ASPECT = 222 / 34;

function face(o, side) {
  const [x0, x1, z0, z1] = o.rect, yaw = side * Math.PI / 2;
  const base = side === 0 ? [(x0 + x1) / 2, o.y0, z1]
    : side === 1 ? [x1, o.y0, (z0 + z1) / 2]
      : side === 2 ? [(x0 + x1) / 2, o.y0, z0] : [x0, o.y0, (z0 + z1) / 2];
  return { yaw, width: side % 2 ? z1 - z0 : x1 - x0, height: o.y1 - o.y0,
    at(x, y, depth = 0.028) {
      return [base[0] + x * Math.cos(yaw) + depth * Math.sin(yaw), base[1] + y,
        base[2] - x * Math.sin(yaw) + depth * Math.cos(yaw)];
    },
  };
}

function label(b, f, tile, x, y, width, height) {
  b.decal(tile, f.at(x, y), width, height, [0, f.yaw, 0]);
}

function coverDetails(b, o) {
  const team = o.id.startsWith('B_') ? -1 : 1, front = team > 0 ? 0 : 2;
  const h = o.y1 - o.y0, kiosk = /kiosk/.test(o.id), cargo = /cargo|stack/.test(o.id);
  b.scope(o.id, 'obstacle-skin', () => {
    const f = face(o, front);
    if (kiosk) {
      // The dark ticket-window strip already exists. A readable timetable and
      // an inset route diagram give it a use, without paneling over the wall.
      const w = Math.min(1.10, f.width * 0.22);
      label(b, f, 'departures', -f.width * 0.21, h * 0.65, w, 0.49);
      label(b, f, 'terminal', f.width * 0.21, h * 0.65, w, 0.49);
      const rear = face(o, (front + 2) % 4);
      label(b, rear, 'poster', -rear.width * 0.28, h * 0.42, 0.58, 0.36);
      // A brass ticket return below one window and two shallow screw heads.
      b.box('metal', '#a28c64', ...f.at(f.width * 0.21, h * 0.42, 0.018), 0.30, 0.08, 0.018, f.yaw);
      for (const dx of [-0.12, 0.12]) b.box('metal', INK,
        ...f.at(f.width * 0.21 + dx, h * 0.42, 0.030), 0.018, 0.018, 0.008, f.yaw);
    } else if (cargo) {
      // Narrow fabric ties, corner protectors and one consignment label make
      // the existing cover read as freight. Its broad center remains inkable.
      for (const side of [front, (front + 2) % 4]) {
        const q = face(o, side);
        for (const dir of [-1, 1]) {
          const x = dir * (q.width / 2 - 0.43);
          b.box('rubber', '#575e55', ...q.at(x, h / 2, 0.016), 0.085, h - 0.38, 0.016, q.yaw);
          b.box('metal', '#acb4a7', ...q.at(x, h * 0.45, 0.025), 0.17, 0.19, 0.014, q.yaw);
          b.box('metal', INK, ...q.at(x, h * 0.45, 0.032), 0.075, 0.09, 0.004, q.yaw);
        }
      }
      label(b, f, 'cargo', f.width * 0.16, h * 0.52, Math.min(1.10, f.width * 0.25), 0.49);
      const q = face(o, team > 0 ? 1 : 3);
      // Small stencilled repair plate on the cargo-facing end only.
      label(b, q, 'service', q.width * 0.20, h * 0.30, 0.48, 0.25);
    } else if (/spawn/.test(o.id)) {
      const titleWidth = Math.min(2.6, f.width * 0.40);
      label(b, f, 'terminalHeader', 0, h * 0.69, titleWidth, titleWidth / HEADER_ASPECT);
      label(b, face(o, (front + 2) % 4), 'departures', 0, h * 0.69, 1.16, 0.58);
    } else {
      const q = face(o, /bridge_edge/.test(o.id) ? (team > 0 ? 1 : 3) : front);
      const x = q.width / 2 - 0.67;
      label(b, q, /bridge_edge|ferry/.test(o.id) ? 'terminal' : 'service', x,
        h * 0.70, Math.min(0.88, q.width * 0.27), 0.35);
      // Localised paint repair and a small inspection tab near the cabinet
      // edge. These are deliberate service marks, not uniform wall noise.
      b.box('metal', '#b7c1b4', ...q.at(-q.width / 2 + 0.45, h * 0.23, 0.019),
        0.21, 0.09, 0.014, q.yaw);
      b.box('metal', RUST, ...q.at(-q.width / 2 + 0.49, h * 0.23, 0.028),
        0.08, 0.025, 0.004, q.yaw);
    }
  });
  if (!kiosk) return;
  // The authored roof sign has its own real bounds (8 roof strips, 4 posts,
  // then sign). Print only on that existing board; no hanging visual blocker.
  const [x0, x1, z0, z1] = o.rect, width = Math.max(0.5, x1 - x0 - 0.58);
  b.scope(`${o.id}:terminal-kiosk:12`, 'assembly-part', () => {
    // Preserve the title crop's proportions inside the existing shallow board.
    const titleWidth = Math.min(width - 0.16, 0.34 * HEADER_ASPECT);
    b.decal('terminalHeader', [(x0 + x1) / 2, o.y1 + 1.15 * 0.62,
      team > 0 ? z1 - 0.010 : z0 + 0.010], titleWidth, titleWidth / HEADER_ASPECT,
    [0, team > 0 ? 0 : Math.PI, 0]);
  });
}

function bench(b, x, y, z, sign) {
  // Seats face the water. Separate timber slats and curved support legs give
  // a human scale to the very long quay without introducing arena clutter.
  for (const dz of [-1.12, 1.12]) {
    b.beam('metal', INK, [x - sign * 0.23, y + 0.10, z + dz], [x - sign * 0.15, y + 0.59, z + dz], 0.10);
    b.beam('metal', INK, [x + sign * 0.28, y + 0.10, z + dz], [x + sign * 0.38, y + 1.45, z + dz], 0.10);
    b.beam('metal', INK, [x - sign * 0.25, y + 0.49, z + dz], [x + sign * 0.32, y + 0.49, z + dz], 0.09);
  }
  for (let i = 0; i < 3; i++) b.box('wood', i === 1 ? '#c29a70' : TIMBER,
    x + sign * (i - 1) * 0.23, y + 0.62, z, 0.20, 0.12, 3.1);
  for (const dy of [0.96, 1.24]) b.box('wood', TIMBER, x + sign * 0.37,
    y + dy, z, 0.13, 0.20, 3.1);
  for (const dz of [-1.25, 1.25]) b.tube('metal', INK,
    [[x - sign * 0.24, y + 0.66, z + dz], [x - sign * 0.22, y + 0.96, z + dz],
      [x + sign * 0.28, y + 0.96, z + dz]], 0.045, 5);
}

function plantedSeat(b, leaf, x, y, z, sign, tree = false) {
  b.chamfer('stone', '#c1c3af', x, y + 0.49, z, 1.65, 0.98, 3.5, 0.17);
  b.chamfer('metal', '#788e7e', x, y + 0.98, z, 1.75, 0.16, 3.6, 0.17);
  b.box('stone', '#605e49', x, y + 1.06, z, 1.4, 0.025, 3.2);
  for (let i = 0; i < 6; i++) {
    const zz = z - 1.17 + i * 0.468;
    b.add('foliage', leaf, ['#788d67', '#8c9b72', '#667d5f'][i % 3],
      [x + Math.sin(i * 2.7) * 0.28, y + 1.30 + (i % 3) * 0.12, zz],
      [0.48, 0.38 + (i % 2) * 0.12, 0.40], [0, i * 0.73, 0]);
  }
  // A compact pollarded tree is reserved for a few exterior resting places.
  if (tree) {
    b.cylinder('wood', '#7b7258', x, y + 2.05, z, 0.12, 2.25);
    for (let i = 0; i < 4; i++) {
      const a = i * TAU / 4 + 0.5;
      b.beam('wood', '#7b7258', [x, y + 2.6, z],
        [x + Math.sin(a) * 0.6, y + 3.15, z + Math.cos(a) * 0.6], 0.09);
      b.add('foliage', leaf, i % 2 ? '#8a9d6b' : '#748a61',
        [x + Math.sin(a) * 0.57, y + 3.35 + (i % 2) * 0.17, z + Math.cos(a) * 0.57],
        [0.95, 0.80, 0.91], [0, a, 0]);
    }
    b.add('foliage', leaf, '#8a9b70', [x, y + 3.89, z], [0.88, 0.64, 0.87]);
  }
  for (const dz of [-1.15, 1.15]) b.box('wood', TIMBER, x - sign * 0.93,
    y + 0.61, z + dz, 0.43, 0.13, 1.0);
}

function exteriorBoard(b, tile, x, y, z, w, h, sign, tint = INK) {
  b.chamfer('metal', tint, x, y, z, 0.18, h + 0.14, w + 0.14, 0.055);
  b.decal(tile, [x - sign * 0.096, y, z], w, h, [0, -sign * Math.PI / 2, 0]);
}

function terminalFront(b, leaf, sign) {
  const x = sign * 55, z = -30 * sign, ground = 2.5;
  b.scope(`kelpline-passenger-quay-${sign}`, 'exterior', () => {
    // Large terminal lettering is on the existing building's upper fascia;
    // the lower view remains open toward the ferry shelter and bench grouping.
    exteriorBoard(b, 'terminalHeader', x - sign * 5.83, 10.12, z - 6 * sign,
      0.82 * HEADER_ASPECT, 0.82, sign);
    // Center between the existing 5.8-WU mooring bollards, keeping their caps
    // from appearing through the open timber backs in a passenger-eye view.
    for (const zz of [-27.1, -21.3]) bench(b, sign * 48.25, ground, sign * zz, sign);

    const bx = sign * 50.4, bz = sign * -22;
    exteriorBoard(b, 'departures', bx, ground + 2.8, bz, 4.7, 1.65, sign);
    for (const dz of [-1.9, 1.9]) b.beam('metal', INK,
      [bx + sign * 0.05, ground, bz + dz], [bx + sign * 0.05, ground + 3.6, bz + dz], 0.11);

    // Slim, cream pier marker. It is supported by the off-limits quay and has
    // a low, solid plinth rather than floating amid the playable sightlines.
    const tx = sign * 48.15, tz = sign * -13.6;
    b.chamfer('metal', '#8d9a8f', tx, ground + 0.12, tz, 0.7, 0.24, 1.65, 0.14);
    b.chamfer('metal', CREAM, tx, ground + 1.85, tz, 0.24, 3.5, 1.38, 0.08);
    exteriorBoard(b, 'terminal', tx - sign * 0.14, ground + 2.49, tz, 1.20, 0.63, sign);
    exteriorBoard(b, 'departures', tx - sign * 0.14, ground + 1.56, tz, 1.20, 0.67, sign, '#788e7e');

    // A pair of sorted litter bins, with a dark inset lid and warm metal rim.
    for (let i = 0; i < 2; i++) {
      const xx = sign * (48.4 + i * 0.75), zz = sign * -31.1;
      b.cylinder('metal', i ? '#728779' : '#82969b', xx, ground + 0.49, zz, 0.31, 0.98);
      b.cylinder('metal', '#aeb5a5', xx, ground + 1.0, zz, 0.34, 0.10);
      b.cylinder('rubber', '#354e53', xx, ground + 1.055, zz, 0.21, 0.025);
    }
    plantedSeat(b, leaf, sign * 48.45, ground, sign * -5.0, sign, true);
  });
}

function dockSafety(b, ring, sign) {
  b.scope(`kelpline-quay-safety-${sign}`, 'exterior', () => {
    const x = sign * 47.30, ground = 2.5;
    for (const z0 of [-47, 47]) {
      const z = sign * z0;
      b.box('metal', INK, x, ground + 1.45, z, 0.11, 2.9, 0.11);
      b.chamfer('metal', CREAM, x, ground + 2.05, z, 0.14, 1.45, 1.30, 0.05);
      const front = x - sign * 0.16, yaw = -sign * Math.PI / 2;
      b.add('metal', ring, '#d7c8a2', [front, ground + 2.14, z], [1, 1, 1], [0, yaw, 0]);
      // Four cloth straps cross the cream rescue ring. Their subdued red is a
      // maritime safety accent; no team-colored light or flashing animation.
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        b.box('rubber', RUST, front - sign * 0.035,
          ground + 2.14 + Math.sin(a) * 0.47, z + Math.cos(a) * 0.47,
          0.14, i % 2 ? 0.18 : 0.25, i % 2 ? 0.25 : 0.18);
      }
      exteriorBoard(b, 'service', x - sign * 0.08, ground + 1.16, z, 0.86, 0.32, sign);
    }
    // Hose reels remain on the service quay. Three concentric coils make a
    // recognisable stored tool, instead of another anonymous utility box.
    for (const z0 of [31, 57]) {
      const z = sign * z0, cx = sign * 48.65, cy = ground + 0.83;
      for (const dz of [-0.43, 0.43]) b.beam('metal', '#788e7e',
        [cx + sign * 0.18, ground, z + dz], [cx, cy, z + dz], 0.09);
      b.cylinder('metal', '#aab5a6', cx, cy, z, 0.57, 0.35, [0, 0, Math.PI / 2]);
      for (const size of [0.93, 0.70, 0.46]) b.add('rubber', ring, '#5c695b',
        [cx - sign * 0.22, cy, z], [size, size, size], [0, -sign * Math.PI / 2, 0]);
      b.tube('rubber', '#5c695b', [[cx - sign * 0.23, cy - 0.18, z + 0.45],
        [cx - sign * 0.25, ground + 0.20, z + 0.63], [cx - sign * 0.36, ground + 0.12, z + 0.94]], 0.045, 5);
    }
  });
}

function workingQuay(b, leaf, sign) {
  b.scope(`kelpline-working-quay-${sign}`, 'exterior', () => {
    const ground = 2.5;
    exteriorBoard(b, 'terminalHeader', sign * 49.20, 8.8, sign * 18,
      6.8, 6.8 / HEADER_ASPECT, sign);
    for (const dz of [-2.3, 2.3]) b.beam('metal', INK,
      [sign * 49.2, 9.52, sign * 18 + dz], [sign * 49.5, 10.4, sign * 18 + dz], 0.10);
    plantedSeat(b, leaf, sign * 48.55, ground, sign * 40, sign);
    plantedSeat(b, leaf, sign * 48.55, ground, sign * 65, sign, true);
    bench(b, sign * 48.25, ground, sign * 4.2, sign);

    // Low pallet, strapped parcels and a single rolled cover: the service bay
    // has a job to do, while the arena itself retains the authored cover plan.
    const cx = sign * 52, cz = sign * 57;
    for (const dz of [-0.82, 0, 0.82]) b.box('wood', '#796e53', cx, ground + 0.14, cz + dz, 2.7, 0.28, 0.19);
    for (let i = 0; i < 6; i++) b.box('wood', TIMBER, cx, ground + 0.33,
      cz - 1.05 + i * 0.42, 2.85, 0.12, 0.31);
    for (const [i, xx] of [-0.68, 0.68].entries()) {
      const x = cx + xx, h = i ? 1.15 : 1.45, y = ground + 0.40 + h / 2;
      b.chamfer('wood', i ? '#aa936a' : '#9caa94', x, y, cz, 1.18, h, 1.78, 0.08);
      for (const dz of [-0.53, 0.53]) b.box('rubber', '#53645c', x, y,
        cz + dz, 1.20, h + 0.02, 0.06);
      exteriorBoard(b, 'cargo', x - sign * 0.61, y, cz, 0.86, 0.42, sign);
    }
    b.cylinder('wood', '#b1a07a', sign * 51.5, ground + 1.35, sign * 60.8, 0.40, 1.7,
      [0, 0, Math.PI / 2]);
    for (const dx of [-0.76, 0.76]) b.cylinder('wood', '#8d7a5d', sign * 51.5 + dx,
      ground + 1.35, sign * 60.8, 0.68, 0.12, [0, 0, Math.PI / 2]);
  });
}

/** Static, non-colliding detail pass; the root builder owns all merged assets. */
export function dressKelplineLife(b, layout) {
  if (layout?.map3?.id !== 'kelpline') return;
  const leaf = new THREE.IcosahedronGeometry(1, 1);
  const ring = new THREE.TorusGeometry(0.47, 0.095, 6, 16);
  try {
    layout.map3.obstacles.forEach(o => coverDetails(b, o));
    for (const sign of [-1, 1]) {
      terminalFront(b, leaf, sign);
      dockSafety(b, ring, sign);
      workingQuay(b, leaf, sign);
    }
  } finally {
    leaf.dispose(); ring.dispose();
  }
}
