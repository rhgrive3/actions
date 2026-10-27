// Build-only, semantics-preserving UI work reduction for Shooter-vs-idle profiling.
// Keep all presentation values, drawing cadence, interpolation, R/G/B, CSS and
// weapon state untouched. Duplicate anchors are treated as conflicts.
export function adaptLosslessShooterHud(rel, code, once) {
  if (rel !== 'src/ui/hud.js') return code;
  const patch = (before, after, label) => {
    code = once(code, before, after, 'lossless shooter HUD: ' + label);
  };

  // This map layout allocates two arrays and a closure *every frame* even
  // when the map is not expanded. Scalar expressions are identical and keep
  // the same floating-point evaluation order for each dimension.
  patch(
    `    const fit = (sz) => (asp >= 1 ? [sz, sz / asp] : [sz * asp, sz]);
    const [w0, h0] = fit(14.5 * u), [w1, h1] = fit(Math.min(H * 0.78, W * 0.6));`,
    `    const small = 14.5 * u, large = Math.min(H * 0.78, W * 0.6);
    const wide = asp >= 1;
    const w0 = wide ? small : small * asp, h0 = wide ? small / asp : small;
    const w1 = wide ? large : large * asp, h1 = wide ? large / asp : large;`,
    'two temporary map layout arrays'
  );

  // The rounded positions were being formatted once for the visibility key
  // and a second time for the exact same DOM transform. Reuse the immutable
  // strings. This intentionally does NOT reduce the map's update frequency.
  patch(
    `      const key = \`\${px.toFixed(1)}|\${py.toFixed(1)}|\${(+p.yaw || 0).toFixed(2)}|\${p.alive === false ? 0 : 1}|\${p.isSelf ? 1 : 0}|\${p.team}\`;`,
    `      const px1 = px.toFixed(1), py1 = py.toFixed(1);
      const key = \`\${px1}|\${py1}|\${(+p.yaw || 0).toFixed(2)}|\${p.alive === false ? 0 : 1}|\${p.isSelf ? 1 : 0}|\${p.team}\`;`,
    'map dot strings shared with DOM transform'
  );
  patch(
    `      d.style.transform = \`translate3d(\${px.toFixed(1)}px,\${py.toFixed(1)}px,0) rotate(\${p.isSelf ? (+p.yaw || 0).toFixed(3) : 0}rad)\`;`,
    `      d.style.transform = \`translate3d(\${px1}px,\${py1}px,0) rotate(\${p.isSelf ? (+p.yaw || 0).toFixed(3) : 0}rad)\`;`,
    'identical map dot DOM presentation'
  );

  // The tank's depth overlay uses the same Gradient whenever its endpoints,
  // deep ink colour and context are unchanged. Cache only *exact matches*;
  // partial ink changes, animations, resize, and palette changes still redraw
  // at the native cadence with the native pixels.
  patch(
    `    const g2 = c.createLinearGradient(0, lvl, 0, H);
    g2.addColorStop(0, 'rgba(255,255,255,.18)'); g2.addColorStop(0.15, 'rgba(255,255,255,0)'); g2.addColorStop(1, cDeep + '66');
    c.fillStyle = g2;
    c.fill();`,
    `    if (T2.depthCtx !== c || T2.depthLevel !== lvl ||
        T2.depthHeight !== H || T2.depthColor !== cDeep) {
      const g2 = c.createLinearGradient(0, lvl, 0, H);
      g2.addColorStop(0, 'rgba(255,255,255,.18)'); g2.addColorStop(0.15, 'rgba(255,255,255,0)'); g2.addColorStop(1, cDeep + '66');
      T2.depthCtx = c; T2.depthLevel = lvl; T2.depthHeight = H;
      T2.depthColor = cDeep; T2.depthGradient = g2;
    }
    c.fillStyle = T2.depthGradient;
    c.fill();`,
    'reuse exactly identical depth CanvasGradient'
  );
  return code;
}
