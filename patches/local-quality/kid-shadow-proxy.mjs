// Squidkid shadows cast from the far-tier body (image-equivalent at the sun map's resolution).
//
// The arena sun shadow is one 2048² map over ~116 m: ~5.7 cm per texel, so a kid's shadow is ~23 texels tall and
// then PCF-blurred. Yet every kid re-rendered its displayed tier into it every frame — hero 111 k / game 32 k skinned
// triangles (skin, cloth, hair) — which made kids ~95 % of the shadow pass in a crowd (measured 140 k of 147 k
// shadow triangles). Detail that fine cannot survive 5.7 cm texels.
//
// Each kid now casts from never-drawn proxies: SkinnedMeshes on the far-tier geometry (bone-aware decimation of the
// same parts, same skeleton, same materials) for every part whose displayed-tier mesh casts, hair included (the far
// tier itself normally lets only skin and cloth cast). Those tier meshes stop casting; parts with no far counterpart
// keep their own shadow. Proxies live on PROXY_LAYER only: no camera sees it, so the main pass, GTAO and reflections
// skip them, and the shadow pass, which tests layers against the *view* camera, gets the layer for exactly its own
// duration. They follow the kid group's visibility and scale (form changes, hiding, spawn), and the shadow cache's
// off-screen actor cull finds them like any castShadow mesh.
const INSTALLED = Symbol.for('inkwave.local-quality.kid-shadow-proxy.v1');
const HOOKED = Symbol.for('inkwave.local-quality.kid-shadow-proxy.shadowmap.v1');
export const PROXY_LAYER = 30;
const FAR = 2;

/** Let shadow-map renders (and only them) include PROXY_LAYER. Idempotent per renderer. */
export function hookShadowLayer(renderer) {
  const sm = renderer?.shadowMap;
  if (!sm || sm[HOOKED] || typeof sm.render !== 'function') return false;
  const render = sm.render;
  sm.render = function kidProxyShadowRender(lights, scene, camera) {
    const layers = camera?.layers;
    if (!layers) return render.call(this, lights, scene, camera);
    const mask = layers.mask;
    layers.enable(PROXY_LAYER);
    try { return render.call(this, lights, scene, camera); } finally { layers.mask = mask; }
  };
  Object.defineProperty(sm, HOOKED, { value: true });
  return true;
}

const ungate = (renderer, object, camera, shadowCamera, geometry) => { geometry.drawRange.count = Infinity; };

const GAME = 1;
const cover = (m) => { m.userData.iwShadow = false; m.castShadow = false; };

/** Build this kid's proxies: parts whose game-tier mesh casts and that have a far-tier counterpart. */
function buildProxies(ch, THREE) {
  const game = ch.lodSets[GAME], far = ch.lodSets[FAR];
  const keys = new Set();
  for (const key in game.meshes) if (game.meshes[key].userData.iwShadowNative && far.meshes[key]) keys.add(key);
  const proxies = [];
  for (const key of keys) {
    const fm = far.meshes[key];
    const p = new THREE.SkinnedMesh(fm.geometry, ch._matFor(fm.userData.iwMat));
    p.bind(ch.skeleton, fm.bindMatrix);
    p.castShadow = true; p.receiveShadow = false;
    p.layers.set(PROXY_LAYER);
    p.boundingSphere = fm.boundingSphere; p.frustumCulled = true;
    // far-owned geometry is gated to 0 during GTAO override passes; the shadow pass always draws it whole
    p.onBeforeShadow = ungate;
    p.name = 'kid:' + key + ':shadow';
    p.userData.iwShadowProxy = true;
    ch.kid.add(p); proxies.push(p);
  }
  ch._shadowProxies = proxies;
  ch._shadowProxyKeys = keys;
  ch._shadowProxyFar = far;
  // covered parts stop casting in every tier (tier switches re-apply userData.iwShadow)
  for (const S of ch.lodSets) if (S) for (const key in S.meshes) if (keys.has(key)) cover(S.meshes[key]);
}

/**
 * @param {{Character: Function}} api
 * @param {object} G shared game context
 * @param {object} THREE
 * @param {() => boolean} enabled default policy (touch devices: the sun map is capped at 2048²); a kid's
 *   `s3KidShadowProxy` true/false overrides it
 */
export function installKidShadowProxy(api, G, THREE, enabled = () => false) {
  const proto = api?.Character?.prototype;
  if (!proto || !THREE || Object.hasOwn(proto, INSTALLED)) return false;
  Object.defineProperty(proto, INSTALLED, { value: true });
  const tierSet = proto._tierSet, update = proto.update, warmAll = proto.warmAll;
  const nativeSet = (ch, t) => {
    const fresh = !ch.lodSets?.[t];
    const S = tierSet.call(ch, t);
    if (fresh && S) for (const m of S.list) m.userData.iwShadowNative = m.userData.iwShadow;
    return S;
  };
  proto._tierSet = function kidProxyTierSet(t) {
    const fresh = !this.lodSets?.[t];
    const S = nativeSet(this, t);
    if (!S || this._shadowProxyBuilding || this.s3KidShadowProxy === false || (this.s3KidShadowProxy !== true && !enabled())) return S;
    if (this._shadowProxies && this.lodSets[FAR] !== this._shadowProxyFar) {
      // the tier sets were rebuilt (quality change): proxies follow the new far geometry
      for (const p of this._shadowProxies) this.kid.remove(p);
      this._shadowProxies = null; this._shadowProxyKeys = null; this._shadowProxyFar = null;
    }
    if (this._shadowProxies) {
      // a tier built after the proxies: its covered parts cast through them too
      if (fresh) for (const key in S.meshes) if (this._shadowProxyKeys.has(key)) cover(S.meshes[key]);
      return S;
    }
    this._shadowProxyBuilding = true;
    try { nativeSet(this, GAME); nativeSet(this, FAR); buildProxies(this, THREE); }
    finally { this._shadowProxyBuilding = false; }
    return S;
  };
  proto.update = function kidProxyUpdate(dt, s) {
    if (G?.renderer) hookShadowLayer(G.renderer);
    return update.call(this, dt, s);
  };
  if (typeof warmAll === 'function') proto.warmAll = function kidProxyWarm(renderer = G?.renderer, ...rest) {
    hookShadowLayer(renderer);
    return warmAll.call(this, renderer, ...rest);
  };
  return true;
}
