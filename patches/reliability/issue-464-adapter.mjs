// Build-only presentation correction for INKWAVE issue #464.
// Out-of-range enemies must not force the positive in-range target reticle state.
//
// Scope: presentation ONLY. This adapter rewrites only the crosshair class
// composition inside `HUD._updCrosshair()` in `src/ui/hud.js`. It consumes the
// existing authoritative reach flag (`ch.inRange`, produced by the aim code);
// it does not compute, change, or fabricate any weapon/projectile range, aim
// direction, damage, or ray-collision value.
//
// Wiring (owned by the parent): this module is intentionally NOT registered in
// the shared dispatcher `patches/reliability/adapter.mjs` or `profile.json`.
// The parent must add `adaptIssue464` to that relay list (and to
// `reliabilityIdentity()`'s file list) to bind the fix into the built output.
function replaceOnce(code, before, after, rel) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0) {
    throw new Error(`Issue-464 HUD anchor mismatch: ${rel}`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export function adaptIssue464(rel, code) {
  if (rel !== 'src/ui/hud.js') return code;

  // Preserve the out-of-range class when the reticle is rebuilt on weapon change.
  code = replaceOnce(code,
    "      this.xh.className = `iw-xh iw-xh--${kind}` + (L.tgt ? ' is-target' : '') + (L.far ? ' is-far' : '');",
    "      this.xh.className = `iw-xh iw-xh--${kind}` + (L.tgt ? ' is-target' : '') + (L.far ? ' is-far' : '') + (L.farTgt ? ' is-far-target' : '');",
    rel);

  // Gate the positive in-range target class behind authoritative reach, keep the
  // out-of-range state available, and expose the distinct under-crosshair-but-
  // unreachable state. `ch.inRange` defaults to in-reach (matches main.js frame
  // construction where a missing controller reports reachable).
  code = replaceOnce(code,
    "    const tgt = ch.onTarget === 'enemy';\n" +
    "    if (tgt !== L.tgt) { L.tgt = tgt; this.xh.classList.toggle('is-target', tgt); }\n" +
    "    const far = ch.inRange === false && !tgt;\n" +
    "    if (far !== L.far) { L.far = far; this.xh.classList.toggle('is-far', far); }",
    "    const inReach = ch.inRange !== false;\n" +
    "    const tgt = ch.onTarget === 'enemy' && inReach;\n" +
    "    if (tgt !== L.tgt) { L.tgt = tgt; this.xh.classList.toggle('is-target', tgt); }\n" +
    "    const far = ch.inRange === false;\n" +
    "    if (far !== L.far) { L.far = far; this.xh.classList.toggle('is-far', far); }\n" +
    "    const farTgt = ch.inRange === false && ch.onTarget === 'enemy';\n" +
    "    if (farTgt !== L.farTgt) { L.farTgt = farTgt; this.xh.classList.toggle('is-far-target', farTgt); }",
    rel);

  return code;
}
