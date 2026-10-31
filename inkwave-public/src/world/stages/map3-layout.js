// Public terrain generated from the frozen MAP3 coordinate records. The source
// contains both teams explicitly: putting these definitions in `half` would
// duplicate collision/paint faces. Other maps retain their existing builders.
import { B, R, PATTERN } from '../mapkit.js';
import { MAP3_STAGES, MAP3_SOURCE, getMap3Stage } from './map3-data.js';
import { MAP3_MINIMAP } from './map3-minimap.js';
export { getMap3Stage };

const PALETTES = {
  tidewater: {
    floor: ['#c2c6bd', '#dfcdae', '#d8b89a', '#e4d8bf', '#d6e2db'],
    edge: '#628d8a', cover: '#e7daca', accent: '#658f8b', grate: '#526b74',
  },
  kelpline: {
    floor: ['#aebbc2', '#c3ccca', '#c8b491', '#d3d9d1', '#d8cbb3', '#b6c8c6'],
    edge: '#536d7a', cover: '#c5d3d0', accent: '#aa7455', grate: '#536873',
  },
};

function floorStyle(stage, floor) {
  const p = PALETTES[stage.id];
  if (floor.material === 'grate') return { color: p.grate, pattern: PATTERN.grate, grate: true };
  if (floor.id.endsWith('_spawn')) return { color: '#ebe5d5', pattern: PATTERN.spawn };
  const color = p.floor[Math.round(floor.y / 1.2)] || p.floor[0];
  // Material follows the place's use, not only its height. These are the
  // existing ink-aware texlib layers: no coplanar overlays hide painted turf.
  if (stage.id === 'kelpline') {
    if (/cargo/.test(floor.id)) return { color: '#aaada2', pattern: PATTERN.yard };
    if (/service|recovery_foot/.test(floor.id)) return { color: '#a5b3ad', pattern: PATTERN.asphalt };
    if (/quay|outer_foot|ferry/.test(floor.id)) return { color: '#d1c9b4', pattern: PATTERN.concrete };
    if (/gantry|high_neck|outer_top/.test(floor.id)) return { color: '#b4c4bd', pattern: PATTERN.nonslip };
    if (/boarding|central_/.test(floor.id)) return { color: '#c4d2c6', pattern: PATTERN.concrete };
    return { color: '#dfd4b9', pattern: PATTERN.tiles };
  }
  if (/market/.test(floor.id)) return { color, pattern: PATTERN.planks };
  if (/low_|underpass|central_arm/.test(floor.id)) return { color: '#b0b8ad', pattern: PATTERN.concrete };
  if (/arrival|civic|lower_court|belvedere/.test(floor.id)) return { color: '#dfdcc7', pattern: PATTERN.tiles };
  if (/west_terrace/.test(floor.id)) return { color: '#cfb293', pattern: PATTERN.pavers };
  return { color: '#d7cbb4', pattern: PATTERN.pavers };
}

function rampDefinition(stage, ramp) {
  const [x0, x1, z0, z1] = ramp.rect;
  const alongX = ramp.axis === 'x';
  const a = alongX ? [x0, ramp.y0, (z0 + z1) / 2] : [(x0 + x1) / 2, ramp.y0, z0];
  const b = alongX ? [x1, ramp.y1, (z0 + z1) / 2] : [(x0 + x1) / 2, ramp.y1, z1];
  const run = alongX ? x1 - x0 : z1 - z0;
  const rise = Math.abs(ramp.y1 - ramp.y0);
  // Level.R measures thickness normal to its sloped top, whereas MAP3 specifies
  // a vertical .6 WU slab. Multiplying by cos(theta) makes the underside exactly
  // .6 below that top at any shared XZ. `thin` prevents the default filled wedge
  // from blocking an underpass. The existing .6 sloped low toe stays buried in
  // the adjoining lower floor; its actual OBB is exercised by runtime tests.
  const thickness = ramp.thickness * run / Math.hypot(run, rise);
  return R(a[1] <= b[1] ? a : b, a[1] <= b[1] ? b : a, alongX ? z1 - z0 : x1 - x0, {
    tag: ramp.id, thin: true, thickness, bevel: 0,
    color: PALETTES[stage.id].floor[Math.round(Math.min(ramp.y0, ramp.y1) / 1.2)],
    pattern: PATTERN.concrete,
  });
}

export function createMap3Layout(stageOrId) {
  const stage = typeof stageOrId === 'string' ? getMap3Stage(stageOrId) : stageOrId;
  if (!stage || !PALETTES[stage.id]) throw new Error('Unknown MAP3 stage');
  const p = PALETTES[stage.id];
  const single = stage.floors.map(f => B(f.rect[0], f.rect[1], f.bottom, f.y, f.rect[2], f.rect[3], {
    ...floorStyle(stage, f), tag: f.id, bevel: 0,
  }));
  single.push(...stage.ramps.map(r => rampDefinition(stage, r)));
  single.push(...stage.obstacles.map(o => B(o.rect[0], o.rect[1], o.y0, o.y1, o.rect[2], o.rect[3], {
    tag: o.id, paint: o.paint !== false,
    bevel: stage.id === 'kelpline' ? .16 : /sea_lip/.test(o.id) ? .08 : /spawn/.test(o.id) ? .12 : .22,
    color: o.paint === false ? p.edge : /cargo|stack/.test(o.id) ? p.accent : p.cover,
    pattern: o.paint === false ? PATTERN.metalpanel : /cargo|stack/.test(o.id) ? PATTERN.container : PATTERN.render,
  })));
  return {
    id: stage.id,
    bounds: { minX: stage.bounds[0], maxX: stage.bounds[1], minZ: stage.bounds[2], maxZ: stage.bounds[3] },
    spawnPads: stage.spawns.map(s => [...s.point]),
    homeSuperJumpPoints: stage.spawns.map(s => [...s.point]),
    spawnBarrier: 4.2,
    waterY: stage.waterY,
    envBoats: false,
    // Multi-level remote flank routes can exceed the legacy 6,000 A* pops.
    // This opt-in is measured against both maps and does not affect other maps.
    navPathMaxIter: 12000,
    single, half: [],
    // The complete immutable source is available to structural art, rule
    // objectives, navigation diagnostics and browser probes without copying it.
    map3: stage,
    map3Source: MAP3_SOURCE,
    minimapProjection: MAP3_MINIMAP,
    decor: { lamps: [], palms: [], flags: [] },
    intro: { from: [22, 17, 12], lookFrom: [0, stage.id === 'kelpline' ? 3.6 : 0, 0], toBack: 3 },
  };
}

export const MAP3_LAYOUTS = Object.freeze(Object.fromEntries(
  Object.keys(MAP3_STAGES).map(id => [id, createMap3Layout(id)]),
));
