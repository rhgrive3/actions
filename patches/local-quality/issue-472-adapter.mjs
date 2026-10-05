// INKWAVE issue #472 — Mobile Online LobbySet quality bypass (build-only adapter).
//
// Narrow root: Showcase._lobLoad/_lobUpdate route touch devices through the raw
// `G.settings.quality` string, so default mobile HIGH regains desktop HIGH lobby
// workload (0.5x planar reflection + extra scene render every visible frame,
// 2048 key shadow, forced `shadowMap.needsUpdate` every lobby frame, steam +
// extra lights). The rest of the app uses `effectiveQuality(settings, mobile)`
// which caps touch HIGH; the lobby must follow the same budget.
//
// Fix direction (lobby only): resolve the lobby quality NAME through the touch
// budget (touch -> native LOW preset), so reflection disables via the native
// `Q.refl === 0` early-return + env-map fallback and the key shadow sizes via
// the native `setQuality` mapSize path (1024). Gate the lobby-branch shadow
// refresh to a 1/3 cadence on LOW; desktop HIGH/MEDIUM keep every-frame shadow
// updates and current reflection. No arena/gameplay/collision change.
//
// Wiring: DO NOT edit `patches/local-quality/adapter.mjs` or `profile.json`
// here. Parent wires `patchLobbySetShowcase` into the build dispatcher; this
// file + its test are standalone. Upstream `inkwave-public/` is never mutated.
export const ISSUE_472_ROOT = 'Online LobbySet (hub/lobby) only';
export const ISSUE_472_BASELINE = '17602ab094da6efb663d872934458e818ae3c93e';

// Lobby shadow refresh cadence on the native LOW preset: 1 dirty flag per 3
// visible lobby frames (~20/s at 60 Hz) instead of every frame (~60/s).
export const LOBBY_SHADOW_INTERVAL_LOW = 3;

const LOBBY_NAMES = ['high', 'medium', 'low'];

/** Touch budget signal. Only `mobile.touch` matters; iOS/Android share it. */
export function isTouchMobile(mobile) {
  return !!mobile?.touch;
}

/**
 * Resolve the NATIVE LobbySet quality name for this device.
 * - Desktop (no touch): pass through the raw name; unknown -> 'high' to match
 *   the LobbySet constructor's native fallback (`QUALITY[quality] ? ... : 'high'`).
 * - Touch: always 'low' — the native preset with `refl: 0` (planar reflection
 *   off, env-map fallback), `shadow: 1024` (inside the effective touch shadow
 *   cap of 2048), `steam: false`, `extraLights: false`.
 * No new quality fields are invented; the preset rows already exist upstream.
 */
export function resolveLobbyQualityName(rawQuality, mobile) {
  if (isTouchMobile(mobile)) return 'low';
  return LOBBY_NAMES.includes(rawQuality) ? rawQuality : 'high';
}

/**
 * Gate the Showcase.render() lobby-branch `shadowMap.needsUpdate = true`.
 * Per-lobby-owner counter (`L._lobShadowTick`); the studio overlay branch is
 * never gated. Desktop HIGH/MEDIUM (`L.quality !== 'low'`) return true every
 * frame to preserve current appearance.
 */
export function lobbyShadowDue(L) {
  if (!L || L.quality !== 'low') return true;
  const n = (L._lobShadowTick | 0) + 1;
  L._lobShadowTick = n;
  return ((n - 1) % LOBBY_SHADOW_INTERVAL_LOW) === 0;
}

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
  let out = replaceOnce(code, IMPORT_ANCHOR, IMPORT_PATCHED, 'adapter import');
  out = replaceOnce(out, LOAD_ANCHOR, LOAD_PATCHED, 'lobLoad effective lobby quality');
  out = replaceOnce(out, SYNC_ANCHOR, SYNC_PATCHED, 'lobUpdate effective lobby quality');
  out = replaceOnce(out, RENDER_ANCHOR, RENDER_PATCHED, 'lobby shadow cadence');
  return out;
}
// INKWAVE issue #472 — Mobile Online LobbySet quality bypass (build-only adapter).
//
// Narrow root: Showcase._lobLoad/_lobUpdate route touch devices through the raw
// `G.settings.quality` string, so default mobile HIGH regains desktop HIGH lobby
// workload (0.5x planar reflection + extra scene render every visible frame,
// 2048 key shadow, forced `shadowMap.needsUpdate` every lobby frame, steam +
// extra lights). The rest of the app uses `effectiveQuality(settings, mobile)`
// which caps touch HIGH; the lobby must follow the same budget.
//
// Fix direction (lobby only): resolve the lobby quality NAME through the touch
// budget (touch -> native LOW preset), so reflection disables via the native
// `Q.refl === 0` early-return + env-map fallback and the key shadow sizes via
// the native `setQuality` mapSize path (1024). Gate the lobby-branch shadow
// refresh to a 1/3 cadence on LOW; desktop HIGH/MEDIUM keep every-frame shadow
// updates and current reflection. No arena/gameplay/collision change.
//
// Wiring: DO NOT edit `patches/local-quality/adapter.mjs` or `profile.json`
// here. Parent wires `patchLobbySetShowcase` into the build dispatcher; this
// file + its test are standalone. Upstream `inkwave-public/` is never mutated.
export const ISSUE_472_ROOT = 'Online LobbySet (hub/lobby) only';
export const ISSUE_472_BASELINE = '17602ab094da6efb663d872934458e818ae3c93e';

// Lobby shadow refresh cadence on the native LOW preset: 1 dirty flag per 3
// visible lobby frames (~20/s at 60 Hz) instead of every frame (~60/s).
export const LOBBY_SHADOW_INTERVAL_LOW = 3;

const LOBBY_NAMES = ['high', 'medium', 'low'];

/** Touch budget signal. Only `mobile.touch` matters; iOS/Android share it. */
export function isTouchMobile(mobile) {
  return !!mobile?.touch;
}

/**
 * Resolve the NATIVE LobbySet quality name for this device.
 * - Desktop (no touch): pass through the raw name; unknown -> 'high' to match
 *   the LobbySet constructor's native fallback (`QUALITY[quality] ? ... : 'high'`).
 * - Touch: always 'low' — the native preset with `refl: 0` (planar reflection
 *   off, env-map fallback), `shadow: 1024` (inside the effective touch shadow
 *   cap of 2048), `steam: false`, `extraLights: false`.
 * No new quality fields are invented; the preset rows already exist upstream.
 */
export function resolveLobbyQualityName(rawQuality, mobile) {
  if (isTouchMobile(mobile)) return 'low';
  return LOBBY_NAMES.includes(rawQuality) ? rawQuality : 'high';
}

/**
 * Gate the Showcase.render() lobby-branch `shadowMap.needsUpdate = true`.
 * Per-lobby-owner counter (`L._lobShadowTick`); the studio overlay branch is
 * never gated. Desktop HIGH/MEDIUM (`L.quality !== 'low'`) return true every
 * frame to preserve current appearance.
 */
export function lobbyShadowDue(L) {
  if (!L || L.quality !== 'low') return true;
  const n = (L._lobShadowTick | 0) + 1;
  L._lobShadowTick = n;
  return ((n - 1) % LOBBY_SHADOW_INTERVAL_LOW) === 0;
}

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
  let out = replaceOnce(code, IMPORT_ANCHOR, IMPORT_PATCHED, 'adapter import');
  out = replaceOnce(out, LOAD_ANCHOR, LOAD_PATCHED, 'lobLoad effective lobby quality');
  out = replaceOnce(out, SYNC_ANCHOR, SYNC_PATCHED, 'lobUpdate effective lobby quality');
  out = replaceOnce(out, RENDER_ANCHOR, RENDER_PATCHED, 'lobby shadow cadence');
  return out;
}