/**
 * Stage-aware bound for decoded RGBA/PBR textures. This is deliberately a
 * maximum dimension, not a fixed resize: original small maps remain exact.
 * System RAM (navigator.deviceMemory) is only a rough pressure hint, NOT a
 * claimed VRAM measurement. Preserve 4K on small desktop scenes; shrink only
 * genuinely large material sets where uncompressed textures risk context loss.
 */
export function nativeStageTextureLimit(manifest, quality, {
  mobile = false, deviceMemoryGB = null, maxTextureSize = 4096
} = {}) {
  const mats = Object.values(manifest?.materials || {});
  const unique = new Set();
  for (const m of mats) {
    if (m.albedo) unique.add(m.albedo);
    if (m.maps?.opacity) unique.add(m.maps.opacity);
    if (quality === 'high') {
      for (const key of ['normal', 'roughness', 'emissive'])
        if (m.maps?.[key]) unique.add(m.maps[key]);
    }
  }
  const vertices = Number(manifest?.geometry?.vertices) || 0;
  const heavy = mats.length >= 30 || vertices >= 150000;
  const memory = Number.isFinite(Number(deviceMemoryGB)) && Number(deviceMemoryGB) > 0
    ? Number(deviceMemoryGB) : null;
  let limit = quality === 'low' ? 512 : quality === 'high' ? 4096 : 1024;

  if (mobile) {
    // Mobile high was already capped at 1024 before this optimization.
    limit = Math.min(limit, 1024);
    // Only very constrained devices with unusually many maps step down.
    if (heavy && quality === 'high' && memory !== null && memory <= 2 && unique.size >= 80)
      limit = 512;
  } else if (heavy && quality === 'high') {
    // Avoid a blanket 1024px High-mode cap: 2K better retains close-up
    // albedo, stencil silhouettes and normal detail on ordinary desktops.
    // Extremely dense scenes on weak machines need the smaller budget.
    limit = 2048;
    if ((memory !== null && memory <= 4 && unique.size >= 64) ||
        (memory !== null && memory <= 8 && unique.size >= 160))
      limit = 1024;
  }

  // Never request an image larger than the GPU can accept.
  const hardware = Number.isFinite(maxTextureSize) && maxTextureSize > 0 ? maxTextureSize : 4096;
  return Math.max(1, Math.min(limit, hardware));
}

/**
 * Keep visually critical albedo, cutout silhouettes, and emissive signage
 * sharper than high-frequency PBR helper maps on exceptionally large scenes.
 * Older numeric loadNativeTextures callers remain supported.
 */
export function nativeStageTextureCaps(manifest, quality, options = {}) {
  const maxDimension = nativeStageTextureLimit(manifest, quality, options);
  const count = Object.keys(manifest?.materials || {}).length;
  const heavy = count >= 30 || (Number(manifest?.geometry?.vertices) || 0) >= 150000;
  const perRole = {};
  if (quality === 'high' && heavy) {
    if (options.mobile && maxDimension >= 1024) {
      perRole.normal = 512;
      perRole.roughness = 512;
    } else if (!options.mobile && maxDimension >= 2048) {
      perRole.roughness = 1024;
    }
  }
  return { maxDimension, perRole };
}
