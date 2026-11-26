// Half-resolution GTAO budget and non-occluder filtering for desktop AO passes.
// Keeps full-resolution contact AO parameters and arena-local occluders intact.
export const GTAO_RESOLUTION_SCALE = 0.5;

const HALFRES_INSTALLED = Symbol.for('inkwave.local-quality.gtao-halfres.v1');
const OCCLUDERS_INSTALLED = Symbol.for('inkwave.local-quality.gtao-occluders.v1');

function validPositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function scaledGtaoDimension(size, scale = GTAO_RESOLUTION_SCALE) {
  const s = validPositive(scale, GTAO_RESOLUTION_SCALE);
  if (!Number.isFinite(size) || size <= 0) return 1;
  return Math.max(1, Math.round(size * s));
}

export function installHalfResGtao(gtao, { scale = GTAO_RESOLUTION_SCALE, basePdRadius = 6 } = {}) {
  if (!gtao || typeof gtao.setSize !== 'function') return false;
  if (gtao[HALFRES_INSTALLED]) return false;
  gtao[HALFRES_INSTALLED] = true;

  const resolvedScale = validPositive(scale, GTAO_RESOLUTION_SCALE);
  const resolvedBaseRadius = validPositive(basePdRadius, 6);
  const nativeSetSize = gtao.setSize;
  gtao.setSize = function (width, height) {
    return nativeSetSize.call(
      this,
      scaledGtaoDimension(width, resolvedScale),
      scaledGtaoDimension(height, resolvedScale),
    );
  };
  gtao._iwResolutionScale = resolvedScale;

  if (typeof gtao.updatePdMaterial === 'function') {
    const nativeUpdatePd = gtao.updatePdMaterial;
    const scalePdRadius = (r) => Math.max(1, Math.round(validPositive(r, resolvedBaseRadius) * resolvedScale));
    gtao.updatePdMaterial = function (params) {
      if (params && typeof params === 'object' && 'radius' in params) {
        return nativeUpdatePd.call(this, { ...params, radius: scalePdRadius(params.radius) });
      }
      return nativeUpdatePd.call(this, params);
    };
    nativeUpdatePd.call(gtao, { radius: scalePdRadius(resolvedBaseRadius) });
  }

  return true;
}

function pushVisibleUnique(node, out) {
  if (node && typeof node === 'object' && node.visible === true && !out.includes(node)) {
    out.push(node);
  }
}

export function collectGtaoNonOccluders(G, out = []) {
  out.length = 0;
  if (!G || typeof G !== 'object') return out;

  const env = G.env;
  if (env && typeof env === 'object') {
    pushVisibleUnique(env.sky, out);
    pushVisibleUnique(env.sea, out);
    pushVisibleUnique(env.lhBeam, out);
    pushVisibleUnique(env.city, out);
    pushVisibleUnique(env.terrain, out);
    pushVisibleUnique(env.staticScenery, out);
    pushVisibleUnique(env.ferris, out);
    pushVisibleUnique(env.trees, out);
    pushVisibleUnique(env.sailInst, out);
    pushVisibleUnique(env.buoyInst, out);
    pushVisibleUnique(env.gullInst, out);
  }

  pushVisibleUnique(G.fx?.root, out);

  const proj = G.projectiles;
  if (proj && typeof proj === 'object') {
    pushVisibleUnique(proj.blobs, out);
    pushVisibleUnique(proj.projectileVisuals?.mesh, out);
    pushVisibleUnique(proj.arcRing, out);
    if (proj.sights) {
      if (Array.isArray(proj.sights)) {
        for (let i = 0; i < proj.sights.length; i++) pushVisibleUnique(proj.sights[i], out);
      } else if (typeof proj.sights.values === 'function') {
        for (const node of proj.sights.values()) pushVisibleUnique(node, out);
      }
    }
    if (Array.isArray(proj.clouds)) {
      for (let i = 0; i < proj.clouds.length; i++) {
        const c = proj.clouds[i];
        if (c) {
          pushVisibleUnique(c.group, out);
          pushVisibleUnique(c.mesh, out);
        }
      }
    }
    if (Array.isArray(proj.beams)) {
      for (let i = 0; i < proj.beams.length; i++) {
        pushVisibleUnique(proj.beams[i]?.mesh, out);
      }
    }
  }

  return out;
}

export function installGtaoOccluderFilter(gtao, G) {
  if (!gtao || typeof gtao._renderOverride !== 'function') return false;
  if (gtao[OCCLUDERS_INSTALLED]) return false;
  gtao[OCCLUDERS_INSTALLED] = true;

  const scratch = [];
  let busy = false;
  const renderOverride = gtao._renderOverride;

  gtao._renderOverride = function (renderer, material) {
    if (material !== this.normalMaterial) return renderOverride.apply(this, arguments);
    const usingScratch = !busy;
    const hidden = usingScratch ? scratch : [];
    if (usingScratch) busy = true;
    const shadow = renderer?.shadowMap;
    const autoUpdate = shadow?.autoUpdate;
    const needsUpdate = shadow?.needsUpdate;
    try {
      collectGtaoNonOccluders(G, hidden);
      for (let i = 0; i < hidden.length; i++) hidden[i].visible = false;
      if (shadow) {
        shadow.autoUpdate = false;
        shadow.needsUpdate = false;
      }
      return renderOverride.apply(this, arguments);
    } finally {
      for (let i = 0; i < hidden.length; i++) hidden[i].visible = true;
      hidden.length = 0;
      if (usingScratch) busy = false;
      if (shadow) {
        shadow.autoUpdate = autoUpdate;
        shadow.needsUpdate = needsUpdate;
      }
    }
  };

  return true;
}
