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
      if (fx._qualityDropSource) fx._qualityDropSource = Array(fx.dCap).fill(null);
      if (fx._qualityDropGeneration) fx._qualityDropGeneration = new Uint32Array(fx.dCap);
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
  }
  if (typeof fx._initRings === 'function') {
    fx._initRings(Math.round(300 * q));
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

  let geo = null;
  let mat = null;
  const prevRT = renderer.getRenderTarget();
  const prevAutoClear = renderer.autoClear;

  try {
    geo = new THREE_LIB.BufferGeometry();
    geo.setAttribute('position', new THREE_LIB.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE_LIB.BufferAttribute(uv, 2));
    geo.setIndex(new THREE_LIB.BufferAttribute(idx, 1));

    // Custom shader material: bit-accurate RGBA transfer, linear GPU encoding without color shifts
    mat = new THREE_LIB.ShaderMaterial({
      uniforms: {
        tOld: { value: oldRT.texture },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform sampler2D tOld;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(tOld, vUv);
        }
      `,
      transparent: false,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      blending: THREE_LIB.NoBlending,
    });

    const mesh = new THREE_LIB.Mesh(geo, mat);
    mesh.frustumCulled = false;
    const scene = new THREE_LIB.Scene();
    scene.add(mesh);
    const cam = new THREE_LIB.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    renderer.autoClear = false;
    renderer.setRenderTarget(newRT);
    renderer.render(scene, cam);
  } finally {
    renderer.setRenderTarget(prevRT);
    renderer.autoClear = prevAutoClear;
    geo?.dispose?.();
    mat?.dispose?.();
  }
}

export function updatePaintQuality(game, targetSize, ctx = null, THREE_LIB = THREE) {
  const paint = ctx?.paint || game?.paint;
  if (!paint || !paint.level || !paint.paintFaces || paint.size === targetSize) return false;

  const oldSize = paint.size;
  const oldRT = paint.rt;
  const oldPpm = paint.ppm;
  const oldUsedHeight = paint.usedHeight;
  const oldPaintFaces = paint.paintFaces || [];

  const oldAtlasMap = new Map();
  for (const f of oldPaintFaces) {
    if (f.atlas) oldAtlasMap.set(f, { ...f.atlas });
  }

  const newDensity = targetSize >= 4096 ? 30 : 18;
  let newRT = null;
  const renderer = paint.renderer;

  try {
    paint.size = targetSize;
    paint._layout?.(newDensity);
    if (renderer && typeof renderer.setRenderTarget === 'function' && oldRT?.texture && THREE_LIB) {
      newRT = new THREE_LIB.WebGLRenderTarget(targetSize, targetSize, {
        type: THREE_LIB.UnsignedByteType,
        format: THREE_LIB.RGBAFormat,
        minFilter: THREE_LIB.LinearMipmapLinearFilter,
        magFilter: THREE_LIB.LinearFilter,
        generateMipmaps: typeof paint._regenerateMipmaps !== 'function',
        depthBuffer: false,
        stencilBuffer: false,
      });
      if (newRT.texture && renderer.capabilities?.getMaxAnisotropy) {
        newRT.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      }

      // Clear the target without leaking the arena renderer background state.
      const prevColor = renderer.getClearColor?.(new THREE_LIB.Color());
      const prevAlpha = renderer.getClearAlpha?.();
      const prevRT = renderer.getRenderTarget();
      const prevAutoClear = renderer.autoClear;
      try {
        renderer.autoClear = false;
        renderer.setRenderTarget(newRT);
        renderer.setClearColor(0x000000, 0);
        renderer.clear(true, false, false);
      } finally {
        renderer.setRenderTarget(prevRT);
        renderer.autoClear = prevAutoClear;
        if (prevColor) renderer.setClearColor(prevColor, prevAlpha);
      }

      resampleAtlasFaces(renderer, oldRT, oldSize, newRT, targetSize, paint.paintFaces, oldAtlasMap, THREE_LIB);
    }
  } catch (err) {
    // Safe rollback: never swallow resampling exceptions or dispose old atlas leaving blank ink
    paint.size = oldSize;
    paint.ppm = oldPpm;
    paint.usedHeight = oldUsedHeight;
    for (const f of oldPaintFaces) {
      const saved = oldAtlasMap.get(f);
      if (saved) f.atlas = { ...saved };
      else delete f.atlas;
    }
    if (newRT) {
      try { newRT.dispose(); } catch (_) {}
    }
    throw err;
  }

  // Safe commit: swap RT and dispose old target
  if (newRT) {
    oldRT?.dispose?.();
    paint.rt = newRT;
    paint.texture = newRT.texture;
    // Resampling is an atlas write even when no future paint/drying is queued.
    paint._regenerateMipmaps?.();
  }

  // Update dryMesh geometry to match new atlas dimensions
  if (paint.dryMesh && THREE_LIB) {
    const S = targetSize;
    const yTop = Math.min(1, ((paint.usedHeight + 2) / S) * 2 - 1);
    paint.dryMesh.geometry?.dispose?.();
    const dg = new THREE_LIB.BufferGeometry();
    dg.setAttribute('position', new THREE_LIB.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, yTop, 0, -1, yTop, 0]), 3));
    dg.setIndex([0, 1, 2, 0, 2, 3]);
    paint.dryMesh.geometry = dg;
  }

  // Rebuild level geometries to update paintUv attributes
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

  // Update level shader uniforms: uPaint, uTexel, uAtlasSize, uPpm
  for (const mat of [game?.levelMat, game?.grateMat]) {
    const uniforms = mat?.userData?.uniforms || mat?.uniforms;
    if (uniforms) {
      if (uniforms.uPaint) uniforms.uPaint.value = paint.texture;
      if (uniforms.uTexel) uniforms.uTexel.value = 1 / targetSize;
      if (uniforms.uAtlasSize) uniforms.uAtlasSize.value = targetSize;
      if (uniforms.uPpm) uniforms.uPpm.value = paint.ppm;
    }
  }

  return true;
}

export function applyRuntimeWorldQuality(game, settings, mobile, deps = {}) {
  if (!game || !settings) return;
  const G = deps.G || (typeof window !== 'undefined' && window.__G ? window.__G : null);
  const effQFn = deps.effectiveQuality || resolveEffectiveQuality;
  const dressingFn = deps.dressingFor || null;
  const THREE_LIB = deps.THREE || THREE || globalThis.THREE;
  const mob = mobile || game.mobile || game.input?.mobile;
  const q = effQFn(settings, mob);

  updatePaintQuality(game, q.paintAtlas, G, THREE_LIB);
  updateEnvironmentShadowQuality(G?.env, q.shadowSize, game.shadowCache);
  updateFXQuality(G?.fx, q.particles, THREE_LIB);
  updatePropQuality(game, settings.quality || 'high', dressingFn, G);

  game._builtQuality = settings.quality;
}
