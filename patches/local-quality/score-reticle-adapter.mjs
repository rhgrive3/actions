// HUD-only corrections: preserve authoritative turf shares and local form.
export function adaptScoreReticle(rel, code, once) {
  if (rel !== 'src/ui/hud.js') return code;
  const patch = (before, after, label) => { code = once(code, before, after, 'score/reticle: ' + label); };
  patch('      const share = pa + pb > 0 ? pa / (pa + pb) : 0.5;',
    '      const shareA = pa / 100, shareB = pb / 100;\n      const neutral = Math.max(0, 100 - pa - pb);',
    'bar uses the same whole-stage denominator as its labels');
  patch('          clash.style.left = `${(share * 100).toFixed(2)}%`;',
    '          clash.style.left = `${(shareA * 100).toFixed(2)}%`;\n' +
    "          // End-cap blobs must not paint over the unclaimed gap.\n" +
    "          edgeA.style.visibility = edgeB.style.visibility = neutral > 0 ? 'hidden' : '';\n" +
    "          clash.style.visibility = neutral > 0 ? 'hidden' : '';",
    'leave neutral track visible at reveal');
  patch('        setBars(lerp(revealFrom.a, share, e), lerp(revealFrom.b, 1 - share, e));',
    '        setBars(lerp(revealFrom.a, shareA, e), lerp(revealFrom.b, shareB, e));',
    'animate each team to its own coverage');
  patch('    const a = this._local();\n    const inv = !!(a && a.alive && a.invuln > 0.05);',
    "    const a = this._local();\n    const reticleHidden = a?.form === 'squid';\n" +
    "    if (reticleHidden !== L.reticleHidden) { L.reticleHidden = reticleHidden; this.ret.style.visibility = reticleHidden ? 'hidden' : ''; }\n" +
    '    const inv = !!(a && a.alive && a.invuln > 0.05);',
    'hide only the aiming reticle during authoritative squid form');
  return code;
}
