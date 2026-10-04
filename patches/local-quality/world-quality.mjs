// INKWAVE #418: Runtime quality world resource budgets.
// Reallocates and resamples visual-only world resources (paint atlas, shadow map,
// FX particle pools, and prop geometry) when Quality changes at runtime.
// Authoritative CPU paint distribution, actor/physics state, and weapon values are strictly preserved.

let THREE = globalThis.THREE;
if (!THREE) {
  try {
    THREE = await import('three');
  } catch (_) {
    try {
      THREE = await import('../../../inkwave-public/vendor/three/build/three.module.js');
    } catch (_) {
      try {
        THREE = await import('../../vendor/three/build/three.module.js');
      } catch (_) {}
    }
  }
}

const QUALITY_PRESETS = {
  low:    { pixelRatio: 0.75, shadowSize: 1024, msaa: 0, bloom: false, ao: false, paintAtlas: 2048, particles: 0.4 },
  medium: { pixelRatio: 1.0,  shadowSize: 2048, msaa: 2, bloom: true,  ao: false, paintAtlas: 2048, particles: 0.7 },
  high:   { pixelRatio: 1.5,  shadowSize: 4096, msaa: 4, bloom: true,  ao: true,  paintAtlas: 4096, particles: 1.0 },
  ultra:  { pixelRatio: 2.0,  shadowSize: 4096, msaa: 4, bloom: true,  ao: true,  paintAtlas: 4096, particles: 1.0 },
};

export function resolveEffectiveQuality(settings, mobile) {
  const name = QUALITY_PRESETS[settings?.quality] ? settings.quality : 'high';
  const base = QUALITY_PRESETS[name];
  if (!mobile?.touch) return base;
  return Object.freeze({
    ...base,
    paintAtlas: Math.min(base.paintAtlas, 2048),
    shadowSize: Math.min(base.shadowSize, 2048),
    particles: Math.min(base.particles, 0.7),
    msaa: 0,
    ao: false,
    bloom: false,
    pixelRatio: Math.min(base.pixelRatio, mobile.ios ? 1.2 : 1.35),
  });
}

export function updateEnvironmentShadowQuality(env, shadowSize, shadowCache = null) {
  if (!env || !env.sun || env.shadowSize === shadowSize) return false;
  env.shadowSize = shadowSize;
  env.sun.shadow.mapSize.set(shadowSize, shadowSize);
  env.sun.shadow.radius = 2.2 * (shadowSize / 4096) + 0.8;
  if (env.sun.shadow.map) {
    env.sun.shadow.map.dispose?.();
    env.sun.shadow.map = null;
  }
  env._fitShadowCam?.();
  env.sun.shadow.needsUpdate = true;
  if (shadowCache) {
    shadowCache.invalidate?.();
  }
  return true;
}

export function updateFXQuality(fx, targetMultiplier, THREE_LIB = THREE) {
  if (!fx) return false;
  const q = Math.max(0.25, targetMultiplier ?? 1);
  if (fx.q === q) return false;
  fx.q = q;
  fx.maxChecks = Math.round(1100 * q);

  // 1. Droplets pool
  if (fx.dMesh) {
    fx.root?.remove(fx.dMesh);
    fx.dGeo?.dispose?.();
    fx.dMesh.material?.dispose?.();
    if (typeof fx._initDrops === 'function') {
      fx._initDrops(Math.round(2600 * q));
    }
  }

  // 2. Sprites pools (puffs + glows)
  if (fx.puffs?.mesh) {
    fx.root?.remove(fx.puffs.mesh);
    fx.puffs.geo?.dispose?.();
    fx.puffs.mesh.material?.dispose?.();
  }
  if (fx.glows?.mesh) {
    fx.root?.remove(fx.glows.mesh);
    fx.glows.geo?.dispose?.();
    fx.glows.mesh.material?.dispose?.();
  }
  if (typeof fx._initSprites === 'function') {
    fx._initSprites(Math.round(520 * q), Math.round(300 * q));
  }

  // 3. Rings pool
  if (fx.rings?.mesh) {
    fx.root?.remove(fx.rings.mesh);
    fx.rings.geo?.dispose?.();
    fx.rings.mesh.material?.dispose?.();
    if (typeof fx._initRings === 'function') {
      fx._initRings(Math.round(300 * q));
    }
  }

  // 4. Ambient motes
  if (fx.motes) {
    fx.root?.remove(fx.motes);
    fx.motes.geometry?.dispose?.();
    fx.motes.material?.dispose?.();
    if (typeof fx._initMotes === 'function') {
      fx._initMotes(Math.round(300 * q));
    }
  }

  return true;
}

export function updatePropQuality(game, targetQuality, dressingFn = null, ctx = null) {
  const props = game?.props;
  if (!props || props.quality === targetQuality) return false;
  const layoutId = game.layoutId;
  if (!layoutId) return false;

  props.clear?.();
  props.quality = targetQuality;
  props.qf = { low: 0.6, medium: 0.8, high: 1 }[targetQuality] ?? 1;

  if (typeof dressingFn === 'function') {
    try {
      const items = dressingFn(layoutId);
      if (items && Array.isArray(items)) {
        for (const it of items) props.add?.(it.type, it);
      }
    } catch (_) {}
  }
  props.build?.();

  const colors = ctx?.teamColors || game?.teamColors;
  if (colors && colors[0]) {
    props.setTeamColors?.(colors[0], colors[1]);
  }
  game._applyNight?.();
  game._shadowRoots?.();
  game.shadowCache?.invalidate?.();
  return true;
}

export function resampleAtlasFaces(renderer, oldRT, oldSize, newRT, newSize, faces, oldAtlasMap, THREE_LIB = THREE) {
  if (!renderer || typeof renderer.setRenderTarget !== 'function' || !oldRT?.texture || !newRT || !THREE_LIB) return;

  const quadList = [];
  for (const f of faces) {
    const oldAtlas = oldAtlasMap.get(f);
    const newAtlas = f.atlas;
    if (!oldAtlas || !newAtlas) continue;

    const su0 = (oldAtlas.x + oldAtlas.pad) / oldSize;
    const sv0 = (oldAtlas.y + oldAtlas.pad) / oldSize;
    const su1 = (oldAtlas.x + oldAtlas.pad + f.su * oldAtlas.ppm) / oldSize;
    const sv1 = (oldAtlas.y + oldAtlas.pad + f.sv * oldAtlas.ppm) / oldSize;

    const dx0 = ((newAtlas.x + newAtlas.pad) / newSize) * 2 - 1;
    const dy0 = ((newAtlas.y + newAtlas.pad) / newSize) * 2 - 1;
    const dx1 = ((newAtlas.x + newAtlas.pad + f.su * newAtlas.ppm) / newSize) * 2 - 1;
    const dy1 = ((newAtlas.y + newAtlas.pad + f.sv * newAtlas.ppm) / newSize) * 2 - 1;

    quadList.push({ su0, sv0, su1, sv1, dx0, dy0, dx1, dy1 });
  }

  if (!quadList.length) return;

  const count = quadList.length;
  const pos = new Float32Array(count * 4 * 3);
  const uv = new Float32Array(count * 4 * 2);
  const idx = new Uint32Array(count * 6);

  for (let i = 0; i < count; i++) {
    const q = quadList[i];
    const vi = i * 4;

    pos[vi * 3]     = q.dx0; pos[vi * 3 + 1]     = q.dy0; pos[vi * 3 + 2]     = 0;
    pos[(vi + 1) * 3] = q.dx1; pos[(vi + 1) * 3 + 1] = q.dy0; pos[(vi + 1) * 3 + 2] = 0;
    pos[(vi + 2) * 3] = q.dx1; pos[(vi + 2) * 3 + 1] = q.dy1; pos[(vi + 2) * 3 + 2] = 0;
    pos[(vi + 3) * 3] = q.dx0; pos[(vi + 3) * 3 + 1] = q.dy1; pos[(vi + 3) * 3 + 2] = 0;

    uv[vi * 2]     = q.su0; uv[vi * 2 + 1]     = q.sv0;
    uv[(vi + 1) * 2] = q.su1; uv[(vi + 1) * 2 + 1] = q.sv0;
    uv[(vi + 2) * 2] = q.su1; uv[(vi + 2) * 2 + 1] = q.sv1;
    uv[(vi + 3) * 2] = q.su0; uv[(vi + 3) * 2 + 1] = q.sv1;

    idx[i * 6]     = vi;     idx[i * 6 + 1] = vi + 1; idx[i * 6 + 2] = vi + 2;
    idx[i * 6 + 3] = vi;     idx[i * 6 + 4] = vi + 2; idx[i * 6 + 5] = vi + 3;
  }

  const geo = new THREE_LIB.BufferGeometry();
  geo.setAttribute('position', new THREE_LIB.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE_LIB.BufferAttribute(uv, 2));
  geo.setIndex(new THREE_LIB.BufferAttribute(idx, 1));

  const mat = new THREE_LIB.MeshBasicMaterial({
    map: oldRT.texture,
    transparent: false,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

  const mesh = new THREE_LIB.Mesh(geo, mat);
  mesh.frustumCulled = false;
  const scene = new THREE_LIB.Scene();
  scene.add(mesh);
  const cam = new THREE_LIB.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const prev = renderer.getRenderTarget();
  const prevAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.setRenderTarget(newRT);
  renderer.render(scene, cam);
  renderer.setRenderTarget(prev);
  renderer.autoClear = prevAutoClear;

  geo.dispose();
  mat.dispose();
}

export function updatePaintQuality(game, targetSize, ctx = null, THREE_LIB = THREE) {
  const paint = ctx?.paint || game?.paint;
  if (!paint || !paint.level || !paint.paintFaces || paint.size === targetSize) return false;

  const oldSize = paint.size;
  const oldRT = paint.rt;
  const oldPaintFaces = paint.paintFaces || [];

  const oldAtlasMap = new Map();
  for (const f of oldPaintFaces) {
    if (f.atlas) oldAtlasMap.set(f, { ...f.atlas });
  }

  // Preserve authoritative CPU paint state without any loss or reset
  const cpuState = {
    grid: paint.grid,
    dead: paint.dead,
    counts: paint.counts ? [...paint.counts] : [0, 0],
    turfTotal: paint.turfTotal,
    turfArea: paint.turfArea,
    version: paint.version,
    clock: paint.clock,
    growing: paint.growing,
    q: paint._q,
    rip: paint.rip,
    ripP: paint.ripP,
    ripS: paint._ripS,
    wetUntil: paint._wetUntil,
    dryAcc: paint._dryAcc,
  };

  paint.geo?.dispose?.();
  paint.mat?.dispose?.();
  paint.dryMesh?.geometry?.dispose?.();
  paint.dryMesh?.material?.dispose?.();

  paint.size = targetSize;
  const newDensity = targetSize >= 4096 ? 30 : 18;
  paint._layout?.(newDensity);
  paint._initGPU?.();

  // Restore CPU state intact
  paint.grid = cpuState.grid;
  paint.dead = cpuState.dead;
  paint.counts = cpuState.counts;
  paint.turfTotal = cpuState.turfTotal;
  paint.turfArea = cpuState.turfArea;
  paint.version = cpuState.version;
  paint.clock = cpuState.clock;
  paint.growing = cpuState.growing;
  paint._q = cpuState.q;
  paint.rip = cpuState.rip;
  paint.ripP = cpuState.ripP;
  paint._ripS = cpuState.ripS;
  paint._wetUntil = cpuState.wetUntil;
  paint._dryAcc = cpuState.dryAcc;

  const renderer = paint.renderer;
  if (renderer && typeof renderer.setRenderTarget === 'function' && oldRT?.texture && THREE_LIB) {
    try {
      resampleAtlasFaces(renderer, oldRT, oldSize, paint.rt, targetSize, paint.paintFaces, oldAtlasMap, THREE_LIB);
    } catch (_) {}
  }
  oldRT?.dispose?.();

  const level = ctx?.level || game?.level || paint.level;
  if (level && typeof level.buildGeometry === 'function') {
    if (game?.levelMesh) {
      game.levelMesh.geometry?.dispose?.();
      game.levelMesh.geometry = level.buildGeometry(targetSize);
    }
    if (game?.grateMesh) {
      game.grateMesh.geometry?.dispose?.();
      game.grateMesh.geometry = level.buildGeometry(targetSize, (b) => b.grate);
    }
  }

  if (game?.levelMat?.userData?.uniforms) {
    if (game.levelMat.userData.uniforms.uPaint) game.levelMat.userData.uniforms.uPaint.value = paint.texture;
    if (game.levelMat.userData.uniforms.uTexel) game.levelMat.userData.uniforms.uTexel.value = 1 / targetSize;
  }
  if (game?.grateMat?.userData?.uniforms) {
    if (game.grateMat.userData.uniforms.uPaint) game.grateMat.userData.uniforms.uPaint.value = paint.texture;
    if (game.grateMat.userData.uniforms.uTexel) game.grateMat.userData.uniforms.uTexel.value = 1 / targetSize;
  }

  return true;
}

export function applyRuntimeWorldQuality(game, settings, mobile, deps = {}) {
  if (!game || !settings) return;
  const ctx = deps.G || game.G || (typeof window !== 'undefined' ? window.G : (typeof globalThis !== 'undefined' ? globalThis.G : null));
  const effQFn = deps.effectiveQuality || resolveEffectiveQuality;
  const dressingFn = deps.dressingFor || game.dressingFor || null;
  const mob = mobile || game.mobile || game.input?.mobile;
  const q = effQFn(settings, mob);

  updatePaintQuality(game, q.paintAtlas, ctx, deps.THREE || THREE);
  updateEnvironmentShadowQuality(ctx?.env || game.env, q.shadowSize, game.shadowCache);
  updateFXQuality(ctx?.fx || game.fx, q.particles, deps.THREE || THREE);
  updatePropQuality(game, settings.quality || 'high', dressingFn, ctx);

  game._builtQuality = settings.quality;
}
