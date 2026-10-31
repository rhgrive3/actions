// A MAP3-only lower-floor projection. Geometry and ink remain face-owned; this
// chooses which existing face is visible at an overlapping XZ, never recolors
// or merges the two floors. Ordinary/native map projections use their old path.
const FIELDS = ['hgt', 'topBlock', 'nrm', 'pixCell', 'pixFx', 'pixFy', 'pixSx', 'pixSy', 'owner', 'base', 'bctx'];
const inside = (rect, x, z) => x >= rect[0] && x <= rect[1] && z >= rect[2] && z <= rect[3];

function upperSurfaces(stage) {
  return [
    ...stage.floors.filter(f => f.bottom > 0).map(f => ({ rect: f.rect, bottom: () => f.bottom, top: () => f.y })),
    ...stage.ramps.map(r => {
      const axis = r.axis === 'x' ? 0 : 2, run = r.rect[axis + 1] - r.rect[axis];
      const top = (x, z) => r.y0 + (r.y1 - r.y0) * ((axis === 0 ? x : z) - r.rect[axis]) / run;
      return { rect: r.rect, bottom: (x, z) => top(x, z) - r.thickness, top };
    }),
  ];
}

function layers(map) {
  if (!map.level.layout?.map3 || map.level.native) return null;
  return map._map3Layers || (map._map3Layers = { stage: map.level.layout.map3,
    surfaces: upperSurfaces(map.level.layout.map3), cache: new Map(), flip: map.flip });
}

function lowerFloor(stage, x, z, ceiling) {
  return stage.floors.some(f => f.material !== 'grate' && f.y <= ceiling - 1.6 && inside(f.rect, x, z));
}

// Exposed for exact same-XZ regression tests and HUD diagnostics. The lower
// projection changes only columns containing genuinely separated walkable floors.
export function map3MinimapCeiling(map, x, z) {
  const state = layers(map);
  if (!state) return Infinity;
  let ceiling = Infinity;
  for (const surface of state.surfaces) {
    if (!inside(surface.rect, x, z)) continue;
    const bottom = surface.bottom(x, z);
    if (bottom < ceiling && lowerFloor(state.stage, x, z, bottom)) ceiling = bottom;
  }
  return ceiling;
}

export function prepareMap3Projection(map) {
  const state = layers(map);
  if (!state) return null;
  if (state.flip !== map.flip) { state.cache.clear(); state.flip = map.flip; }
  map.map3Layer ||= 'upper';
  for (const [key, cached] of state.cache) if (key !== map.map3Layer && cached.base === map.base) {
    map.base = document.createElement('canvas'); map.base.width = map.w; map.base.height = map.h;
    map.bctx = map.base.getContext('2d', { willReadFrequently: true });
    // Production's resource adapter reuses correctly sized typed arrays on a
    // rebuild. Detach them here so it cannot overwrite the cached other floor.
    for (const field of FIELDS) if (field !== 'base' && field !== 'bctx') map[field] = null;
    break;
  }
  if (map.map3Layer !== 'lower') return null;
  const caps = new Float32Array(map.w * map.h).fill(Infinity), tc = {};
  for (const surface of state.surfaces) for (const floor of state.stage.floors) {
    if (floor.material === 'grate') continue;
    const rect = [Math.max(surface.rect[0], floor.rect[0]), Math.min(surface.rect[1], floor.rect[1]),
      Math.max(surface.rect[2], floor.rect[2]), Math.min(surface.rect[3], floor.rect[3])];
    if (rect[0] >= rect[1] || rect[2] >= rect[3]) continue;
    map.toCanvas(rect[0], rect[2], tc); const ax = tc.x, ay = tc.y;
    map.toCanvas(rect[1], rect[3], tc);
    const x0 = Math.max(0, Math.floor(Math.min(ax, tc.x))), x1 = Math.min(map.w - 1, Math.ceil(Math.max(ax, tc.x)));
    const z0 = Math.max(0, Math.floor(Math.min(ay, tc.y))), z1 = Math.min(map.h - 1, Math.ceil(Math.max(ay, tc.y)));
    for (let py = z0; py <= z1; py++) for (let px = x0; px <= x1; px++) {
      const x = map._worldX(px + .5), z = map._worldZ(py + .5);
      if (!inside(rect, x, z)) continue;
      const ceiling = surface.bottom(x, z);
      if (floor.y > ceiling - 1.6) continue;
      const i = py * map.w + px;
      caps[i] = Math.min(caps[i], ceiling - .01);
    }
  }
  return caps;
}

export function rememberMap3Projection(map) {
  const state = layers(map);
  if (state) state.cache.set(map.map3Layer || 'upper', Object.fromEntries(FIELDS.map(key => [key, map[key]])));
}

export function updateMap3Projection(map, actor, dt) {
  const state = layers(map);
  if (!state || !actor?.pos) return;
  const ceiling = map3MinimapCeiling(map, actor.pos.x, actor.pos.z);
  // A real jump stays below the slab; feet, rather than the camera pivot, own
  // selection. A short dwell prevents edge jitter during lateral movement.
  const desired = actor.alive !== false && Number.isFinite(ceiling) && actor.pos.y < ceiling - .3 ? 'lower' : 'upper';
  if (desired === (map.map3Layer || 'upper')) { map._map3Pending = null; map._map3Dwell = 0; return; }
  if (map._map3Pending !== desired) { map._map3Pending = desired; map._map3Dwell = 0; }
  map._map3Dwell += Math.max(0, dt);
  if (map._map3Dwell < .18) return;
  map.map3Layer = desired; map._map3Pending = null; map._map3Dwell = 0;
  const cached = state.flip === map.flip && state.cache.get(desired);
  if (cached) { for (const key of FIELDS) map[key] = cached[key]; map._built = true; }
  else map._built = false;
  map.version = -1; map.timer = 0; map._band = 0; map._composeDirty = true;
  map._inkGen = -1;
  if (map.paint.inkDirty) map.paint.inkDirty.full = true;
}

export function invalidateMap3ProjectionTheme(map) {
  const state = layers(map);
  if (state) for (const key of state.cache.keys()) if (key !== map.map3Layer) state.cache.delete(key);
}

export function drawMap3ProjectionLabel(map) {
  if (!layers(map)) return;
  const c = map.ctx, height = Math.max(20, map.s * 3.2), width = height * 3.2;
  c.save(); c.globalAlpha = .9; c.fillStyle = '#17282d';
  c.fillRect(6, map.h - height - 6, width, height);
  c.globalAlpha = 1; c.fillStyle = '#ffffff'; c.font = `600 ${height * .6}px sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(map.map3Layer === 'lower' ? '↓ 下層' : '↑ 上層', 6 + width / 2, map.h - height / 2 - 6);
  c.restore();
}

export const MAP3_MINIMAP = Object.freeze({ prepare: prepareMap3Projection, remember: rememberMap3Projection,
  update: updateMap3Projection, invalidateTheme: invalidateMap3ProjectionTheme, drawLabel: drawMap3ProjectionLabel });
