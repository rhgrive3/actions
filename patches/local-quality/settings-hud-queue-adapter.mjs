// Build-only changes to display work. Keep gameplay/input owners unchanged.
export function adaptSettingsHudQueue(rel, code, once) {
  if (rel === 'src/ui/menu-art.js') {
    const start = code.indexOf('function previewAimAssist(ctx) {');
    const end = code.indexOf('\nfunction previewAimMouse(', start);
    if (start < 0 || end < start) throw Error('aim preview boundary changed');
    let part = code.slice(start, end);
    part = once(part, '  let v = clamp(+ctx.value || 0), t = 0;', "  let v = clamp(+ctx.value || 0), t = 0, trailD = 'M20 90 L300 90';", 'aim trail owns its previous path');
    part = once(part, 'near = Math.exp(-Math.pow((x0 - 160) / 60, 2))', 'near = v === 0 ? 0 : Math.exp(-Math.pow((x0 - 160) / 60, 2))', 'zero assist skips unused Gaussian');
    part = once(part, "      if (t < 0.02) trail.setAttribute('d', `M${x.toFixed(1)} ${y.toFixed(1)}`);\n      else trail.setAttribute('d', `${trail.getAttribute('d')} L${x.toFixed(1)} ${y.toFixed(1)}`);", "      if (t < 0.02) trailD = `M${x.toFixed(1)} ${y.toFixed(1)}`;\n      else trailD += ` L${x.toFixed(1)} ${y.toFixed(1)}`;\n      trail.setAttribute('d', trailD);", 'aim SVG keeps exact frame path without reading it back');
    return code.slice(0, start) + part + code.slice(end);
  }
  if (rel === 'src/ui/hud-boss.js') {
    for (const [target, value] of [
      ['this.call', '`translate3d(${S.cx.toFixed(1)}px,${S.cy.toFixed(1)}px,0)`'],
      ['this.callEdge', '`rotate(${ang.toFixed(3)}rad)`'],
      ['this.callArrow', '`rotate(${da.toFixed(3)}rad)`'],
    ]) {
      const assignment = `${target}.style.transform = ${value};`;
      const replacement = `{ const value = ${value}; if (${target}._queueCallTransform !== value || ${target}.style.transform !== ${target}._queueCallSerialized) { ${target}.style.transform = value; ${target}._queueCallTransform = value; ${target}._queueCallSerialized = ${target}.style.transform; } }`;
      code = once(code, assignment, replacement, 'boss callout element owns exact CSS string');
    }
  }
  if (rel === 'src/ui/hud.js') code = once(code,
    "        el.querySelector('.iw-bcn__label b').textContent = b.ok ? b.name : `${b.name} · ${b.dead ? '×' : '…'}`;",
    "        const label = el._queueBeaconLabel ||= el.querySelector('.iw-bcn__label b');\n        const labelText = b.ok ? b.name : `${b.name} · ${b.dead ? '×' : '…'}`;\n        if (!Object.hasOwn(label, '_queueBeaconText') || label._queueBeaconText !== labelText) { label.textContent = labelText; label._queueBeaconText = labelText; }",
    'moving beacon reuses only its unchanged label text');
  return code;
}
