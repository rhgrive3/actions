// #581 — Halyard reflection-skip cache retains disposed PropKit atlas/meshes after leaving the map.
//
// Environment._reflSkips() caches strong references to the live scene (the decor group plus the selected PropKit
// meshes props:flags / glow / blink / spin:* / fence / blob / foliage). Its key only covers the scene child count
// and the props group UUID + child count, and a non-marina stage never renders a planar reflection, so after a stage
// change that key is never recomputed: the page-lifetime Environment keeps the previous stage's meshes reachable.
// Three.js dispose() only frees renderer-side resources and never nulls geometry/material/texture/userData, so the
// old material -> CanvasTexture -> 2048² atlas canvas chain survives leaving Halyard.
//
// This build adapter drops the cache on the two native Environment paths that replace stage-owned resources:
//   * rebuildForArena() — main.js _buildWorld, after props/decor have been rebuilt for the new layout;
//   * the marina transition inside setTheme() — the stage water mode flipped without a full arena rebuild.
// The next planar-reflection frame below ultra rebuilds the exclusion list lazily from the scene that is live then,
// so reflection exclusions, draw-call savings and quality behaviour are unchanged. Raw inkwave-public/ stays
// byte-identical; no gameplay, atlas, quality or timing value is touched.

export function adaptReflSkip(rel, code, replace) {
  if (rel !== 'src/world/environment.js') return code;
  const patch = (before, after, label) => { code = replace(code, before, after, 'refl-skip: ' + label); };

  // Helper next to the cache it owns.
  patch(
    '  // Scene parts left out of the planar reflection below ultra (cached per prop build): FX, decor, small prop batches.\n  _reflSkips(scene) {',
    '  // Drop the reflection-skip cache. The list holds strong references to the previous stage\'s decor group and\n' +
    '  // selected PropKit meshes, whose materials still point at that stage\'s atlas canvas, so a stale entry keeps a\n' +
    '  // disposed stage reachable for the whole page lifetime — dispose() never breaks that reachability.\n' +
    '  // The next reflection frame below ultra rebuilds the exclusions from the scene that is live then.\n' +
    '  _invalidateReflSkips() {\n' +
    '    this._reflSkipKey = null;\n' +
    '    this._reflSkipList = null;\n' +
    '  }\n\n' +
    '  // Scene parts left out of the planar reflection below ultra (cached per prop build): FX, decor, small prop batches.\n  _reflSkips(scene) {',
    'invalidator next to the cache');

  // Arena rebuild: main.js _buildWorld replaces props/decor, then calls rebuildForArena for the new layout.
  patch(
    '  rebuildForArena(bounds, rects) {\n    this._marina = this._stageMarina();',
    '  rebuildForArena(bounds, rects) {\n    this._invalidateReflSkips();\n    this._marina = this._stageMarina();',
    'arena rebuild');

  // Marina transition reached from setTheme() when the stage water mode flips.
  patch(
    '    if (stageMarina !== this._marina) { this._marina = stageMarina; this._rebuildDock(); }',
    '    if (stageMarina !== this._marina) { this._marina = stageMarina; this._invalidateReflSkips(); this._rebuildDock(); }',
    'marina transition');

  return code;
}
