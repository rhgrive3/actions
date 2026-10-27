// Terminal build-only optimization after all HUD presentation/queue transforms.
// Preserve exact rounded keys, transforms, update order, canvas drawing and input.
export function adaptLosslessShooterHud(rel, code, once) {
  if (rel !== 'src/ui/hud.js') return code;
  const patch = (before, after, label) => {
    code = once(code, before, after, 'lossless shooter HUD: ' + label);
  };
  // The final HUD already uses per-marker scalar ownership checks. When a
  // marker changes it formats the same pixel coordinates once for the key and
  // again for the visible CSS transform. Reuse those exact string values.
  // No decision thresholds, update frequency, or DOM values are changed.
  patch(
    `      const key = \`\${px.toFixed(1)}|\${py.toFixed(1)}|\${yaw.toFixed(2)}|\${p.alive === false ? 0 : 1}|\${p.isSelf ? 1 : 0}|\${p.team}\`;`,
    `      const px1 = px.toFixed(1), py1 = py.toFixed(1);
      const key = \`\${px1}|\${py1}|\${yaw.toFixed(2)}|\${p.alive === false ? 0 : 1}|\${p.isSelf ? 1 : 0}|\${p.team}\`;`,
    'reuse exact map coordinates in marker key'
  );
  patch(
    `      d.style.transform = \`translate3d(\${px.toFixed(1)}px,\${py.toFixed(1)}px,0) rotate(\${p.isSelf ? (+p.yaw || 0).toFixed(3) : 0}rad)\`;`,
    `      d.style.transform = \`translate3d(\${px1}px,\${py1}px,0) rotate(\${p.isSelf ? (+p.yaw || 0).toFixed(3) : 0}rad)\`;`,
    'reuse map coordinates in pixel-identical DOM transform'
  );
  return code;
}
