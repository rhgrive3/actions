// GPU budget for native (source-mesh) stages. Source stages draw 0.25-1M
// display vertices in ~250-400 draws. GTAO's normal/depth override pass draws
// that whole scene a second time each frame, and MSAA HalfFloat targets scale
// with the screen. Together they caused WebGL context loss on ordinary GPUs.
// Only visual GPU representations change here; CPU paint, physics, nav and
// actors are untouched.

const STORAGE_KEY = 'inkwave.nativeGpuSafety';
const TIER_TTL_MS = 14 * 24 * 3600 * 1000;
export const NATIVE_GPU_MAX_TIER = 2;

function storage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

/** 0 = default native budget, 1/2 = stepped down after a context loss here. */
export function nativeGpuTier(store = storage(), now = Date.now()) {
  try {
    const raw = store?.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const value = JSON.parse(raw), tier = Math.trunc(Number(value?.tier));
    if (!Number.isFinite(tier) || tier <= 0) return 0;
    if (!Number.isFinite(value.at) || now - value.at > TIER_TTL_MS) return 0;
    return Math.min(NATIVE_GPU_MAX_TIER, tier);
  } catch { return 0; }
}

export function recordNativeContextLoss(store = storage(), now = Date.now()) {
  const tier = Math.min(NATIVE_GPU_MAX_TIER, nativeGpuTier(store, now) + 1);
  try { store?.setItem(STORAGE_KEY, JSON.stringify({ tier, at: now })); } catch {}
  return tier;
}

/** Upper bounds applied on top of the user's effective quality preset. */
export function nativeRenderCaps({ mobile = false, tier = 0 } = {}) {
  const caps = { ao: false, msaa: 2 };
  if (!mobile) caps.pixelRatio = 1.25;
  if (tier >= 1) Object.assign(caps, { msaa: 0, bloom: false, pixelRatio: 1, shadowSize: 2048, paintAtlas: 2048 });
  if (tier >= 2) Object.assign(caps, { pixelRatio: 0.75, shadowSize: 1024 });
  return caps;
}

// Touch devices start one texture step lower: High loads ~520 source maps
// (~320 MB with mips) on a single stage, and iPad Safari lost the context at
// match start. Their render targets are already small, so textures dominate.
const textureTier = (tier, mobile) => tier + (mobile ? 1 : 0);

/** Texture representation for the stage: the user's choice, lowered by tier. */
export function nativeTextureQuality(settingsQuality, tier = 0, mobile = false) {
  const base = ['high', 'ultra'].includes(settingsQuality) ? 'high' : settingsQuality === 'low' ? 'low' : 'balanced';
  const order = ['low', 'balanced', 'high'], t = textureTier(tier, mobile);
  const ceiling = t >= 2 ? 'low' : t >= 1 ? 'balanced' : 'high';
  return order[Math.min(order.indexOf(base), order.indexOf(ceiling))];
}

/** Lower steps also bound individual maps; source maps are mostly <= 512px. */
export function nativeTierTextureCaps(caps, tier = 0, mobile = false) {
  const t = textureTier(tier, mobile);
  if (t < 2) return caps;
  return { ...caps, maxDimension: Math.min(caps.maxDimension, t >= 3 ? 128 : 256) };
}

// UASTC transcodes to one of these without an uncompressed RGBA32 fallback
// (KTX2Loader: ASTC, BC7, BC1/BC3 and ETC2 all cover opaque and alpha maps).
const UASTC_TARGETS = ['WEBGL_compressed_texture_astc', 'EXT_texture_compression_bptc', 'WEBGL_compressed_texture_s3tc', 'WEBGL_compressed_texture_etc'];
export function nativeCompressedTextureSupport(renderer) {
  const extensions = renderer?.extensions;
  return typeof extensions?.has === 'function' && UASTC_TARGETS.some(name => extensions.has(name));
}

/**
 * Texture quality and caps for one native load. Touch devices start one step
 * lower unless the stage ships KTX2 and this GPU receives it compressed; the
 * uncompressed touch budget then stays attached as `caps.fallback` for any
 * image that has to be decoded from its source PNG instead.
 */
export function nativeTextureProfile({ settingsQuality, tier = 0, touch = false, compressed = false, stageCaps }) {
  const relief = touch && compressed;
  const quality = nativeTextureQuality(settingsQuality, tier, touch && !relief);
  const caps = nativeTierTextureCaps(stageCaps(quality), tier, touch && !relief);
  if (!relief) return { quality, caps, textureTouch: touch };
  const fallbackQuality = nativeTextureQuality(settingsQuality, tier, true);
  const fallback = { quality: fallbackQuality, ...nativeTierTextureCaps(stageCaps(fallbackQuality), tier, true) };
  return { quality, caps: { ...caps, fallback }, textureTouch: false };
}

const capKey = caps => Object.keys(caps).sort().map(k => k + '=' + caps[k]).join(',');
const capped = new WeakMap();

/** Same object for the same input: Renderer compares quality by identity. */
export function capQuality(q, caps) {
  if (!q || !caps) return q;
  const key = capKey(caps);
  let byCaps = capped.get(q);
  if (!byCaps) capped.set(q, byCaps = new Map());
  let out = byCaps.get(key);
  if (!out) {
    out = { ...q };
    for (const [name, limit] of Object.entries(caps)) {
      if (!(name in out)) continue;
      out[name] = typeof limit === 'boolean' ? out[name] && limit : Math.min(out[name], limit);
    }
    byCaps.set(key, out = Object.freeze(out));
  }
  return out;
}

/**
 * Cap the Renderer's quality while a native stage is published. Renderer
 * assigns `this.q = effectiveQuality(...)` on settings changes; an instance
 * accessor keeps that assignment raw and every read capped, so later setting
 * changes inside the stage stay bounded without a second composer rebuild.
 */
export function setNativeRenderBudget(R, caps) {
  if (!R) return false;
  let state = R.__nativeGpuBudget;
  if (!state) {
    if (!caps) return false;
    state = R.__nativeGpuBudget = { raw: R.q, caps: null };
    Object.defineProperty(R, 'q', {
      configurable: true, enumerable: true,
      get() { return capQuality(state.raw, state.caps); },
      set(value) { state.raw = value; },
    });
  }
  const before = R.q;
  state.caps = caps || null;
  const after = R.q;
  const changed = before !== after && Object.keys(after).some(k => before[k] !== after[k]);
  if (changed && R.scene && typeof R._buildComposer === 'function') {
    R.dynScale = 1;
    R._buildComposer();
    if (before.ao !== after.ao || before.msaa !== after.msaa)
      R.scene.traverse?.(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); });
  }
  return changed;
}

const NOTE_CLASS = 'iw-native-gpu-note';

/** One listener per canvas: step the budget down for the next native load. */
export function watchNativeContextLoss(canvas, isNative) {
  if (!canvas || canvas.__nativeGpuWatch) return;
  canvas.__nativeGpuWatch = true;
  canvas.addEventListener('webglcontextlost', () => {
    if (!isNative()) return;
    const tier = recordNativeContextLoss();
    // Renderer's own listener (registered first) has already built the
    // reload dialog. Explain that the reload uses the lower budget.
    const overlay = typeof document === 'undefined' ? null : document.querySelector('.iw-webgl-recovery');
    if (!overlay || overlay.querySelector('.' + NOTE_CLASS)) return;
    const note = document.createElement('p');
    note.className = NOTE_CLASS;
    note.style.cssText = 'margin:0;font-weight:400;font-size:14px;opacity:.85';
    note.textContent = `原典ステージの描画負荷が端末の上限を超えた可能性があります。次回の読み込みから描画負荷を下げます（段階 ${tier}/${NATIVE_GPU_MAX_TIER}）。`;
    overlay.insertBefore(note, overlay.querySelector('button'));
  }, false);
}

/** Resize the sun's shadow map (same steps as the runtime quality path). */
export function setNativeShadowSize(env, size, shadowCache = null) {
  const sun = env?.sun;
  if (!sun || !Number.isFinite(size) || env.shadowSize === size) return false;
  env.shadowSize = size;
  sun.shadow.mapSize.set(size, size);
  sun.shadow.radius = 2.2 * (size / 4096) + 0.8;
  if (sun.shadow.map) { sun.shadow.map.dispose?.(); sun.shadow.map = null; }
  env._fitShadowCam?.();
  sun.shadow.needsUpdate = true;
  shadowCache?.invalidate?.();
  return true;
}

/** Publish (caps) or remove (null) the native budget on renderer and world. */
export function applyNativeGpuBudget(game, G, caps) {
  const R = game?.R;
  setNativeRenderBudget(R, caps);
  const shadow = R?.q?.shadowSize;
  if (Number.isFinite(shadow)) setNativeShadowSize(G?.env, shadow, game.shadowCache);
}
