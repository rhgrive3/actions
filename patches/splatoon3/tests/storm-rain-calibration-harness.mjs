import { fixture } from './source-fixture.mjs';
import { FixedClock, STEP } from '../runtime/clock.mjs';

export const STORM_CALIBRATION_RENDER_HZ = Object.freeze([30, 60, 120]);
export const STORM_CALIBRATION_SECONDS = 8;
export const STORM_CALIBRATION_SEED = 0x2262026;
export const STORM_CALIBRATION_EXTRA_EXPORTS = "export { FX } from './inkwave-public/src/fx/fx.js';";

const TAU = Math.PI * 2;
const RADIAL_BIN_WORLD_UNITS = 0.5;
const ANGULAR_BIN_DEGREES = 30;
const round = (n) => Number.isFinite(n) ? Math.round(n * 1e9) / 1e9 : null;

function isLeafRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value).every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item));
}

export function stringifyCalibrationJson(value) {
  const format = (item, depth) => {
    if (item === null || typeof item !== 'object') return JSON.stringify(item);
    if (isLeafRecord(item)) return JSON.stringify(item);
    const indent = '  '.repeat(depth);
    const childIndent = '  '.repeat(depth + 1);
    if (Array.isArray(item)) {
      if (item.length === 0) return '[]';
      return `[\n${item.map((child) => `${childIndent}${format(child, depth + 1)}`).join(',\n')}\n${indent}]`;
    }
    const entries = Object.entries(item);
    if (entries.length === 0) return '{}';
    return `{\n${entries.map(([key, child]) => `${childIndent}${JSON.stringify(key)}: ${format(child, depth + 1)}`).join(',\n')}\n${indent}}`;
  };
  return format(value, 0);
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function headlessPaintRenderer() {
  return {
    capabilities: { getMaxAnisotropy: () => 1 },
    target: null,
    autoClear: true,
    getRenderTarget() { return this.target; },
    getClearColor(out) { return out.setRGB(0, 0, 0); },
    getClearAlpha() { return 0; },
    setRenderTarget(target) { this.target = target; },
    setClearColor() {},
    clear() {},
    render() {},
  };
}

function timestamp(renderHz, renderFrame, simulationTick, G, cloud) {
  return {
    renderHz,
    renderFrame,
    simulationTick,
    simulationTimeSeconds: round(G.time),
    cloudTimeSeconds: round(cloud.t),
  };
}

function collectCpuTurf(paint, level, center, team, radiusLimitWorldUnits) {
  const own = team + 1;
  let cells = 0;
  let areaWorldUnitsSquared = 0;
  const bins = new Map();
  const radialBinCount = Math.ceil(radiusLimitWorldUnits / RADIAL_BIN_WORLD_UNITS);
  for (const face of level.faces) {
    if (!face.turf || !face.atlas) continue;
    for (let j = 0; j < face.nv; j++) for (let i = 0; i < face.nu; i++) {
      const k = face.grid + j * face.nu + i;
      if (paint.dead[k] || paint.grid[k] !== own) continue;
      cells++;
      const cellArea = face.cu * face.cv;
      areaWorldUnitsSquared += cellArea;
      const x = face.origin.x + face.u.x * (i + 0.5) * face.cu + face.v.x * (j + 0.5) * face.cv;
      const z = face.origin.z + face.u.z * (i + 0.5) * face.cu + face.v.z * (j + 0.5) * face.cv;
      const dx = x - center.x, dz = z - center.z;
      const radius = Math.hypot(dx, dz);
      const radialBin = Math.min(radialBinCount - 1, Math.floor(radius / RADIAL_BIN_WORLD_UNITS));
      const angle = (Math.atan2(dz, dx) + TAU) % TAU;
      const angularBin = Math.floor(angle * 180 / Math.PI / ANGULAR_BIN_DEGREES);
      const key = `${radialBin}:${angularBin}`;
      const bin = bins.get(key) || { radialBin, angularBin, cells: 0, areaWorldUnitsSquared: 0 };
      bin.cells++;
      bin.areaWorldUnitsSquared += cellArea;
      bins.set(key, bin);
    }
  }
  return {
    cells,
    areaWorldUnitsSquared: round(areaWorldUnitsSquared),
    distribution: [...bins.values()].sort((a, b) => a.radialBin - b.radialBin || a.angularBin - b.angularBin).map((bin) => ({
      radialStartWorldUnits: round(bin.radialBin * RADIAL_BIN_WORLD_UNITS),
      radialEndWorldUnits: round((bin.radialBin + 1) * RADIAL_BIN_WORLD_UNITS),
      angleStartDegrees: bin.angularBin * ANGULAR_BIN_DEGREES,
      angleEndDegrees: (bin.angularBin + 1) * ANGULAR_BIN_DEGREES,
      cells: bin.cells,
      areaWorldUnitsSquared: round(bin.areaWorldUnitsSquared),
    })),
  };
}

function comparableEvent(event) {
  const { renderHz, renderFrame, ...simulationEvent } = event;
  return simulationEvent;
}

export function comparableStormRun(run) {
  return {
    summary: Object.fromEntries(Object.entries(run.summary).filter(([key]) => key !== 'renderHz' && key !== 'renderFrames')),
    events: run.events.map(comparableEvent),
    distribution: run.distribution,
  };
}

// 'production': the composed INKWAVE build (adapter + runtime), updated on the fixed 60 Hz clock.
// 'public-source': the unpatched inkwave-public modules, with one _updateClouds(dt) per render frame
// (the Issue #226 "関数単独" scope). Its update window stops 0.3 s before expiry in the public source.
export const STORM_CALIBRATION_SCOPES = Object.freeze(['production', 'public-source']);
const passthroughSource = (_rel, code) => code;

export async function measureStormRainAtRenderHz(renderHz, {
  seed = STORM_CALIBRATION_SEED,
  durationSeconds = STORM_CALIBRATION_SECONDS,
  scope = 'production',
} = {}) {
  if (!Number.isInteger(renderHz) || renderHz <= 0 || renderHz > 240) throw new RangeError('renderHz must be an integer from 1 to 240');
  if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) throw new RangeError('durationSeconds must be a positive integer');
  if (!STORM_CALIBRATION_SCOPES.includes(scope)) throw new RangeError(`scope must be one of ${STORM_CALIBRATION_SCOPES.join(', ')}`);
  const production = scope === 'production';

  const f = await fixture({
    productionComposition: production,
    fullRuntime: production,
    realProjectiles: true,
    extraExports: STORM_CALIBRATION_EXTRA_EXPORTS,
    vmMathRandom: mulberry32(seed ^ 0x58584658),
    ...(production ? {} : { adapt: passthroughSource, adaptNative: passthroughSource }),
  });
  const { G, THREE, Level, PaintSystem, Projectiles, Physics, FX, profile } = f;
  G.scene = new THREE.Scene();
  G.netm = null;
  G.actors = [];
  G.time = 0;

  const bounds = { minX: -32, maxX: 32, minZ: -32, maxZ: 32 };
  const level = new Level({
    bounds,
    spawnPads: [[-8, 0, -8], [8, 0, 8]],
    spawnBarrier: 0,
    half: [],
    single: [{ kind: 'box', min: [-32, -0.5, -32], max: [32, 0, 32] }],
  });
  G.level = level;
  G.physics = new Physics(level);
  G.paint = new PaintSystem(headlessPaintRenderer(), level, { atlasSize: 1024, maxDensity: 4, cell: 0.25 });
  G.projectiles = new Projectiles(G.scene);
  G.fx = new FX(G.scene, { quality: 'high' });
  G.boss = null;

  const owner = f.make('shooter');
  owner.team = 0;
  owner.remote = false;
  G.actors = [];

  const cloud = {
    t: 0,
    dur: durationSeconds,
    team: 0,
    ghost: false,
    owner,
    dir: new THREE.Vector3(),
    rainT: 0,
    group: new THREE.Group(),
  };
  cloud.group.position.set(0, 5, 0);
  G.projectiles.clouds.push(cloud);

  const events = [];
  let renderFrame = 0;
  let simulationTick = 0;
  let nextCandidateIndex = 0;
  let currentCandidateIndex = null;
  let cosmeticParticleEmissions = 0;
  let cosmeticRainCalls = 0;
  let paintFlaggedCosmeticEmissions = 0;

  const record = (kind, data = {}) => events.push({
    kind,
    ...timestamp(renderHz, renderFrame, simulationTick, G, cloud),
    ...data,
  });

  const raycast = G.physics.raycast.bind(G.physics);
  G.physics.raycast = (origin, direction, reach, hit) => {
    const candidateIndex = nextCandidateIndex++;
    currentCandidateIndex = candidateIndex;
    const result = raycast(origin, direction, reach, hit);
    record('candidate_ray_emission', {
      candidateIndex,
      x: round(origin.x), y: round(origin.y), z: round(origin.z),
      rayLengthWorldUnits: round(reach),
      hit: !!result.hit,
    });
    if (result.hit) record('ray_ground_hit', {
      candidateIndex,
      x: round(result.point.x), y: round(result.point.y), z: round(result.point.z),
      normalY: round(result.normal.y),
    });
    return result;
  };

  const splat = G.paint.splat.bind(G.paint);
  let summedCircularBrushFootprintWorldUnitsSquared = 0;
  let summedClaimedWorldUnitsSquared = 0;
  let paintWriteEvents = 0;
  G.paint.splat = (center, radius, team, opts = {}) => {
    const beforeCells = G.paint.counts[team];
    const beforeVersion = G.paint.version;
    const claimedWorldUnitsSquared = splat(center, radius, team, opts);
    const cellDelta = G.paint.counts[team] - beforeCells;
    const result = {
      candidateIndex: currentCandidateIndex,
      x: round(center.x), y: round(center.y), z: round(center.z),
      radiusWorldUnits: round(radius),
      nominalCircularBrushFootprintWorldUnitsSquared: round(Math.PI * radius * radius),
      claimedWorldUnitsSquared: round(claimedWorldUnitsSquared),
      cpuTurfCellsDelta: cellDelta,
      cpuGridVersionDelta: G.paint.version - beforeVersion,
    };
    summedCircularBrushFootprintWorldUnitsSquared += Math.PI * radius * radius;
    summedClaimedWorldUnitsSquared += claimedWorldUnitsSquared;
    paintWriteEvents++;
    record('paint_splat_write', result);
    currentCandidateIndex = null;
    return claimedWorldUnitsSquared;
  };

  const fx = G.fx;
  let activeCosmeticBatch = null;
  const spawnDrop = fx._spawnDrop;
  fx._spawnDrop = function (...args) {
    if (activeCosmeticBatch) {
      activeCosmeticBatch.count++;
      if ((args[11] & 1) !== 0) activeCosmeticBatch.paintFlagged++;
    }
    return spawnDrop.apply(this, args);
  };
  const rain = fx.rain;
  fx.rain = function (pos, radius, color, dt, opts) {
    const batch = { count: 0, paintFlagged: 0 };
    activeCosmeticBatch = batch;
    try {
      return rain.call(this, pos, radius, color, dt, opts);
    } finally {
      activeCosmeticBatch = null;
      cosmeticRainCalls++;
      cosmeticParticleEmissions += batch.count;
      paintFlaggedCosmeticEmissions += batch.paintFlagged;
      record('cosmetic_fx_rain_batch', {
        x: round(pos.x), y: round(pos.y), z: round(pos.z),
        visualRadiusWorldUnits: round(radius),
        emittedCosmeticParticles: batch.count,
        paintFlaggedParticles: batch.paintFlagged,
      });
    }
  };

  const clock = production ? new FixedClock() : null;
  if (production) G.paint.useFixedPaintClock();
  const renderFrames = renderHz * durationSeconds;
  for (renderFrame = 1; renderFrame <= renderFrames; renderFrame++) {
    if (production) {
      clock.advance(1 / renderHz, (dt) => {
        simulationTick++;
        G.time += dt;
        G.projectiles._updateClouds(dt);
        G.paint.advanceSimulation(dt);
      });
    } else {
      simulationTick++;
      G.time += 1 / renderHz;
      G.projectiles._updateClouds(1 / renderHz);
    }
    G.paint.flush(1 / renderHz);
  }

  const turf = collectCpuTurf(G.paint, level, cloud.group.position, cloud.team, profile.specials.storm.radius + 2);
  const audit = production ? (cloud.s3RainAudit || {}) : null;
  const candidateRayEmissions = events.filter((e) => e.kind === 'candidate_ray_emission').length;
  const rayGroundHits = events.filter((e) => e.kind === 'ray_ground_hit').length;
  const cosmeticParticleBatchEvents = events.filter((e) => e.kind === 'cosmetic_fx_rain_batch');
  const simulationTicks = production ? clock.ticks : simulationTick;
  const summary = {
    scope,
    renderHz,
    renderFrames,
    fixedSimulationHz: production ? 60 : null,
    simulationStepRule: production ? 'composed INKWAVE FixedClock, 60 Hz' : 'one public _updateClouds(1/renderHz) per render frame',
    fixedSimulationTicks: simulationTicks,
    fixedSimulationSeconds: round(production ? clock.ticks * STEP : renderFrames / renderHz),
    cloudCount: 1,
    cloudRemovedAtEnd: G.projectiles.clouds.length === 0,
    candidateRayEmissions,
    rayGroundHits,
    paintWriteEvents,
    auditCandidateRayEmissions: audit ? (audit.candidateDrops ?? 0) : null,
    auditRayGroundHits: audit ? (audit.groundHits ?? 0) : null,
    auditPaintEvents: audit ? (audit.paintEvents ?? 0) : null,
    cosmeticRainCalls,
    cosmeticParticleEmissions,
    cosmeticParticleBatchEvents: cosmeticParticleBatchEvents.length,
    paintFlaggedCosmeticEmissions,
    summedCircularBrushFootprintWorldUnitsSquared: round(summedCircularBrushFootprintWorldUnitsSquared),
    summedClaimedWorldUnitsSquared: round(summedClaimedWorldUnitsSquared),
    finalCpuTurfCellsFromGrid: turf.cells,
    finalCpuTurfUnionWorldUnitsSquared: turf.areaWorldUnitsSquared,
    finalCpuTurfCellsFromPaintCounts: G.paint.counts[cloud.team],
    finalCpuTurfGridVersion: G.paint.version,
    renderCadenceSimulationTimeSeconds: round(G.time),
  };
  return { summary, events, distribution: turf.distribution };
}

export async function measureStormRainCalibration({
  renderRates = STORM_CALIBRATION_RENDER_HZ,
  scopes = STORM_CALIBRATION_SCOPES,
  ...options
} = {}) {
  const runs = [];
  for (const scope of scopes) for (const renderHz of renderRates) runs.push(await measureStormRainAtRenderHz(renderHz, { ...options, scope }));
  return {
    measurement: {
      issue: 226,
      status: 'calibration research; no confirmed overpainting defect',
      measurementDate: '2026-10-09',
      baselineMain: '5d0be6b7fdebfd07e696e75497aaa97aa5ff5648',
      seed: options.seed ?? STORM_CALIBRATION_SEED,
      durationSeconds: options.durationSeconds ?? STORM_CALIBRATION_SECONDS,
      fixedSimulationHz: 60,
      renderRates,
      scopes,
      coordinateUnits: {
        inkwaveInternalConvention: 'The project profile documents raw coordinates 1:1 with INKWAVE meters, with distanceScale.factor=1 marked inferred; actual character/stage scale still requires measurement.',
        distance: 'INKWAVE world units (WU); no conversion to retail Splatoon 3 units is established',
        area: 'INKWAVE world units squared (WU²); no conversion to retail Splatoon 3 area is established',
        retailMapping: 'unknown; this measurement applies no conversion',
      },
      scenario: {
        cloudCount: 1,
        team: 0,
        owner: 'local, non-ghost',
        cloudOriginWorldUnits: [0, 5, 0],
        cloudDriftDirection: [0, 0, 0],
        terrain: '64 WU x 64 WU flat paintable CPU turf plane at y=0 WU',
        actors: 0,
        gear: 'none',
      },
      existingAdapterContext: {
        stormUpdateWindow: 'production scope: the already-present composed adapter runs rain through the final duration tick; no change made here',
        publicSourceUpdateWindow: 'public-source scope: unpatched _updateClouds emits rain only while cloud time < duration - 0.3 s, checked once per update call',
        rayReachWorldUnits: 12,
        rayReachStatus: 'existing INKWAVE adapter bound in WU; no Nintendo-specific value asserted and no gameplay value changed by this tooling',
      },
      terminology: {
        candidateRayEmissions: 'INKWAVE calls into its rain raycast path; not Nintendo rain particles',
        rayGroundHits: 'successful returns from the composed INKWAVE Physics.raycast against the fixture plane',
        paintWriteEvents: 'calls to the composed INKWAVE PaintSystem.splat; CPU turf grid accounting is reported separately',
        cosmeticParticleEmissions: 'FX.rain drop-pool admissions counted at FX._spawnDrop; not Nintendo particles',
        summedCircularBrushFootprintWorldUnitsSquared: 'sum of pi*r^2 for each splat call in WU²; a nominal overlap-prone proxy, not turf union',
        finalCpuTurfUnionWorldUnitsSquared: 'area in WU² of unique team-owned turf cells in the real PaintSystem CPU grid after the run',
      },
    },
    runs,
  };
}
