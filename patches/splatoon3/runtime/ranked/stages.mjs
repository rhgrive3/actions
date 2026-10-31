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
  const pushAt = (x, z, sourceIndex, nominalY) => {
    const floor = spec.floorAt ? spec.floorAt(x, z, nominalY, clearanceRadius) : pathHeight(level, x, z, clearanceRadius);
    if (floor === null) throw new Error(`Ranked ${id} tower path ${sourceIndex} is not over live floor (${x.toFixed(2)}, ${z.toFixed(2)})`);
    // The collider has a 0.24 WU deck thickness centered 0.12 WU below this
    // point, so 0.40 WU of top-face clearance leaves a visible/collision gap.
    path.push([x, floor + 0.40, z]);
    if (sourceIndex === spec.centerIndex) centerIndex = path.length - 1;
  };
  pushAt(mapped[0][0], mapped[0][1], 0, spec.heights?.[0]);
  for (let i = 1; i < mapped.length; i++) {
    const a = mapped[i - 1], b = mapped[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.25));
    for (let n = 1; n <= steps; n++) {
      const t = n / steps;
      const nominalY = spec.heights ? spec.heights[i - 1] + (spec.heights[i] - spec.heights[i - 1]) * t : undefined;
      pushAt(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, n === steps ? i : -1, nominalY);
    }
  }
  return { path, centerIndex };
}

function normalizeStage(level, id, spec, mode) {
  const zones = spec.zones.map(([x, z, width, depth], i) => {
    const center = pointOnStage(level, id, [x, z], !!spec.local, null, `zone ${i} center`);
    return { center, size: [width, depth] };
  });
  const halfSize = spec.halfSize ?? 1.4;
  // Legacy calls and Tower retain the exact eager sampling order. Other
  // modes keep a lazy compatible tower view for diagnostics without sampling
  // tens of thousands of unused collision points during match setup.
  let towerPath = mode === undefined || mode === 'tower' ? buildTowerPath(level, id, spec, !!spec.local, halfSize) : null;
  const getTowerPath = () => towerPath || (towerPath = buildTowerPath(level, id, spec, !!spec.local, halfSize));
  const goals = spec.goals.map((p, i) => pointOnStage(level, id, p, !!spec.local, null, `goal ${i}`));
  const checkpoints = spec.checkpoints.map((team, t) => team.map((p, i) =>
    pointOnStage(level, id, p, !!spec.local, null, `team ${t} checkpoint ${i}`)));
  const center = pointOnStage(level, id, spec.center, !!spec.local, null, 'Rainmaker center');
  const clams = spec.clams.map((p, i) => pointOnStage(level, id, p, !!spec.local, null, `clam spawn ${i}`));

  return {
    id,
    zones,
    tower: {
      get path() { return getTowerPath().path; }, set path(value) { getTowerPath().path = value; },
      get centerIndex() { return getTowerPath().centerIndex; }, set centerIndex(value) { getTowerPath().centerIndex = value; },
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

function map3TowerFloorSampler(level, source) {
  const ids = new Set([...source.floors, ...source.ramps].map(part => part.id));
  const point = level.blocks[0].center.clone(), query = [];
  const maxGrade = Math.max(0, ...source.ramps.map(r => Math.abs(r.y1 - r.y0) /
    (r.axis === 'x' ? r.rect[1] - r.rect[0] : r.rect[3] - r.rect[2])));
  function floorAt(x, z, ceiling) {
    let best = null;
    for (const index of level.queryBlocks(x - .01, z - .01, x + .01, z + .01, query)) {
      const block = level.blocks[index], n = block.axes[1];
      if (!block.solid || !ids.has(block.tag) || n.y < .68) continue;
      const y = block.center.y + (block.half.y - n.x * (x - block.center.x) - n.z * (z - block.center.z)) / n.y;
      if (y > ceiling || best !== null && y <= best) continue;
      if (level.pointInBlock(block, point.set(x, y - .01, z), .001)) best = y;
    }
    return best;
  }
  return (x, z, nominalY, radius) => {
    let best = floorAt(x, z, nominalY + .08);
    if (best === null || Math.abs(best - nominalY) > .08) throw new Error(`MAP3 tower route lost authored support (${x}, ${nominalY}, ${z})`);
    // Anticipate ramps under the rotated/trailing deck, without promoting a
    // higher storey, canopy, arch or portal beam into the tower's ground floor.
    // Any obstacle still intersecting the swept body is an actual validation
    // failure; it is never hidden by lifting the route onto the obstacle top.
    const ceiling = nominalY + radius * maxGrade + .08, step = .15;
    for (let dz = -radius; dz <= radius + step / 2; dz += step) for (let dx = -radius; dx <= radius + step / 2; dx += step) {
      if (dx * dx + dz * dz > radius * radius) continue;
      const y = floorAt(x + dx, z + dz, ceiling);
      if (y !== null && y > best) best = y;
    }
    return best;
  };
}

function normalizeMap3Stage(level, mode) {
  const source = level.layout.map3, { id, rules } = source;
  // Preserve the authored storey. Highest-XZ sampling moves lower objectives
  // onto bridges and silently changes the intended attack/defence routes.
  const point = p => p.slice();
  const zones = rules.zones.map(({ rect: [x0, x1, z0, z1], y }) => ({
    center: [(x0 + x1) / 2, y, (z0 + z1) / 2], size: [x1 - x0, z1 - z0], heightTolerance: 0.35,
  }));
  const route = rules.tower.path.map(point);
  if (route.length % 2 === 0) {
    const n = route.length / 2, a = route[n - 1], b = route[n];
    route.splice(n, 0, a.map((v, axis) => (v + b[axis]) / 2));
  }
  const towerSpec = { path: route.map(p => [p[0], p[2]]), heights:route.map(p => p[1]),
    floorAt:map3TowerFloorSampler(level, source), centerIndex: Math.floor(route.length / 2) };
  let towerPath = mode === undefined || mode === 'tower' ? buildTowerPath(level, id, towerSpec, false, 1.4) : null;
  const getTowerPath = () => towerPath || (towerPath = buildTowerPath(level, id, towerSpec, false, 1.4));
  // The design lists A-home then B-home. Both live rule engines index these
  // arrays by ATTACKING team (team 0 advances +Z), so reverse the home order.
  const attackPoints = points => [point(points[1]), point(points[0])];
  return {
    id, zones,
    tower: {
      get path() { return getTowerPath().path; }, set path(value) { getTowerPath().path = value; },
      get centerIndex() { return getTowerPath().centerIndex; }, set centerIndex(value) { getTowerPath().centerIndex = value; },
      checkpoints: [[{ progress: 0.42, count: 5 }, { progress: 0.78, count: 5 }],
        [{ progress: 0.42, count: 5 }, { progress: 0.78, count: 5 }]],
      speed: 1.2, halfSize: 1.4,
    },
    rainmaker: {
      center: point(rules.rainmaker.center),
      checkpoints: attackPoints(rules.rainmaker.checkpoints).map(p => [p]),
      goals: attackPoints(rules.rainmaker.goals),
      // Local stage calibration: forbid retreat into the protected launch area.
      retreatZ: id === 'tidewater' ? [-56, 56] : [-60, 60],
    },
    clams: { spawns: rules.clams.pickupPoints.map(point), goals: attackPoints(rules.clams.baskets) },
    calibration: 'MAP3 authored coordinates with explicit floor bands and live swept tower clearance; not retail stage collision data.',
  };
}

export function createRankedStage(G, mode) {
  const level = G?.level;
  const id = level?.layout?.id;
  if (level?.layout?.map3) return normalizeMap3Stage(level, mode);
  const spec = SPECS[id];
  if (!level || !spec) throw new RangeError(`No ranked stage calibration for map ${String(id)}`);
  return normalizeStage(level, id, spec, mode);
}

