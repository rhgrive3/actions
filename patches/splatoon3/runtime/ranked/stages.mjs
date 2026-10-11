// Ranked blockout coordinates use the live INKWAVE collision layouts as their
// coordinate source. They are local gameplay calibration, not recovered retail
// Splatoon collision data or a claim of one-to-one retail Ranked layouts.
const CARGO_ANGLE = 35 * Math.PI / 180;
const cargoPoint = ([x, z]) => [
  x * Math.cos(CARGO_ANGLE) + z * Math.sin(CARGO_ANGLE),
  -x * Math.sin(CARGO_ANGLE) + z * Math.cos(CARGO_ANGLE),
];

// Each coordinate is [x,z]. `y: null` means sample the active Level's real
// highest floor at that point. Explicit heights are used only for a tower
// moving surface that bridges a known ramp, lift or stair transition.
const SPECS = Object.freeze({
  tidewater: {
    zones: [[-9, 0, 6, 7], [9, 0, 6, 7]],
    path: [[6.5, -18], [6.5, -9], [6.5, 0], [6.5, 9], [6.5, 18]], centerIndex: 2,
    goals: [[0, 30], [0, -30]],
    checkpoints: [[[6.5, 10], [0, 22]], [[-6.5, -10], [0, -22]]],
    center: [6.5, 0], retreatZ: [-24, 24],
    clams: [[-12, -9], [12, -9], [-12, 9], [12, 9], [0, -20], [0, 20]],
  },
  kelpline: {
    zones: [[0, -12, 8, 6], [0, 12, 8, 6]],
    // The active layout's central gantry and service ramp lift this route; the
    // deck follows their measured top faces and doglegs around the center post.
    path: [[-4, -16], [-4, -7], [-4, -3.2], [3.8, -3.2], [3.8, 1.9], [3.8, 7], [3.8, 16]], centerIndex: 4,
    goals: [[0, 32], [0, -32]],
    checkpoints: [[[0, 12], [0, 22]], [[0, -12], [0, -22]]],
    center: [3.8, 1.9], retreatZ: [-24, 24],
    clams: [[-12, -10], [12, -10], [-12, 10], [12, 10], [0, -20], [0, 20]],
  },
  halyard: {
    zones: [[0, -15, 6, 6], [0, 15, 6, 6]],
    // The ferry side stairs and roof form a symmetric crossing. Deck heights
    // are sampled against the plank, cabin and wheelhouse collision tops.
    path: [[22, -20], [22, -3.6], [17.8, -3.6], [15, -3.2], [12.6, -1.9],
      [6.5, -1.9], [3.2, -1.9], [3.2, 0], [0, 0], [-3.2, 0], [-3.2, 1.9],
      [-6.5, 1.9], [-12.6, 1.9], [-15, 3.2], [-17.8, 3.6], [-22, 3.6], [-22, 20]], centerIndex: 8,
    goals: [[-22, 20], [22, -20]],
    checkpoints: [[[3.3, 12], [-3.3, 20]], [[-3.3, -12], [3.3, -20]]],
    center: [8.2, 0], retreatZ: [-24, 24],
    clams: [[3.2, -20], [-3.2, -20], [3.2, 20], [-3.2, 20], [0, -13], [0, 13]],
  },
  cargo: {
    zones: [[-8, 0, 7, 7], [8, 0, 7, 7]],
    // The central lift track crosses the live hatch covers. Stage calibration
    // raises the deck above the highest exposed floor inside its footprint.
    path: [[0, -18], [0, -6], [0, -3], [0, 0], [0, 3], [0, 6], [0, 18]], centerIndex: 3,
    goals: [[0, 30], [0, -30]],
    checkpoints: [[[0, 10], [0, 22]], [[0, -10], [0, -22]]],
    center: [0, 0], retreatZ: [-24, 24],
    clams: [[-3, -20], [3, -20], [-3, 20], [3, 20], [0, -12], [0, 12]],
    local: true,
  },
  scorch: {
    zones: [[-8, 0, 6, 7], [8, 0, 6, 7]],
    // The left-center lane passes the mid-tower edge and the mirrored ramps;
    // the deck lifts over the actual blockout ledges along this route.
    path: [[-4, -20], [-4, -10], [-4, 0], [-4, 10], [-4, 20]], centerIndex: 2,
    goals: [[0, 30], [0, -30]],
    checkpoints: [[[0, 20], [0, 25]], [[0, -20], [0, -25]]],
    center: [-4, 0], retreatZ: [-25, 25],
    clams: [[-8, -9], [8, -9], [-8, 9], [8, 9], [0, -24], [0, 24]],
  },
});

function mapPoint(id, pair, local = false) {
  return id === 'cargo' && local ? cargoPoint(pair) : pair.slice();
}

function liveFloor(level, x, z) {
  const y = level?.groundHeight?.(x, z);
  return Number.isFinite(y) ? y : null;
}

function pointOnStage(level, id, pair, local, yOverride = null, label = 'objective') {
  const [x, z] = mapPoint(id, pair, local);
  const floor = liveFloor(level, x, z);
  if (floor === null) throw new Error(`Ranked ${id} ${label} is not over live floor (${x.toFixed(2)}, ${z.toFixed(2)})`);
  return [x, yOverride === null ? floor : yOverride, z];
}

function pathHeight(level, x, z, radius) {
  let best = liveFloor(level, x, z);
  const step = 0.15;
  for (let dz = -radius; dz <= radius + step / 2; dz += step) {
    for (let dx = -radius; dx <= radius + step / 2; dx += step) {
      if (dx * dx + dz * dz > radius * radius) continue;
      const y = liveFloor(level, x + dx, z + dz);
      if (y !== null && (best === null || y > best)) best = y;
    }
  }
  return best;
}

function buildTowerPath(level, id, spec, local, halfSize) {
  const source = spec.path.map(value => Array.isArray(value) ? value : value.p);
  const mapped = source.map(p => mapPoint(id, p, local));
  const path = [];
  let centerIndex = 0;
  // Include a small margin around the rotated deck corners so a thin plank or
  // grate at the very edge cannot clip the swept collider between samples.
  // Include one trailing deck length around corners; the path interpolates
  // between sampled heights and must stay raised until the deck clears ramps.
  const clearanceRadius = halfSize * Math.SQRT2 + halfSize;
  const pushAt = (x, z, sourceIndex) => {
    const floor = pathHeight(level, x, z, clearanceRadius);
    if (floor === null) throw new Error(`Ranked ${id} tower path ${sourceIndex} is not over live floor (${x.toFixed(2)}, ${z.toFixed(2)})`);
    // The collider has a 0.24 m deck thickness centered 0.12 m below this
    // point, so 0.40 m of top-face clearance leaves a visible/collision gap.
    path.push([x, floor + 0.40, z]);
    if (sourceIndex === spec.centerIndex) centerIndex = path.length - 1;
  };
  pushAt(mapped[0][0], mapped[0][1], 0);
  for (let i = 1; i < mapped.length; i++) {
    const a = mapped[i - 1], b = mapped[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.25));
    for (let n = 1; n <= steps; n++) {
      const t = n / steps;
      pushAt(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, n === steps ? i : -1);
    }
  }
  return { path, centerIndex };
}

function normalizeStage(level, id, spec) {
  const zones = spec.zones.map(([x, z, width, depth], i) => {
    const center = pointOnStage(level, id, [x, z], !!spec.local, null, `zone ${i} center`);
    return { center, size: [width, depth] };
  });
  const halfSize = spec.halfSize ?? 1.4;
  const towerPath = buildTowerPath(level, id, spec, !!spec.local, halfSize);
  const goals = spec.goals.map((p, i) => pointOnStage(level, id, p, !!spec.local, null, `goal ${i}`));
  const checkpoints = spec.checkpoints.map((team, t) => team.map((p, i) =>
    pointOnStage(level, id, p, !!spec.local, null, `team ${t} checkpoint ${i}`)));
  const center = pointOnStage(level, id, spec.center, !!spec.local, null, 'Rainmaker center');
  const clams = spec.clams.map((p, i) => pointOnStage(level, id, p, !!spec.local, null, `clam spawn ${i}`));

  return {
    id,
    zones,
    tower: {
      path: towerPath.path, centerIndex: towerPath.centerIndex,
      checkpoints: [[{ progress: 0.42, count: 5 }, { progress: 0.78, count: 5 }],
        [{ progress: 0.42, count: 5 }, { progress: 0.78, count: 5 }]],
      speed: 1.2, halfSize,
    },
    rainmaker: {
      center, checkpoints, goals,
      retreatZ: spec.retreatZ.slice(),
    },
    clams: { spawns: clams, goals: goals.map(p => p.slice()) },
    calibration: 'Local INKWAVE gameplay estimate based on the active blockout collision geometry; not retail stage collision data.',
  };
}

export function createRankedStage(G) {
  const level = G?.level;
  const id = level?.layout?.id;
  const spec = SPECS[id];
  if (!level || !spec) throw new RangeError(`No ranked stage calibration for map ${String(id)}`);
  return normalizeStage(level, id, spec);
}

