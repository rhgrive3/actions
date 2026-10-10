// Build-only source transform. Runtime lobby helpers retain their existing URL.
function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE issue-472 patch conflict (${label}): expected exactly one anchor`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

const IMPORT_ANCHOR = `import { WEAPONS } from '../config.js';`;
const IMPORT_PATCHED = `import { WEAPONS } from '../config.js';\nimport { resolveLobbyQualityName, lobbyShadowDue } from '../../patches/local-quality/issue-472-adapter.mjs';`;

// _lobLoad: raw quality string -> touch-aware native lobby name.
const LOAD_ANCHOR = `      const q = G.settings?.quality || 'high';\n      const set = new mod.LobbySet(this.r, { quality: q, texlib: G.game?.texlib || null });\n      L.set = set; L.quality = q;`;
const LOAD_PATCHED = `      const q = resolveLobbyQualityName(G.settings?.quality, G.mobile ?? G.game?.mobile);\n      const set = new mod.LobbySet(this.r, { quality: q, texlib: G.game?.texlib || null });\n      L.set = set; L.quality = q;`;

// _lobUpdate runtime quality sync: same resolver so a settings change or a
// desktop/touch profile switch converges without rebuilding the world.
const SYNC_ANCHOR = `    const q = G.settings?.quality;\n    if (q && q !== L.quality) { L.quality = q; S.setQuality?.(q); }`;
const SYNC_PATCHED = `    const q = resolveLobbyQualityName(G.settings?.quality, G.mobile ?? G.game?.mobile);\n    if (q !== L.quality) { L.quality = q; S.setQuality?.(q); }`;

// Showcase.render() lobby branch only: gate the every-frame shadow refresh.
// The overlay branch (`_cameraPedestal`/`_cameraResults`) anchor is untouched.
const RENDER_ANCHOR = `      this._lobEnv(L);\n      r.shadowMap.needsUpdate = true;\n      r.setRenderTarget(target);`;
const RENDER_PATCHED = `      this._lobEnv(L);\n      if (lobbyShadowDue(L)) r.shadowMap.needsUpdate = true;\n      r.setRenderTarget(target);`;

/**
 * Build-only source transform for `src/game/showcase.js` (lobby anchors only).
 * Returns non-lobby files unchanged. Throws on missing/duplicated anchors so a
 * silent no-op can never ship, and throws on double-apply (idempotency guard).
 */
export function patchLobbySetShowcase(rel, code) {
  if (rel !== 'src/game/showcase.js') return code;
  const composedImport = "import { WEAPONS, effectiveQuality } from '../config.js';";
  const before = code.includes(composedImport) ? composedImport : IMPORT_ANCHOR;
  let out = replaceOnce(code, before, before + "\nimport { resolveLobbyQualityName, lobbyShadowDue } from '../../patches/local-quality/issue-472-adapter.mjs';", 'adapter import');
  out = replaceOnce(out, LOAD_ANCHOR, LOAD_PATCHED, 'lobLoad effective lobby quality');
  out = replaceOnce(out, SYNC_ANCHOR, SYNC_PATCHED, 'lobUpdate effective lobby quality');
  out = replaceOnce(out, RENDER_ANCHOR, RENDER_PATCHED, 'lobby shadow cadence');
  return out;
}
